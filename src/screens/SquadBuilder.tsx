import { useMemo, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { PlayerCard } from '../components/PlayerCard';
import { TeamCrest } from '../components/TeamCrest';
import { FORMATIONS, getFormation } from '../data/formations';
import { FLAG } from '../data/flags';
import { getTeam, LEAGUES } from '../data/leagues';
import { GROUP_COLOR, POSITION_GROUP, positionAffinity, type Player, type PositionGroup } from '../data/types';
import { useGame } from '../store/gameStore';

type DragSource = { kind: 'bench'; player: Player } | { kind: 'slot'; index: number };

const GROUP_FILTERS: (PositionGroup | 'ALL')[] = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];

export default function SquadBuilder() {
  const {
    userTeamId,
    formationId,
    starters,
    savedSquads,
    selectTeam,
    setFormation,
    setStarter,
    swapStarters,
    autoPickSquad,
    saveSquad,
    loadSquad,
    deleteSquad,
    setScreen,
    bench,
    squadRating,
    chemistry,
  } = useGame();

  const team = getTeam(userTeamId);
  const formation = getFormation(formationId);
  const [teamSearch, setTeamSearch] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<PositionGroup | 'ALL'>('ALL');
  const [minRating, setMinRating] = useState(0);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [inspect, setInspect] = useState<Player | null>(null);
  const [squadName, setSquadName] = useState('');
  const dragRef = useRef<DragSource | null>(null);

  const benchPlayers = bench();
  const rating = squadRating();
  const chem = chemistry();
  const filledCount = starters.filter(Boolean).length;

  const filteredLeagues = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    return LEAGUES.map((l) => ({
      ...l,
      teams: l.teams.filter((t) => !q || t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q)),
    })).filter((l) => l.teams.length > 0);
  }, [teamSearch]);

  const filteredBench = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    return benchPlayers
      .filter((p) => (groupFilter === 'ALL' ? true : POSITION_GROUP[p.position] === groupFilter))
      .filter((p) => p.overall >= minRating)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.position.toLowerCase().includes(q))
      .sort((a, b) => b.overall - a.overall);
  }, [benchPlayers, groupFilter, minRating, playerSearch]);

  const handleDrop = (index: number) => {
    const src = dragRef.current;
    dragRef.current = null;
    setDragOverSlot(null);
    if (!src) return;
    audio.click();
    if (src.kind === 'bench') setStarter(index, src.player);
    else if (src.index !== index) swapStarters(src.index, index);
  };

  const handleSlotClick = (index: number) => {
    audio.click();
    if (selectedSlot === null) {
      setSelectedSlot(index);
      setInspect(starters[index]);
    } else if (selectedSlot === index) {
      setSelectedSlot(null);
    } else {
      swapStarters(selectedSlot, index);
      setSelectedSlot(null);
    }
  };

  const handleBenchClick = (player: Player) => {
    audio.click();
    setInspect(player);
    if (selectedSlot !== null) {
      setStarter(selectedSlot, player);
      setSelectedSlot(null);
    }
  };

  return (
    <div className="pitch-bg flex h-full w-full flex-col font-editorial text-chalk">
      {/* ─────────────────────── Match-card header ─────────────────────── */}
      <header className="z-20 flex shrink-0 items-stretch border-b border-chalk/15">
        <button
          onClick={() => setScreen('landing')}
          className="flex items-center gap-2 border-r border-chalk/15 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-chalk-dim transition hover:text-chalk"
        >
          <span className="font-mono">←</span> Back
        </button>
        <div className="flex items-center gap-3 border-r border-chalk/15 px-5 py-3">
          <span className="stencil-num flex h-9 w-9 items-center justify-center bg-chalk text-[18px] leading-none text-pitch-950">
            02
          </span>
          <div className="leading-none">
            <div className="font-stencil text-[18px] font-extrabold tracking-tight uppercase">
              Team Sheet
            </div>
            <div className="eyebrow mt-1">Assemble XI · pick a shape</div>
          </div>
        </div>

        {/* Current team readout, tucked into the header like a match card. */}
        <div className="hidden items-center gap-3 border-r border-chalk/15 px-5 md:flex">
          <TeamCrest team={team} size={30} />
          <div className="leading-tight">
            <div className="font-stencil text-[13px] font-bold uppercase text-chalk">
              {team.shortName}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim">
              {team.league}
            </div>
          </div>
        </div>

        {/* Ratings block */}
        <div className="ml-auto flex items-stretch">
          <HeaderStat label="OVR" value={rating} accent={rating >= 85 ? 'chalk' : 'dim'} />
          <HeaderStat label="Chem" value={`${chem}`} suffix="%" accent={chem >= 75 ? 'chalk' : 'dim'} />
          <HeaderStat label="Filled" value={`${filledCount}/11`} accent={filledCount === 11 ? 'chalk' : 'corner'} />
          <div className="flex items-center gap-2 border-l border-chalk/15 px-4">
            <button
              onClick={() => { audio.click(); autoPickSquad(); }}
              className="ghost-btn !py-2 !px-4 !text-[12px]"
            >
              Auto pick
            </button>
            <button
              onClick={() => { audio.confirm(); setScreen('setup'); }}
              disabled={filledCount < 11}
              className="kick-btn !py-2 !px-4 !text-[14px] disabled:cursor-not-allowed disabled:opacity-40"
              title={filledCount < 11 ? 'Fill all eleven positions first' : undefined}
            >
              Continue <span className="whistle">→</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ─────────────────────── Left: club selector ─────────────────────── */}
        <aside className="flex w-full shrink-0 flex-col border-b border-chalk/15 lg:w-[300px] lg:border-b-0 lg:border-r">
          <div className="border-b border-chalk/10 p-4">
            <div className="eyebrow">Your club</div>
            <input
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              placeholder="Search clubs…"
              className="mt-3 w-full border border-chalk/20 bg-pitch-950/60 px-3 py-2 font-editorial text-[13px] text-chalk outline-none transition placeholder:text-chalk-dim/50 focus:border-corner"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            {filteredLeagues.map((league) => (
              <div key={league.id} className="border-b border-chalk/10 last:border-b-0">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-chalk/10 bg-pitch-950/95 px-4 py-2 backdrop-blur">
                  <span className="eyebrow">{league.name}</span>
                  <span className="font-mono text-[9px] text-chalk-dim/60">
                    {league.teams.length}
                  </span>
                </div>
                <ul>
                  {league.teams.map((t) => {
                    const active = t.id === userTeamId;
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => { audio.click(); selectTeam(t.id); setSelectedSlot(null); }}
                          onMouseEnter={() => audio.hover()}
                          className={`group flex w-full items-center gap-3 border-b border-chalk/5 px-4 py-2.5 text-left transition
                            ${active ? 'bg-corner/10' : 'hover:bg-chalk/5'}`}
                        >
                          {/* Kit-color bar as the club's identity marker. */}
                          <span
                            className="h-9 w-[3px] shrink-0"
                            style={{ background: t.primaryColor }}
                            aria-hidden
                          />
                          <TeamCrest team={t} size={30} />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate font-stencil text-[13px] font-bold uppercase transition ${active ? 'text-corner' : 'text-chalk group-hover:text-chalk'}`}>
                              {t.name}
                            </span>
                            <span className="font-mono text-[9px] uppercase tracking-widest text-chalk-dim/70">
                              OVR {t.rating}
                            </span>
                          </span>
                          {active && (
                            <span className="font-mono text-[9px] uppercase tracking-widest text-corner">
                              ●
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* ─────────────────────── Centre: formation pitch ─────────────────────── */}
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-chalk/15 px-5 py-3">
            <span className="eyebrow mr-2">Formation</span>
            {FORMATIONS.map((f) => (
              <button
                key={f.id}
                onClick={() => { audio.click(); setFormation(f.id); setSelectedSlot(null); }}
                onMouseEnter={() => audio.hover()}
                className={`border px-3 py-1.5 font-stencil text-[12px] font-bold uppercase tracking-[0.08em] transition
                  ${f.id === formationId
                    ? 'border-corner bg-corner text-chalk'
                    : 'border-chalk/20 text-chalk-dim hover:border-chalk/50 hover:text-chalk'}`}
              >
                {f.name}
              </button>
            ))}
            <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
              {formation.description}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 scroll-thin">
            <FormationPitch
              starters={starters}
              formationId={formationId}
              dragOverSlot={dragOverSlot}
              selectedSlot={selectedSlot}
              onSlotClick={handleSlotClick}
              onSlotDragStart={(index) => { dragRef.current = { kind: 'slot', index }; }}
              onSlotDragOver={setDragOverSlot}
              onSlotDrop={handleDrop}
              onSlotClear={(index) => { audio.click(); setStarter(index, null); }}
            />
          </div>
        </main>

        {/* ─────────────────────── Right: bench + saved squads ─────────────────────── */}
        <aside className="flex w-full shrink-0 flex-col border-t border-chalk/15 lg:w-[340px] lg:border-l lg:border-t-0">
          {/* Bench header */}
          <div className="border-b border-chalk/10 p-4">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Squad · bench</span>
              <span className="font-mono text-[10px] text-chalk-dim/70">
                {filteredBench.length} available
              </span>
            </div>
            <input
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Search players…"
              className="mt-3 w-full border border-chalk/20 bg-pitch-950/60 px-3 py-2 font-editorial text-[13px] text-chalk outline-none transition placeholder:text-chalk-dim/50 focus:border-corner"
            />

            <div className="mt-3 flex flex-wrap gap-1">
              {GROUP_FILTERS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupFilter(g)}
                  className={`border px-2.5 py-1 font-stencil text-[10px] font-bold tracking-[0.1em] transition
                    ${groupFilter === g
                      ? 'border-corner bg-corner/15 text-corner'
                      : 'border-chalk/15 text-chalk-dim hover:border-chalk/40 hover:text-chalk'}`}
                >
                  {g}
                </button>
              ))}
            </div>

            <label className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-chalk-dim">
              Min OVR
              <input
                type="range"
                min={0}
                max={95}
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="flex-1"
              />
              <span className="stencil-num w-6 text-right text-[14px] text-chalk">
                {minRating}
              </span>
            </label>
          </div>

          {/* Bench list — team-sheet rows */}
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            {filteredBench.map((p) => (
              <BenchRow
                key={p.id}
                player={p}
                selected={inspect?.id === p.id}
                onClick={() => handleBenchClick(p)}
                onDragStart={() => { dragRef.current = { kind: 'bench', player: p }; }}
                onDragEnd={() => { dragRef.current = null; setDragOverSlot(null); }}
              />
            ))}
            {!filteredBench.length && (
              <p className="py-8 text-center font-mono text-[11px] uppercase tracking-widest text-chalk-dim/60">
                No players match those filters.
              </p>
            )}
          </div>

          {/* Saved squads */}
          <div className="border-t border-chalk/15 p-4">
            <div className="eyebrow">Saved sheets</div>
            <div className="mt-3 flex gap-2">
              <input
                value={squadName}
                onChange={(e) => setSquadName(e.target.value)}
                placeholder="Name this sheet"
                className="min-w-0 flex-1 border border-chalk/20 bg-pitch-950/60 px-3 py-2 font-editorial text-[12px] text-chalk outline-none transition placeholder:text-chalk-dim/50 focus:border-corner"
              />
              <button
                onClick={() => { audio.confirm(); saveSquad(squadName); setSquadName(''); }}
                className="ghost-btn !py-2 !px-3 !text-[11px]"
              >
                Save
              </button>
            </div>
            {savedSquads.length > 0 && (
              <ul className="mt-3 max-h-32 divide-y divide-chalk/10 overflow-y-auto scroll-thin border-t border-chalk/10">
                {savedSquads.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-2">
                    <button
                      onClick={() => { audio.click(); loadSquad(s.id); }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate font-stencil text-[12px] font-bold uppercase text-chalk">
                        {s.name}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-widest text-chalk-dim/60">
                        {getTeam(s.teamId).shortName} · {s.formationId}
                      </span>
                    </button>
                    <button
                      onClick={() => deleteSquad(s.id)}
                      className="font-mono text-[13px] text-chalk-dim/50 transition hover:text-corner"
                      aria-label={`Delete ${s.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Inspector card */}
      {inspect && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 w-72 -translate-x-1/2 lg:left-auto lg:right-[22.5rem] lg:translate-x-0">
          <div className="pointer-events-auto">
            <PlayerCard player={inspect} />
            <button
              onClick={() => setInspect(null)}
              className="mt-2 w-full border border-chalk/15 bg-pitch-950/80 py-2 font-mono text-[10px] uppercase tracking-widest text-chalk-dim transition hover:text-chalk"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */

function HeaderStat({
  label,
  value,
  suffix = '',
  accent,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  accent: 'chalk' | 'dim' | 'corner';
}) {
  const color = accent === 'corner' ? 'text-corner' : accent === 'dim' ? 'text-chalk-dim' : 'text-chalk';
  return (
    <div className="hidden flex-col items-end justify-center border-l border-chalk/15 px-5 sm:flex">
      <div className="eyebrow">{label}</div>
      <div className={`stencil-num mt-0.5 text-[20px] leading-none ${color}`}>
        {value}
        {suffix}
      </div>
    </div>
  );
}

function BenchRow({
  player,
  selected,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  player: Player;
  selected: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const group = POSITION_GROUP[player.position];
  const accent = GROUP_COLOR[group];
  return (
    <button
      type="button"
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group flex w-full cursor-grab items-center gap-3 border-b border-chalk/10 px-4 py-2.5 text-left transition active:cursor-grabbing
        ${selected ? 'bg-corner/10' : 'hover:bg-chalk/5'}`}
    >
      <span className="stencil-num w-8 text-right text-[20px] leading-none text-chalk">
        {player.overall}
      </span>
      <span
        className="w-[3px] self-stretch"
        style={{ background: accent }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-editorial text-[13px] font-semibold text-chalk">
          {player.name}
        </span>
        <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-chalk-dim/80">
          <span style={{ color: accent }} className="font-bold">
            {player.position}
          </span>
          <span aria-hidden>{FLAG[player.nationality] ?? '·'}</span>
          <span className="truncate">{player.nationality}</span>
        </span>
      </span>
      <span className="font-mono text-[10px] text-chalk-dim/60">#{player.number}</span>
    </button>
  );
}

/* ================================================================== */

interface PitchProps {
  starters: (Player | null)[];
  formationId: string;
  dragOverSlot: number | null;
  selectedSlot: number | null;
  onSlotClick: (i: number) => void;
  onSlotDragStart: (i: number) => void;
  onSlotDragOver: (i: number | null) => void;
  onSlotDrop: (i: number) => void;
  onSlotClear: (i: number) => void;
}

/**
 * Chalk-on-grass formation pitch. Slot cards look like team-sheet tokens —
 * shirt number top-left, name and position, kit-color rail on the left edge.
 */
export function FormationPitch({
  starters,
  formationId,
  dragOverSlot,
  selectedSlot,
  onSlotClick,
  onSlotDragStart,
  onSlotDragOver,
  onSlotDrop,
  onSlotClear,
}: PitchProps) {
  const formation = getFormation(formationId);

  return (
    <div
      className="relative mx-auto aspect-[68/105] w-full max-w-[32rem] overflow-hidden border border-chalk/20"
      style={{
        background:
          'repeating-linear-gradient(0deg, #0F2015 0px, #0F2015 34px, #14291B 34px, #14291B 68px), linear-gradient(180deg, #0B1810, #0F2015)',
      }}
    >
      {/* Chalk markings, drawn with a slight turbulence filter. */}
      <svg viewBox="0 0 68 105" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <filter id="pitch-chalk" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence baseFrequency="1.1" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="0.35" />
          </filter>
        </defs>
        <g
          fill="none"
          stroke="#F2EFE4"
          strokeWidth="0.28"
          opacity="0.55"
          strokeLinecap="round"
          filter="url(#pitch-chalk)"
          vectorEffect="non-scaling-stroke"
        >
          <rect x="0.5" y="0.5" width="67" height="104" />
          <line x1="0.5" y1="52.5" x2="67.5" y2="52.5" />
          <circle cx="34" cy="52.5" r="9.15" />
          <circle cx="34" cy="52.5" r="0.6" fill="#F2EFE4" stroke="none" />
          {/* Bottom (own) end */}
          <rect x="13.84" y="88.54" width="40.32" height="16.46" />
          <rect x="24.84" y="99.51" width="18.32" height="5.49" />
          <circle cx="34" cy="94.03" r="0.6" fill="#F2EFE4" stroke="none" />
          <path d="M24.9 88.54 A9.15 9.15 0 0 0 43.1 88.54" />
          {/* Top (opposition) end */}
          <rect x="13.84" y="0" width="40.32" height="16.46" />
          <rect x="24.84" y="0" width="18.32" height="5.49" />
          <circle cx="34" cy="10.97" r="0.6" fill="#F2EFE4" stroke="none" />
          <path d="M24.9 16.46 A9.15 9.15 0 0 1 43.1 16.46" />
          {/* Corner arcs */}
          <path d="M0.5 3 A2.5 2.5 0 0 0 3 0.5" />
          <path d="M65 0.5 A2.5 2.5 0 0 0 67.5 3" />
          <path d="M0.5 102 A2.5 2.5 0 0 1 3 104.5" />
          <path d="M65 104.5 A2.5 2.5 0 0 1 67.5 102" />
        </g>
      </svg>

      {formation.slots.map((slot, i) => {
        const player = starters[i];
        const top = `${(1 - slot.x) * 88 + 6}%`;
        const left = `${slot.y * 84 + 8}%`;
        const isOver = dragOverSlot === i;
        const isSelected = selectedSlot === i;
        const fit = player ? positionAffinity(player.position, slot.position) : 0;
        const accent = GROUP_COLOR[slot.group];

        return (
          <div
            key={`${slot.position}-${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ top, left }}
          >
            <div
              draggable={!!player}
              onDragStart={() => onSlotDragStart(i)}
              onDragEnd={() => onSlotDragOver(null)}
              onDragOver={(e) => { e.preventDefault(); onSlotDragOver(i); }}
              onDragLeave={() => onSlotDragOver(null)}
              onDrop={(e) => { e.preventDefault(); onSlotDrop(i); }}
              onClick={() => onSlotClick(i)}
              className={`group relative flex w-[5.1rem] cursor-pointer flex-col items-stretch text-left transition-all
                ${isOver
                  ? 'scale-105 border border-corner bg-pitch-950/95 shadow-[0_0_0_2px_rgba(229,72,77,0.6),0_0_20px_rgba(229,72,77,0.35)]'
                  : isSelected
                  ? 'border border-corner bg-pitch-950/95'
                  : player
                  ? 'border border-chalk/25 bg-pitch-950/85 hover:border-chalk/60'
                  : 'border border-dashed border-chalk/30 bg-pitch-950/60'}`}
              style={{ borderRadius: '2px' }}
            >
              {/* Position tag — bar-scroll style. */}
              <span
                className="absolute -top-[9px] left-1 px-1 font-stencil text-[9px] font-extrabold tracking-[0.1em] text-pitch-950"
                style={{ background: accent }}
              >
                {slot.position}
              </span>

              {player ? (
                <div className="flex items-stretch gap-1.5 pt-2 pb-1.5 pl-1.5 pr-2">
                  {/* Kit rail on the left, colored by the position group. */}
                  <span
                    className="w-[2px] shrink-0"
                    style={{ background: accent, opacity: fit >= 1 ? 1 : fit >= 0.7 ? 0.6 : 0.3 }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className="stencil-num text-[18px] leading-none text-chalk">
                        {player.overall}
                      </span>
                      <span className="ml-auto font-mono text-[9px] text-chalk-dim/70">
                        #{player.number}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate font-editorial text-[10px] font-semibold leading-tight text-chalk">
                      {player.name.split(' ').slice(-1)[0]}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-[8px] uppercase leading-none text-chalk-dim/70">
                      <span aria-hidden>{FLAG[player.nationality] ?? ''}</span>
                      <span className="truncate">{player.nationality.slice(0, 3)}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSlotClear(i); }}
                    className="absolute -right-[7px] -top-[7px] hidden h-4 w-4 items-center justify-center bg-corner font-mono text-[9px] font-bold text-chalk group-hover:flex"
                    style={{ borderRadius: '2px' }}
                    aria-label={`Remove ${player.name}`}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <span className="px-2 py-3 text-center font-mono text-[9px] uppercase tracking-widest text-chalk-dim/50">
                  Empty
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
