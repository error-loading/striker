import type { Camera, ViewPoint } from './camera';

/** Scratch buffers — the polygon path runs once per face, thousands of times a frame. */
const viewBuf: ViewPoint[] = [];
const clipBuf: ViewPoint[] = [];

/**
 * Trace a world-space polygon into the current path, clipped against the near
 * plane. Returns false if nothing survived, or if the result lands entirely off
 * screen — the caller can then skip the fill.
 *
 * Clipping in view space rather than rejecting faces outright matters once the
 * camera sits inside the stadium bowl: a stand face with a single vertex behind
 * the lens still covers most of the frame, and dropping it pops a hole in the
 * stadium.
 */
function traceWorldPoly(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pts: [number, number, number?][],
): boolean {
  const near = cam.near;
  viewBuf.length = 0;
  for (const [x, y, z] of pts) viewBuf.push(cam.view(x, y, z ?? 0));

  // Sutherland–Hodgman against the single plane d >= near.
  clipBuf.length = 0;
  for (let i = 0; i < viewBuf.length; i++) {
    const a = viewBuf[i];
    const b = viewBuf[(i + 1) % viewBuf.length];
    const ain = a.d >= near;
    const bin = b.d >= near;
    if (ain) clipBuf.push(a);
    if (ain !== bin) {
      const t = (near - a.d) / (b.d - a.d);
      clipBuf.push({
        lat: a.lat + (b.lat - a.lat) * t,
        vert: a.vert + (b.vert - a.vert) * t,
        d: near,
      });
    }
  }
  if (clipBuf.length < 3) return false;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  ctx.beginPath();
  for (let i = 0; i < clipBuf.length; i++) {
    const p = cam.fromView(clipBuf[i]);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  // Cheap reject: the bowl puts most of its geometry outside the viewport.
  if (maxX < 0 || minX > cam.width || maxY < 0 || minY > cam.height) return false;
  return true;
}

/** Fill a world-space polygon (list of [x, y, z] triples) in screen space. */
export function fillWorldPoly(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pts: [number, number, number?][],
  fill: string | CanvasGradient,
) {
  if (!traceWorldPoly(ctx, cam, pts)) return;
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Fill and outline a world-space polygon in one pass — used for panel edges. */
export function fillStrokeWorldPoly(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pts: [number, number, number?][],
  fill: string | CanvasGradient,
  stroke: string,
  lineWidth = 1,
) {
  if (!traceWorldPoly(ctx, cam, pts)) return;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
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
