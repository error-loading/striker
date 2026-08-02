import type { Stadium } from '../data/types';
import { PITCH } from '../engine/constants';
import { Rng } from '../engine/math';
import type { Camera } from './camera';
import { fillWorldPoly, mixHex, shade } from './draw';

const L = PITCH.length;
const W = PITCH.width;
const M = PITCH.margin;

interface SideFrame {
  /** Origin at the inner edge of the stand. */
  ox: number;
  oy: number;
  /** Unit vector along the stand. */
  ax: number;
  ay: number;
  /** Length of the stand along `a`. */
  span: number;
  /** Unit vector pointing away from the pitch. */
  bx: number;
  by: number;
  name: 'south' | 'north' | 'west' | 'east';
}

interface Tier {
  /** Distance from the inner edge where the tier starts / ends. */
  d0: number;
  d1: number;
  z0: number;
  z1: number;
}

interface CrowdDot {
  x: number;
  y: number;
  z: number;
  color: string;
  /** Phase offset so the crowd shimmers out of sync. */
  phase: number;
}

const SIDES: SideFrame[] = [
  { ox: -4, oy: -M, ax: 1, ay: 0, span: L + 8, bx: 0, by: -1, name: 'south' },
  { ox: -4, oy: W + M, ax: 1, ay: 0, span: L + 8, bx: 0, by: 1, name: 'north' },
  { ox: -M, oy: -4, ax: 0, ay: 1, span: W + 8, bx: -1, by: 0, name: 'west' },
  { ox: L + M, oy: -4, ax: 0, ay: 1, span: W + 8, bx: 1, by: 0, name: 'east' },
];

const TIERS: Tier[] = [
  { d0: 1.4, d1: 17, z0: 1.1, z1: 10.5 },
  { d0: 19.5, d1: 34, z0: 15.5, z1: 27 },
];

/** Precomputed, camera-independent stadium geometry for one venue. */
export class StadiumScene {
  private crowd: CrowdDot[] = [];
  private stadium: Stadium;
  private night: boolean;

  constructor(stadium: Stadium, night: boolean) {
    this.stadium = stadium;
    this.night = night;
    this.buildCrowd();
  }

  private point(s: SideFrame, along: number, out: number, z: number): [number, number, number] {
    return [s.ox + s.ax * along + s.bx * out, s.oy + s.ay * along + s.by * out, z];
  }

  private buildCrowd() {
    const rng = new Rng(this.hashId());
    const base = this.stadium.seatColor;
    const alt = this.stadium.seatColorAlt;
    // A palette of clothing tones mixed with the club's seat colours.
    const palette = [
      base,
      alt,
      shade(base, 0.22),
      shade(alt, -0.15),
      '#E8D5C0',
      '#C89B7B',
      '#8A5A3B',
      '#F2F2F2',
      '#1E1E24',
      '#3A4C6B',
    ];

    for (const s of SIDES) {
      for (const tier of TIERS) {
        const rows = 16;
        const cols = Math.round(s.span * 1.5);
        for (let r = 0; r < rows; r++) {
          const tv = (r + 0.5) / rows;
          const out = tier.d0 + (tier.d1 - tier.d0) * tv;
          const z = tier.z0 + (tier.z1 - tier.z0) * tv;
          for (let c = 0; c < cols; c++) {
            // Thin the crowd out so it reads as texture, not a solid block.
            if (rng.next() > 0.62) continue;
            const along = ((c + 0.5) / cols) * s.span + rng.range(-0.3, 0.3);
            const p = this.point(s, along, out + rng.range(-0.25, 0.25), z + rng.range(-0.1, 0.1));
            this.crowd.push({
              x: p[0],
              y: p[1],
              z: p[2],
              color: palette[Math.floor(rng.next() * palette.length)],
              phase: rng.next() * Math.PI * 2,
            });
          }
        }
      }
    }
  }

  private hashId(): number {
    let h = 5381;
    for (let i = 0; i < this.stadium.id.length; i++) h = (h * 33) ^ this.stadium.id.charCodeAt(i);
    return h >>> 0;
  }

