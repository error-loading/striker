import type { Weather } from '../data/types';
import type { MatchPlayer } from '../engine/types';

/**
 * Per-player looks, derived once from the player's id.
 *
 * Everything here is deterministic — the same player always looks the same,
 * across reloads and replays — and derived rather than authored, which is the
 * same trick the squad data uses to get 384 coherent players out of nothing.
 *
 * Skin tone is distributed across the roster independently of nationality.
 * Inferring someone's appearance from the country on their passport would be
 * wrong about a great many real footballers, so the spread is seeded from the
 * player id instead: diverse squads, no assumptions encoded.
 */
export type HairStyle = 'short' | 'buzz' | 'fade' | 'curly' | 'afro' | 'long' | 'topknot' | 'bald';
export type FacialHair = 'none' | 'stubble' | 'goatee' | 'full';

export interface Appearance {
  skin: string;
  /** Shaded and lit variants, precomputed so the draw loop stays cheap. */
  skinDark: string;
  hair: string;
  hairStyle: HairStyle;
  facialHair: FacialHair;
  boots: string;
  bootAccent: string;
  sleeves: 'short' | 'long';
  headband: boolean;
  /** Build variation: scales shoulder width and height a little. */
  heightScale: number;
  buildScale: number;
}

/**
 * Skin tones, each as a [lit, shaded] pair. Shared with the crowd — see
 * `spectators.ts` — so a spectator and a player standing under the same
 * floodlight are drawn from the same range of people.
 */
export const SKIN_TONES: [string, string][] = [
  ['#F2D3BC', '#D9AE93'],
  ['#EBC3A3', '#CE9C79'],
  ['#D9A87C', '#B98456'],
  ['#C68A62', '#A2693F'],
  ['#A9683F', '#834B27'],
  ['#8A5433', '#67381E'],
  ['#6B3F26', '#4C2917'],
  ['#4E2C18', '#361C0E'],
];

export const HAIR_COLORS = ['#12100F', '#1C1512', '#2B1B12', '#3D2415', '#5B3A1E', '#8A5A2B', '#C8A050', '#E8D9A8', '#A33B14'];
const HAIR_STYLES: HairStyle[] = ['short', 'buzz', 'fade', 'curly', 'afro', 'long', 'topknot', 'short', 'fade', 'short'];
const BOOTS = ['#F2F4F7', '#14161A', '#D9F24A', '#FF3B6B', '#2E7DFF', '#FF8A1E', '#00E0B8', '#B026FF', '#FFD400'];

/** xorshift-ish hash so consecutive ids do not produce similar players. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  return h >>> 0;
}

const cache = new Map<string, Appearance>();

export function appearanceFor(p: MatchPlayer, weather: Weather): Appearance {
  const key = `${p.id}:${weather}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const h = hash(p.id);
  // Independent streams off the one hash, so changing one trait does not
  // shuffle the others.
  const pick = (shift: number, n: number) => ((h >>> shift) & 0xff) % n;
  const frac = (shift: number) => (((h >>> shift) & 0xff) / 255);

  const [skin, skinDark] = SKIN_TONES[pick(0, SKIN_TONES.length)];
  const age = p.source.age;

  // Older players lose hair and grey a little more often — a small thing that
  // makes a squad list read as people rather than clones.
  let hairStyle = HAIR_STYLES[pick(5, HAIR_STYLES.length)];
  if (age > 31 && frac(11) < 0.22) hairStyle = 'bald';
  let hair = HAIR_COLORS[pick(13, HAIR_COLORS.length)];
  if (age > 32 && frac(19) < 0.25) hair = '#9AA0A6';

  // Beards get more common with age, and a clean shave is always on the table.
  const beardRoll = frac(21) * (age > 27 ? 1.25 : 0.85);
  const facialHair: FacialHair =
    beardRoll < 0.42 ? 'none' : beardRoll < 0.68 ? 'stubble' : beardRoll < 0.84 ? 'goatee' : 'full';

  const boots = BOOTS[pick(3, BOOTS.length)];
  const cold = weather === 'Snowy' || weather === 'Rainy';

  const a: Appearance = {
    skin,
    skinDark,
    hair,
    hairStyle,
    facialHair,
    boots,
    bootAccent: BOOTS[(pick(3, BOOTS.length) + 3) % BOOTS.length],
    sleeves: cold || frac(7) < 0.3 ? 'long' : 'short',
    headband: frac(17) < 0.06,
    heightScale: 0.94 + frac(9) * 0.13,
    buildScale: 0.92 + frac(23) * 0.17,
  };
  cache.set(key, a);
  return a;
}
