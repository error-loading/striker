import type { Team, Weather } from '../data/types';
import { PITCH } from '../engine/constants';
import type { Ball, MatchPlayer } from '../engine/types';
import type { Appearance } from './appearance';
import { appearanceFor } from './appearance';
import { shadowOffset, type Atmosphere } from './atmosphere';
import type { Camera, Projected } from './camera';
import { contrastText, mixHex, shade, worldLine } from './draw';

const BASE_HEIGHT = 1.86;

export interface KitColors {
  shirt: string;
  shorts: string;
  socks: string;
  trim: string;
  text: string;
  /** Goalkeeper glove colour, unused for outfielders. */
  gloves: string;
}

export function kitFor(team: Team, isGK: boolean, isAway: boolean): KitColors {
  if (isGK) {
    // Keepers wear a contrasting strip so they read instantly.
    const shirt = shade(team.accentColor, 0.25);
    return {
      shirt,
      shorts: shade(shirt, -0.3),
      socks: shade(shirt, -0.3),
      trim: '#111827',
      text: contrastText(shirt),
      gloves: '#E8EEF6',
    };
  }
  const shirt = isAway ? team.secondaryColor : team.primaryColor;
  const shorts = isAway ? team.primaryColor : team.secondaryColor;
  return {
    shirt,
    shorts: shorts === shirt ? shade(shirt, -0.35) : shorts,
    socks: shorts === shirt ? shade(shirt, -0.35) : shorts,
    trim: team.accentColor,
    text: contrastText(shirt),
    gloves: '#E8EEF6',
  };
}

/** Per-player animation phase, keyed by player id. */
const runPhase = new Map<string, number>();
/** Smoothed stride amount, so a player does not snap between walk and sprint. */
const strideAmount = new Map<string, number>();

export function advancePhases(players: MatchPlayer[], dt: number) {
  for (const p of players) {
    const speed = Math.hypot(p.vel.x, p.vel.y);
    // Cadence rises with speed: a walking player takes slow steps, a sprinter
    // turns his legs over fast.
    const cadence = 1.5 + speed * 1.35;
    runPhase.set(p.id, (runPhase.get(p.id) ?? Math.random() * 6.28) + dt * cadence);

    const target = Math.min(1, speed / 7.2);
    const prev = strideAmount.get(p.id) ?? target;
    // Blend toward the new gait rather than cutting to it.
    strideAmount.set(p.id, prev + (target - prev) * Math.min(1, dt * 7));
  }
}

/** A pose is just a bag of world-space joint positions, in metres. */
interface Pose {
  hip: [number, number, number][];
  knee: [number, number, number][];
  ankle: [number, number, number][];
  toe: [number, number, number][];
  shoulder: [number, number, number][];
  elbow: [number, number, number][];
  hand: [number, number, number][];
  hipMid: [number, number, number];
  shoulderMid: [number, number, number];
  neck: [number, number, number];
  head: [number, number, number];
  headR: number;
  /** Chest depth front to back, in metres. */
  torsoDepth: number;
}

/**
 * Build the skeleton in world space.
 *
 * Joints are placed in metres around the player's own forward/left axes and
 * then projected like any other world point, which is what makes the figure
 * turn, foreshorten and sit correctly in the broadcast perspective. Posing in
 * screen space would need the rotation faked, and would break the moment the
 * camera changed angle.
 */
