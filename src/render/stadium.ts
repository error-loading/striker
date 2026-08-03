import type { Stadium } from '../data/types';
import { PITCH } from '../engine/constants';
import { Rng } from '../engine/math';
import { fog, fogged, litFace, type Atmosphere } from './atmosphere';
import type { Camera } from './camera';
import { fillWorldPoly, mixHex, shade } from './draw';

const L = PITCH.length;
const W = PITCH.width;
const M = PITCH.margin;

/**
 * The bowl is one continuous rounded rectangle rather than four separate
 * stands. Every seat, wall, roof panel and advertising board is placed by
 * walking this ring, which is what closes the corners — the old four-box layout
 * left a black wedge of nothing at each corner of the frame.
 */
const RING = {
  /** Inner edge of the bowl, measured from the pitch. */
  x0: -M - 3,
  x1: L + M + 3,
  y0: -M,
  y1: W + M,
  /** Corner radius. Large enough to read as a curve, small enough to clear the
   *  corner flags — the arc must stay outside the pitch rectangle. */
  radius: 16,
  /** Target spacing between ring samples, in metres. */
  spacing: 2.6,
};

interface Tier {
  /** Distance out from the ring where the rake starts and ends. */
  d0: number;
  d1: number;
  /** Height at the front and back of the rake. */
  z0: number;
  z1: number;
  /** Height of the fascia wall carrying the tier, measured down from z0. */
  fascia: number;
}

interface RingSample {
  x: number;
  y: number;
  /** Outward unit normal — "away from the pitch". */
  nx: number;
  ny: number;
  /** Tier rakes at this point on the ring, already scaled to local height. */
  tiers: Tier[];
  /** Roof deck height, or 0 for an open stand. */
  roofZ: number;
  roofD0: number;
  roofD1: number;
}

/**
 * Three tiers at full height. Real bowls step back as they rise, so each tier's
 * front sits further out and higher than the one below, with a fascia between.
 */
const FULL_TIERS: Tier[] = [
  { d0: 1.8, d1: 14.5, z0: 1.2, z1: 8.2, fascia: 1.2 },
  { d0: 16.0, d1: 25.5, z0: 11.0, z1: 17.6, fascia: 3.0 },
  { d0: 27.5, d1: 37.5, z0: 20.4, z1: 28.0, fascia: 3.2 },
];

/** The two-tier profile used where the bowl steps down. */
const LOW_TIERS: Tier[] = [
  { d0: 1.8, d1: 15.0, z0: 1.2, z1: 9.0, fascia: 1.2 },
  { d0: 16.5, d1: 30.0, z0: 11.6, z1: 20.4, fascia: 3.0 },
];

const ROOF_FULL = { z: 31.6, d0: 24, d1: 41 };
const ROOF_LOW = { z: 23.4, d0: 15, d1: 33 };

/**
 * How far the far side of the bowl steps down. Grounds are rarely symmetrical —
 * the stand opposite the gantry is usually the shallow one — and the drop is
 * what lets a band of sky and the floodlight rigs sit above the roofline
 * instead of the frame being wall-to-wall seating.
 */
const FAR_DROP = 0.4;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How many ring samples make up one drawing/culling block. */
const BLOCK = 6;

/**
 * Height of the corner floodlight masts, to the underside of the lamp bank.
 * Tall enough to clear the stepped-down far stand and sit against the sky,
 * low enough that a broadcast lens still has the lamp banks in frame — a
 * realistically towering pylon simply lands above the top edge.
 */
const MAST_H = 23;

interface CrowdDot {
  x: number;
  y: number;
  z: number;
  color: string;
  phase: number;
  /** 0 = always drawn, higher ranks drop out first as the block recedes. */
  rank: number;
}

interface Flag {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  width: number;
  height: number;
  color: string;
  alt: string;
  phase: number;
}

interface Block {
  /** Samples spanning this block, inclusive of the shared end sample. */
  samples: RingSample[];
  /** Centre of the block at mid height, for depth sorting and culling. */
  cx: number;
  cy: number;
  cz: number;
  crowd: CrowdDot[];
  flags: Flag[];
  /** Supporter tint for this section: home end, away end, or neutral. */
  tint: string;
  /** True where a stairway splits the seating. */
  vomitory: boolean;
  /** Per-frame scratch. */
  depth: number;
}

export interface StadiumOptions {
  atmosphere: Atmosphere;
  /** Kit colours of the two sides, used to tint the supporter ends. */
  homeColor: string;
  awayColor: string;
}

/**
 * Height profile around the ring: 1 on the gantry side and behind both goals,
 * dropping across the far corners to the shallow stand opposite the camera.
 */
function heightScale(ny: number): number {
  return 1 - FAR_DROP * smoothstep(0.3, 0.95, ny);
}

