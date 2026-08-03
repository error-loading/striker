import type { Weather } from '../data/types';
import { mixHex } from './draw';

/**
 * Aerial perspective and the key light, in one place.
 *
 * Everything the stadium draws — stands, crowd, roof, pylons — runs its colour
 * through {@link fogged} before it hits the canvas. Surfaces far from the camera
 * lose contrast and drift toward the sky colour, which is what actually sells
 * depth in a bowl this big: without it, the far stand reads as a flat sticker
 * pasted at the top of the frame.
 */
export interface Atmosphere {
  /** Colour distant geometry dissolves into. Matches the sky at the horizon. */
  haze: string;
  /** Depth in metres at which haze starts to bite. */
  near: number;
  /** Depth in metres at which haze reaches {@link max}. */
  far: number;
  /** Strongest haze fraction, 0..1. Never 1, or the far stand vanishes. */
  max: number;
  /** Unit vector toward the key light, world space, z up. */
  sun: { x: number; y: number; z: number };
  /** Broad multiplier on stadium surface brightness. */
  ambient: number;
  /** Warm tint mixed into lit surfaces — sodium at night, sunlight by day. */
  warm: string;
  warmth: number;
  night: boolean;
}

const norm = (x: number, y: number, z: number) => {
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
};

export function atmosphereFor(night: boolean, weather: Weather): Atmosphere {
  if (night) {
    return {
      // Night haze is the floodlight spill hanging in the air over the bowl.
      haze: '#0B1428',
      near: 55,
      far: 220,
      max: 0.72,
      sun: norm(-0.35, -0.5, 0.79),
      ambient: 0.62,
      warm: '#FFE7B8',
      warmth: 0.16,
      night: true,
    };
  }
  const base: Atmosphere = {
    haze: '#A8C4DC',
    near: 40,
    far: 175,
    max: 0.6,
    sun: norm(-0.42, -0.36, 0.83),
    ambient: 1,
    warm: '#FFF3D6',
    warmth: 0.1,
    night: false,
  };
  if (weather === 'Rainy') return { ...base, haze: '#7C8896', max: 0.62, near: 60, ambient: 0.86, warmth: 0.02 };
  if (weather === 'Snowy') return { ...base, haze: '#D7E1EA', max: 0.7, near: 50, ambient: 1.04, warmth: 0.03 };
  if (weather === 'Foggy') return { ...base, haze: '#C0CBD6', max: 0.86, near: 34, far: 190, ambient: 0.92, warmth: 0.02 };
  return base;
}

/** Haze fraction at a given camera depth, 0..max. */
export function fog(a: Atmosphere, depth: number): number {
  if (depth <= a.near) return 0;
  const t = Math.min(1, (depth - a.near) / (a.far - a.near));
  // Squared falloff: the near stands stay crisp, the far ones wash out fast.
  return a.max * t * t;
}

/** Blend a surface colour toward the haze by its distance from the camera. */
export function fogged(hex: string, a: Atmosphere, depth: number): string {
  const f = fog(a, depth);
  return f <= 0.002 ? hex : mixHex(hex, a.haze, f);
}

/**
 * Lambert shading for a stadium face, given the outward normal of the surface
 * it belongs to. Faces turned away from the key light sit in ambient only.
 */
export function litFace(hex: string, a: Atmosphere, nx: number, ny: number, nz: number): string {
  const d = nx * a.sun.x + ny * a.sun.y + nz * a.sun.z;
  const lambert = a.ambient * (0.62 + 0.38 * Math.max(0, d));
  const tinted = a.warmth > 0 ? mixHex(hex, a.warm, a.warmth * Math.max(0, d)) : hex;
  return mixHex(tinted, lambert >= 1 ? '#FFFFFF' : '#000000', Math.min(0.6, Math.abs(lambert - 1)));
}

/**
 * Where a point's shadow lands on the pitch, given the key light. Returned in
 * world metres, so the caller projects it like any other ground position.
 */
export function shadowOffset(a: Atmosphere, height: number): { dx: number; dy: number } {
  // Guard a light directly overhead, which would throw the shadow to infinity.
  const zc = Math.max(0.35, a.sun.z);
  return { dx: (-a.sun.x / zc) * height, dy: (-a.sun.y / zc) * height };
}
