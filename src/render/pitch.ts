import { GOAL_Y_MAX, GOAL_Y_MIN, PITCH } from '../engine/constants';
import type { Atmosphere } from './atmosphere';
import { shadowOffset } from './atmosphere';
import type { Camera } from './camera';
import { fillWorldPoly, shade, worldArc, worldLine, worldStroke } from './draw';

const L = PITCH.length;
const W = PITCH.width;
const LINE = 0.12;
const LINE_COLOR = 'rgba(255,255,255,0.92)';

export interface PitchTheme {
  /** Base grass colour, darkened at night. */
  grassDark: string;
  grassLight: string;
  /** Run-off surround outside the touchlines. */
  surround: string;
  /** Ambient light multiplier, 0..1. */
  light: number;
}

export function pitchTheme(night: boolean, weather: string): PitchTheme {
  if (night) {
    return { grassDark: '#0F3D1E', grassLight: '#17552D', surround: '#0B2E17', light: 0.86 };
  }
  if (weather === 'Snowy') {
    return { grassDark: '#D9E6DE', grassLight: '#EDF4F0', surround: '#C9D8D0', light: 1.05 };
  }
  if (weather === 'Rainy') {
    return { grassDark: '#14481F', grassLight: '#1B5B2A', surround: '#103A19', light: 0.82 };
  }
  if (weather === 'Foggy') {
    return { grassDark: '#1B5227', grassLight: '#246633', surround: '#154220', light: 0.9 };
  }
  return { grassDark: '#1A5C28', grassLight: '#227334', surround: '#154A20', light: 1 };
}

/** Deterministic 0..1 noise, so the turf looks the same every frame. */
function hash2(i: number, j: number): number {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * The playing surface: mown bands running goal to goal, broken up across their
 * length so the turf is not one flat colour, then wear laid over the top.
 *
 * The run-off around the pitch is drawn by the stadium, which owns the rounded
 * ring the surround has to follow.
 */
export function drawGrass(ctx: CanvasRenderingContext2D, cam: Camera, theme: PitchTheme) {
  const bands = 18;
  const bandW = L / bands;
  // Each band is split across the pitch so it can vary in tone with distance.
  const chunks = 7;
  const chunkH = W / chunks;

  for (let i = 0; i < bands; i++) {
    const x0 = i * bandW;
    const x1 = x0 + bandW;
    const base = i % 2 === 0 ? theme.grassLight : theme.grassDark;
    for (let j = 0; j < chunks; j++) {
      const y0 = j * chunkH;
      const y1 = y0 + chunkH;
      // A touch of variation per patch: real turf is never uniform, and the
      // break-up is what stops the stripes reading as flat vector shapes.
      const v = (hash2(i, j) - 0.5) * 0.05;
      fillWorldPoly(ctx, cam, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], shade(base, v));
    }
  }

  // The roller leaves a faint cross-grain over the mown bands.
  const cross = 26;
  for (let j = 0; j < cross; j += 2) {
    const y0 = (W * j) / cross;
    const y1 = (W * (j + 1)) / cross;
    fillWorldPoly(ctx, cam, [[0, y0], [L, y0], [L, y1], [0, y1]], 'rgba(255,255,255,0.018)');
  }

  drawWear(ctx, cam);
}

/**
 * Wear patterns. A pitch late in a season is darkest where the traffic is:
 * both goalmouths, the centre circle, the penalty spots and a scuffed strip
 * along each touchline where the wingers work.
 */