function profileFor(nx: number, ny: number): Pick<RingSample, 'tiers' | 'roofZ' | 'roofD0' | 'roofD1'> {
  const h = heightScale(ny);
  const threeTier = h >= 0.84;
  const src = threeTier ? FULL_TIERS : LOW_TIERS;
  const roof = threeTier ? ROOF_FULL : ROOF_LOW;
  // Depth shrinks more slowly than height, so a stepped-down stand still has a
  // believable rake rather than looking like a scale model of the tall one.
  const dScale = 0.72 + 0.28 * h;
  void nx;
  return {
    tiers: src.map((t) => ({
      d0: t.d0 * dScale,
      d1: t.d1 * dScale,
      z0: t.z0 * h,
      z1: t.z1 * h,
      fascia: t.fascia * h,
    })),
    roofZ: roof.z * h,
    roofD0: roof.d0 * dScale,
    roofD1: roof.d1 * dScale,
  };
}

function buildRing(): RingSample[] {
  const { x0, x1, y0, y1, radius: r, spacing } = RING;
  const out: RingSample[] = [];

  const push = (x: number, y: number, nx: number, ny: number) => {
    out.push({ x, y, nx, ny, ...profileFor(nx, ny) });
  };

  const straight = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    nx: number,
    ny: number,
  ) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      push(ax + (bx - ax) * t, ay + (by - ay) * t, nx, ny);
    }
  };

  const arc = (cx: number, cy: number, from: number, to: number) => {
    const n = Math.max(2, Math.round((Math.abs(to - from) * r) / spacing));
    for (let i = 0; i < n; i++) {
      const a = from + (to - from) * (i / n);
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      push(cx + nx * r, cy + ny * r, nx, ny);
    }
  };

  const H = Math.PI / 2;
  straight(x0 + r, y0, x1 - r, y0, 0, -1);
  arc(x1 - r, y0 + r, -H, 0);
  straight(x1, y0 + r, x1, y1 - r, 1, 0);
  arc(x1 - r, y1 - r, 0, H);
  straight(x1 - r, y1, x0 + r, y1, 0, 1);
  arc(x0 + r, y1 - r, H, Math.PI);
  straight(x0, y1 - r, x0, y0 + r, -1, 0);
  arc(x0 + r, y0 + r, Math.PI, Math.PI + H);
  return out;
}

/** Precomputed, camera-independent stadium geometry for one venue. */
export class StadiumScene {
  private ring: RingSample[];
  private blocks: Block[] = [];
  private stadium: Stadium;
  private atmos: Atmosphere;
  private night: boolean;
  private seatBase: string;
  private concrete: string;
  /** Adaptive crowd budget — raised or lowered to hold the frame time. */
  private crowdBudget = 1;

  constructor(stadium: Stadium, night: boolean, opts: StadiumOptions) {
    this.stadium = stadium;
    this.night = night;
    this.atmos = opts.atmosphere;
    this.ring = buildRing();
    this.seatBase = mixHex(stadium.seatColor, stadium.seatColorAlt, 0.45);
    this.concrete = shade('#3A4356', night ? -0.42 : -0.05);
    this.build(opts);
  }

  private hashId(): number {
    let h = 5381;
    for (let i = 0; i < this.stadium.id.length; i++) h = (h * 33) ^ this.stadium.id.charCodeAt(i);
    return h >>> 0;
  }

  private point(s: RingSample, out: number, z: number): [number, number, number] {
    return [s.x + s.nx * out, s.y + s.ny * out, z];
  }

  /**
   * The ground inside the bowl, filled out to the ring.
   *
   * The playing surround has to follow the rounded ring rather than a
   * rectangle, or the corners of the apron poke out through the curve of the
   * bowl and leave sky showing between the pitch and the stands.
   *
   * It is drawn as a fan of triangles from the centre spot rather than as one
   * big polygon, because the camera stands inside the ring: a single polygon
   * enclosing the camera is concave in view space, and clipping it against the
   * near plane folds it inside out. Every triangle in the fan is convex, so
   * each one clips correctly on its own.
   */
  drawSurround(ctx: CanvasRenderingContext2D, cam: Camera, color: string) {
    const cx = L / 2;
    const cy = W / 2;
    const n = this.ring.length;
    for (let i = 0; i < n; i++) {
      const p = this.ring[i];
      const q = this.ring[(i + 1) % n];
      fillWorldPoly(ctx, cam, [[cx, cy, 0], [p.x, p.y, 0], [q.x, q.y, 0]], color);
    }
  }

  /** Ground-level positions of the four floodlight rigs, for the light pools. */
  rigPositions(): [number, number][] {
    return this.rigs().map(({ px, py }): [number, number] => [px, py]);
  }

