import type { Weather } from '../data/types';
import { Rng } from '../engine/math';
import { fogged, litFace, type Atmosphere } from './atmosphere';
import type { Camera } from './camera';
import { HAIR_COLORS, SKIN_TONES } from './appearance';
import { mixHex, shade } from './draw';

/**
 * The crowd, as people rather than pixels.
 *
 * A spectator is drawn the same way a footballer is: a small skeleton posed in
 * the stand's own frame, then surfaced with capsules between the joints. What
 * differs is where the perspective comes from. A player projects every joint
 * through the camera individually, which is worth it at 28 pixels tall and
 * twenty-two of them. A stand holds twenty-five thousand seats, so a spectator
 * projects *four* points — the seat, and a metre up, left and forward of it —
 * and builds every joint as an affine combination of those. Across a body 0.9 m
 * tall and 60 m away the perspective divide is constant to well under a pixel,
 * so the figure still turns, foreshortens and leans correctly, at a sixth of
 * the projection cost.
 *
 * Looks are pooled, not per-seat. Each block of the bowl gets its own pool of
 * {@link POOL} spectators whose colours are already lit for that block's facing
 * — so the draw loop does no colour arithmetic at all — and every seat points
 * at one of them. Two seats sharing a look still differ: gesture timing, lean,
 * standing height and reaction threshold are per-seat, and that is what the eye
 * actually reads at this size. It is the same instancing a 3D crowd uses, with
 * the pool standing in for the atlas.
 */

/** Distinct looks per block. Beyond this the repetition stops being visible. */
const POOL = 96;

/** Haze is quantised to this many steps, so a pool is re-fogged rarely. */
const HAZE_STEPS = 12;

export interface SpectatorLook {
  /** Torso garment, lit for the block, plus fold-shadow and rim variants. */
  top: string;
  topShade: string;
  topRim: string;
  /** Sleeve — a jacket arm, or bare skin in warm weather. */
  sleeve: string;
  legs: string;
  skin: string;
  skinShade: string;
  hair: string;
  /** 0 for a bald or covered head, else the hair mass as a head-radius scale. */
  hairMass: number;
  hat: string | null;
  scarf: string | null;
  /** Hip-to-crown height in metres. Children and seniors sit lower. */
  height: number;
  /** Shoulder-width scale. */
  build: number;
  /** Drive needed before this fan reacts. Low = out of their seat all match. */
  calm: number;
  /** Favoured reaction: 0 applaud, 1 both arms up, 2 scarf held overhead. */
  gesture: 0 | 1 | 2;
  /** Turned toward a neighbour, mid-conversation. Sign picks which way. */
  chatter: number;
}

export interface LookPool {
  /** Lit for the block, unfogged. */
  base: SpectatorLook[];
  /** Same looks with aerial perspective applied, filled lazily. */
  hazed: (SpectatorLook | undefined)[];
  hazeStep: number;
}

/** Coats, hoodies and shirts for fans not in club colours. */
const CASUAL = [
  '#2A2F3A', '#1A1D24', '#3E4756', '#5B6472', '#8C929C', '#D6DAE0', '#F0F2F5',
  '#3A4C6B', '#26405C', '#6B3F3A', '#7A5C34', '#2E4A38', '#4A3A5C', '#B04A3A',
];
const LEGWEAR = ['#232833', '#1A1E27', '#33404F', '#3E3A34', '#4A4F5A'];
const HAT_COLORS = ['#1B1F27', '#8C1B2E', '#1D3F6B', '#D9DEE5', '#2E4A38', '#B0561E'];

export interface LookOptions {
  atmosphere: Atmosphere;
  night: boolean;
  weather: Weather;
  /** Section colour, or '' for a neutral stand. */
  tint: string;
  /** Fallback apparel colours for a neutral stand. */
  seat: string;
  /** Outward normal of the block — spectators face the opposite way. */
  nx: number;
  ny: number;
}

/**
 * Build one block's pool.
 *
 * Colours are baked through {@link litFace} here, using the direction the
 * spectators in this block are facing, so a stand on the shaded side of the
 * ground reads darker than one in the light without the draw loop ever touching
 * a colour. Everything the loop needs is a finished hex string.
 */