function drawWear(ctx: CanvasRenderingContext2D, cam: Camera) {
  const scuff = 'rgba(28,52,24,0.2)';
  const heavy = 'rgba(30,48,22,0.3)';

  // Goalmouths: a worn arc in front of each goal.
  for (const end of [0, 1]) {
    const gx = end === 0 ? 0 : L;
    const dir = end === 0 ? 1 : -1;
    const steps = 16;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI - Math.PI / 2;
      pts.push([gx + dir * Math.cos(t) * 9.5, W / 2 + Math.sin(t) * 12, 0.004]);
    }
    pts.push([gx, W / 2 + 12, 0.004], [gx, W / 2 - 12, 0.004]);
    fillWorldPoly(ctx, cam, pts, heavy);

    // The keeper's own path across his six-yard line.
    fillWorldPoly(
      ctx,
      cam,
      [
        [gx + dir * 0.4, W / 2 - 5.2, 0.005],
        [gx + dir * 3.2, W / 2 - 5.2, 0.005],
        [gx + dir * 3.2, W / 2 + 5.2, 0.005],
        [gx + dir * 0.4, W / 2 + 5.2, 0.005],
      ],
      scuff,
    );

    // Penalty spot run-up.
    const spot = gx + dir * PITCH.penaltySpot;
    fillWorldPoly(
      ctx,
      cam,
      [
        [spot - 1.6, W / 2 - 1.6, 0.005],
        [spot + 1.6, W / 2 - 1.6, 0.005],
        [spot + 1.6, W / 2 + 1.6, 0.005],
        [spot - 1.6, W / 2 + 1.6, 0.005],
      ],
      scuff,
    );
  }

  // Centre circle, where every kickoff and most of the midfield traffic lands.
  const ring: [number, number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ring.push([L / 2 + Math.cos(a) * 7.4, W / 2 + Math.sin(a) * 6.2, 0.004]);
  }
  fillWorldPoly(ctx, cam, ring, scuff);

  // Touchline channels.
  for (const y of [2.6, W - 2.6]) {
    fillWorldPoly(
      ctx,
      cam,
      [
        [6, y - 2.2, 0.003],
        [L - 6, y - 2.2, 0.003],
        [L - 6, y + 2.2, 0.003],
        [6, y + 2.2, 0.003],
      ],
      'rgba(28,52,24,0.13)',
    );
  }
}

/** All white markings, to Laws of the Game dimensions. */
export function drawMarkings(ctx: CanvasRenderingContext2D, cam: Camera) {
  const c = LINE_COLOR;

  // Touchlines and goal lines.
  worldLine(ctx, cam, 0, 0, L, 0, LINE, c);
  worldLine(ctx, cam, 0, W, L, W, LINE, c);
  worldLine(ctx, cam, 0, 0, 0, W, LINE, c);
  worldLine(ctx, cam, L, 0, L, W, LINE, c);

  // Halfway line and centre circle.
  worldLine(ctx, cam, L / 2, 0, L / 2, W, LINE, c);
  worldArc(ctx, cam, L / 2, W / 2, PITCH.circleRadius, 0, Math.PI * 2, LINE, c, 64);
  // Centre spot.
  worldArc(ctx, cam, L / 2, W / 2, 0.14, 0, Math.PI * 2, 0.28, c, 12);

  for (const end of [0, 1]) {
    const gx = end === 0 ? 0 : L;
    const dir = end === 0 ? 1 : -1;

    // Penalty area (18 yards).
    const pDepth = gx + dir * PITCH.penaltyAreaDepth;
    const pyMin = W / 2 - PITCH.penaltyAreaWidth / 2;
    const pyMax = W / 2 + PITCH.penaltyAreaWidth / 2;
    worldLine(ctx, cam, gx, pyMin, pDepth, pyMin, LINE, c);
    worldLine(ctx, cam, gx, pyMax, pDepth, pyMax, LINE, c);
    worldLine(ctx, cam, pDepth, pyMin, pDepth, pyMax, LINE, c);

    // Goal area (6 yards).
    const gDepth = gx + dir * PITCH.goalAreaDepth;
    const gyMin = W / 2 - PITCH.goalAreaWidth / 2;
    const gyMax = W / 2 + PITCH.goalAreaWidth / 2;
    worldLine(ctx, cam, gx, gyMin, gDepth, gyMin, LINE, c);
    worldLine(ctx, cam, gx, gyMax, gDepth, gyMax, LINE, c);
    worldLine(ctx, cam, gDepth, gyMin, gDepth, gyMax, LINE, c);

    // Penalty spot.
    const spotX = gx + dir * PITCH.penaltySpot;
    worldArc(ctx, cam, spotX, W / 2, 0.14, 0, Math.PI * 2, 0.28, c, 12);

    // Penalty arc — only the segment outside the box.
    const dxToLine = PITCH.penaltyAreaDepth - PITCH.penaltySpot;
    const theta = Math.acos(Math.min(1, dxToLine / PITCH.circleRadius));
    const base = end === 0 ? 0 : Math.PI;
    worldArc(ctx, cam, spotX, W / 2, PITCH.circleRadius, base - theta, base + theta, LINE, c, 32);

    // Corner arcs.
    const cornerBase = end === 0 ? 0 : Math.PI;
    worldArc(ctx, cam, gx, 0, PITCH.cornerArc, cornerBase, cornerBase + Math.PI / 2, LINE, c, 12);
    worldArc(ctx, cam, gx, W, PITCH.cornerArc, cornerBase - Math.PI / 2, cornerBase, LINE, c, 12);
  }
}

