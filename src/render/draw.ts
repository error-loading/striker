import type { Camera } from './camera';

/** Fill a world-space polygon (list of [x, y, z] triples) in screen space. */
export function fillWorldPoly(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pts: [number, number, number?][],
  fill: string | CanvasGradient,
) {
  ctx.beginPath();
  let started = false;
  for (const [x, y, z] of pts) {
    const p = cam.project(x, y, z ?? 0);
    if (!p.visible) return; // Any vertex behind the camera: skip the whole face.
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  if (!started) return;
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * Draw a pitch marking as a world-space rectangle so its on-screen thickness
 * foreshortens correctly with distance — a stroked line would not.
 */
export function worldLine(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return;
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  fillWorldPoly(
    ctx,
    cam,
    [
      [x1 + nx, y1 + ny, 0.01],
      [x2 + nx, y2 + ny, 0.01],
      [x2 - nx, y2 - ny, 0.01],
      [x1 - nx, y1 - ny, 0.01],
    ],
    color,
  );
}

/** Circular arc drawn as a ribbon of world-space quads. */
export function worldArc(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  cxw: number,
  cyw: number,
  radius: number,
  from: number,
  to: number,
  width: number,
  color: string,
  segments = 48,
) {
  const step = (to - from) / segments;
  for (let i = 0; i < segments; i++) {
    const a0 = from + step * i;
    const a1 = from + step * (i + 1);
    worldLine(
      ctx,
      cam,
      cxw + Math.cos(a0) * radius,
      cyw + Math.sin(a0) * radius,
      cxw + Math.cos(a1) * radius,
      cyw + Math.sin(a1) * radius,
      width,
      color,
    );
  }
}

/** Stroke a world-space 3D segment with a constant screen width (nets, frames). */
export function worldStroke(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  a: [number, number, number],
  b: [number, number, number],
  color: string,
  px = 1,
) {
  const p1 = cam.project(a[0], a[1], a[2]);
  const p2 = cam.project(b[0], b[1], b[2]);
  if (!p1.visible || !p2.visible) return;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = px;
  ctx.stroke();
}

/** Mix two hex colours; `t` of 0 returns `a`. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round((((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t));
  const g = Math.round((((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t));
  const bl = Math.round(((pa & 255) * (1 - t) + (pb & 255) * t));
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/** Darken (t<0) or lighten (t>0) a hex colour. */
export function shade(hex: string, t: number): string {
  return mixHex(hex, t < 0 ? '#000000' : '#ffffff', Math.abs(t));
}

/** Choose black or white text for legibility on a coloured kit. */
export function contrastText(hex: string): string {
  const p = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((p >> 16) & 255) + 0.587 * ((p >> 8) & 255) + 0.114 * (p & 255)) / 255;
  return lum > 0.6 ? '#101828' : '#FFFFFF';
}
