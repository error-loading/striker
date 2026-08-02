import { memo } from 'react';
import { GROUP_COLOR, POSITION_GROUP, type Player } from '../data/types';
import { FLAG } from '../data/flags';

interface Props {
  player: Player;
  compact?: boolean;
  selected?: boolean;
  draggable?: boolean;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  /** Shown as a corner tag, e.g. the slot the player is filling. */
  slotLabel?: string;
  className?: string;
}

const ratingColor = (overall: number) =>
  overall >= 88 ? '#FFD700' : overall >= 84 ? '#00D9FF' : overall >= 79 ? '#4ADE80' : '#94A3B8';

function PlayerCardImpl({
  player,
  compact = false,
  selected = false,
  draggable = false,
  onClick,
  onDragStart,
  onDragEnd,
  slotLabel,
  className = '',
}: Props) {
  const group = POSITION_GROUP[player.position];
  const accent = GROUP_COLOR[group];
  const rc = ratingColor(player.overall);

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={`card-hover group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left
          ${selected ? 'border-cyan/70 bg-cyan/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}
          ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${className}`}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-extrabold"
          style={{ background: `${rc}1F`, color: rc, boxShadow: `inset 0 0 0 1px ${rc}55` }}
        >
          {player.overall}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white/90">{player.name}</span>
          <span className="flex items-center gap-1.5 text-[10px] text-white/45">
            <span style={{ color: accent }} className="font-bold">
              {player.position}
            </span>
            <span aria-hidden>{FLAG[player.nationality] ?? '🏳️'}</span>
            <span className="truncate">{player.nationality}</span>
          </span>
        </span>
        {slotLabel && <span className="chip shrink-0 !px-1.5 !py-0.5 !text-[9px]">{slotLabel}</span>}
      </button>
    );
  }

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`card-hover relative overflow-hidden rounded-2xl border p-4
        ${selected ? 'border-cyan/70' : 'border-white/12'} bg-gradient-to-br from-navy-800/90 to-navy-950/95
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${className}`}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-25 blur-2xl"
        style={{ background: rc }}
      />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl font-extrabold leading-none" style={{ color: rc }}>
            {player.overall}
          </div>
          <div className="mt-1 text-[11px] font-bold tracking-widest" style={{ color: accent }}>
            {player.position}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg" aria-hidden>
            {FLAG[player.nationality] ?? '🏳️'}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-white/40">
            #{player.number}
          </div>
        </div>
      </div>

      <div className="mt-3 truncate font-display text-base font-bold uppercase tracking-wide text-white">
        {player.name}
      </div>
      <div className="text-[11px] text-white/45">
        {player.nationality} · {player.foot} footed · {player.age}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[10px]">
        {(
          [
            ['PAC', player.pace],
            ['SHO', player.shooting],
            ['PAS', player.passing],
            ['DRI', player.dribbling],
            ['DEF', player.defending],
            ['PHY', player.physical],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-1.5">
            <span className="font-bold tracking-wider text-white/40">{k}</span>
            <span className="font-extrabold text-white/85">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const PlayerCard = memo(PlayerCardImpl);