export function buildLookPool(rng: Rng, o: LookOptions): LookPool {
  const a = o.atmosphere;
  // Spectators face the pitch: the inward normal is their chest normal.
  const fx = -o.nx;
  const fy = -o.ny;
  const lit = (hex: string) => litFace(hex, a, fx, fy, 0.25);

  const cold = o.weather === 'Snowy' || o.weather === 'Rainy' || o.night;
  const wrapped = o.weather === 'Snowy' ? 0.8 : o.weather === 'Rainy' ? 0.62 : o.night ? 0.4 : 0.16;

  const base: SpectatorLook[] = [];
  for (let i = 0; i < POOL; i++) {
    // In a supporter end most of the stand wears the colour; elsewhere replica
    // shirts are scattered thinly through ordinary coats.
    const inColors = o.tint ? rng.next() < 0.66 : rng.next() < 0.06;
    const garment = inColors
      ? rng.next() < 0.24
        ? mixHex(o.tint || o.seat, '#FFFFFF', 0.42)
        : rng.next() < 0.18
          ? shade(o.tint || o.seat, -0.24)
          : o.tint || o.seat
      : CASUAL[Math.floor(rng.next() * CASUAL.length)];

    // Age spread: mostly adults, with children, teenagers and seniors through
    // the stand. Height and build follow from it.
    const ageRoll = rng.next();
    const child = ageRoll < 0.09;
    const teen = !child && ageRoll < 0.2;
    const senior = ageRoll > 0.9;
    const height = (child ? 0.6 : teen ? 0.76 : senior ? 0.8 : 0.86) * rng.range(0.95, 1.06);
    const build = (child ? 0.72 : teen ? 0.86 : 1) * rng.range(0.9, 1.14);

    const [skin, skinShade] = SKIN_TONES[Math.floor(rng.next() * SKIN_TONES.length)];
    let hair = HAIR_COLORS[Math.floor(rng.next() * HAIR_COLORS.length)];
    if (senior && rng.next() < 0.55) hair = rng.next() < 0.5 ? '#9AA0A6' : '#C8CCD2';

    const hatted = rng.next() < wrapped;
    // A covered head shows no hair mass; a bare one carries anything from a
    // buzz cut to an afro.
    const hairMass = hatted ? 0 : rng.next() < 0.08 ? 0 : rng.range(1.02, 1.34);

    const top = lit(garment);
    base.push({
      top,
      topShade: shade(top, -0.26),
      topRim: shade(top, o.night ? 0.32 : 0.24),
      // Bare arms only when it is warm and they are not in a coat.
      sleeve: cold || rng.next() < 0.6 ? shade(top, -0.1) : lit(skin),
      legs: lit(LEGWEAR[Math.floor(rng.next() * LEGWEAR.length)]),
      skin: lit(skin),
      skinShade: lit(skinShade),
      hair: lit(hair),
      hairMass,
      hat: hatted ? lit(o.tint && rng.next() < 0.5 ? o.tint : HAT_COLORS[Math.floor(rng.next() * HAT_COLORS.length)]) : null,
      scarf: rng.next() < (o.tint ? 0.42 : 0.12) ? lit(o.tint || CASUAL[Math.floor(rng.next() * CASUAL.length)]) : null,
      height,
      build,
      // Children and teenagers are up and shouting long before the season
      // ticket holders in front of them are.
      calm: (child || teen ? rng.range(0, 0.3) : rng.range(0.08, 0.72)) + (senior ? 0.2 : 0),
      gesture: (rng.next() < 0.42 ? 0 : rng.next() < 0.6 ? 1 : 2) as 0 | 1 | 2,
      chatter: rng.next() < 0.3 ? rng.range(-1, 1) : 0,
    });
  }
  return { base, hazed: new Array(POOL), hazeStep: -1 };
}

/**
 * The pool as seen through the air between it and the camera.
 *
 * Aerial perspective is resolved per block rather than per seat, at a quantised
 * depth, and cached until the camera has moved enough to change the bucket.
 * A block is a couple of dozen metres deep and the haze curve is smooth across
 * that, so nothing is lost; what is gained is that a frame drawing ten thousand
 * spectators does a few hundred colour mixes instead of a hundred thousand.
 */
export function hazedPool(pool: LookPool, a: Atmosphere, depth: number): SpectatorLook[] {
  const f = Math.min(1, Math.max(0, (depth - a.near) / (a.far - a.near)));
  const step = Math.round(a.max * f * f * HAZE_STEPS);
  if (step <= 0) return pool.base;
  if (step !== pool.hazeStep) {
    pool.hazeStep = step;
    pool.hazed.length = 0;
    pool.hazed.length = POOL;
  }
  return pool.hazed as SpectatorLook[];
}

