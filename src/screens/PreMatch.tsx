import { useEffect, useMemo, useState } from 'react';
import { audio } from '../audio/audio';
import { TeamCrest } from '../components/TeamCrest';
import { getFormation } from '../data/formations';
import { FLAG } from '../data/flags';
import { getTeam } from '../data/leagues';
import { getStadium } from '../data/stadiums';
import { createMatch } from '../engine/createMatch';
import { kitFor } from '../render/entities';
import { pickBestXI, useGame } from '../store/gameStore';

const COUNTDOWN_SECONDS = 6;

export default function PreMatch() {
  const state = useGame();
  const { userTeamId, opponentTeamId, formationId, opponentFormationId, setEngine, setScreen } = state;
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const [skipped, setSkipped] = useState(false);

  const home = getTeam(userTeamId);
  const away = getTeam(opponentTeamId);
  const stadium = getStadium(state.stadiumId);
  const homeXI = state.starters;
  const awayXI = useMemo(
    () => pickBestXI(opponentTeamId, getFormation(opponentFormationId)),
    [opponentTeamId, opponentFormationId],
  );

  // Build the engine up front so the match screen starts instantly.
  useEffect(() => {
    const engine = createMatch({
      userTeamId,
      opponentTeamId,
      formationId,
      opponentFormationId,
      starters: state.starters,
      difficulty: state.difficulty,
      weather: state.weather,
      timeOfDay: state.timeOfDay,
      durationMinutes: state.durationMinutes,
      stadiumId: state.stadiumId,
    });
    setEngine(engine);
    // Intentionally built once on mount: re-creating it would reset the match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    audio.stopMusic();
    audio.init();
    audio.startCrowd();
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (remaining === 0 && !skipped) {
      setSkipped(true);
      audio.whistle();
      setScreen('match');
    }
  }, [remaining, skipped, setScreen]);

  const homeKit = kitFor(home, false, false);
  const awayKit = kitFor(away, false, true);

  return (
    <div className="grid-bg relative flex h-full w-full flex-col overflow-hidden bg-navy-950">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-40 top-0 h-[50rem] w-[50rem] rounded-full opacity-[0.18] blur-[130px]"
          style={{ background: home.primaryColor }}
        />
        <div
          className="absolute -right-40 bottom-0 h-[50rem] w-[50rem] rounded-full opacity-[0.18] blur-[130px]"
          style={{ background: away.primaryColor }}
        />
      </div>

      {/* Venue strip */}
      <header className="relative z-10 flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
        <button onClick={() => setScreen('setup')} className="btn-ghost !px-3 !py-2 !text-[11px]">
          ← Setup
        </button>
        <div className="text-center">
          <div className="font-display text-sm font-bold uppercase tracking-widest">{stadium.name}</div>
          <div className="text-[10px] text-white/40">
            {stadium.city} · {stadium.capacity.toLocaleString()} · {state.weather} · {state.timeOfDay}
          </div>
        </div>
        <button
          onClick={() => { setSkipped(true); audio.whistle(); setScreen('match'); }}
          className="btn-primary !px-4 !py-2 !text-[11px]"
        >
          Skip →
        </button>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto scroll-thin">
        {/* Scoreboard-style header */}
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-6 px-5 py-8 sm:gap-12">
          <SideHeader teamId={userTeamId} kit={homeKit} align="right" label="Home" />
          <div className="shrink-0 text-center">
            <div
              className="font-display text-6xl font-black leading-none text-cyan text-glow sm:text-7xl"
              key={remaining}
              style={{ animation: 'fadeUp .4s cubic-bezier(.16,1,.3,1)' }}
            >
              {remaining > 0 ? remaining : '⚽'}
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.3em] text-white/40">
              {remaining > 0 ? 'Kick off in' : 'Play!'}
            </div>
          </div>
          <SideHeader teamId={opponentTeamId} kit={awayKit} align="left" label="Away" />
        </div>

        {/* Team sheets */}
        <div className="mx-auto grid max-w-5xl gap-4 px-5 pb-10 md:grid-cols-2">
          <TeamSheet
            teamId={userTeamId}
            formationId={formationId}
            xi={homeXI}
            accent={home.primaryColor}
            title="Your XI"
          />
          <TeamSheet
            teamId={opponentTeamId}
            formationId={opponentFormationId}
            xi={awayXI}
            accent={away.primaryColor}
            title="Opposition XI"
          />
        </div>
      </div>
    </div>
  );
}

function SideHeader({
  teamId,
  kit,
  align,
  label,
}: {
  teamId: string;
  kit: { shirt: string; shorts: string; trim: string };
  align: 'left' | 'right';
  label: string;
}) {
  const team = getTeam(teamId);
  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center gap-3 ${align === 'right' ? 'sm:items-end' : 'sm:items-start'}`}>
      <TeamCrest team={team} size={72} />
      <div className={`min-w-0 text-center ${align === 'right' ? 'sm:text-right' : 'sm:text-left'}`}>
        <div className="text-[10px] uppercase tracking-widest text-white/35">{label}</div>
        <div className="truncate font-display text-lg font-extrabold uppercase sm:text-2xl">{team.shortName}</div>
      </div>
      {/* Kit preview */}
      <svg width="56" height="60" viewBox="0 0 56 60" aria-label={`${team.name} kit`}>
        <path
          d="M16 8 L22 4 h12 l6 4 8 5 -5 9 -4-2 v30 H17 V20 l-4 2 -5-9 Z"
          fill={kit.shirt}
          stroke={kit.trim}
          strokeWidth="1.5"
        />
        <path d="M22 4 h12 a6 6 0 0 1 -12 0" fill={kit.trim} />
        <rect x="17" y="50" width="22" height="8" fill={kit.shorts} />
      </svg>
    </div>
  );
}

function TeamSheet({
  teamId,
  formationId,
  xi,
  accent,
  title,
}: {
  teamId: string;
  formationId: string;
  xi: (ReturnType<typeof getTeam>['players'][number] | null)[];
  accent: string;
  title: string;
}) {
  const formation = getFormation(formationId);
  const team = getTeam(teamId);
  return (
    <section className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full" style={{ background: accent }} />
          <h2 className="font-display text-sm font-bold uppercase tracking-widest">{title}</h2>
        </div>
        <span className="chip !py-0.5">{formation.name}</span>
      </div>
      <ul className="space-y-1">
        {xi.map((p, i) =>
          p ? (
            <li key={`${p.id}-${i}`} className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
              <span className="w-8 shrink-0 text-center text-[10px] font-bold text-white/35">
                {formation.slots[i].position}
              </span>
              <span className="w-5 shrink-0 text-center text-[11px] font-bold text-white/50">{p.number}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{p.name}</span>
              <span aria-hidden className="shrink-0 text-[11px]">
                {FLAG[p.nationality] ?? ''}
              </span>
              <span className="w-6 shrink-0 text-right text-[12px] font-extrabold" style={{ color: accent }}>
                {p.overall}
              </span>
            </li>
          ) : (
            <li key={i} className="rounded-lg bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/25">
              {formation.slots[i].position} — vacant
            </li>
          ),
        )}
      </ul>
      <div className="mt-3 text-[10px] text-white/35">{team.league}</div>
    </section>
  );
}
