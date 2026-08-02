import { useMemo, useState } from 'react';
import { audio } from '../audio/audio';
import { TeamCrest } from '../components/TeamCrest';
import { FORMATIONS, getFormation } from '../data/formations';
import { getTeam, LEAGUES } from '../data/leagues';
import { STADIUMS } from '../data/stadiums';
import { pickBestXI, useGame } from '../store/gameStore';
import type { Difficulty, TimeOfDay, Weather } from '../data/types';
import { DIFFICULTY } from '../engine/constants';

const DIFFICULTIES: { key: Difficulty; blurb: string }[] = [
  { key: 'Amateur', blurb: 'Passive opposition, generous assistance. Learn the controls.' },
  { key: 'Semi-Pro', blurb: 'The AI holds shape but gives you time on the ball.' },
  { key: 'Professional', blurb: 'A fair contest. Mistakes get punished, but not every time.' },
  { key: 'World Class', blurb: 'Aggressive pressing and sharp finishing. Minimal assistance.' },
  { key: 'Legendary', blurb: 'Relentless. They swarm the ball and bury their chances.' },
];

const WEATHERS: { key: Weather; icon: string; effect: string }[] = [
  { key: 'Clear', icon: '☀️', effect: 'Perfect conditions' },
  { key: 'Rainy', icon: '🌧️', effect: 'Quicker surface, looser touch' },
  { key: 'Snowy', icon: '❄️', effect: 'Heavy going, ball holds up' },
  { key: 'Foggy', icon: '🌫️', effect: 'Reduced visibility downfield' },
];