/** Fog one look on demand, the first time this block draws it at this depth. */
function resolve(pool: LookPool, looks: SpectatorLook[], i: number, a: Atmosphere, depth: number): SpectatorLook {
  const hit = looks[i];
  if (hit) return hit;
  const b = pool.base[i];
  const F = (hex: string) => fogged(hex, a, depth);
  const out: SpectatorLook = {
    ...b,
    top: F(b.top),
    topShade: F(b.topShade),
    topRim: F(b.topRim),
    sleeve: F(b.sleeve),
    legs: F(b.legs),
    skin: F(b.skin),
    skinShade: F(b.skinShade),
    hair: F(b.hair),
    hat: b.hat ? F(b.hat) : null,
    scarf: b.scarf ? F(b.scarf) : null,
  };
  looks[i] = out;
  return out;
}

export interface Spectator {
  x: number;
  y: number;
  /** Seat height — the figure's hips. */
  z: number;
  /** Unit vector toward the pitch, with a little per-seat jitter. */
  fx: number;
  fy: number;
  /** Index into the block's look pool. */
  look: number;
  /** Animation offset, so a row ripples instead of pulsing as one. */
  phase: number;
  /** 0 = always drawn; higher ranks thin out first as the block recedes. */
  rank: number;
}

/** Everything the crowd needs to know about the match, per frame. */
export interface CrowdMood {
  /** Baseline arousal from the run of play, 0..1. */
  excitement: number;
  /** Celebration spike, 0..1, decaying over the seconds after a goal. */
  celebration: number;
  /** Who just scored — their end goes up, the other end sits on its hands. */
  scoringSide: 0 | 1 | null;
}

export interface CrowdFrame {
  time: number;
  /** How animated this block is right now, 0..1. */
  drive: number;
  /** Position along the ring, so reactions travel round the bowl as a wave. */
  ringPhase: number;
  night: boolean;
  /** True when this block's spectators are turned toward the lens. */
  faceOn: boolean;
  /** Screen-space rim-light offset, away from the key light. */
  rimX: number;
  rimY: number;
  /** Highest level of detail this frame's budget will pay for. */
  maxDetail: number;
  /**
   * The block's own screen frame: where one world metre up, and one metre to a
   * spectator's left, land in pixels — measured once at the block centre, along
   * with the pixels-per-metre there.
   *
   * A seat borrows this instead of projecting its own, scaling it by its own
   * pixels-per-metre. Across one block the camera basis barely rotates; all
   * that really changes between seats is the perspective scale, and that is the
   * part the ratio restores. The residual is a fraction of a pixel on a figure
   * four pixels tall, and it saves two projections per spectator on the tier
   * that holds most of the crowd. Nearer seats, where the approximation would
   * start to show, project properly.
   */
  baseUx: number;
  baseUy: number;
  baseLx: number;
  baseLy: number;
  basePx: number;
  /** False when the block centre could not be projected; seats fall back. */
  baseOk: boolean;
}

const IDLE = 0;
const CLAP = 1;
const RAISE = 2;
const SCARF = 3;

/**
 * Accumulator for the flat-mark tier, which is most of any crowd.
 *
 * The cost of a distant spectator is not its geometry — it is two rectangles —
 * but the canvas state changes around it. Assigning `fillStyle` re-parses a CSS
 * colour string, and a `fill()` is a draw call; doing both twice per seat is
 * what makes five thousand marks expensive, and it is why the cheapest tier
 * measured almost half the crowd's frame time before this existed.
 *
 * Because looks are pooled, a block only has {@link POOL} distinct colours in
 * it. So marks are bucketed by look, and each bucket is emitted as one path and
 * one fill. Five thousand state changes become ninety-six.
 *
 * Bucketing reorders the marks within a block, which would matter for bodies —
 * a stand has to be painted back to front. It does not matter here: these are
 * one- to three-pixel marks whose overlap is a fraction of a pixel. Blocks are
 * still drawn in depth order, which is the ordering that carries the bowl.
 */
