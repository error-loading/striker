import { GOAL_Y_MAX, GOAL_Y_MIN, PITCH } from '../engine/constants';
import type { Camera } from './camera';
import { fillWorldPoly, worldArc, worldLine, worldStroke } from './draw';

const L = PITCH.length;
const W = PITCH.width;
const LINE = 0.12;
const LINE_COLOR = 'rgba(255,255,255,0.92)';

export interface PitchTheme {
  /** Base grass colour, darkened at night. */
  grassDark: string;
  grassLight: string;
  /** Ambient light multiplier, 0..1. */
  light: number;
}

export function pitchTheme(night: boolean, weather: string): PitchTheme {
  if (night) {
    return { grassDark: '#0E3A1C', grassLight: '#14512A', light: 0.86 };
  }
  if (weather === 'Snowy') return { grassDark: '#D9E6DE', grassLight: '#EDF4F0', light: 1.05 };
  if (weather === 'Rainy') return { grassDark: '#14481F', grassLight: '#1B5B2A', light: 0.82 };
  if (weather === 'Foggy') return { grassDark: '#1B5227', grassLight: '#246633', light: 0.9 };
  return { grassDark: '#1A5C28', grassLight: '#227334', light: 1 };
}

/** Mowed grass: bands running across the pitch, alternating light and dark. */
export function drawGrass(ctx: CanvasRenderingContext2D, cam: Camera, theme: PitchTheme) {
  const bands = 18;
  const bandW = L / bands;
  const m = PITCH.margin;

  // Run-off surround first, so the playing surface sits on top of it.
  fillWorldPoly(
    ctx,
    cam,
    [
      [-m, -m],
      [L + m, -m],
      [L + m, W + m],
      [-m, W + m],
    ],
    theme.grassDark,
  );

  for (let i = 0; i < bands; i++) {
    const x0 = i * bandW;
    const x1 = x0 + bandW;
    fillWorldPoly(
      ctx,
      cam,
      [
        [x0, 0],
        [x1, 0],
        [x1, W],
        [x0, W],
      ],
      i % 2 === 0 ? theme.grassLight : theme.grassDark,
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

/** Goal frames with a perspective-correct net mesh. */
export function drawGoals(ctx: CanvasRenderingContext2D, cam: Camera, night: boolean) {
  const h = PITCH.goalHeight;
  const depth = 2.0;
  const frame = night ? '#F4F7FA' : '#FFFFFF';

  for (const end of [0, 1]) {
    const gx = end === 0 ? 0 : L;
    const back = end === 0 ? -depth : L + depth;
    const y0 = GOAL_Y_MIN;
    const y1 = GOAL_Y_MAX;

    // Net panels: a translucent fill behind the mesh reads as netting.
    const netFill = 'rgba(238,246,255,0.11)';
    fillWorldPoly(ctx, cam, [[gx, y0, 0], [back, y0, 0], [back, y0, h * 0.82], [gx, y0, h]], netFill);
    fillWorldPoly(ctx, cam, [[gx, y1, 0], [back, y1, 0], [back, y1, h * 0.82], [gx, y1, h]], netFill);
    fillWorldPoly(ctx, cam, [[back, y0, 0], [back, y1, 0], [back, y1, h * 0.82], [back, y0, h * 0.82]], netFill);
    fillWorldPoly(ctx, cam, [[gx, y0, h], [gx, y1, h], [back, y1, h * 0.82], [back, y0, h * 0.82]], netFill);

    // Net mesh.
    const mesh = 'rgba(255,255,255,0.3)';
    const cols = 14;
    for (let i = 0; i <= cols; i++) {
      const t = i / cols;
      const y = y0 + (y1 - y0) * t;
      worldStroke(ctx, cam, [back, y, 0], [back, y, h * 0.82], mesh, 1);
      worldStroke(ctx, cam, [gx, y, h], [back, y, h * 0.82], mesh, 1);
    }
    const rows = 6;
    for (let i = 0; i <= rows; i++) {
      const z = (h * 0.82 * i) / rows;
      worldStroke(ctx, cam, [back, y0, z], [back, y1, z], mesh, 1);
    }
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const x = gx + (back - gx) * t;
      const z = h - (h - h * 0.82) * t;
      worldStroke(ctx, cam, [x, y0, 0], [x, y0, z], mesh, 1);
      worldStroke(ctx, cam, [x, y1, 0], [x, y1, z], mesh, 1);
    }

    // Posts and crossbar, drawn as solid boxes so they catch the light.
    const t = 0.06;
    fillWorldPoly(ctx, cam, [[gx - t, y0 - t, 0], [gx + t, y0 - t, 0], [gx + t, y0 - t, h], [gx - t, y0 - t, h]], frame);
    fillWorldPoly(ctx, cam, [[gx - t, y1 + t, 0], [gx + t, y1 + t, 0], [gx + t, y1 + t, h], [gx - t, y1 + t, h]], frame);
    fillWorldPoly(ctx, cam, [[gx - t, y0, h - t], [gx - t, y1, h - t], [gx - t, y1, h + t], [gx - t, y0, h + t]], frame);
    fillWorldPoly(ctx, cam, [[gx - t, y0, h + t], [gx + t, y0, h + t], [gx + t, y1, h + t], [gx - t, y1, h + t]], '#E7EDF5');
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

/** Soft pools of floodlight, plus a screen vignette. */
export function drawLighting(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  night: boolean,
  width: number,
  height: number,
) {
  if (night) {
    // Four light pools from the corner pylons.
    for (const [lx, ly] of [
      [L * 0.22, -12],
      [L * 0.78, -12],
      [L * 0.22, W + 12],
      [L * 0.78, W + 12],
    ]) {
      const p = cam.project(lx, ly, 0);
      if (!p.visible) continue;
      const r = p.scale * 42;
      if (r < 4 || r > 6000) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, 'rgba(214,236,255,0.16)');
      g.addColorStop(0.6, 'rgba(190,220,255,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
  }

  const v = ctx.createRadialGradient(
    width / 2,
    height * 0.55,
    Math.min(width, height) * 0.25,
    width / 2,
    height * 0.55,
    Math.max(width, height) * 0.78,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, night ? 'rgba(2,6,14,0.62)' : 'rgba(6,14,26,0.34)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, width, height);
}