export default function MatchSetup() {
  const {
    userTeamId,
    opponentTeamId,
    opponentFormationId,
    formationId,
    starters,
    difficulty,
    weather,
    timeOfDay,
    durationMinutes,
    stadiumId,
    setOpponent,
    setMatchOption,
    setScreen,
  } = useGame();

  const [tab, setTab] = useState<'opponent' | 'conditions'>('opponent');
  const [oppSearch, setOppSearch] = useState('');

  const oppTeam = getTeam(opponentTeamId);
  const oppXI = useMemo(
    () => pickBestXI(opponentTeamId, getFormation(opponentFormationId)),
    [opponentTeamId, opponentFormationId],
  );
  const userXI = starters.filter(Boolean);
  const userRating = userXI.length
    ? Math.round(userXI.reduce((s, p) => s + p!.overall, 0) / userXI.length)
    : 0;
  const oppRating = Math.round(
    oppXI.filter(Boolean).reduce((s, p) => s + p!.overall, 0) / Math.max(1, oppXI.filter(Boolean).length),
  );

  const filteredLeagues = useMemo(() => {
    const q = oppSearch.trim().toLowerCase();
    return LEAGUES.map((l) => ({
      ...l,
      teams: l.teams.filter(
        (t) => t.id !== userTeamId && (!q || t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q)),
      ),
    })).filter((l) => l.teams.length);
  }, [oppSearch, userTeamId]);

  const profile = DIFFICULTY[difficulty];

  return (
    <div className="grid-bg flex h-full w-full flex-col bg-navy-950">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-navy-950/85 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen('squad')} className="btn-ghost !px-3 !py-2 !text-[11px]">
            ← Squad
          </button>
          <h1 className="heading text-lg sm:text-xl">Match Setup</h1>
        </div>
        <button onClick={() => { audio.confirm(); setScreen('prematch'); }} className="btn-primary !px-5 !py-2 !text-[11px]">
          Kick Off →
        </button>
      </header>

      {/* Head to head banner */}
      <div className="shrink-0 border-b border-white/10 bg-gradient-to-r from-navy-900/80 via-navy-950 to-navy-900/80 px-5 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <TeamBanner teamId={userTeamId} rating={userRating} formation={formationId} align="left" tag="Your club" />
          <div className="shrink-0 text-center">
            <div className="font-display text-2xl font-black text-white/25">VS</div>
            <div className="mt-1 text-[10px] uppercase tracking-widest text-white/35">
              {durationMinutes} min · {timeOfDay}
            </div>
          </div>
          <TeamBanner teamId={opponentTeamId} rating={oppRating} formation={opponentFormationId} align="right" tag="Opposition" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-1 border-b border-white/10 px-5 pt-3">
        {(['opponent', 'conditions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { audio.click(); setTab(t); }}
            className={`rounded-t-lg px-5 py-2.5 text-xs font-bold uppercase tracking-widest transition
              ${tab === t ? 'bg-white/[0.07] text-cyan' : 'text-white/40 hover:text-white/70'}`}
          >
            {t === 'opponent' ? 'Opponent' : 'Conditions'}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 scroll-thin">
        {tab === 'opponent' ? (
          <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_20rem]">
            <section>
              <div className="mb-3 flex items-center gap-3">
                <div className="label">Select opposition</div>
                <input
                  value={oppSearch}
                  onChange={(e) => setOppSearch(e.target.value)}
                  placeholder="Search clubs…"
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs outline-none placeholder:text-white/30 focus:border-cyan/60"
                />
              </div>
              {filteredLeagues.map((league) => (
                <div key={league.id} className="mb-5">
                  <div className="label mb-2">{league.name}</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {league.teams.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { audio.click(); setOpponent(t.id); }}
                        onMouseEnter={() => audio.hover()}
                        className={`card-hover flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition
                          ${t.id === opponentTeamId ? 'border-cyan bg-cyan/10 shadow-glow' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}
                      >
                        <TeamCrest team={t} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold">{t.shortName}</span>
                          <span className="text-[10px] text-white/40">OVR {t.rating}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {/* Opponent XI */}
            <aside className="glass h-fit rounded-2xl p-4">
              <div className="flex items-center gap-2.5">
                <TeamCrest team={oppTeam} size={34} />
                <div className="min-w-0">
                  <div className="truncate font-display text-sm font-bold">{oppTeam.name}</div>
                  <div className="text-[10px] text-white/40">Probable XI</div>
                </div>
              </div>

              <div className="mt-3">
                <div className="label mb-1.5">Their shape</div>
                <div className="flex flex-wrap gap-1">
                  {FORMATIONS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setMatchOption('opponentFormationId', f.id)}
                      className={`rounded px-2 py-1 text-[10px] font-bold transition
                        ${f.id === opponentFormationId ? 'bg-cyan/20 text-cyan' : 'bg-white/5 text-white/45 hover:text-white'}`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              <ul className="mt-3 space-y-1">
                {oppXI.map((p, i) =>
                  p ? (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5">
                      <span className="w-7 shrink-0 text-center text-[10px] font-bold text-white/35">
                        {getFormation(opponentFormationId).slots[i].position}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/85">{p.name}</span>
                      <span className="shrink-0 text-[11px] font-extrabold text-cyan">{p.overall}</span>
                    </li>
                  ) : null,
                )}
              </ul>
            </aside>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-7">
            {/* Difficulty */}
            <section>
              <div className="label mb-3">Difficulty</div>
              <div className="grid gap-2 sm:grid-cols-5">
                {DIFFICULTIES.map((d, i) => (
                  <button
                    key={d.key}
                    onClick={() => { audio.click(); setMatchOption('difficulty', d.key); }}
                    onMouseEnter={() => audio.hover()}
                    className={`rounded-xl border px-3 py-3 text-left transition
                      ${d.key === difficulty ? 'border-cyan bg-cyan/10 shadow-glow' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <span
                          key={j}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: j <= i ? '#00D9FF' : 'rgba(255,255,255,0.15)' }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 font-display text-sm font-bold">{d.key}</div>
                    <div className="mt-1 text-[10px] leading-snug text-white/45">{d.blurb}</div>
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-4">
                <Meter label="AI Pressing" value={profile.aiPressing} />
                <Meter label="AI Reaction" value={1 - profile.aiReaction / 0.6} />
                <Meter label="AI Accuracy" value={1 - (profile.aiError - 0.6) / 1.2} />
                <Meter label="Your Assist" value={profile.userAssist} tone="#FFD700" />
              </div>
            </section>

            {/* Duration */}
            <section>
              <div className="label mb-3">Match length</div>
              <div className="flex flex-wrap gap-2">
                {[6, 12, 20].map((d) => (
                  <button
                    key={d}
                    onClick={() => { audio.click(); setMatchOption('durationMinutes', d); }}
                    className={`rounded-xl border px-5 py-3 transition
                      ${durationMinutes === d ? 'border-cyan bg-cyan/10 shadow-glow' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}
                  >
                    <div className="font-display text-lg font-extrabold">{d} min</div>
                    <div className="text-[10px] text-white/40">{d / 2} min halves</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Stadium */}
            <section>
              <div className="label mb-3">Stadium</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {STADIUMS.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => { audio.click(); setMatchOption('stadiumId', st.id); }}
                    onMouseEnter={() => audio.hover()}
                    className={`card-hover flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition
                      ${st.id === stadiumId ? 'border-cyan bg-cyan/10 shadow-glow' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}
                  >
                    <span
                      className="h-9 w-9 shrink-0 rounded-lg"
                      style={{ background: `linear-gradient(140deg, ${st.seatColor}, ${st.seatColorAlt})` }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold">{st.name}</span>
                      <span className="text-[10px] text-white/40">
                        {st.city} · {st.capacity.toLocaleString()} · {st.roof} roof
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Weather + time */}
            <section className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="label mb-3">Weather</div>
                <div className="grid grid-cols-2 gap-2">
                  {WEATHERS.map((w) => (
                    <button
                      key={w.key}
                      onClick={() => { audio.click(); setMatchOption('weather', w.key); }}
                      className={`rounded-xl border px-3 py-3 text-left transition
                        ${weather === w.key ? 'border-cyan bg-cyan/10 shadow-glow' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}
                    >
                      <div className="text-xl">{w.icon}</div>
                      <div className="mt-1 font-display text-sm font-bold">{w.key}</div>
                      <div className="text-[10px] text-white/45">{w.effect}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="label mb-3">Kick-off time</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['Day', 'Night'] as TimeOfDay[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => { audio.click(); setMatchOption('timeOfDay', t); }}
                      className={`rounded-xl border px-3 py-3 text-left transition
                        ${timeOfDay === t ? 'border-cyan bg-cyan/10 shadow-glow' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}
                    >
                      <div className="text-xl">{t === 'Day' ? '🌤️' : '🌙'}</div>
                      <div className="mt-1 font-display text-sm font-bold">{t}</div>
                      <div className="text-[10px] text-white/45">
                        {t === 'Day' ? 'Natural light' : 'Floodlights on'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamBanner({
  teamId,
  rating,
  formation,
  align,
  tag,
}: {
  teamId: string;
  rating: number;
  formation: string;
  align: 'left' | 'right';
  tag: string;
}) {
  const team = getTeam(teamId);
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <TeamCrest team={team} size={52} />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-white/35">{tag}</div>
        <div className="truncate font-display text-base font-bold sm:text-xl">{team.name}</div>
        <div className={`mt-1 flex items-center gap-2 text-[11px] ${align === 'right' ? 'justify-end' : ''}`}>
          <span className="chip !py-0.5">OVR {rating}</span>
          <span className="chip !py-0.5">{formation}</span>
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value, tone = '#00D9FF' }: { label: string; value: number; tone?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[9px] uppercase tracking-widest text-white/40">
        <span>{label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  );
}
