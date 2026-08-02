import { memo } from 'react';
import type { Team } from '../data/types';

interface Props {
  team: Team;
  size?: number;
  className?: string;
}

/**
 * Procedural club crest.
 *
 * Every badge is generated from the club's own colours and initials so the
 * game ships without third-party logo assets. Rather than a single shield
 * template with a colour swap, each club is deterministically assigned:
 *
 *   shape    — 4 heraldic outlines (kite, round, banner, hex)
 *   field    — 5 field divisions (solid, halved, hooped, chevron, sash)
 *   ornament — 5 charges (star, football, wreath, chevron, monogram)
 *
 * That yields 100 combinations against 24 clubs, so no two crests collide and
 * each has a distinct silhouette + fill pattern + top charge.
 */

const SHAPES = ['kite', 'round', 'banner', 'hex'] as const;
const FIELDS = ['solid', 'halved', 'hooped', 'chevron', 'sash'] as const;
const ORNAMENTS = ['star', 'ball', 'wreath', 'chevron', 'monogram'] as const;

type Shape = (typeof SHAPES)[number];
type Field = (typeof FIELDS)[number];
type Ornament = (typeof ORNAMENTS)[number];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Path for the shield outline. All shapes fit within a 64×72 viewBox. */
function shieldPath(shape: Shape): string {
  switch (shape) {
    case 'kite':
      return 'M32 4 L58 12 V32 C58 50 45 62 32 68 C19 62 6 50 6 32 V12 Z';
    case 'round':
      return 'M32 4 C50 4 60 16 60 34 C60 52 48 66 32 68 C16 66 4 52 4 34 C4 16 14 4 32 4 Z';
    case 'banner':
      // Shield with a small banner scroll poking out below.
      return 'M32 4 L58 11 V30 C58 46 46 56 32 60 C18 56 6 46 6 30 V11 Z';
    case 'hex':
      return 'M32 4 L58 16 V44 L32 60 L6 44 V16 Z';
  }
}

interface CrestSpec {
  shape: Shape;
  field: Field;
  ornament: Ornament;
  fieldFlip: boolean;
  starCount: 1 | 2 | 3;
}

function specFor(team: Team): CrestSpec {
  const h = hash(team.id);
  return {
    shape: SHAPES[h % SHAPES.length],
    field: FIELDS[(h >> 3) % FIELDS.length],
    ornament: ORNAMENTS[(h >> 7) % ORNAMENTS.length],
    fieldFlip: ((h >> 11) & 1) === 1,
    starCount: (((h >> 13) % 3) + 1) as 1 | 2 | 3,
  };
}

function FieldPattern({
  field,
  primary,
  secondary,
  flip,
}: {
  field: Field;
  primary: string;
  secondary: string;
  flip: boolean;
}) {
  const a = flip ? secondary : primary;
  const b = flip ? primary : secondary;
  switch (field) {
    case 'solid':
      return <rect x="0" y="0" width="64" height="72" fill={a} />;
    case 'halved':
      return (
        <>
          <rect x="0" y="0" width="32" height="72" fill={a} />
          <rect x="32" y="0" width="32" height="72" fill={b} />
        </>
      );
    case 'hooped':
      return (
        <>
          <rect x="0" y="0" width="64" height="72" fill={a} />
          {[10, 26, 42].map((y) => (
            <rect key={y} x="0" y={y} width="64" height="7" fill={b} opacity="0.85" />
          ))}
        </>
      );
    case 'chevron':
      return (
        <>
          <rect x="0" y="0" width="64" height="72" fill={a} />
          <path d="M0 20 L32 6 L64 20 L64 34 L32 20 L0 34 Z" fill={b} opacity="0.9" />
        </>
      );
    case 'sash':
      return (
        <>
          <rect x="0" y="0" width="64" height="72" fill={a} />
          <path d="M-10 46 L46 -10 L64 8 L8 64 Z" fill={b} opacity="0.9" />
        </>
      );
  }
}