/**
 * Goal frames with a perspective-correct net.
 *
 * The net is built as a real box — two side panels, a back and a roof — with
 * the back panel raked away from the goal line and the roof sagging between the
 * crossbar and the back stanchion, which is what gives a goal its depth from a
 * broadcast angle. The mesh is drawn as strokes over a translucent fill so it
 * stays legible at any distance.
 */
export function drawGoals(ctx: CanvasRenderingContext2D, cam: Camera, night: boolean, atmos: Atmosphere) {
  const h = PITCH.goalHeight;
  const depth = 2.3;
  const backZ = h * 0.72;
  const frame = night ? '#F6F9FC' : '#FFFFFF';
  const shadowed = night ? '#C9D4E2' : '#D8E0EA';

  for (const end of [0, 1]) {
    const gx = end === 0 ? 0 : L;
    const dir = end === 0 ? -1 : 1;
    const back = gx + dir * depth;
    const y0 = GOAL_Y_MIN;
    const y1 = GOAL_Y_MAX;

    // Shadow of the frame on the grass, so the goal sits on the pitch rather
    // than floating over it.
    const sh = shadowOffset(atmos, h);
    const shb = shadowOffset(atmos, backZ);
    fillWorldPoly(
      ctx,
      cam,
      [
        [gx, y0, 0.006],
        [gx + sh.dx, y0 + sh.dy, 0.006],
        [back + shb.dx, y1 + shb.dy, 0.006],
        [back, y1, 0.006],
      ],
      night ? 'rgba(4,14,26,0.2)' : 'rgba(8,22,14,0.16)',
    );

    // Net panels: a translucent fill behind the mesh reads as netting.
    const netFill = night ? 'rgba(226,238,255,0.13)' : 'rgba(244,250,255,0.16)';
    const sideL: [number, number, number][] = [
      [gx, y0, 0],
      [back, y0, 0],
      [back, y0, backZ],
      [gx, y0, h],
    ];
    const sideR: [number, number, number][] = [
      [gx, y1, 0],
      [back, y1, 0],
      [back, y1, backZ],
      [gx, y1, h],
    ];
    fillWorldPoly(ctx, cam, sideL, netFill);
    fillWorldPoly(ctx, cam, sideR, netFill);
    fillWorldPoly(ctx, cam, [[back, y0, 0], [back, y1, 0], [back, y1, backZ], [back, y0, backZ]], netFill);
    fillWorldPoly(ctx, cam, [[gx, y0, h], [gx, y1, h], [back, y1, backZ], [back, y0, backZ]], netFill);

    // Mesh. Denser than the old net, and drawn on both the back and the roof,
    // which is the part the camera looks straight into.
    const mesh = night ? 'rgba(248,252,255,0.42)' : 'rgba(255,255,255,0.5)';
    const thin = night ? 'rgba(230,242,255,0.24)' : 'rgba(255,255,255,0.3)';
    const cols = 20;
    for (let i = 0; i <= cols; i++) {
      const y = y0 + ((y1 - y0) * i) / cols;
      // Verticals down the back, and the roof lines running goal to stanchion.
      worldStroke(ctx, cam, [back, y, 0], [back, y, backZ], mesh, 1);
      worldStroke(ctx, cam, [gx, y, h], [back, y, backZ], thin, 1);
    }
    const rows = 9;
    for (let i = 0; i <= rows; i++) {
      const z = (backZ * i) / rows;
      worldStroke(ctx, cam, [back, y0, z], [back, y1, z], mesh, 1);
    }
    // Side-panel mesh, and the ribs running back from the goal line.
    const ribs = 7;
    for (let i = 0; i <= ribs; i++) {
      const t = i / ribs;
      const x = gx + (back - gx) * t;
      const z = h + (backZ - h) * t;
      worldStroke(ctx, cam, [x, y0, 0], [x, y0, z], thin, 1);
      worldStroke(ctx, cam, [x, y1, 0], [x, y1, z], thin, 1);
      const zz = (backZ * i) / ribs;
      worldStroke(ctx, cam, [gx, y0, zz], [back, y0, zz], thin, 1);
      worldStroke(ctx, cam, [gx, y1, zz], [back, y1, zz], thin, 1);
    }

    // Posts and crossbar as solid boxes, with a shaded face so they read as
    // round steel rather than flat tape.
    const t = 0.065;
    for (const [yp, sgn] of [
      [y0, -1],
      [y1, 1],
    ] as const) {
      fillWorldPoly(
        ctx,
        cam,
        [
          [gx - t, yp + sgn * t, 0],
          [gx + t, yp + sgn * t, 0],
          [gx + t, yp + sgn * t, h],
          [gx - t, yp + sgn * t, h],
        ],
        frame,
      );
      fillWorldPoly(
        ctx,
        cam,
        [
          [gx + t, yp + sgn * t, 0],
          [gx + t, yp - sgn * t, 0],
          [gx + t, yp - sgn * t, h],
          [gx + t, yp + sgn * t, h],
        ],
        shadowed,
      );
    }
    // Crossbar: front face plus a lit top edge.
    fillWorldPoly(ctx, cam, [[gx - t, y0, h - t], [gx - t, y1, h - t], [gx - t, y1, h + t], [gx - t, y0, h + t]], frame);
    fillWorldPoly(ctx, cam, [[gx - t, y0, h + t], [gx + t, y0, h + t], [gx + t, y1, h + t], [gx - t, y1, h + t]], shade(frame, -0.06));

    // Back stanchions holding the net up.
    for (const yp of [y0, y1]) {
      fillWorldPoly(
        ctx,
        cam,
        [
          [back - 0.05, yp, 0],
          [back + 0.05, yp, 0],
          [back + 0.05, yp, backZ],
          [back - 0.05, yp, backZ],
        ],
        shadowed,
      );
    }
  }
}

