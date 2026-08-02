import { memo } from 'react';
import type { Team } from '../data/types';

interface Props {
  team: Team;
  size?: number;
  className?: string;
}

/**
 * Procedural club crest. Every badge is generated from the club's own colours
 * and initials, so the game ships without third-party logo assets.
 */
function TeamCrestImpl({ team, size = 48, className = '' }: Props) {
  const id = `crest-${team.id}`;
  const initials = team.shortName.slice(0, 3);
  // Stripe pattern varies by club so badges are visually distinguishable.
  const variant = team.id.charCodeAt(0) % 3;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={`${team.name} crest`}
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={team.primaryColor} />
          <stop offset="100%" stopColor={team.accentColor} />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <path d="M32 3 L58 11 V32 C58 46 46 56 32 61 C18 56 6 46 6 32 V11 Z" />
        </clipPath>
      </defs>

      <path
        d="M32 3 L58 11 V32 C58 46 46 56 32 61 C18 56 6 46 6 32 V11 Z"
        fill={`url(#${id}-g)`}
        stroke={team.secondaryColor}
        strokeWidth="2.5"
      />

      <g clipPath={`url(#${id}-clip)`} opacity="0.5">
        {variant === 0 &&
          [0, 1, 2].map((i) => (
            <rect key={i} x={12 + i * 16} y="0" width="7" height="64" fill={team.secondaryColor} />
          ))}
        {variant === 1 && <rect x="0" y="0" width="64" height="20" fill={team.secondaryColor} />}
        {variant === 2 && (
          <path d="M6 34 L58 20 V32 L6 46 Z" fill={team.secondaryColor} />
        )}
      </g>

      <text
        x="32"
        y="38"
        textAnchor="middle"
        fontFamily="Poppins, Inter, sans-serif"
        fontWeight="800"
        fontSize={initials.length > 2 ? 17 : 21}
        fill="#FFFFFF"
        stroke="rgba(0,0,0,0.45)"
        strokeWidth="0.7"
        letterSpacing="0.5"
      >
        {initials}
      </text>
      <path d="M32 3 L58 11 V32 C58 46 46 56 32 61" fill="rgba(255,255,255,0.1)" />
    </svg>
  );
}

export const TeamCrest = memo(TeamCrestImpl);