function buildPose(p: MatchPlayer, app: Appearance, phase: number, stride: number, time: number): Pose {
  const hs = app.heightScale;
  const bs = app.buildScale;

  // Forward and left, from the player's own heading.
  const fx = Math.cos(p.facing);
  const fy = Math.sin(p.facing);
  const lx = -fy;
  const ly = fx;

  const tired = p.stamina < 40 ? (40 - p.stamina) / 40 : 0;
  const celebrating = p.animation === 'celebrate';

  const thigh = 0.44 * hs;
  const shin = 0.44 * hs;
  const foot = 0.21 * hs;
  const spine = 0.56 * hs;
  const upperArm = 0.31 * hs;
  const foreArm = 0.28 * hs;
  const shoulderHalf = 0.215 * bs;
  const hipHalf = 0.125 * bs;

  // Vertical bob: the body rises twice per stride cycle, and a tired player
  // stops picking himself up as much.
  const bob = 0.038 * stride * Math.sin(phase * 2) * (1 - tired * 0.4);
  // Idle players still breathe and shift their weight.
  const breathe = stride < 0.06 ? Math.sin(time * 1.6 + phase) * 0.012 : 0;
  const sway = stride < 0.06 ? Math.sin(time * 0.8 + phase) * 0.035 : 0;

  const hipZ = 0.97 * hs + bob + breathe;
  const hipMid: [number, number, number] = [p.pos.x + lx * sway, p.pos.y + ly * sway, hipZ];

  const at = (base: [number, number, number], fwd: number, lat: number, up: number): [number, number, number] => [
    base[0] + fx * fwd + lx * lat,
    base[1] + fy * fwd + ly * lat,
    base[2] + up,
  ];

  // Torso pitches forward with pace, and further when legs are heavy.
  const lean = 0.09 + 0.30 * stride + tired * 0.16;
  const shoulderMid = at(hipMid, spine * Math.sin(lean), 0, spine * Math.cos(lean));

  const hip: [number, number, number][] = [];
  const knee: [number, number, number][] = [];
  const ankle: [number, number, number][] = [];
  const toe: [number, number, number][] = [];
  const shoulder: [number, number, number][] = [];
  const elbow: [number, number, number][] = [];
  const hand: [number, number, number][] = [];

  // side 0 = player's left, side 1 = player's right.
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? 1 : -1;
    const legPhase = phase + (side === 0 ? 0 : Math.PI);

    // Thigh swings fore and aft; the knee flexes hardest as the leg recovers,
    // which is what stops a run cycle looking like scissors.
    const swing = (0.60 * stride + 0.04) * Math.sin(legPhase);
    const flex = Math.max(0, (0.95 * stride + 0.08) * Math.sin(legPhase + 1.9));
    const shinAngle = swing - flex;

    const h: [number, number, number] = at(hipMid, 0, sgn * hipHalf, 0);
    const k = at(h, thigh * Math.sin(swing), 0, -thigh * Math.cos(swing));
    const a = at(k, shin * Math.sin(shinAngle), 0, -shin * Math.cos(shinAngle));
    // Never let a foot sink through the turf.
    a[2] = Math.max(0.045, a[2]);
    // Toe lifts on the swing leg and plants flat under load.
    const toePitch = 0.35 - swing * 0.5;
    const t = at(a, foot * Math.cos(toePitch), 0, Math.max(0, foot * Math.sin(toePitch) * 0.5) + 0.02);
    t[2] = Math.max(0.03, t[2]);

    hip.push(h);
    knee.push(k);
    ankle.push(a);
    toe.push(t);

    const s: [number, number, number] = at(shoulderMid, 0, sgn * shoulderHalf, 0);
    let armSwing: number;
    let elbowFlex: number;
    if (celebrating) {
      // Both arms up and out.
      armSwing = -2.35 + Math.sin(time * 5 + sgn) * 0.18;
      elbowFlex = 0.25;
    } else {
      // Arms counter-rotate against the legs.
      const armPhase = legPhase + Math.PI;
      armSwing = (0.52 * stride + 0.06) * Math.sin(armPhase) * (1 - tired * 0.3);
      elbowFlex = 0.42 + 0.62 * stride + tired * 0.1;
    }
    // Arms hang just outside the ribs rather than through them.
    const e = at(s, upperArm * Math.sin(armSwing), sgn * upperArm * 0.22, -upperArm * Math.cos(armSwing));
    const hd = at(e, foreArm * Math.sin(armSwing + elbowFlex), sgn * foreArm * 0.12, -foreArm * Math.cos(armSwing + elbowFlex));
    shoulder.push(s);
    elbow.push(e);
    hand.push(hd);
  }

  const neck = at(shoulderMid, 0.015, 0, 0.045 * hs);
  // A tired player's head drops; otherwise it sits back over the shoulders.
  const headTilt = lean * 0.45 + tired * 0.1;
  const head = at(neck, 0.115 * hs * Math.sin(headTilt), 0, 0.115 * hs * Math.cos(headTilt));

  return {
    hip,
    knee,
    ankle,
    toe,
    shoulder,
    elbow,
    hand,
    hipMid,
    shoulderMid,
    neck,
    head,
    headR: 0.097 * hs,
    torsoDepth: 0.23 * bs,
  };
}

