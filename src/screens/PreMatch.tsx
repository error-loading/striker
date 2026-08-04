import { useEffect, useMemo, useState } from 'react';
import { audio } from '../audio/audio';
import { TeamCrest } from '../components/TeamCrest';
import { getFormation } from '../data/formations';
import { FLAG } from '../data/flags';
import { getTeam } from '../data/leagues';
import { getStadium } from '../data/stadiums';
import type { Player, Team } from '../data/types';
import { createMatch } from '../engine/createMatch';
import { kitFor } from '../render/entities';
import { pickBestXI, useGame } from '../store/gameStore';

const COUNTDOWN_SECONDS = 6;

// Pitch graphic viewBox — a full pitch, home attacking right, away attacking left.
const PW = 900;
const PH = 440;
const MX = 34;
const MY = 26;
const HALFWAY = PW / 2;
const LANE = HALFWAY - MX - 14;

function homeX(x: number) {
  return MX + x * LANE;
}
function awayX(x: number) {
  return PW - MX - x * LANE;
}
function slotY(y: number) {
  return MY + y * (PH - MY * 2);
}

export default function PreMatch() {
  const state = useGame();
  const { userTeamId, opponentTeamId, formationId, opponentFormationId, setEngine, setScreen } = state;
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const [skipped, setSkipped] = useState(false);

  const home = getTeam(userTeamId);
  const away = getTeam(opponentTeamId);
  const stadium = getStadium(state.stadiumId);
  const homeFormation = getFormation(formationId);
  const awayFormation = getFormation(opponentFormationId);
  const homeXI = state.starters;
  const awayXI = useMemo(
    () => pickBestXI(opponentTeamId, awayFormation),
    [opponentTeamId, awayFormation],
  );

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
    <div className="pitch-bg relative flex h-full w-full flex-col overflow-hidden font-editorial text-chalk">
      {/* ─────────────────────── Venue strip ─────────────────────── */}
      <header className="relative z-10 flex shrink-0 items-center justify-between border-b border-chalk/15 px-5 py-3">
        <button onClick={() => setScreen('setup')} className="ghost-btn !px-3 !py-2 !text-[11px]">
          ← Setup
        </button>
        <div className="text-center leading-tight">
          <div className="eyebrow">{stadium.city} · {stadium.capacity.toLocaleString()}</div>
          <div className="font-stencil text-lg font-extrabold uppercase tracking-tight text-chalk">
            {stadium.name}
          </div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
            {state.weather} · {state.timeOfDay}
          </div>
        </div>
        <button
          onClick={() => { setSkipped(true); audio.whistle(); setScreen('match'); }}
          className="kick-btn !py-2 !text-[13px]"
        >
          <span className="whistle">▶</span> Skip
        </button>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto scroll-thin">
        {/* ─────────────────────── Scoreboard hero ─────────────────────── */}
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-6 px-5 pb-6 pt-8 sm:gap-14">
          <SideHeader team={home} kit={homeKit} align="right" label="Home" />
          <div className="shrink-0 text-center">
            <div className="eyebrow">Kick-off in</div>
            <div
              key={remaining}
              className={`stencil-num mt-1 text-6xl leading-none sm:text-7xl ${
                remaining > 0 && remaining <= 3 ? 'text-corner' : 'text-chalk'
              }`}
              style={{ animation: 'fadeUp .4s cubic-bezier(.16,1,.3,1)' }}
            >
              {remaining > 0 ? String(remaining).padStart(2, '0') : '▶'}
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-chalk-dim/60">
              {remaining > 0 ? 'seconds' : 'kick off'}
            </div>
          </div>
          <SideHeader team={away} kit={awayKit} align="left" label="Away" />
        </div>

        {/* ─────────────────────── Lineup pitch (signature) ─────────────────────── */}
        <div className="mx-auto max-w-5xl px-5">
          <div className="border border-chalk/20 bg-pitch-900/40">
            <div className="flex items-center justify-between border-b border-chalk/15 px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0" style={{ background: home.primaryColor }} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim/80">
                  {home.shortName} · {homeFormation.name}
                </span>
              </div>
              <span className="eyebrow">Confirmed lineups</span>
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim/80">
                  {awayFormation.name} · {away.shortName}
                </span>
                <span className="h-2.5 w-2.5 shrink-0" style={{ background: away.primaryColor }} />
              </div>
            </div>
            <div className="p-3 sm:p-5">
              <LineupPitch
                homeXI={homeXI}
                awayXI={awayXI}
                homeFormation={homeFormation}
                awayFormation={awayFormation}
                homeKit={homeKit}
                awayKit={awayKit}
              />
            </div>
          </div>
        </div>

        {/* ─────────────────────── Team sheets ─────────────────────── */}
        <div className="mx-auto grid max-w-5xl gap-0 px-5 py-10 sm:grid-cols-2 sm:gap-8">
          <TeamSheet team={home} formation={homeFormation} xi={homeXI} title="Your XI" />
          <TeamSheet team={away} formation={awayFormation} xi={awayXI} title="Opposition XI" />
        </div>
      </div>
    </div>
  );
}