/** Corner flags — small, but their absence is instantly noticeable. */
export function drawCornerFlags(ctx: CanvasRenderingContext2D, cam: Camera, time: number) {
  const height = 1.5;
  for (const [x, y] of [
    [0, 0],
    [L, 0],
    [0, W],
    [L, W],
  ]) {
    const base = cam.project(x, y, 0);
    const top = cam.project(x, y, height);
    if (!base.visible || !top.visible) continue;
    if (base.x < -60 || base.x > cam.width + 60) continue;

    ctx.strokeStyle = '#F2F5F8';
    ctx.lineWidth = Math.max(1, base.scale * 0.045);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();

    // Pennant, fluttering toward the middle of the pitch.
    const inward = x === 0 ? 1 : -1;
    const flutter = Math.sin(time * 4 + x + y) * 0.18;
    const w = Math.max(3, top.scale * 0.42) * inward;
    const h = Math.max(2, top.scale * 0.3);
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(top.x + w, top.y + h * (0.45 + flutter));
    ctx.lineTo(top.x, top.y + h);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Floodlight pools laid over the turf, then the overall grade.
 *
 * `rigs` are the ground positions of the corner masts, so the pools land where
 * the lights actually are rather than at four guessed points. Each rig throws a
 * pool toward the middle of the pitch, which is what produces the overlapping
 * bright centre and darker corners a floodlit pitch has.
 */
export function drawLighting(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  night: boolean,
  width: number,
  height: number,
  rigs: [number, number][],
) {
  ctx.save();
  if (night) {
    ctx.globalCompositeOperation = 'lighter';
    for (const [rx, ry] of rigs) {
      // Aim each pool a third of the way in from its own corner.
      const lx = rx + (L / 2 - rx) * 0.62;
      const ly = ry + (W / 2 - ry) * 0.62;
      const p = cam.project(lx, ly, 0);
      if (!p.visible) continue;
      const r = p.scale * 46;
      if (r < 6 || r > 8000) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, 'rgba(150,178,214,0.15)');
      g.addColorStop(0.45, 'rgba(122,150,188,0.07)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Warm sodium cast over the whole scene, the colour a floodlit ground has
    // on camera once white balance settles.
    ctx.fillStyle = 'rgba(255,214,150,0.055)';
    ctx.fillRect(0, 0, width, height);
  } else {
    // Daylight: a soft warm wash from the sun side, cooling into the shadows.
    const g = ctx.createLinearGradient(0, 0, width * 0.8, height);
    g.addColorStop(0, 'rgba(255,246,214,0.09)');
    g.addColorStop(0.55, 'rgba(255,250,235,0.03)');
    g.addColorStop(1, 'rgba(150,180,210,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();

  const v = ctx.createRadialGradient(
    width / 2,
    height * 0.55,
    Math.min(width, height) * 0.3,
    width / 2,
    height * 0.55,
    Math.max(width, height) * 0.8,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, night ? 'rgba(2,6,14,0.58)' : 'rgba(6,14,26,0.3)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, width, height);
}