interface Pt {
  x: number;
  y: number;
}

/** Screen-space rim-light offset and strength, shared by every body part. */
interface Rim {
  dx: number;
  dy: number;
  tint: number;
  on: boolean;
}

/** Screen-space point between two projected joints. */
function lerpP(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function capsule(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.7, width);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export interface PlayerDrawOptions {
  controlled: boolean;
  night: boolean;
  atmos: Atmosphere;
  weather: Weather;
  /** True for the side's captain, who wears the armband. */
  captain: boolean;
  time: number;
}

/**
 * Draw a footballer as an articulated figure.
 *
 * The skeleton is real 3D — see {@link buildPose} — but the surfaces are drawn
 * as screen-space capsules and polygons between the projected joints. At the
 * scale a broadcast camera puts a player on screen (roughly 28 css pixels tall)
 * that reads identically to shaded geometry and costs a fraction as much.
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  p: MatchPlayer,
  kit: KitColors,
  opts: PlayerDrawOptions,
) {
  const base = cam.project(p.pos.x, p.pos.y, 0);
  const crown = cam.project(p.pos.x, p.pos.y, BASE_HEIGHT);
  if (!base.visible || !crown.visible) return;
  if (base.x < -140 || base.x > cam.width + 140) return;
  if (base.y < -160 || base.y > cam.height + 160) return;

  const h = base.y - crown.y;
  if (h < 2) return;

  const app = appearanceFor(p, opts.weather);
  const scale = base.scale;

  // Shadow first, under everything.
  drawShadow(ctx, cam, p, opts, h);

  // Furthest level of detail: a team-coloured dot is all that survives at this
  // size anyway, and it keeps 22 figures off the profile when the camera pulls
  // right out.
  if (h < 7) {
    ctx.fillStyle = kit.shirt;
    ctx.beginPath();
    ctx.arc(base.x, base.y - h * 0.45, Math.max(1.2, h * 0.24), 0, Math.PI * 2);
    ctx.fill();
    if (opts.controlled) drawSelection(ctx, base, h);
    return;
  }

  const phase = runPhase.get(p.id) ?? 0;
  const stride = strideAmount.get(p.id) ?? 0;
  const pose = buildPose(p, app, phase, stride, opts.time);

  const P = (v: [number, number, number]) => cam.project(v[0], v[1], v[2]);
  const hip = pose.hip.map(P);
  const knee = pose.knee.map(P);
  const ankle = pose.ankle.map(P);
  const toe = pose.toe.map(P);
  const shoulder = pose.shoulder.map(P);
  const elbow = pose.elbow.map(P);
  const hand = pose.hand.map(P);
  const neck = P(pose.neck);
  const head = P(pose.head);
  const shoulderMid = P(pose.shoulderMid);
  const hipMid = P(pose.hipMid);
  if (!shoulder[0].visible || !shoulder[1].visible || !head.visible) return;
  if (!shoulderMid.visible || !hipMid.visible) return;

  // Which of the player's sides is nearer the camera decides draw order, so a
  // near arm passes in front of the chest and a far arm behind it.
  const near = shoulder[0].d < shoulder[1].d ? 0 : 1;
  const far = near === 0 ? 1 : 0;

  // Is the player facing the camera or turned away? Drives which side of the
  // shirt carries the number, and whether we see a face.
  const camPos = cam.position;
  const toCamX = camPos.x - p.pos.x;
  const toCamY = camPos.y - p.pos.y;
  const facingDot =
    (Math.cos(p.facing) * toCamX + Math.sin(p.facing) * toCamY) / (Math.hypot(toCamX, toCamY) || 1);
  const facingCamera = facingDot > 0;

  const detail = h >= 26 ? 2 : h >= 13 ? 1 : 0;
  const lit = (c: string) => (opts.controlled ? shade(c, 0.1) : c);

  /**
   * Rim light offset, in screen pixels, pointing away from the key light.
   *
   * Each body part is drawn twice: once shifted this far in a brighter tint,
   * then again in its own colour on top, so the bright copy survives only as a
   * sliver along one edge. Stroking an outline instead puts a halo right around
   * the figure, which reads as a helmet rather than as light.
   */
  const sunLen = Math.hypot(opts.atmos.sun.x, opts.atmos.sun.y) || 1;
  const rimPx = Math.max(0.4, h * 0.018);
  const rim = {
    dx: (-opts.atmos.sun.x / sunLen) * rimPx,
    dy: (-opts.atmos.sun.y / sunLen) * rimPx * 0.5,
    tint: opts.night ? 0.34 : 0.26,
    on: detail >= 1,
  };
  const shirt = lit(kit.shirt);
  const shorts = lit(kit.shorts);
  const socks = lit(kit.socks);
  const skin = lit(app.skin);

  const w = scale; // pixels per metre at this player's depth
  const limbW = {
    thigh: w * 0.163,
    shin: w * 0.126,
    upperArm: w * 0.102,
    foreArm: w * 0.086,
    neck: w * 0.105,
  };

  ctx.lineJoin = 'round';

  // --- far side limbs -----------------------------------------------------
  drawArm(ctx, shoulder[far], elbow[far], hand[far], limbW, shade(shirt, -0.16), shade(skin, -0.12), app, kit, p, detail, opts, false);
  drawLeg(ctx, hip[far], knee[far], ankle[far], toe[far], limbW, shade(shorts, -0.16), shade(skin, -0.12), shade(socks, -0.16), shade(app.boots, -0.15), detail);

  // --- torso --------------------------------------------------------------
  drawTorso(ctx, shoulder, hip, shoulderMid, hipMid, pose.torsoDepth * scale, shirt, shorts, kit, p, detail, facingCamera, h, opts, rim);

  // --- near side limbs ----------------------------------------------------
  drawLeg(ctx, hip[near], knee[near], ankle[near], toe[near], limbW, shorts, skin, socks, app.boots, detail);
  drawArm(ctx, shoulder[near], elbow[near], hand[near], limbW, shirt, skin, app, kit, p, detail, opts, opts.captain);

  // --- head ---------------------------------------------------------------
  drawHead(ctx, neck, head, pose.headR * scale, limbW.neck, skin, app, detail, facingCamera, opts, rim);

  if (opts.controlled) drawSelection(ctx, base, h);
}