function SideHeader({
  team,
  kit,
  align,
  label,
}: {
  team: Team;
  kit: { shirt: string; shorts: string; trim: string };
  align: 'left' | 'right';
  label: string;
}) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center gap-2.5 ${align === 'right' ? 'sm:items-end' : 'sm:items-start'}`}>
      <TeamCrest team={team} size={64} />
      <div className={`min-w-0 text-center ${align === 'right' ? 'sm:text-right' : 'sm:text-left'}`}>
        <div className="eyebrow">{label}</div>
        <div className="truncate font-stencil text-lg font-extrabold uppercase tracking-tight text-chalk sm:text-2xl">
          {team.shortName}
        </div>
      </div>
      <svg width="48" height="52" viewBox="0 0 56 60" aria-label={`${team.name} kit`}>
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

type Kit = { shirt: string; trim: string };

function LineupPitch({
  homeXI,
  awayXI,
  homeFormation,
  awayFormation,
  homeKit,
  awayKit,
}: {
  homeXI: (Player | null)[];
  awayXI: (Player | null)[];
  homeFormation: ReturnType<typeof getFormation>;
  awayFormation: ReturnType<typeof getFormation>;
  homeKit: Kit;
  awayKit: Kit;
}) {
  const gkKitHome: Kit = { shirt: '#F2EFE4', trim: '#111827' };
  const gkKitAway: Kit = { shirt: '#0B1810', trim: '#F2EFE4' };

  return (
    <svg
      viewBox={`0 0 ${PW} ${PH}`}
      className="h-auto w-full"
      role="img"
      aria-label="Both teams' starting formations on the pitch"
    >
      <defs>
        <filter id="lineupChalk" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence baseFrequency="0.9" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="0.6" />
        </filter>
      </defs>

      <rect x="0" y="0" width={PW} height={PH} fill="#0F2015" />
      <g opacity="0.3">
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x={(i * PW) / 12} y="0" width={PW / 12} height={PH} fill={i % 2 === 0 ? '#14291B' : '#0F2015'} />
        ))}
      </g>

      <g stroke="#F2EFE4" strokeWidth="1" fill="none" opacity="0.5" strokeLinecap="round" filter="url(#lineupChalk)">
        <rect x={MX - 4} y={MY - 4} width={PW - (MX - 4) * 2} height={PH - (MY - 4) * 2} />
        <line x1={HALFWAY} y1={MY - 4} x2={HALFWAY} y2={PH - MY + 4} />
        <circle cx={HALFWAY} cy={PH / 2} r="52" />
        <circle cx={HALFWAY} cy={PH / 2} r="1.4" fill="#F2EFE4" stroke="none" />
        {/* Home goal / boxes, left. */}
        <rect x={MX - 4} y={PH / 2 - 88} width="120" height="176" />
        <rect x={MX - 4} y={PH / 2 - 40} width="44" height="80" />
        {/* Away goal / boxes, right. */}
        <rect x={PW - MX - 116} y={PH / 2 - 88} width="120" height="176" />
        <rect x={PW - MX - 40} y={PH / 2 - 40} width="44" height="80" />
      </g>

      {/* Home XI. */}
      <g>
        {homeXI.map((p, i) => {
          const slot = homeFormation.slots[i];
          if (!p || !slot) return null;
          const kit = slot.position === 'GK' ? gkKitHome : homeKit;
          const cx = homeX(slot.x);
          const cy = slotY(slot.y);
          return (
            <PlayerDot key={`h-${p.id}-${i}`} cx={cx} cy={cy} number={p.number} kit={kit} delay={i * 45} />
          );
        })}
      </g>

      {/* Away XI. */}
      <g>
        {awayXI.map((p, i) => {
          const slot = awayFormation.slots[i];
          if (!p || !slot) return null;
          const kit = slot.position === 'GK' ? gkKitAway : awayKit;
          const cx = awayX(slot.x);
          const cy = slotY(slot.y);
          return (
            <PlayerDot key={`a-${p.id}-${i}`} cx={cx} cy={cy} number={p.number} kit={kit} delay={480 + i * 45} />
          );
        })}
      </g>

      <g fontFamily="'JetBrains Mono', monospace" fill="#F2EFE4" opacity="0.55">
        <text x={MX + 2} y={PH - 8} fontSize="9" letterSpacing="1.5">← attacking</text>
        <text x={PW - MX - 2} y={PH - 8} fontSize="9" letterSpacing="1.5" textAnchor="end">attacking →</text>
      </g>
    </svg>
  );
}

function PlayerDot({
  cx,
  cy,
  number,
  kit,
  delay,
}: {
  cx: number;
  cy: number;
  number: number;
  kit: Kit;
  delay: number;
}) {
  const textFill = kit.shirt === '#F2EFE4' || kit.shirt === '#0B1810' ? kit.trim : '#0B1810';
  return (
    <g className="chalk-pop" style={{ ['--delay' as string]: `${delay}ms` } as React.CSSProperties}>
      <circle cx={cx} cy={cy} r="13" fill={kit.shirt} stroke={kit.trim} strokeWidth="1.4" />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontFamily="'JetBrains Mono', monospace"
        fontSize="11"
        fontWeight="700"
        fill={textFill}
      >
        {number}
      </text>
    </g>
  );
}

function TeamSheet({
  team,
  formation,
  xi,
  title,
}: {
  team: Team;
  formation: ReturnType<typeof getFormation>;
  xi: (Player | null)[];
  title: string;
}) {
  return (
    <section className="border-t border-chalk/15 pt-4 sm:border-t-0 sm:pt-0 [&:first-child]:border-t-0">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-4 w-1" style={{ background: team.primaryColor }} />
          <h2 className="font-stencil text-sm font-bold uppercase tracking-widest text-chalk">{title}</h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim/60">{team.league}</span>
      </div>
      <ul className="divide-y divide-chalk/10 border-y border-chalk/15">
        {xi.map((p, i) =>
          p ? (
            <li key={`${p.id}-${i}`} className="flex items-center gap-3 py-1.5 font-mono text-[12px]">
              <span className="w-9 shrink-0 text-[10px] uppercase tracking-wider text-chalk-dim/60">
                {formation.slots[i].position}
              </span>
              <span className="stencil-num w-6 shrink-0 text-right text-[13px] text-chalk">{p.number}</span>
              <span className="min-w-0 flex-1 truncate text-chalk">{p.name}</span>
              <span aria-hidden className="shrink-0 text-[11px]">
                {FLAG[p.nationality] ?? ''}
              </span>
              <span className="w-6 shrink-0 text-right text-[12px] font-bold" style={{ color: team.primaryColor }}>
                {p.overall}
              </span>
            </li>
          ) : (
            <li key={i} className="py-1.5 font-mono text-[11px] text-chalk-dim/40">
              {formation.slots[i].position} — vacant
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