const bodies: number[][] = Array.from({ length: POOL }, () => []);
const headMarks: number[][] = Array.from({ length: POOL }, () => []);
const headDomes: number[][] = Array.from({ length: POOL }, () => []);
const armSegs: number[][] = Array.from({ length: POOL }, () => []);
const markedLooks: number[] = [];

/** Note that this look has something waiting to be drawn. */
function touch(i: number) {
  if (bodies[i].length + headMarks[i].length + headDomes[i].length + armSegs[i].length === 0) {
    markedLooks.push(i);
  }
}

/** Emit everything bucketed so far: one path and one draw call per colour. */
export function flushMarks(
  ctx: CanvasRenderingContext2D,
  looks: SpectatorLook[],
  pool: LookPool,
  f: CrowdFrame,
) {
  for (const i of markedLooks) {
    const base = pool.base[i];
    const look = looks === pool.base ? base : looks[i] ?? base;
    const body = bodies[i];
    const flat = headMarks[i];
    const dome = headDomes[i];
    const arms = armSegs[i];

    if (body.length) {
      ctx.fillStyle = look.top;
      ctx.beginPath();
      for (let k = 0; k < body.length; k += 4) ctx.rect(body[k], body[k + 1], body[k + 2], body[k + 3]);
      ctx.fill();
      body.length = 0;
    }
    if (flat.length) {
      ctx.fillStyle = look.skin;
      ctx.beginPath();
      for (let k = 0; k < flat.length; k += 4) ctx.rect(flat[k], flat[k + 1], flat[k + 2], flat[k + 3]);
      ctx.fill();
      flat.length = 0;
    }
    if (dome.length) {
      ctx.fillStyle = f.faceOn ? look.skin : look.hat ?? (base.hairMass > 0 ? look.hair : look.skin);
      ctx.beginPath();
      for (let k = 0; k < dome.length; k += 3) {
        const rx = dome[k + 2] * 0.92;
        // `moveTo` first, every time. Unlike `rect`, an `ellipse` continues the
        // current subpath, so a batch of them without this is one path joined
        // by straight lines between the heads — which fills as a fan of huge
        // triangles the moment the crowd is thinned enough to separate them.
        ctx.moveTo(dome[k] + rx, dome[k + 1]);
        ctx.ellipse(dome[k], dome[k + 1], rx, dome[k + 2], 0, 0, Math.PI * 2);
      }
      ctx.fill();
      dome.length = 0;
    }
    if (arms.length) {
      // One width for the whole bucket: within a look and a block, an arm is
      // the same fraction of a pixel wide either way, and the floor catches it.
      ctx.strokeStyle = look.sleeve;
      ctx.lineWidth = Math.max(0.6, 0.185 * base.build * 0.62 * f.basePx);
      ctx.beginPath();
      for (let k = 0; k < arms.length; k += 4) {
        ctx.moveTo(arms[k], arms[k + 1]);
        ctx.lineTo(arms[k + 2], arms[k + 3]);
      }
      ctx.stroke();
      arms.length = 0;
    }
  }
  markedLooks.length = 0;
}

interface Pt {
  x: number;
  y: number;
}

function capsule(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.6, width);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** Scratch points — one spectator's joints, reused for every spectator. */
const J: Pt[] = Array.from({ length: 24 }, () => ({ x: 0, y: 0 }));