function drawShadow(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  p: MatchPlayer,
  opts: PlayerDrawOptions,
  h: number,
) {
  const off = shadowOffset(opts.atmos, BASE_HEIGHT * 0.55);
  const root = cam.project(p.pos.x, p.pos.y, 0);
  const tip = cam.project(p.pos.x + off.dx, p.pos.y + off.dy, 0);
  if (!root.visible) return;
  const w = h * 0.42;
  ctx.save();
  ctx.globalAlpha = opts.night ? 0.4 : 0.28;
  ctx.fillStyle = '#04121F';
  ctx.beginPath();
  if (tip.visible) {
    const dx = tip.x - root.x;
    const dy = tip.y - root.y;
    const len = Math.hypot(dx, dy);
    ctx.ellipse(root.x + dx * 0.5, root.y + dy * 0.5, Math.max(w * 0.3, len * 0.5 + w * 0.26), w * 0.2, Math.atan2(dy, dx), 0, Math.PI * 2);
  } else {
    ctx.ellipse(root.x, root.y, w * 0.55, w * 0.22, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

function drawSelection(ctx: CanvasRenderingContext2D, base: Projected, h: number) {
  const w = h * 0.42;
  ctx.save();
  ctx.strokeStyle = '#00D9FF';
  ctx.lineWidth = Math.max(1.2, h * 0.04);
  ctx.shadowColor = '#00D9FF';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, w * 0.78, w * 0.32, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  hip: Projected,
  knee: Projected,
  ankle: Projected,
  toe: Projected,
  limbW: Record<string, number>,
  shorts: string,
  skin: string,
  socks: string,
  boots: string,
  detail: number,
) {
  if (!hip.visible || !knee.visible || !ankle.visible) return;
  // Bare thigh and calf first, then the kit laid over the top — same order a
  // player gets dressed in, and it keeps the joints continuous underneath.
  capsule(ctx, hip, knee, limbW.thigh, skin);
  capsule(ctx, knee, ankle, limbW.shin, skin);
  // Shorts cover the top of the thigh, cut wider than the leg inside them.
  capsule(ctx, hip, lerpP(hip, knee, 0.46), limbW.thigh * 1.3, shorts);
  // Socks run from below the knee to the ankle.
  capsule(ctx, lerpP(knee, ankle, 0.12), ankle, limbW.shin * 1.06, socks);
  if (detail >= 2) {
    // Turnover band at the top of the sock.
    capsule(ctx, lerpP(knee, ankle, 0.12), lerpP(knee, ankle, 0.28), limbW.shin * 1.12, shade(socks, 0.25));
  }
  if (toe.visible) capsule(ctx, ankle, toe, limbW.shin * 0.95, boots);
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  shoulder: Projected,
  elbow: Projected,
  hand: Projected,
  limbW: Record<string, number>,
  shirt: string,
  skin: string,
  app: Appearance,
  kit: KitColors,
  p: MatchPlayer,
  detail: number,
  opts: PlayerDrawOptions,
  captain: boolean,
) {
  if (!shoulder.visible || !elbow.visible) return;
  capsule(ctx, shoulder, elbow, limbW.upperArm, skin);
  if (hand.visible) capsule(ctx, elbow, hand, limbW.foreArm, skin);

  // Sleeve length is part of the kit, and gets longer in bad weather.
  const sleeveEnd = app.sleeves === 'long' ? 1 : 0.55;
  capsule(ctx, shoulder, lerpP(shoulder, elbow, sleeveEnd), limbW.upperArm * 1.2, shirt);
  if (app.sleeves === 'long' && hand.visible) {
    capsule(ctx, elbow, lerpP(elbow, hand, 0.55), limbW.foreArm * 1.15, shirt);
  }
  if (detail >= 2) {
    // Cuff trim where the sleeve ends — a hem, not a shoulder patch.
    const cuff = lerpP(shoulder, elbow, sleeveEnd);
    capsule(ctx, lerpP(shoulder, elbow, sleeveEnd - 0.06), cuff, limbW.upperArm * 1.22, kit.trim);
    if (captain) {
      // Armband sits high on the upper arm.
      capsule(ctx, lerpP(shoulder, elbow, 0.28), lerpP(shoulder, elbow, 0.4), limbW.upperArm * 1.26, '#FFD700');
    }
  }

  // Hands — gloves for a keeper, otherwise a simple fist.
  if (hand.visible) {
    const r = Math.max(0.6, limbW.foreArm * (p.isGK ? 0.95 : 0.62));
    ctx.fillStyle = p.isGK ? kit.gloves : skin;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (p.isGK && detail >= 2) {
      // Cuff at the wrist, not a ring around the whole glove — a full circle
      // reads as a bracelet at this size.
      ctx.strokeStyle = shade(kit.gloves, -0.35);
      ctx.lineWidth = Math.max(0.4, r * 0.4);
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, r * 0.85, Math.PI * 0.7, Math.PI * 1.3);
      ctx.stroke();
    }
  }
  void opts;
}

function drawTorso(
  ctx: CanvasRenderingContext2D,
  shoulder: Projected[],
  hip: Projected[],
  shoulderMid: Projected,
  hipMid: Projected,
  chestPx: number,
  shirt: string,
  shorts: string,
  kit: KitColors,
  p: MatchPlayer,
  detail: number,
  facingCamera: boolean,
  h: number,
  opts: PlayerDrawOptions,
  rim: Rim,
) {
  if (!hip[0].visible || !hip[1].visible) return;

  const pad = (h * 0.055) / 2;
  const chestTop = lerpP(shoulderMid, hipMid, 0.06);
  const chestBottom = lerpP(shoulderMid, hipMid, 0.88);

  // Rim pass: the same chest, shifted toward the light in a brighter tint.
  if (rim.on) {
    capsule(
      ctx,
      { x: chestTop.x + rim.dx, y: chestTop.y + rim.dy },
      { x: chestBottom.x + rim.dx, y: chestBottom.y + rim.dy },
      chestPx,
      shade(shirt, rim.tint),
    );
  }

  // A chest has depth as well as width. Without this underlay the shoulder-to
  // -hip quad collapses to a line the moment a player turns side-on, and the
  // figure reads as a stick with a head on it. The capsule is the body's
  // front-to-back thickness, so the silhouette survives every heading.
  capsule(ctx, chestTop, chestBottom, chestPx, shirt);

  // The shirt proper: the quad between the shoulders and the hips, which is
  // what gives the broad chest when the player faces the camera.
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.moveTo(shoulder[0].x, shoulder[0].y - pad);
  ctx.lineTo(shoulder[1].x, shoulder[1].y - pad);
  ctx.lineTo(hip[1].x, hip[1].y);
  ctx.lineTo(hip[0].x, hip[0].y);
  ctx.closePath();
  ctx.fill();

  // Shorts: a capsule for depth, then the quad, same as the shirt.
  const waist0 = lerpP(shoulder[0], hip[0], 0.78);
  const waist1 = lerpP(shoulder[1], hip[1], 0.78);
  const waistMid = lerpP(shoulderMid, hipMid, 0.78);
  capsule(ctx, waistMid, lerpP(hipMid, waistMid, -0.15), chestPx * 0.8, shorts);
  ctx.fillStyle = shorts;
  ctx.beginPath();
  ctx.moveTo(waist0.x, waist0.y);
  ctx.lineTo(waist1.x, waist1.y);
  ctx.lineTo(hip[1].x, hip[1].y + pad);
  ctx.lineTo(hip[0].x, hip[0].y + pad);
  ctx.closePath();
  ctx.fill();

  if (detail >= 1) {
    // Shading down the side away from the key light gives the torso volume.
    const shadeSide = opts.atmos.sun.x < 0 ? 1 : 0;
    const mid0 = lerpP(shoulder[shadeSide], shoulder[1 - shadeSide], 0.32);
    const mid1 = lerpP(hip[shadeSide], hip[1 - shadeSide], 0.32);
    ctx.fillStyle = shade(shirt, -0.16);
    ctx.beginPath();
    ctx.moveTo(shoulder[shadeSide].x, shoulder[shadeSide].y - pad);
    ctx.lineTo(mid0.x, mid0.y - pad);
    ctx.lineTo(mid1.x, mid1.y);
    ctx.lineTo(hip[shadeSide].x, hip[shadeSide].y);
    ctx.closePath();
    ctx.fill();
  }

  // Shirt number, on the back or the chest depending on which we can see.
  if (detail >= 2) {
    const cx = (shoulder[0].x + shoulder[1].x + hip[0].x + hip[1].x) / 4;
    const cy = (shoulder[0].y + shoulder[1].y + hip[0].y + hip[1].y) / 4;
    const width = Math.hypot(shoulder[1].x - shoulder[0].x, shoulder[1].y - shoulder[0].y);
    // Only when the chest is square enough to the camera to carry the digits.
    if (width > h * 0.19) {
      const size = Math.max(5, h * (facingCamera ? 0.15 : 0.2));
      ctx.fillStyle = kit.text;
      ctx.font = `800 ${Math.round(size)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // The back number sits higher and larger, as it does on a real shirt.
      ctx.fillText(String(p.number), cx, facingCamera ? cy + h * 0.01 : cy - h * 0.03);
    }
    // Collar.
    ctx.strokeStyle = kit.trim;
    ctx.lineWidth = Math.max(0.6, h * 0.018);
    ctx.beginPath();
    ctx.moveTo(shoulder[0].x, shoulder[0].y - pad);
    ctx.lineTo(shoulder[1].x, shoulder[1].y - pad);
    ctx.stroke();
  }
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  neck: Projected,
  head: Projected,
  radius: number,
  neckW: number,
  skin: string,
  app: Appearance,
  detail: number,
  facingCamera: boolean,
  opts: PlayerDrawOptions,
  rim: Rim,
) {
  if (!neck.visible || !head.visible) return;
  const r = Math.max(1, radius);
  const style = app.hairStyle;

  // Neck sits in the shadow of the jaw and mostly behind the collar. Drawn
  // pale and wide it reads as a scarf, so keep it narrow and dark.
  capsule(ctx, neck, head, neckW * 0.72, shade(skin, -0.3));

  // Rim pass for the skull, offset toward the light.
  if (rim.on) {
    ctx.fillStyle = shade(style === 'bald' ? skin : app.hair, rim.tint);
    ctx.beginPath();
    ctx.ellipse(head.x + rim.dx, head.y + rim.dy - r * 0.1, r * 0.9, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Hair is laid down as a whole skull first, then the face is cut back into
   * it in skin. Drawing a half-ellipse "cap" instead leaves a hard horizontal
   * hairline across the brow, which reads as a helmet rather than hair — and
   * turning away from the camera should show a full head of hair, not a cap.
   */
  const hairR = style === 'afro' ? r * 1.3 : style === 'curly' ? r * 1.14 : r * 1.05;
  if (style !== 'bald') {
    ctx.fillStyle = app.hair;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - r * 0.12, hairR * 0.92, hairR, 0, 0, Math.PI * 2);
    ctx.fill();
    if (style === 'long') {
      // A fall of hair past the jaw, behind the face.
      ctx.beginPath();
      ctx.ellipse(head.x, head.y + r * 0.3, hairR * 0.95, hairR * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === 'topknot') {
      ctx.beginPath();
      ctx.arc(head.x, head.y - r * 1.12, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The face. Only carved out when we can actually see it — from behind, the
  // head stays covered.
  ctx.fillStyle = skin;
  ctx.beginPath();
  if (facingCamera || style === 'bald') {
    const inset = style === 'bald' ? 0 : r * (style === 'buzz' ? 0.1 : style === 'fade' ? 0.13 : 0.17);
    ctx.ellipse(head.x, head.y + inset * 0.7, r * 0.88 - inset * 0.5, r - inset, 0, 0, Math.PI * 2);
  } else {
    // Turned away: just the nape below the hairline.
    ctx.ellipse(head.x, head.y + r * 0.62, r * 0.55, r * 0.34, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  if (style === 'fade' && detail >= 2 && facingCamera) {
    // Faded sides: hair blended toward skin around the temples.
    ctx.strokeStyle = mixHex(app.hair, skin, 0.5);
    ctx.lineWidth = Math.max(0.5, r * 0.2);
    ctx.beginPath();
    ctx.arc(head.x, head.y - r * 0.06, r * 0.86, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }

  if (detail >= 2 && facingCamera && app.facialHair !== 'none') {
    // Beard as a darker mask over the jaw.
    ctx.fillStyle = mixHex(app.hair, skin, app.facialHair === 'stubble' ? 0.55 : 0.12);
    ctx.beginPath();
    if (app.facialHair === 'goatee') {
      ctx.ellipse(head.x, head.y + r * 0.52, r * 0.3, r * 0.34, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(head.x, head.y + r * 0.26, r * 0.76, r * 0.66, 0, 0, Math.PI);
    }
    ctx.fill();
  }

  if (app.headband && detail >= 2) {
    ctx.strokeStyle = '#F2F4F7';
    ctx.lineWidth = Math.max(0.5, r * 0.22);
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - r * 0.22, r * 0.9, r * 0.66, 0, Math.PI * 1.04, Math.PI * 1.96);
    ctx.stroke();
  }
  void opts;
}

/**
 * Name plate above a player. Drawn in its own pass after every figure, so a
 * label is never half-covered by the player standing in front of it.
 */
export function drawPlayerLabel(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  p: MatchPlayer,
  kit: KitColors,
  controlled: boolean,
) {
  const base = cam.project(p.pos.x, p.pos.y, 0);
  const crown = cam.project(p.pos.x, p.pos.y, BASE_HEIGHT);
  if (!base.visible || !crown.visible) return;
  const h = base.y - crown.y;
  if (h < 14) return;

  const label = p.lastName.toUpperCase();
  const fontSize = Math.max(9, Math.round(h * 0.15));
  ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
  const textW = ctx.measureText(label).width;
  const badge = fontSize * 1.5;
  const padX = fontSize * 0.5;
  const boxW = textW + badge + padX * 2;
  const boxH = fontSize * 1.55;
  const x = base.x - boxW / 2;
  const y = crown.y - boxH - h * 0.18;

  ctx.save();
  // Plate.
  ctx.fillStyle = 'rgba(6,12,24,0.82)';
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, boxH * 0.28);
  ctx.fill();
  if (controlled) {
    ctx.strokeStyle = '#00D9FF';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Team-colour badge carrying the shirt number.
  ctx.fillStyle = kit.shirt;
  ctx.beginPath();
  ctx.roundRect(x + padX * 0.5, y + boxH * 0.16, badge, boxH * 0.68, boxH * 0.2);
  ctx.fill();
  ctx.fillStyle = kit.text;
  ctx.font = `800 ${Math.round(fontSize * 0.82)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(p.number), x + padX * 0.5 + badge / 2, y + boxH * 0.52);

  ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = controlled ? '#00D9FF' : '#E8EDF5';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + padX * 0.5 + badge + padX * 0.6, y + boxH * 0.54);
  ctx.restore();
}

export function drawBall(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ball: Ball,
  night: boolean,
  atmos: Atmosphere,
) {
  const p = cam.project(ball.pos.x, ball.pos.y, ball.z + 0.11);
  // The shadow tracks the light, so a lofted ball's shadow runs ahead of it on
  // the grass instead of sitting glued underneath.
  const off = shadowOffset(atmos, ball.z);
  const ground = cam.project(ball.pos.x + off.dx, ball.pos.y + off.dy, 0);
  if (!p.visible || !ground.visible) return;

  // Shadow spreads and fades as the ball rises.
  const lift = Math.min(1, ball.z / 6);
  ctx.save();
  ctx.globalAlpha = (night ? 0.5 : 0.34) * (1 - lift * 0.6);
  ctx.fillStyle = '#04121F';
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, ground.scale * 0.14 * (1 + lift), ground.scale * 0.06 * (1 + lift), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const r = Math.max(1.6, p.scale * 0.115);

  // Motion trail on a struck ball.
  const speed = Math.hypot(ball.vel.x, ball.vel.y);
  if (speed > 14) {
    const back = cam.project(
      ball.pos.x - ball.vel.x * 0.045,
      ball.pos.y - ball.vel.y * 0.045,
      Math.max(0, ball.z - ball.vz * 0.045) + 0.11,
    );
    if (back.visible) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = r * 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(back.x, back.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.72, '#E9EEF4');
  g.addColorStop(1, '#A8B4C4');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Panel hint, only when the ball is large enough to warrant it.
  if (r > 3.4) {
    ctx.fillStyle = 'rgba(20,30,48,0.72)';
    ctx.beginPath();
    ctx.arc(p.x + r * 0.1, p.y - r * 0.05, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Live offside line for the attacking team, as broadcast graphics show it. */
export function drawOffsideLine(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  color = 'rgba(0,217,255,0.55)',
) {
  worldLine(ctx, cam, x, 0, x, PITCH.width, 0.16, color);
}