  /**
   * Draw the bowl. `excitement` (0..1) drives crowd shimmer, so the stands come
   * alive when the match does.
   */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, time: number, excitement: number) {
    // Painter's algorithm: furthest stand first.
    const order = SIDES.map((s) => {
      const mid = this.point(s, s.span / 2, 18, 12);
      const p = cam.project(mid[0], mid[1], mid[2]);
      return { s, depth: p.visible ? p.d : Infinity };
    }).sort((a, b) => b.depth - a.depth);

    for (const { s } of order) this.drawStand(ctx, cam, s);
    this.drawCrowd(ctx, cam, time, excitement);
    for (const { s } of order) this.drawAdBoards(ctx, cam, s, time);
    this.drawFloodlights(ctx, cam);
  }

  private drawStand(ctx: CanvasRenderingContext2D, cam: Camera, s: SideFrame) {
    const dark = this.night ? -0.45 : -0.2;
    const concrete = shade('#2A3244', this.night ? -0.35 : 0);

    for (const tier of TIERS) {
      // Rake face — where the seats live.
      const a0 = this.point(s, 0, tier.d0, tier.z0);
      const a1 = this.point(s, s.span, tier.d0, tier.z0);
      const b1 = this.point(s, s.span, tier.d1, tier.z1);
      const b0 = this.point(s, 0, tier.d1, tier.z1);
      const g = shade(mixHex(this.stadium.seatColor, this.stadium.seatColorAlt, 0.5), dark);
      fillWorldPoly(ctx, cam, [a0, a1, b1, b0], g);

      // Front wall below the tier, in concrete.
      const f0 = this.point(s, 0, tier.d0, 0);
      const f1 = this.point(s, s.span, tier.d0, 0);
      fillWorldPoly(ctx, cam, [f0, f1, a1, a0], concrete);
    }

    // Roof slab over the upper tier.
    if (this.stadium.roof !== 'open') {
      const top = TIERS[1];
      const rz = top.z1 + 9;
      const r0 = this.point(s, 0, top.d0 - 2, rz);
      const r1 = this.point(s, s.span, top.d0 - 2, rz);
      const r2 = this.point(s, s.span, top.d1 + 4, rz + 2.5);
      const r3 = this.point(s, 0, top.d1 + 4, rz + 2.5);
      fillWorldPoly(ctx, cam, [r0, r1, r2, r3], shade('#1B2233', this.night ? -0.35 : -0.1));
      // Underside of the roof, catching light from below.
      const u0 = this.point(s, 0, top.d0 - 2, rz - 0.6);
      const u1 = this.point(s, s.span, top.d0 - 2, rz - 0.6);
      fillWorldPoly(ctx, cam, [r0, r1, u1, u0], shade('#39445E', this.night ? -0.2 : 0.05));

      // Roof trusses.
      const trusses = 12;
      for (let i = 0; i <= trusses; i++) {
        const along = (s.span * i) / trusses;
        const t0 = this.point(s, along, top.d0 - 2, rz + 0.05);
        const t1 = this.point(s, along, top.d1 + 4, rz + 2.55);
        const p0 = cam.project(t0[0], t0[1], t0[2]);
        const p1 = cam.project(t1[0], t1[1], t1[2]);
        if (!p0.visible || !p1.visible) continue;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = 'rgba(150,170,205,0.22)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  private drawCrowd(ctx: CanvasRenderingContext2D, cam: Camera, time: number, excitement: number) {
    const w = cam.width;
    const h = cam.height;
    const dim = this.night ? 0.72 : 1;
    // Sway amplitude grows with excitement.
    const amp = 0.12 + excitement * 0.5;

    for (const dot of this.crowd) {
      const bob = Math.sin(time * 3.1 + dot.phase) * amp;
      const p = cam.project(dot.x, dot.y, dot.z + bob * 0.18);
      if (!p.visible) continue;
      if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;
      const size = Math.max(1, p.scale * 0.32);
      if (size < 0.8) continue;
      ctx.fillStyle = dim < 1 ? shade(dot.color, -(1 - dim)) : dot.color;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size * 1.35);
    }

    // Camera flashes in the dark, more frequent when the crowd is up.
    if (this.night && this.crowd.length) {
      const flashes = Math.round(2 + excitement * 14);
      for (let i = 0; i < flashes; i++) {
        const dot = this.crowd[Math.floor((Math.sin(time * 9.3 + i * 71.3) * 0.5 + 0.5) * this.crowd.length)];
        if (!dot) continue;
        const p = cam.project(dot.x, dot.y, dot.z);
        if (!p.visible || p.x < 0 || p.x > w) continue;
        const s = Math.max(1.5, p.scale * 0.9);
        ctx.fillStyle = 'rgba(255,255,240,0.85)';
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
  }

  /** LED perimeter boards with a scrolling message. */
  private drawAdBoards(ctx: CanvasRenderingContext2D, cam: Camera, s: SideFrame, time: number) {
    const height = 1.05;
    const panels = Math.round(s.span / 6);
    const messages = ['FIFA 26', 'THE BEAUTIFUL GAME', 'REDEFINED', 'MATCHDAY LIVE'];

    for (let i = 0; i < panels; i++) {
      const a0 = (s.span * i) / panels;
      const a1 = (s.span * (i + 1)) / panels - 0.12;
      const p0 = this.point(s, a0, 0.5, 0);
      const p1 = this.point(s, a1, 0.5, 0);
      const p2 = this.point(s, a1, 0.5, height);
      const p3 = this.point(s, a0, 0.5, height);

      // Cycle each panel through the palette with a travelling offset.
      const t = (time * 0.35 + i * 0.18) % 1;
      const hue = Math.floor(t * 4) % 4;
      const colors = ['#0A1428', '#00354A', '#0A1428', '#123'];
      fillWorldPoly(ctx, cam, [p0, p1, p2, p3], colors[hue]);

      // Text band: a glowing stripe standing in for LED type at distance.
      const mid0 = this.point(s, a0 + 0.4, 0.48, height * 0.34);
      const mid1 = this.point(s, a1 - 0.4, 0.48, height * 0.34);
      const mid2 = this.point(s, a1 - 0.4, 0.48, height * 0.66);
      const mid3 = this.point(s, a0 + 0.4, 0.48, height * 0.66);
      const msg = messages[(i + Math.floor(time * 0.35)) % messages.length];
      const glow = msg === 'FIFA 26' ? 'rgba(0,217,255,0.85)' : 'rgba(255,215,0,0.6)';
      fillWorldPoly(ctx, cam, [mid0, mid1, mid2, mid3], glow);
    }
  }

  private drawFloodlights(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (this.stadium.roof === 'closed') return;
    const pylons: [number, number][] = [
      [-M - 6, -M - 6],
      [L + M + 6, -M - 6],
      [-M - 6, W + M + 6],
      [L + M + 6, W + M + 6],
    ];
    for (const [x, y] of pylons) {
      const base = cam.project(x, y, 0);
      const top = cam.project(x, y, 42);
      if (!base.visible || !top.visible) continue;
      ctx.strokeStyle = this.night ? '#39445E' : '#5A6784';
      ctx.lineWidth = Math.max(1.5, base.scale * 0.5);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();

      // Lamp array.
      const w = Math.max(6, top.scale * 9);
      const hgt = Math.max(3, top.scale * 3.5);
      ctx.fillStyle = this.night ? '#FFFBE8' : '#8895AD';
      ctx.fillRect(top.x - w / 2, top.y - hgt, w, hgt);
      if (this.night) {
        const g = ctx.createRadialGradient(top.x, top.y, 0, top.x, top.y, w * 2.4);
        g.addColorStop(0, 'rgba(255,250,220,0.5)');
        g.addColorStop(1, 'rgba(255,250,220,0)');
        ctx.fillStyle = g;
        ctx.fillRect(top.x - w * 2.4, top.y - w * 2.4, w * 4.8, w * 4.8);
      }
    }
  }
}