  private build(opts: StadiumOptions) {
    const rng = new Rng(this.hashId());
    const n = this.ring.length;
    const nBlocks = Math.max(4, Math.round(n / BLOCK));

    for (let b = 0; b < nBlocks; b++) {
      const i0 = Math.round((b * n) / nBlocks);
      const i1 = Math.round(((b + 1) * n) / nBlocks);
      const samples: RingSample[] = [];
      for (let i = i0; i <= i1; i++) samples.push(this.ring[i % n]);

      // Supporter ends: the blocks behind each goal take a kit colour, so the
      // two ends read as home and away rather than one uniform crowd.
      const mid = samples[Math.floor(samples.length / 2)];
      const endness = mid.x < L * 0.2 ? -1 : mid.x > L * 0.8 ? 1 : 0;
      const tint = endness === -1 ? opts.homeColor : endness === 1 ? opts.awayColor : '';

      const block: Block = {
        samples,
        cx: 0,
        cy: 0,
        cz: 0,
        crowd: [],
        flags: [],
        tint,
        vomitory: b % 3 === 1,
        depth: 0,
      };
      const top = mid.tiers[mid.tiers.length - 1];
      const c = this.point(mid, (top.d0 + top.d1) / 2, (top.z0 + top.z1) / 2);
      block.cx = c[0];
      block.cy = c[1];
      block.cz = c[2];

      this.fillCrowd(block, rng, tint);
      this.addFlags(block, rng, tint, opts);
      this.blocks.push(block);
    }
  }

  /** A palette of clothing tones, weighted toward the section's colours. */
  private palette(tint: string): string[] {
    const base = this.stadium.seatColor;
    const alt = this.stadium.seatColorAlt;
    const skin = ['#E8D5C0', '#C89B7B', '#8A5A3B', '#6B4429'];
    const clothes = ['#F2F2F2', '#1E1E24', '#3A4C6B', '#5A5F6B', '#2B2F3A', '#D8DDE4'];
    if (!tint) return [base, alt, shade(base, 0.2), shade(alt, -0.12), ...skin, ...clothes, ...clothes];
    // Supporter ends: mostly the club colour, with enough variation to avoid a
    // flat block of one hue.
    return [
      tint,
      tint,
      tint,
      shade(tint, 0.22),
      shade(tint, -0.22),
      mixHex(tint, '#FFFFFF', 0.4),
      base,
      ...skin,
      ...clothes.slice(0, 3),
    ];
  }

  private fillCrowd(block: Block, rng: Rng, tint: string) {
    const palette = this.palette(tint);
    const segs = block.samples.length - 1;
    const maxTiers = Math.max(...block.samples.map((s) => s.tiers.length));

    for (let t = 0; t < maxTiers; t++) {
      const rows = t === 0 ? 15 : 14;
      // A block of empty seats here and there — no ground is ever full.
      const emptiness = 0.05 + rng.next() * 0.06;

      for (let r = 0; r < rows; r++) {
        const rv = (r + 0.5) / rows;

        for (let s = 0; s < segs; s++) {
          const a = block.samples[s];
          const bnext = block.samples[s + 1];
          const ta = a.tiers[t];
          const tb = bnext.tiers[t];
          if (!ta || !tb) continue;
          const span = Math.hypot(bnext.x - a.x, bnext.y - a.y);
          const cols = Math.max(2, Math.round(span * 1.7));

          for (let c = 0; c < cols; c++) {
            if (rng.next() < emptiness) continue;
            const u = (c + 0.4 + rng.range(-0.18, 0.18)) / cols;
            // Interpolate position, normal and rake along the ring, so the
            // seating follows the curve and the step-down in stand height.
            const bx = a.x + (bnext.x - a.x) * u;
            const by = a.y + (bnext.y - a.y) * u;
            const nx = a.nx + (bnext.nx - a.nx) * u;
            const ny = a.ny + (bnext.ny - a.ny) * u;
            const nl = Math.hypot(nx, ny) || 1;
            const d0 = ta.d0 + (tb.d0 - ta.d0) * u;
            const d1 = ta.d1 + (tb.d1 - ta.d1) * u;
            const z0 = ta.z0 + (tb.z0 - ta.z0) * u;
            const z1 = ta.z1 + (tb.z1 - ta.z1) * u;
            const o = d0 + 0.7 + (d1 - d0 - 1.2) * rv + rng.range(-0.22, 0.22);
            block.crowd.push({
              x: bx + (nx / nl) * o,
              y: by + (ny / nl) * o,
              z: z0 + (z1 - z0) * rv + 0.75 + rng.range(-0.12, 0.12),
              color: palette[Math.floor(rng.next() * palette.length)],
              phase: rng.next() * Math.PI * 2,
              // Rank spreads evenly so thinning stays uniform, never patchy.
              rank: (r * 7 + c * 3) % 4,
            });
          }
        }
      }
    }
  }