/** Draw one spectator, at whatever level of detail its size on screen earns. */
export function drawSpectator(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  s: Spectator,
  pool: LookPool,
  looks: SpectatorLook[],
  atmos: Atmosphere,
  f: CrowdFrame,
) {
  const base = pool.base[s.look];

  /**
   * Reaction. `drive` is how much this end has to shout about; `calm` is how
   * much it takes to get this particular person up. The travelling term is what
   * stops a stand from moving as one animal — a roar reaches the far corner a
   * beat after the goal, exactly as it does in a real ground.
   */
  const wave = Math.sin(f.ringPhase * 2.4 - f.time * 1.1) * 0.14;
  const energy = f.drive + wave + Math.sin(s.phase * 1.7 + f.time * 0.7) * 0.07 - base.calm;

  let state = IDLE;
  if (energy > 0.34) state = base.gesture === 2 && base.scarf ? SCARF : base.gesture === 1 ? RAISE : CLAP;
  else if (energy > 0.08) state = CLAP;

  // Standing up is gradual: they half rise, then commit.
  const stand = energy <= 0.16 ? 0 : Math.min(1, (energy - 0.16) * 2.6);
  const lift = stand * 0.42;
  // Idle bodies still shift their weight and breathe.
  const sway = Math.sin(f.time * (1.4 + state * 0.6) + s.phase) * (0.008 + stand * 0.02);

  const o = cam.project(s.x, s.y, s.z + lift + sway);
  if (!o.visible) return;
  if (o.x < -8 || o.x > cam.width + 8 || o.y < -10 || o.y > cam.height + 10) return;

  const px = o.scale;
  if (px < 1.2) return;

  const look = looks === pool.base ? base : resolve(pool, looks, s.look, atmos, o.d);
  const H = base.height;
  const B = 0.185 * base.build;

  /**
   * Level of detail, in pixels per metre.
   *
   * The thresholds are set by what the shipped cameras actually deliver, not by
   * round numbers. No camera in the game gets closer to a spectator than about
   * ten pixels per metre — the gantry looks *over* its own stand, so the nearest
   * crowd in any frame is the far touchline, a hundred-odd metres out. Setting
   * the top tier where it is means the closest fans on screen get the full
   * figure, which is the only place the top tier would ever be seen.
   */
  const detail = Math.min(f.maxDetail, px < 2.6 ? 0 : px < 5 ? 1 : px < 8.5 ? 2 : 3);

  if (detail === 0) {
    /**
     * Furthest tier. Distant fans lose contrast rather than gaining blur: at a
     * couple of pixels across there is nothing to defocus, and washing the mark
     * toward the haze is what depth of field does to detail this small anyway.
     *
     * Bucketed rather than drawn — see {@link flushMarks}.
     */
    const w = Math.max(0.8, px * 0.26);
    touch(s.look);
    bodies[s.look].push(o.x - w * 0.5, o.y - w * 1.5, w, w * 1.7);
    headMarks[s.look].push(o.x - w * 0.35, o.y - w * 2.1, w * 0.7, w * 0.7);
    return;
  }

  /**
   * Anything bucketed so far belongs behind this figure, so it goes down first.
   *
   * `fillCrowd` seats the stand back to front, and detail falls off with depth,
   * so the marks come first in the array and this boundary is crossed a handful
   * of times per block rather than per seat.
   */
  if (detail >= 2 && markedLooks.length) flushMarks(ctx, looks, pool, f);

  /**
   * The spectator's own frame, in screen pixels: where a metre up, a metre to
   * their left and a metre in front of the seat land. Three projections buy the
   * whole body — every joint below is an affine combination of these, which is
   * why a figure this cheap still turns with the stand it sits in and leans
   * correctly toward the pitch.
   */
  let ux: number;
  let uy: number;
  let lx: number;
  let ly: number;
  // Forward only matters once hands come off the body, and no offset in it
  // exceeds a quarter of a metre — under six pixels per metre that is inside
  // the line width, so it is not bought at all below the near tiers.
  let fwX = 0;
  let fwY = 0;

  if (detail >= 2 || !f.baseOk) {
    const up = cam.project(s.x, s.y, s.z + lift + 0.5);
    const lat = cam.project(s.x - s.fy * 0.5, s.y + s.fx * 0.5, s.z + lift);
    if (!up.visible || !lat.visible) return;
    ux = (up.x - o.x) * 2;
    uy = (up.y - o.y) * 2;
    lx = (lat.x - o.x) * 2;
    ly = (lat.y - o.y) * 2;
    if (detail >= 2) {
      const fwd = cam.project(s.x + s.fx * 0.5, s.y + s.fy * 0.5, s.z + lift);
      if (!fwd.visible) return;
      fwX = (fwd.x - o.x) * 2;
      fwY = (fwd.y - o.y) * 2;
    }
  } else {
    // Borrowed from the block, rescaled to this seat's depth.
    const k = px / f.basePx;
    ux = f.baseUx * k;
    uy = f.baseUy * k;
    lx = f.baseLx * k;
    ly = f.baseLy * k;
  }

  let n = 0;
  const P = (u: number, l: number, w: number): Pt => {
    const p = J[n++];
    p.x = o.x + ux * u + lx * l + fwX * w;
    p.y = o.y + uy * u + ly * l + fwY * w;
    return p;
  };

  // Turned toward a neighbour, mid-conversation, when nothing is happening.
  const chat = state === IDLE ? base.chatter * (0.5 + 0.5 * Math.sin(f.time * 0.5 + s.phase)) : 0;
  const lean = chat * 0.05;

  const hipMid = P(0, 0, 0);
  const chest = P(H * 0.46, lean * 0.6, 0.02);
  const neck = P(H * 0.57, lean, 0.01);
  const head = P(H * 0.72 + stand * 0.01, lean * 1.4, 0.02 + chat * 0.02);
  const headR = Math.max(0.9, H * 0.115 * px);

  const chestW = B * 1.85 * px;

  // --- arms ---------------------------------------------------------------
  // One shared clap/wave cycle per person; the phase offset is what keeps a
  // stand from applauding in lockstep.
  const beat = f.time * (state === CLAP ? 8.4 : 3.1) + s.phase;
  const c = Math.sin(beat) * 0.5 + 0.5;
  // The two arms run on offset cycles, so raised hands are never level. Two
  // hands rising and falling together look like a puppet.
  const c2 = Math.sin(beat + 1.9) * 0.5 + 0.5;

  let armU = 0;
  let armL = 0;
  let armW = 0;
  let handU = 0;
  let handL = 0;
  let handW = 0;
  /** Height of the far hand, which only differs when the arms are up. */
  let handUFar = 0;
  if (state === CLAP) {
    // Elbows low and in, hands up and together in front of the chest. Level
    // elbows and hands put a horizontal bar across every torso in the stand.
    armU = H * 0.24;
    armL = B + 0.06;
    armW = 0.1;
    handU = H * 0.36;
    handL = 0.03 + c * 0.06;
    handW = 0.19;
  } else if (state === RAISE) {
    // Elbows out wide, hands in over the head. Straight vertical arms read as
    // two candles either side of the face; the bend is what makes them arms.
    armU = H * 0.56;
    armL = B + 0.12;
    armW = 0.03;
    handU = H * (0.9 + c * 0.06);
    handUFar = H * (0.9 + c2 * 0.06);
    handL = B - 0.02;
    handW = 0.02;
  } else if (state === SCARF) {
    armU = H * 0.64;
    armL = B + 0.13;
    armW = 0.02;
    handU = H * (0.96 + c * 0.03);
    handUFar = H * (0.96 + c2 * 0.03);
    handL = B + 0.26;
    handW = 0;
  } else {
    armU = H * 0.3;
    armL = B + 0.03;
    armW = 0.05;
    handU = H * (0.15 + Math.sin(beat * 0.5) * 0.02);
    handL = B + 0.02;
    handW = 0.17;
  }
  if (!handUFar) handUFar = handU;

  const armWidth = Math.max(0.6, B * 0.62 * px);

  if (detail === 1) {
    /**
     * Middle tier, and the one that holds most of a stand. Everything it draws
     * is bucketed rather than issued: a stroked capsule and a filled ellipse per
     * seat were costing more than the geometry they described.
     *
     * The torso becomes an upright rectangle instead of a capsule. At four to
     * eight pixels tall the round caps of a capsule are a pixel of antialiasing
     * on each end, and a rect goes into the same batched path as the far tier.
     * The arms stay real segments, because whether a stand has its arms up is
     * the one thing that reads at this size.
     */
    touch(s.look);
    const w = Math.max(0.9, chestW);
    bodies[s.look].push((chest.x + hipMid.x) * 0.5 - w * 0.5, chest.y - w * 0.45, w, hipMid.y - chest.y + w * 0.65);
    headDomes[s.look].push(head.x, head.y, headR);
    if (state !== IDLE) {
      const seg = armSegs[s.look];
      seg.push(chest.x, chest.y, o.x + ux * handU - lx * handL, o.y + uy * handU - ly * handL);
      seg.push(chest.x, chest.y, o.x + ux * handUFar + lx * handL, o.y + uy * handUFar + ly * handL);
    }
    return;
  }

  {
    /**
     * Far arm behind the chest, near arm in front, so the body has a front and
     * a back rather than reading as a cut-out. It carries more than it looks
     * like it should: without it every figure in the stand narrows to a pill,
     * because the arms at rest are what give a seated torso its shoulders.
     *
     * The elbow only survives in the closest rows, so everywhere else it is one
     * segment straight to the hand — same silhouette, half the draw calls on
     * the tier that spends the most of them.
     */
    const h0 = P(handUFar, handL, handW);
    const shoulderF = P(H * 0.49, B, 0);
    if (detail >= 3) {
      const e0 = P(armU, armL, armW);
      capsule(ctx, shoulderF, e0, armWidth, look.topShade);
      // Forearms take the sleeve, never bare skin — a stand full of pale arms
      // raised against dark coats reads as antlers. Whoever is actually in short
      // sleeves has skin as their sleeve colour already.
      capsule(ctx, e0, h0, armWidth * 0.86, look.sleeve);
    } else {
      capsule(ctx, shoulderF, h0, armWidth, look.topShade);
    }
  }

  // --- torso --------------------------------------------------------------
  if (detail >= 3) {
    // Rim pass: the same chest nudged toward the key light in a brighter tint,
    // so a sliver of it survives along one edge. Same trick the players use.
    capsule(
      ctx,
      { x: hipMid.x + f.rimX, y: hipMid.y + f.rimY },
      { x: chest.x + f.rimX, y: chest.y + f.rimY },
      chestW,
      look.topRim,
    );
  }
  capsule(ctx, hipMid, chest, chestW, look.top);
  {
    /**
     * Occlusion where the body meets the seat. Legs are deliberately not drawn:
     * every camera in the game looks *down* into the stands, so a seated fan's
     * thighs are behind the row in front of them and their own knees. Drawing
     * them puts a dark lozenge on the step in front of each figure, which reads
     * as luggage rather than as a person.
     */
    capsule(ctx, hipMid, P(H * 0.18, 0, 0.03), chestW * 0.92, look.topShade);
  }

  // --- near arm and hands -------------------------------------------------
  {
    const e1 = P(armU, -armL, armW);
    const h1 = P(handU, -handL, handW);
    const shoulderN = P(H * 0.49, -B, 0);
    capsule(ctx, shoulderN, e1, armWidth, look.top);
    capsule(ctx, e1, h1, armWidth * 0.86, look.sleeve);
    if (detail >= 3 && state !== IDLE) {
      // Hands, once they are more than a pixel across.
      ctx.fillStyle = look.skin;
      ctx.beginPath();
      ctx.arc(h1.x, h1.y, armWidth * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }

    // Scarf held overhead, sagging between the hands.
    if (state === SCARF && look.scarf) {
      const h0 = P(handUFar, handL, handW);
      const sag = P(Math.min(handU, handUFar) - H * 0.16, 0, 0);
      const w = Math.max(0.8, headR * 0.5);
      capsule(ctx, h1, sag, w, look.scarf);
      capsule(ctx, sag, h0, w, look.scarf);
    }
  }

  // --- head ---------------------------------------------------------------
  // The neck is about a pixel until the very closest rows, where the shadow
  // under the jaw starts to matter.
  if (detail >= 3) capsule(ctx, neck, head, headR * 0.72, look.skinShade);

  if (base.hairMass > 0) {
    // Hair as a whole skull first, with the face cut back into it — a cap laid
    // over the top leaves a hard hairline that reads as a helmet, and a fan
    // turned away from the lens should show a full head of hair.
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - headR * 0.12, headR * base.hairMass * 0.92, headR * base.hairMass, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  {
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    if (f.faceOn) {
      const inset = base.hairMass > 0 ? headR * 0.16 : 0;
      ctx.ellipse(head.x, head.y + inset * 0.7, headR * 0.88 - inset * 0.5, headR - inset, 0, 0, Math.PI * 2);
    } else {
      // Turned away: the nape below the hairline is all there is to see.
      ctx.ellipse(head.x, head.y + headR * 0.55, headR * 0.58, headR * 0.4, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  if (look.hat) {
    // A beanie sits over the crown; the brim only survives at the closest rows.
    ctx.fillStyle = look.hat;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y - headR * 0.34, headR * 0.98, headR * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    if (detail >= 3) {
      capsule(ctx, { x: head.x - headR, y: head.y - headR * 0.28 }, { x: head.x + headR, y: head.y - headR * 0.28 }, headR * 0.36, shade(look.hat, -0.18));
    }
  }

  // Scarf round the neck when it is not being waved.
  if (look.scarf && state !== SCARF && detail >= 3) {
    capsule(ctx, P(H * 0.5, -B * 0.7, 0.04), P(H * 0.5, B * 0.7, 0.04), headR * 0.44, look.scarf);
  }

}