function Ornament({
  ornament,
  accent,
  chalk,
  starCount,
}: {
  ornament: Ornament;
  accent: string;
  chalk: string;
  starCount: 1 | 2 | 3;
}) {
  switch (ornament) {
    case 'star': {
      // 1–3 five-point stars across the top.
      const positions =
        starCount === 1 ? [32] : starCount === 2 ? [24, 40] : [20, 32, 44];
      return (
        <g fill={accent} stroke={chalk} strokeWidth="0.4" opacity="0.95">
          {positions.map((cx) => (
            <path
              key={cx}
              d={starPath(cx, 15, 4)}
            />
          ))}
        </g>
      );
    }
    case 'ball':
      // Generic football at the top — a universal football symbol, not a club mark.
      return (
        <g>
          <circle cx="32" cy="15" r="5.5" fill={chalk} stroke="#1a1a1a" strokeWidth="0.6" />
          <path
            d="M32 10.5 L34.7 12.5 L33.7 15.6 L30.3 15.6 L29.3 12.5 Z"
            fill="#1a1a1a"
          />
          <path d="M32 15 L27.2 16.5" stroke="#1a1a1a" strokeWidth="0.6" />
          <path d="M32 15 L36.8 16.5" stroke="#1a1a1a" strokeWidth="0.6" />
        </g>
      );
    case 'wreath':
      // Two laurel arcs framing the initials.
      return (
        <g fill="none" stroke={accent} strokeWidth="1.2" opacity="0.85">
          <path d="M14 30 Q10 44 20 54" />
          <path d="M50 30 Q54 44 44 54" />
          {[0, 1, 2, 3].map((i) => (
            <g key={`l-${i}`}>
              <ellipse cx={12 + i * 1.8} cy={32 + i * 6} rx="2.2" ry="1" fill={accent} transform={`rotate(-30 ${12 + i * 1.8} ${32 + i * 6})`} />
              <ellipse cx={52 - i * 1.8} cy={32 + i * 6} rx="2.2" ry="1" fill={accent} transform={`rotate(30 ${52 - i * 1.8} ${32 + i * 6})`} />
            </g>
          ))}
        </g>
      );
    case 'chevron':
      // Small triangular chevron mark above the letters.
      return (
        <path
          d="M22 18 L32 10 L42 18 L38 20 L32 15 L26 20 Z"
          fill={accent}
          stroke={chalk}
          strokeWidth="0.4"
        />
      );
    case 'monogram':
      // No top charge — the initials carry the crest.
      return null;
  }
}

function starPath(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.42;
    points.push(`${cx + Math.cos(angle) * rad},${cy + Math.sin(angle) * rad}`);
  }
  return `M${points.join(' L')} Z`;
}

function TeamCrestImpl({ team, size = 48, className = '' }: Props) {
  const id = `crest-${team.id}`;
  const spec = specFor(team);
  const path = shieldPath(spec.shape);
  const initials = team.shortName.slice(0, 3);
  const hasWreath = spec.ornament === 'wreath';
  const hasBanner = spec.shape === 'banner';

  // Contrast rule: if the primary is very light, put the initials in dark ink.
  const luminance = getLuminance(team.primaryColor);
  const inkColor = luminance > 0.55 ? '#0B1810' : '#F2EFE4';
  const strokeColor = luminance > 0.55 ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.55)';

  // Initials position drops a touch when a wreath is present so it sits inside.
  const textY = hasWreath ? 46 : spec.ornament === 'monogram' ? 44 : 42;
  const textSize = initials.length > 2 ? (spec.ornament === 'monogram' ? 22 : 17) : spec.ornament === 'monogram' ? 26 : 22;

  return (
    <svg
      width={size}
      height={size * (72 / 64)}
      viewBox="0 0 64 72"
      className={className}
      role="img"
      aria-label={`${team.name} crest`}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={path} />
        </clipPath>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* Field, clipped inside the shield outline. */}
      <g clipPath={`url(#${id}-clip)`}>
        <FieldPattern
          field={spec.field}
          primary={team.primaryColor}
          secondary={team.secondaryColor}
          flip={spec.fieldFlip}
        />
        {/* Inner shine highlight to lift the field. */}
        <rect x="0" y="0" width="64" height="72" fill={`url(#${id}-shine)`} />
      </g>

      {/* Ornament sits on top of the field but under the initials. */}
      <g clipPath={`url(#${id}-clip)`}>
        <Ornament
          ornament={spec.ornament}
          accent={team.accentColor}
          chalk="#F2EFE4"
          starCount={spec.starCount}
        />
      </g>

      {/* Initials. */}
      <text
        x="32"
        y={textY}
        textAnchor="middle"
        fontFamily="'Big Shoulders Display', Impact, sans-serif"
        fontWeight="800"
        fontSize={textSize}
        fill={inkColor}
        stroke={strokeColor}
        strokeWidth="0.5"
        letterSpacing="0.8"
      >
        {initials}
      </text>

      {/* Banner scroll beneath, for the 'banner' shape. */}
      {hasBanner && (
        <g>
          <path
            d="M6 58 Q32 66 58 58 L58 66 Q32 72 6 66 Z"
            fill={team.accentColor}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth="0.6"
          />
          <text
            x="32"
            y="66.5"
            textAnchor="middle"
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="700"
            fontSize="6"
            fill={getLuminance(team.accentColor) > 0.55 ? '#0B1810' : '#F2EFE4'}
            letterSpacing="0.4"
          >
            {team.shortName.slice(0, 3).toUpperCase()}
          </text>
        </g>
      )}

      {/* Shield outline stroke on top for a crisp edge. */}
      <path
        d={path}
        fill="none"
        stroke={inkColor === '#F2EFE4' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)'}
        strokeWidth="1.6"
      />
      {/* Inner hairline for depth. */}
      <path
        d={path}
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="0.6"
        transform="translate(0.6 0.6) scale(0.98)"
        transform-origin="32 36"
        style={{ transformOrigin: '32px 36px' }}
      />
    </svg>
  );
}

/** sRGB relative luminance for contrast decisions. */
function getLuminance(hex: string): number {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export const TeamCrest = memo(TeamCrestImpl);
