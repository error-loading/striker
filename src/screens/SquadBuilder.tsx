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

  /** Resolve a drop onto a formation slot from either source. */
  const handleDrop = (index: number) => {
    const src = dragRef.current;
    dragRef.current = null;
    setDragOverSlot(null);
    if (!src) return;
    audio.click();
    if (src.kind === 'bench') setStarter(index, src.player);
    else if (src.index !== index) swapStarters(src.index, index);
  };

  /** Click-to-place fallback for touch devices, where HTML5 drag is unreliable. */
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
    <div className="grid-bg flex h-full w-full flex-col bg-navy-950">
      {/* Header */}
      <header className="z-20 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-navy-950/85 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen('landing')} className="btn-ghost !px-3 !py-2 !text-[11px]">
            ← Back
          </button>
          <h1 className="heading text-lg sm:text-xl">Squad Builder</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { audio.click(); autoPickSquad(); }} className="btn-ghost !px-4 !py-2 !text-[11px]">
            Auto Pick
          </button>
          <button
            onClick={() => { audio.confirm(); setScreen('setup'); }}
            disabled={filledCount < 11}
            className="btn-primary !px-5 !py-2 !text-[11px]"
            title={filledCount < 11 ? 'Fill all eleven positions first' : undefined}
          >
            Continue →
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ---------------- Left: club selection ---------------- */}
        <aside className="flex w-full shrink-0 flex-col border-b border-white/10 lg:w-72 lg:border-b-0 lg:border-r">
          <div className="p-3">
            <div className="label mb-2">Choose your club</div>
            <input
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              placeholder="Search clubs…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-cyan/60"
            />
          </div>
          <div className="max-h-56 flex-1 overflow-y-auto px-3 pb-3 scroll-thin lg:max-h-none">
            {filteredLeagues.map((league) => (
              <div key={league.id} className="mb-4">
                <div className="sticky top-0 z-10 bg-navy-950/90 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35 backdrop-blur">
                  {league.name}
                </div>
                <div className="space-y-1">
                  {league.teams.map((t) => {
                    const active = t.id === userTeamId;
                    return (
                      <button
                        key={t.id}
                        onClick={() => { audio.click(); selectTeam(t.id); setSelectedSlot(null); }}
                        onMouseEnter={() => audio.hover()}
                        className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition
                          ${active ? 'border-cyan/60 bg-cyan/10' : 'border-transparent hover:border-white/15 hover:bg-white/5'}`}
                      >
                        <TeamCrest team={t} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{t.name}</span>
                          <span className="text-[10px] text-white/40">Squad rating {t.rating}</span>
                        </span>
                        <span
                          className="h-6 w-1.5 rounded-full"
                          style={{ background: `linear-gradient(${t.primaryColor}, ${t.secondaryColor})` }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ---------------- Centre: formation pitch ---------------- */}
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="label mr-1">Formation</span>
            {FORMATIONS.map((f) => (
              <button
                key={f.id}
                onClick={() => { audio.click(); setFormation(f.id); setSelectedSlot(null); }}
                onMouseEnter={() => audio.hover()}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold tracking-wider transition
                  ${f.id === formationId ? 'border-cyan bg-cyan/15 text-cyan shadow-glow' : 'border-white/12 text-white/55 hover:border-white/30 hover:text-white'}`}
              >
                {f.name}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 scroll-thin">
            <p className="mb-3 text-center text-xs text-white/40">
              {formation.description}
            </p>

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

        {/* ---------------- Right: squad summary + bench ---------------- */}
        <aside className="flex w-full shrink-0 flex-col border-t border-white/10 lg:w-[22rem] lg:border-l lg:border-t-0">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center gap-3">
              <TeamCrest team={team} size={44} />
              <div className="min-w-0">
                <div className="truncate font-display text-base font-bold">{team.name}</div>
                <div className="text-[11px] text-white/40">{team.league}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Stat label="Avg OVR" value={rating} tone={rating >= 85 ? 'gold' : 'cyan'} />
              <Stat label="Chemistry" value={chem} tone={chem >= 75 ? 'green' : chem >= 50 ? 'cyan' : 'red'} suffix="%" />
              <Stat label="Shape" value={formation.name} tone="plain" />
            </div>

            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[10px] uppercase tracking-widest text-white/40">
                <span>Squad complete</span>
                <span>{filledCount}/11</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan to-gold transition-all duration-500"
                  style={{ width: `${(filledCount / 11) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Bench + filters */}
          <div className="border-b border-white/10 p-3">
            <div className="label mb-2">Squad ({filteredBench.length})</div>
            <input
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Search players…"
              className="mb-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-cyan/60"
            />
            <div className="flex flex-wrap gap-1">
              {GROUP_FILTERS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupFilter(g)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold tracking-wider transition
                    ${groupFilter === g ? 'bg-cyan/20 text-cyan' : 'bg-white/5 text-white/45 hover:text-white'}`}
                  style={groupFilter === g && g !== 'ALL' ? { color: GROUP_COLOR[g], background: `${GROUP_COLOR[g]}22` } : undefined}
                >
                  {g}
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/40">
              Min OVR
              <input
                type="range"
                min={0}
                max={95}
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-6 text-right font-bold text-cyan">{minRating}</span>
            </label>
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 scroll-thin">
            {filteredBench.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                compact
                draggable
                selected={inspect?.id === p.id}
                onClick={() => handleBenchClick(p)}
                onDragStart={() => { dragRef.current = { kind: 'bench', player: p }; }}
                onDragEnd={() => { dragRef.current = null; setDragOverSlot(null); }}
              />
            ))}
            {!filteredBench.length && (
              <p className="py-8 text-center text-xs text-white/30">No players match those filters.</p>
            )}
          </div>

          {/* Saved squads */}
          <div className="border-t border-white/10 p-3">
            <div className="label mb-2">Saved squads</div>
            <div className="flex gap-2">
              <input
                value={squadName}
                onChange={(e) => setSquadName(e.target.value)}
                placeholder="Name this squad"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none placeholder:text-white/30 focus:border-cyan/60"
              />
              <button
                onClick={() => { audio.confirm(); saveSquad(squadName); setSquadName(''); }}
                className="btn-ghost !px-3 !py-2 !text-[10px]"
              >
                Save
              </button>
            </div>
            {savedSquads.length > 0 && (
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto scroll-thin">
                {savedSquads.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
                    <button
                      onClick={() => { audio.click(); loadSquad(s.id); }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-[11px] font-semibold">{s.name}</span>
                      <span className="text-[9px] text-white/35">
                        {getTeam(s.teamId).shortName} · {s.formationId}
                      </span>
                    </button>
                    <button
                      onClick={() => deleteSquad(s.id)}
                      className="text-white/25 transition hover:text-danger"
                      aria-label={`Delete ${s.name}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Inspector */}
      {inspect && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 w-72 -translate-x-1/2 lg:left-auto lg:right-[23.5rem] lg:translate-x-0">
          <div className="pointer-events-auto animate-fadeUp">
            <PlayerCard player={inspect} />
            <button
              onClick={() => setInspect(null)}
              className="mt-2 w-full rounded-lg bg-white/5 py-1.5 text-[10px] uppercase tracking-widest text-white/40 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stat({
  label,
  value,
  tone,
  suffix = '',
}: {
  label: string;
  value: string | number;
  tone: 'gold' | 'cyan' | 'green' | 'red' | 'plain';
  suffix?: string;
}) {
  const color =
    tone === 'gold' ? '#FFD700' : tone === 'green' ? '#4ADE80' : tone === 'red' ? '#FF4444' : tone === 'cyan' ? '#00D9FF' : '#FFFFFF';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-widest text-white/35">{label}</div>
      <div className="mt-0.5 font-display text-lg font-extrabold" style={{ color }}>
        {value}
        {suffix}
      </div>
    </div>
  );
}

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

/** Vertical mini-pitch with a draggable card at each formation slot. */
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
      className="relative mx-auto aspect-[68/105] w-full max-w-[30rem] overflow-hidden rounded-2xl border border-white/15"
      style={{
        background:
          'repeating-linear-gradient(0deg,#17532580 0px,#17532580 34px,#1c6a2e80 34px,#1c6a2e80 68px), linear-gradient(180deg,#0d3a1a,#155029)',
      }}
    >
      {/* Markings */}
      <svg viewBox="0 0 68 105" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <g fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4">
          <rect x="0.5" y="0.5" width="67" height="104" />
          <line x1="0.5" y1="52.5" x2="67.5" y2="52.5" />
          <circle cx="34" cy="52.5" r="9.15" />
          <circle cx="34" cy="52.5" r="0.5" fill="rgba(255,255,255,0.5)" />
          {/* Bottom (own) end */}
          <rect x="13.84" y="88.54" width="40.32" height="16.46" />
          <rect x="24.84" y="99.51" width="18.32" height="5.49" />
          <circle cx="34" cy="94.03" r="0.5" fill="rgba(255,255,255,0.5)" />
          <path d="M24.9 88.54 A9.15 9.15 0 0 0 43.1 88.54" />
          {/* Top (opposition) end */}
          <rect x="13.84" y="0" width="40.32" height="16.46" />
          <rect x="24.84" y="0" width="18.32" height="5.49" />
          <circle cx="34" cy="10.97" r="0.5" fill="rgba(255,255,255,0.5)" />
          <path d="M24.9 16.46 A9.15 9.15 0 0 1 43.1 16.46" />
        </g>
      </svg>

      {formation.slots.map((slot, i) => {
        const player = starters[i];
        // slot.x runs from own goal (0) to opposition goal (1); the pitch is drawn
        // with our goal at the bottom, so invert for the CSS top offset.
        const top = `${(1 - slot.x) * 88 + 6}%`;
        const left = `${slot.y * 84 + 8}%`;
        const isOver = dragOverSlot === i;
        const isSelected = selectedSlot === i;
        const fit = player ? positionAffinity(player.position, slot.position) : 0;
        const fitColor = fit >= 1 ? '#4ADE80' : fit >= 0.7 ? '#FFD700' : fit > 0 ? '#FF9F45' : '#FF4444';

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
              className={`group relative flex w-[4.6rem] cursor-pointer flex-col items-center rounded-xl border px-1 py-1.5 text-center backdrop-blur-sm transition-all
                ${isOver ? 'slot-drop-active border-cyan' : isSelected ? 'border-cyan bg-cyan/20' : player ? 'border-white/25 bg-navy-950/75 hover:border-white/50' : 'border-dashed border-white/35 bg-navy-950/45'}`}
            >
              <span
                className="absolute -top-1.5 rounded px-1 text-[8px] font-black tracking-wider"
                style={{ background: GROUP_COLOR[slot.group], color: '#050B18' }}
              >
                {slot.position}
              </span>

              {player ? (
                <>
                  <span className="mt-1.5 font-display text-base font-extrabold leading-none" style={{ color: fitColor }}>
                    {player.overall}
                  </span>
                  <span className="mt-0.5 w-full truncate text-[9px] font-semibold leading-tight text-white/85">
                    {player.name.split(' ').slice(-1)[0]}
                  </span>
                  <span className="text-[8px] leading-none text-white/40">
                    {FLAG[player.nationality] ?? ''} #{player.number}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSlotClear(i); }}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white group-hover:flex"
                    aria-label={`Remove ${player.name}`}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <span className="py-2 text-[9px] uppercase tracking-widest text-white/35">Empty</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
