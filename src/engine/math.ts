export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function norm(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-6 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const fromAngle = (a: number, m = 1): Vec2 => ({ x: Math.cos(a) * m, y: Math.sin(a) * m });

export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

/** Shortest signed difference between two angles, in (-pi, pi]. */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Rotate `from` toward `to` by at most `maxStep` radians. */
export function rotateToward(from: number, to: number, maxStep: number): number {
  const d = angleDiff(to, from);
  return from + clamp(d, -maxStep, maxStep);
}

/** Deterministic PRNG so a match can be replayed from a seed. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  /**
   * Approximately gaussian, via the sum of three uniforms (Bates distribution).
   * Three U(0,1) samples have mean 1.5 and standard deviation 0.5, so dividing
   * the centred sum by 0.5 yields unit variance and a realistic ±3σ tail.
   */
  gauss(sigma = 1): number {
    return ((this.next() + this.next() + this.next() - 1.5) / 0.5) * sigma;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
}