  private addFlags(block: Block, rng: Rng, tint: string, opts: StadiumOptions) {
    // Flags cluster in the supporter ends and are rare elsewhere.
    const count = tint ? 2 + Math.floor(rng.next() * 3) : rng.next() < 0.3 ? 1 : 0;
    for (let i = 0; i < count; i++) {
      const s = block.samples[Math.floor(rng.next() * (block.samples.length - 1))];
      const tier = s.tiers[rng.next() < 0.72 ? 0 : 1] ?? s.tiers[0];
      const rv = rng.range(0.35, 0.9);
      const out = tier.d0 + (tier.d1 - tier.d0) * rv;
      const p = this.point(s, out, tier.z0 + (tier.z1 - tier.z0) * rv + 1.5);
      const c = tint || (rng.next() < 0.5 ? opts.homeColor : this.stadium.seatColor);
      block.flags.push({
        x: p[0],
        y: p[1],
        z: p[2],
        nx: s.nx,
        ny: s.ny,
        width: rng.range(1.3, 2.4),
        height: rng.range(0.8, 1.5),
        color: c,
        alt: mixHex(c, '#FFFFFF', 0.72),
        phase: rng.next() * Math.PI * 2,
      });
    }
  }

  /**
   * Draw the bowl. `excitement` (0..1) drives crowd shimmer, so the stands come
   * alive when the match does.
   *
   * The whole ring goes down before the pitch. Strictly the near stand is
   * between the lens and the turf and ought to be painted after it, but the
   * camera is mounted *in* that stand: the only parts of it in front of the
   * camera are a few rows directly below, which project as a wall of enormous
   * nearby seats. Letting the playing surround paint over them is both cheaper
   * and closer to what a real broadcast shot contains, which is no sight of the
   * gantry's own stand at all.
   */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, time: number, excitement: number) {
    // Painter's algorithm over the whole ring: furthest block first, so the far
    // side of the bowl is laid down before the near side crosses in front.
    const visible: Block[] = [];
    for (const b of this.blocks) {
      const p = cam.project(b.cx, b.cy, b.cz);
      if (!p.visible) continue;
      // Cull on the block's own extent, not its centre. A stand block is tens
      // of metres wide and tall; testing only the middle drops blocks whose
      // near edge is still in frame, which punches a hole in the bowl.
      if (!this.blockInFrame(cam, b)) continue;
      b.depth = p.d;
      visible.push(b);
    }
    visible.sort((a, b) => b.depth - a.depth);

    // Masts stand outside the bowl, so they go down before the stands and get
    // occluded by them; only the heads and their glow sit above the roofline.
    this.drawFloodlightMasts(ctx, cam);

    const drawn = { dots: 0 };
    for (const b of visible) {
      this.drawBlockStructure(ctx, cam, b);
      this.drawBlockCrowd(ctx, cam, b, time, excitement, drawn);
      this.drawBlockFlags(ctx, cam, b, time);
      this.drawBlockRoof(ctx, cam, b);
      this.drawBlockBoards(ctx, cam, b, time);
    }

    // Hold the crowd near a fixed budget so a wide camera on a big ground costs
    // the same as a tight one.
    const target = 9000;
    if (drawn.dots > target * 1.15) this.crowdBudget = Math.max(0.35, this.crowdBudget - 0.06);
    else if (drawn.dots < target * 0.8) this.crowdBudget = Math.min(1, this.crowdBudget + 0.04);

    if (this.night) this.drawCameraFlashes(ctx, cam, visible, time, excitement);
    this.drawFloodlights(ctx, cam, time);
  }

  /**
   * Screen bounds test over a block's eight corners — the front and back of its
   * lowest and highest tier at both ends. Any corner behind the camera means
   * the block straddles the lens, so it is kept.
   */
  private blockInFrame(cam: Camera, block: Block): boolean {
    const ends = [block.samples[0], block.samples[block.samples.length - 1]];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const s of ends) {
      const lo = s.tiers[0];
      const hi = s.tiers[s.tiers.length - 1];
      const top = s.roofZ || hi.z1;
      const corners: [number, number, number][] = [
        this.point(s, 0, 0),
        this.point(s, lo.d1, lo.z1),
        this.point(s, hi.d1, top),
        this.point(s, hi.d0, top),
      ];
      for (const [x, y, z] of corners) {
        const p = cam.project(x, y, z);
        if (!p.visible) return true;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    return maxX > 0 && minX < cam.width && maxY > 0 && minY < cam.height;
  }

  /** Rakes, fascias and stairways for one block. */
  private drawBlockStructure(ctx: CanvasRenderingContext2D, cam: Camera, block: Block) {
    const a = this.atmos;
    const samples = block.samples;
    const maxTiers = Math.max(...samples.map((s) => s.tiers.length));

    for (let t = 0; t < maxTiers; t++) {
      // Higher tiers catch more light and more haze.
      const rise = t * 0.05;

      for (let s = 0; s < samples.length - 1; s++) {
        const p = samples[s];
        const q = samples[s + 1];
        const tp = p.tiers[t];
        const tq = q.tiers[t];
        if (!tp || !tq) continue;
        const depth = cam.project((p.x + q.x) / 2 + p.nx * tp.d1, (p.y + q.y) / 2 + p.ny * tp.d1, tp.z1).d;
        if (!Number.isFinite(depth) || depth <= 0) continue;

        // The seating rake. Shaded by the direction the stand faces, so the
        // four sides of the bowl never read as one flat tone.
        const seat = litFace(shade(this.seatBase, rise - (this.night ? 0.4 : 0.08)), a, p.nx, p.ny, 0.55);
        fillWorldPoly(
          ctx,
          cam,
          [
            this.point(p, tp.d0, tp.z0),
            this.point(q, tq.d0, tq.z0),
            this.point(q, tq.d1, tq.z1),
            this.point(p, tp.d1, tp.z1),
          ],
          fogged(seat, a, depth),
        );

        // Seat-row banding: a few darker lines across the rake give the tier a
        // sense of scale that a flat fill cannot.
        const rows = 5;
        const band = fogged(shade(seat, -0.3), a, depth);
        for (let r = 1; r < rows; r++) {
          const rv = r / rows;
          fillWorldPoly(
            ctx,
            cam,
            [
              this.point(p, tp.d0 + (tp.d1 - tp.d0) * rv, tp.z0 + (tp.z1 - tp.z0) * rv),
              this.point(q, tq.d0 + (tq.d1 - tq.d0) * rv, tq.z0 + (tq.z1 - tq.z0) * rv),
              this.point(q, tq.d0 + (tq.d1 - tq.d0) * rv + 0.35, tq.z0 + (tq.z1 - tq.z0) * rv + 0.2),
              this.point(p, tp.d0 + (tp.d1 - tp.d0) * rv + 0.35, tp.z0 + (tp.z1 - tp.z0) * rv + 0.2),
            ],
            band,
          );
        }

        // Fascia below the tier front — concrete on the lower ring, a lit
        // balcony wall on the ones above it.
        const wall = t === 0 ? this.concrete : litFace(shade(this.concrete, 0.1), a, p.nx, p.ny, 0);
        fillWorldPoly(
          ctx,
          cam,
          [
            this.point(p, tp.d0, tp.z0 - tp.fascia),
            this.point(q, tq.d0, tq.z0 - tq.fascia),
            this.point(q, tq.d0, tq.z0),
            this.point(p, tp.d0, tp.z0),
          ],
          fogged(wall, a, depth),
        );

        // Balcony sponsor band on the upper tiers.
        if (t > 0) {
          fillWorldPoly(
            ctx,
            cam,
            [
              this.point(p, tp.d0 - 0.05, tp.z0 - tp.fascia * 0.75),
              this.point(q, tq.d0 - 0.05, tq.z0 - tq.fascia * 0.75),
              this.point(q, tq.d0 - 0.05, tq.z0 - tq.fascia * 0.25),
              this.point(p, tp.d0 - 0.05, tp.z0 - tp.fascia * 0.25),
            ],
            fogged(block.tint ? shade(block.tint, -0.25) : '#111826', a, depth),
          );
        }
      }

      // A stairway cut through the middle of some blocks.
      if (block.vomitory) {
        const mid = Math.floor(samples.length / 2);
        const p = samples[mid];
        const q = samples[Math.min(mid + 1, samples.length - 1)];
        const tp = p.tiers[t];
        const tq = q.tiers[t];
        if (!tp || !tq) continue;
        const depth = cam.project(p.x + p.nx * tp.d1, p.y + p.ny * tp.d1, tp.z1).d;
        fillWorldPoly(
          ctx,
          cam,
          [
            this.point(p, tp.d0, tp.z0 + 0.05),
            this.point(q, tq.d0, tq.z0 + 0.05),
            this.point(q, tq.d1, tq.z1 + 0.05),
            this.point(p, tp.d1, tp.z1 + 0.05),
          ],
          fogged(shade(this.concrete, this.night ? -0.1 : 0.16), a, depth),
        );
      }
    }
  }

  private drawBlockCrowd(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    block: Block,
    time: number,
    excitement: number,
    drawn: { dots: number },
  ) {
    const a = this.atmos;
    const w = cam.width;
    const h = cam.height;
    const amp = 0.1 + excitement * 0.42;
    const dim = this.night ? -0.28 : 0;

    // Level of detail: distant blocks are thinned, because at that size the
    // difference between 900 dots and 300 is invisible but not free.
    const scaleAt = cam.project(block.cx, block.cy, block.cz).scale;
    const dotSize = scaleAt * 0.34;
    let maxRank = 3;
    if (dotSize < 1.15) maxRank = 2;
    if (dotSize < 0.85) maxRank = 1;
    if (dotSize < 0.6) maxRank = 0;
    maxRank = Math.min(maxRank, Math.round(3 * this.crowdBudget));
    if (dotSize < 0.34) return;

    const hazeAt = fog(a, cam.project(block.cx, block.cy, block.cz).d);
    const haze = hazeAt > 0.004;

    for (const dot of block.crowd) {
      if (dot.rank > maxRank) continue;
      // Excited crowds stand up; the sway is per-seat so rows ripple.
      const bob = Math.sin(time * 3.4 + dot.phase) * amp;
      const p = cam.project(dot.x, dot.y, dot.z + bob * 0.22);
      if (!p.visible) continue;
      if (p.x < -12 || p.x > w + 12 || p.y < -12 || p.y > h + 12) continue;
      // Capped: the gantry camera clips the front rows of its own stand, and a
      // seat a few metres from the lens would otherwise scale up into a slab
      // the size of a player.
      const size = Math.min(p.scale * 0.34, 7);
      if (size < 0.42) continue;
      let color = dim ? shade(dot.color, dim) : dot.color;
      if (haze) color = fogged(color, a, p.d);
      ctx.fillStyle = color;
      // Slightly taller than wide: a head and shoulders, not a square pixel.
      ctx.fillRect(p.x - size * 0.5, p.y - size * 0.7, Math.max(0.7, size), Math.max(0.9, size * 1.5));
      drawn.dots++;
    }
  }

  private drawBlockFlags(ctx: CanvasRenderingContext2D, cam: Camera, block: Block, time: number) {
    const a = this.atmos;
    for (const f of block.flags) {
      // Wave the flag by displacing its far edge — cheap, and reads correctly
      // because the whole thing is only a few dozen pixels across.
      const wave = Math.sin(time * 2.1 + f.phase);
      const tx = -f.ny;
      const ty = f.nx;
      const cols = 4;
      for (let i = 0; i < cols; i++) {
        const u0 = (i / cols) * f.width;
        const u1 = ((i + 1) / cols) * f.width;
        const s0 = Math.sin(time * 3.2 + f.phase + (u0 / f.width) * 2.4) * 0.28 * (u0 / f.width);
        const s1 = Math.sin(time * 3.2 + f.phase + (u1 / f.width) * 2.4) * 0.28 * (u1 / f.width);
        const quad: [number, number, number][] = [
          [f.x + tx * u0, f.y + ty * u0, f.z + s0],
          [f.x + tx * u1, f.y + ty * u1, f.z + s1],
          [f.x + tx * u1 + f.nx * wave * 0.3, f.y + ty * u1 + f.ny * wave * 0.3, f.z + s1 - f.height],
          [f.x + tx * u0 + f.nx * wave * 0.3, f.y + ty * u0 + f.ny * wave * 0.3, f.z + s0 - f.height],
        ];
        const depth = cam.project(quad[0][0], quad[0][1], quad[0][2]).d;
        // Bands across the flag stand in for a crest or stripe.
        const c = i % 2 === 0 ? f.color : f.alt;
        fillWorldPoly(ctx, cam, quad, fogged(shade(c, this.night ? -0.2 : 0), a, depth));
      }
    }
  }

  private drawBlockRoof(ctx: CanvasRenderingContext2D, cam: Camera, block: Block) {
    if (this.stadium.roof === 'open') return;
    const a = this.atmos;
    const samples = block.samples;
    const deck = shade('#1B2233', this.night ? -0.35 : -0.05);
    // The underside is in shadow from the deck above it — it should read as a
    // dark lid over the stand, not a bright grey ramp.
    const under = shade('#2C3448', this.night ? -0.45 : 0.06);

    for (let s = 0; s < samples.length - 1; s++) {
      const p = samples[s];
      const q = samples[s + 1];
      if (!p.roofZ || !q.roofZ) continue;
      const depth = cam.project((p.x + q.x) / 2 + p.nx * p.roofD0, (p.y + q.y) / 2 + p.ny * p.roofD0, p.roofZ).d;

      // Underside first: it is what the camera actually sees from inside the
      // bowl, and it catches the floodlights.
      fillWorldPoly(
        ctx,
        cam,
        [
          this.point(p, p.roofD0, p.roofZ),
          this.point(q, q.roofD0, q.roofZ),
          this.point(q, q.roofD1, q.roofZ + 3),
          this.point(p, p.roofD1, p.roofZ + 3),
        ],
        fogged(under, a, depth),
      );

      // Leading edge — a bright lip that draws the roofline against the sky.
      fillWorldPoly(
        ctx,
        cam,
        [
          this.point(p, p.roofD0, p.roofZ),
          this.point(q, q.roofD0, q.roofZ),
          this.point(q, q.roofD0 - 0.8, q.roofZ + 1.1),
          this.point(p, p.roofD0 - 0.8, p.roofZ + 1.1),
        ],
        fogged(litFace(deck, a, 0, 0, 1), a, depth),
      );

      // Truss ribs, spaced every other sample.
      if (s % 2 === 0) {
        fillWorldPoly(
          ctx,
          cam,
          [
            this.point(p, p.roofD0, p.roofZ - 0.15),
            this.point(p, p.roofD1, p.roofZ + 2.85),
            this.point(p, p.roofD1, p.roofZ + 2.55),
            this.point(p, p.roofD0, p.roofZ - 0.45),
          ],
          fogged(shade(under, 0.24), a, depth),
        );
      }
    }
  }

  /** LED perimeter boards, curving with the ring. */
  private drawBlockBoards(ctx: CanvasRenderingContext2D, cam: Camera, block: Block, time: number) {
    const a = this.atmos;
    const height = 1.05;
    const out = 0.6;
    const samples = block.samples;

    for (let s = 0; s < samples.length - 1; s++) {
      const p = samples[s];
      const q = samples[s + 1];
      const depth = cam.project((p.x + q.x) / 2 + p.nx * out, (p.y + q.y) / 2 + p.ny * out, height / 2).d;
      if (depth > 190) continue;

      // Each panel cycles through the board palette on a travelling offset, the
      // way a real LED ribbon runs a message around the ground.
      const t = (time * 0.42 + s * 0.21 + block.cx * 0.01) % 1;
      const panel = t < 0.5 ? '#08111F' : '#0B2033';
      fillWorldPoly(
        ctx,
        cam,
        [
          this.point(p, out, 0),
          this.point(q, out, 0),
          this.point(q, out, height),
          this.point(p, out, height),
        ],
        fogged(panel, a, depth),
      );

      // The lit type band. Colour travels along the ring so the boards animate.
      const glowT = (time * 0.42 + s * 0.21) % 1;
      const glow = glowT < 0.45 ? 'rgba(0,217,255,0.9)' : glowT < 0.7 ? 'rgba(255,215,0,0.75)' : 'rgba(240,248,255,0.8)';
      fillWorldPoly(
        ctx,
        cam,
        [
          this.point(p, out - 0.03, height * 0.3),
          this.point(q, out - 0.03, height * 0.3),
          this.point(q, out - 0.03, height * 0.68),
          this.point(p, out - 0.03, height * 0.68),
        ],
        glow,
      );

      // Spill onto the grass in front of the board.
      if (this.night) {
        fillWorldPoly(
          ctx,
          cam,
          [
            this.point(p, out - 0.05, 0.02),
            this.point(q, out - 0.05, 0.02),
            this.point(q, out - 1.6, 0.02),
            this.point(p, out - 1.6, 0.02),
          ],
          'rgba(120,190,235,0.07)',
        );
      }
    }
  }

  /** Phone and camera flashes rippling round the bowl after dark. */
  private drawCameraFlashes(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    visible: Block[],
    time: number,
    excitement: number,
  ) {
    const flashes = Math.round(4 + excitement * 26);
    ctx.fillStyle = 'rgba(255,252,236,0.9)';
    for (let i = 0; i < flashes; i++) {
      const b = visible[Math.floor((Math.sin(time * 5.1 + i * 12.9) * 0.5 + 0.5) * visible.length)];
      if (!b || !b.crowd.length) continue;
      const dot = b.crowd[Math.floor((Math.sin(time * 9.3 + i * 71.3) * 0.5 + 0.5) * b.crowd.length)];
      if (!dot) continue;
      const p = cam.project(dot.x, dot.y, dot.z);
      if (!p.visible || p.x < 0 || p.x > cam.width || p.y < 0 || p.y > cam.height) continue;
      const s = Math.max(1.6, p.scale * 0.85);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s * 1.2);
    }
  }

  /** Where each corner rig stands, and which way its lamp bank faces. */
  private rigs(): { px: number; py: number; tx: number; ty: number }[] {
    const r = RING.radius;
    const corners: [number, number][] = [
      [RING.x0 + r, RING.y0 + r],
      [RING.x1 - r, RING.y0 + r],
      [RING.x0 + r, RING.y1 - r],
      [RING.x1 - r, RING.y1 - r],
    ];
    return corners.map(([cx, cy]) => {
      // Push the rig outward along the corner diagonal, clear of the bowl.
      const dx = cx < L / 2 ? -1 : 1;
      const dy = cy < W / 2 ? -1 : 1;
      return {
        px: cx + dx * (r + 26) * 0.707,
        py: cy + dy * (r + 26) * 0.707,
        // Lamp bank sits square to the diagonal, aimed at the middle.
        tx: -dy * 0.707,
        ty: dx * 0.707,
      };
    });
  }

  private drawFloodlightMasts(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (this.stadium.roof === 'closed') return;
    const a = this.atmos;

    for (const { px, py } of this.rigs()) {
      const base = cam.project(px, py, 0);
      const top = cam.project(px, py, MAST_H);
      if (!base.visible || !top.visible) continue;
      if (top.x < -300 || top.x > cam.width + 300) continue;

      // Lattice mast: two legs plus cross bracing, rather than a single line.
      const legOff = 1.5;
      const steel = fogged(shade('#5A6784', this.night ? -0.5 : -0.05), a, top.d);
      fillWorldPoly(
        ctx,
        cam,
        [
          [px - legOff, py, 0],
          [px + legOff, py, 0],
          [px + legOff * 0.3, py, MAST_H],
          [px - legOff * 0.3, py, MAST_H],
        ],
        steel,
      );

      const braces = 8;
      ctx.strokeStyle = steel;
      ctx.lineWidth = Math.max(0.5, top.scale * 0.05);
      ctx.beginPath();
      for (let i = 0; i < braces; i++) {
        const z0 = (MAST_H * i) / braces;
        const z1 = (MAST_H * (i + 1)) / braces;
        const s0 = legOff * (1 - (z0 / MAST_H) * 0.7);
        const s1 = legOff * (1 - (z1 / MAST_H) * 0.7);
        const p0 = cam.project(px + (i % 2 ? s0 : -s0), py, z0);
        const p1 = cam.project(px + (i % 2 ? -s1 : s1), py, z1);
        if (!p0.visible || !p1.visible) continue;
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
      }
      ctx.stroke();
    }
  }

  /** Lamp banks and their bloom, drawn over the bowl. */
  private drawFloodlights(ctx: CanvasRenderingContext2D, cam: Camera, time: number) {
    if (this.stadium.roof === 'closed') return;
    const a = this.atmos;
    const bankW = 8.5;
    const bankH = 3.8;

    for (const { px, py, tx, ty } of this.rigs()) {
      const top = cam.project(px, py, MAST_H);
      if (!top.visible) continue;
      if (top.x < -300 || top.x > cam.width + 300) continue;

      fillWorldPoly(
        ctx,
        cam,
        [
          [px - tx * bankW * 0.5, py - ty * bankW * 0.5, MAST_H],
          [px + tx * bankW * 0.5, py + ty * bankW * 0.5, MAST_H],
          [px + tx * bankW * 0.5, py + ty * bankW * 0.5, MAST_H + bankH],
          [px - tx * bankW * 0.5, py - ty * bankW * 0.5, MAST_H + bankH],
        ],
        fogged('#232B3C', a, top.d),
      );

      // Individual lamp heads in a grid on the frame.
      const lampCols = 6;
      const lampRows = 3;
      ctx.fillStyle = this.night ? '#FFF8DC' : '#93A2BC';
      for (let i = 0; i < lampCols; i++) {
        for (let j = 0; j < lampRows; j++) {
          const u = ((i + 0.5) / lampCols - 0.5) * bankW * 0.9;
          const v = MAST_H + bankH * ((j + 0.5) / lampRows) * 0.9 + 0.2;
          const lp = cam.project(px + tx * u, py + ty * u, v);
          if (!lp.visible) continue;
          const s = Math.max(1, lp.scale * 0.95);
          ctx.fillRect(lp.x - s / 2, lp.y - s / 2, s, s);
        }
      }

      if (this.night) {
        // Bloom: a tight core plus a wide halo, with a slow flicker so the rig
        // does not look like a static decal.
        const flicker = 0.94 + Math.sin(time * 1.7 + px) * 0.06;
        const cy = top.y - (top.scale * bankH) / 2;
        const rr = Math.max(16, top.scale * 22);
        const g = ctx.createRadialGradient(top.x, cy, 0, top.x, cy, rr);
        g.addColorStop(0, `rgba(255,250,224,${0.7 * flicker})`);
        g.addColorStop(0.2, `rgba(255,246,210,${0.28 * flicker})`);
        g.addColorStop(0.55, `rgba(210,228,255,${0.08 * flicker})`);
        g.addColorStop(1, 'rgba(180,205,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(top.x - rr, cy - rr, rr * 2, rr * 2);
      }
    }
  }
}
