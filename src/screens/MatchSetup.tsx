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

// Typographic marks instead of emoji — quieter, matches the chalk-on-grass palette.
const WEATHERS: { key: Weather; mark: string; effect: string }[] = [
  { key: 'Clear', mark: '☼', effect: 'Perfect conditions' },
  { key: 'Rainy', mark: '☂', effect: 'Quicker surface, looser touch' },
  { key: 'Snowy', mark: '❄', effect: 'Heavy going, ball holds up' },
  { key: 'Foggy', mark: '≈', effect: 'Reduced visibility downfield' },
];

const TIMES: { key: TimeOfDay; mark: string; effect: string }[] = [
  { key: 'Day', mark: '○', effect: 'Natural light · 15:00 kick-off' },
  { key: 'Night', mark: '●', effect: 'Floodlights on · 20:00 kick-off' },
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
    oppXI.filter(Boolean).reduce((s, p) => s + p!.overall, 0) /
      Math.max(1, oppXI.filter(Boolean).length),
  );

  const filteredLeagues = useMemo(() => {
    const q = oppSearch.trim().toLowerCase();
    return LEAGUES.map((l) => ({
      ...l,
      teams: l.teams.filter(
        (t) =>
          t.id !== userTeamId &&
          (!q || t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q)),
      ),
    })).filter((l) => l.teams.length);
  }, [oppSearch, userTeamId]);

  const profile = DIFFICULTY[difficulty];
  const stadium = STADIUMS.find((s) => s.id === stadiumId) ?? STADIUMS[0];

  return (
    <div className="pitch-bg flex h-full w-full flex-col font-editorial text-chalk">
      {/* ─────────────────────── Match-card header ─────────────────────── */}
      <header className="flex shrink-0 items-stretch border-b border-chalk/15">
        <button
          onClick={() => setScreen('squad')}
          className="flex items-center gap-2 border-r border-chalk/15 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-chalk-dim transition hover:text-chalk"
        >
          <span className="font-mono">←</span> Squad
        </button>
        <div className="flex items-center gap-3 border-r border-chalk/15 px-5 py-3">
          <span className="stencil-num flex h-9 w-9 items-center justify-center bg-chalk text-[18px] leading-none text-pitch-950">
            03
          </span>
          <div className="leading-none">
            <div className="font-stencil text-[18px] font-extrabold tracking-tight uppercase">
              Match Card
            </div>
            <div className="eyebrow mt-1">Pick opposition · set conditions</div>
          </div>
        </div>

        <div className="hidden flex-1 items-center px-5 md:flex">
          <span className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
            {stadium.name} · {stadium.city} · att {stadium.capacity.toLocaleString()}
          </span>
        </div>

        <button
          onClick={() => { audio.confirm(); setScreen('prematch'); }}
          className="my-2 mr-4 kick-btn"
        >
          <span className="whistle">▶</span> Kick off
        </button>
      </header>

      {/* ─────────────────────── Fixtures banner ─────────────────────── */}
      <section className="shrink-0 border-b border-chalk/15 bg-pitch-900/40">
        <div className="mx-auto grid max-w-[1360px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 py-6">
          <TeamBanner teamId={userTeamId} rating={userRating} formation={formationId} align="left" tag="Your club" />
          <div className="flex shrink-0 flex-col items-center gap-1">
            <div className="stencil-num text-[42px] leading-none text-corner">vs</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-chalk-dim/80">
              {durationMinutes} min · {timeOfDay.toLowerCase()}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-chalk-dim/50">
              {difficulty}
            </div>
          </div>
          <TeamBanner teamId={opponentTeamId} rating={oppRating} formation={opponentFormationId} align="right" tag="Opposition" />
        </div>
      </section>

      {/* ─────────────────────── Tabs ─────────────────────── */}
      <div className="flex shrink-0 items-stretch border-b border-chalk/15">
        {(['opponent', 'conditions'] as const).map((t, i) => (
          <button
            key={t}
            onClick={() => { audio.click(); setTab(t); }}
            className={`group relative flex items-center gap-2 border-r border-chalk/15 px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] transition
              ${tab === t ? 'text-chalk' : 'text-chalk-dim hover:text-chalk'}`}
          >
            <span className="font-mono text-[10px] text-chalk-dim/60">
              {String(i + 1).padStart(2, '0')}
            </span>
            {t === 'opponent' ? 'Opponent' : 'Conditions'}
            <span
              className={`absolute inset-x-6 bottom-0 h-[2px] bg-corner transition-transform duration-200 ${
                tab === t ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
              }`}
            />
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        {tab === 'opponent' ? (
          <div className="mx-auto grid max-w-[1360px] gap-0 lg:grid-cols-[1fr_360px]">
            {/* ------- opponent grid ------- */}
            <section className="border-b border-chalk/15 p-6 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-4">
                <span className="eyebrow">Select opposition</span>
                <span className="chalk-rule flex-1 max-w-[240px]" />
                <input
                  value={oppSearch}
                  onChange={(e) => setOppSearch(e.target.value)}
                  placeholder="Search clubs…"
                  className="w-56 border border-chalk/20 bg-pitch-950/60 px-3 py-1.5 font-editorial text-[12px] text-chalk outline-none transition placeholder:text-chalk-dim/50 focus:border-corner"
                />
              </div>

              {filteredLeagues.map((league) => (
                <div key={league.id} className="mt-6">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="eyebrow">{league.name}</span>
                    <span className="font-mono text-[9px] text-chalk-dim/60">
                      {league.teams.length}
                    </span>
                    <span className="chalk-rule flex-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-0 border border-chalk/15 sm:grid-cols-3 xl:grid-cols-4">
                    {league.teams.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { audio.click(); setOpponent(t.id); }}
                        onMouseEnter={() => audio.hover()}
                        className={`group flex items-center gap-3 border-b border-r border-chalk/10 px-3 py-3 text-left transition
                          ${t.id === opponentTeamId ? 'bg-corner/10' : 'hover:bg-chalk/5'}`}
                      >
                        <span
                          className="h-8 w-[3px] shrink-0"
                          style={{ background: t.primaryColor }}
                          aria-hidden
                        />
                        <TeamCrest team={t} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-stencil text-[13px] font-bold uppercase transition ${t.id === opponentTeamId ? 'text-corner' : 'text-chalk'}`}>
                            {t.shortName}
                          </span>
                          <span className="font-mono text-[9px] uppercase tracking-widest text-chalk-dim/70">
                            OVR {t.rating}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {/* ------- opponent team sheet ------- */}
            <aside className="p-6">
              <div className="flex items-center gap-3">
                <TeamCrest team={oppTeam} size={38} />
                <div className="min-w-0">
                  <div className="truncate font-stencil text-[16px] font-extrabold uppercase text-chalk">
                    {oppTeam.name}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
                    Probable XI
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 eyebrow">Their shape</div>
                <div className="flex flex-wrap gap-1">
                  {FORMATIONS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setMatchOption('opponentFormationId', f.id)}
                      className={`border px-2.5 py-1 font-stencil text-[11px] font-bold tracking-[0.08em] transition
                        ${f.id === opponentFormationId
                          ? 'border-corner bg-corner text-chalk'
                          : 'border-chalk/20 text-chalk-dim hover:border-chalk/50 hover:text-chalk'}`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              <ul className="mt-5 divide-y divide-chalk/10 border-y border-chalk/15">
                {oppXI.map((p, i) =>
                  p ? (
                    <li key={p.id} className="flex items-center gap-3 py-2">
                      <span className="w-8 shrink-0 font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
                        {getFormation(opponentFormationId).slots[i].position}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-editorial text-[12px] font-semibold text-chalk">
                        {p.name}
                      </span>
                      <span className="stencil-num shrink-0 text-[16px] text-chalk">
                        {p.overall}
                      </span>
                    </li>
                  ) : null,
                )}
              </ul>
            </aside>
          </div>
        ) : (
          <div className="mx-auto max-w-[1360px] px-6 py-8">
            {/* -------- Difficulty -------- */}
            <NumberedSection num="01" title="Difficulty" hint="How much the opposition intends to hurt you">
              <div className="grid gap-0 border border-chalk/15 sm:grid-cols-5">
                {DIFFICULTIES.map((d, i) => {
                  const active = d.key === difficulty;
                  return (
                    <button
                      key={d.key}
                      onClick={() => { audio.click(); setMatchOption('difficulty', d.key); }}
                      onMouseEnter={() => audio.hover()}
                      className={`group flex flex-col items-start gap-3 border-b border-r border-chalk/15 px-4 py-4 text-left transition
                        ${active ? 'bg-corner/10' : 'hover:bg-chalk/5'}`}
                    >
                      <div className="flex w-full items-center gap-1">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <span
                            key={j}
                            className="h-[3px] flex-1"
                            style={{ background: j <= i ? (active ? '#E5484D' : '#F2EFE4') : 'rgba(242,239,228,0.15)' }}
                          />
                        ))}
                      </div>
                      <div>
                        <div className={`font-stencil text-[15px] font-extrabold uppercase ${active ? 'text-corner' : 'text-chalk'}`}>
                          {d.key}
                        </div>
                        <div className="mt-1 font-editorial text-[11px] leading-snug text-chalk-dim">
                          {d.blurb}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 grid gap-6 border border-chalk/15 bg-pitch-900/40 px-5 py-4 sm:grid-cols-4">
                <Meter label="AI Pressing" value={profile.aiPressing} />
                <Meter label="AI Reaction" value={1 - profile.aiReaction / 0.6} />
                <Meter label="AI Accuracy" value={1 - (profile.aiError - 0.6) / 1.2} />
                <Meter label="Your Assist" value={profile.userAssist} tone="chalk" />
              </div>
            </NumberedSection>

            {/* -------- Match length -------- */}
            <NumberedSection num="02" title="Match length" hint="Halves of equal time. Half-time in between.">
              <div className="grid gap-0 border border-chalk/15 sm:grid-cols-3">
                {[6, 12, 20].map((d) => {
                  const active = durationMinutes === d;
                  return (
                    <button
                      key={d}
                      onClick={() => { audio.click(); setMatchOption('durationMinutes', d); }}
                      className={`flex items-baseline justify-between border-b border-r border-chalk/15 px-5 py-4 text-left transition
                        ${active ? 'bg-corner/10' : 'hover:bg-chalk/5'}`}
                    >
                      <div>
                        <div className={`stencil-num text-[26px] leading-none ${active ? 'text-corner' : 'text-chalk'}`}>
                          {d}
                        </div>
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
                          minutes
                        </div>
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim/60">
                        {d / 2} min · {d / 2} min
                      </div>
                    </button>
                  );
                })}
              </div>
            </NumberedSection>

            {/* -------- Stadium -------- */}
            <NumberedSection num="03" title="The ground" hint="Every stadium is procedurally built from its shell — no borrowed marks">
              <div className="grid gap-0 border border-chalk/15 sm:grid-cols-2 lg:grid-cols-3">
                {STADIUMS.map((st) => {
                  const active = st.id === stadiumId;
                  return (
                    <button
                      key={st.id}
                      onClick={() => { audio.click(); setMatchOption('stadiumId', st.id); }}
                      onMouseEnter={() => audio.hover()}
                      className={`flex items-center gap-3 border-b border-r border-chalk/15 px-4 py-3 text-left transition
                        ${active ? 'bg-corner/10' : 'hover:bg-chalk/5'}`}
                    >
                      <span
                        className="h-9 w-1 shrink-0"
                        style={{ background: `linear-gradient(180deg, ${st.seatColor}, ${st.seatColorAlt})` }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-stencil text-[13px] font-bold uppercase ${active ? 'text-corner' : 'text-chalk'}`}>
                          {st.name}
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-chalk-dim/70">
                          {st.city} · {st.capacity.toLocaleString()} · {st.roof.toLowerCase()} roof
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </NumberedSection>

            {/* -------- Weather + time -------- */}
            <div className="grid gap-6 sm:grid-cols-2">
              <NumberedSection num="04" title="Weather" hint="Rain quickens the surface. Snow slows it.">
                <div className="grid grid-cols-2 gap-0 border border-chalk/15">
                  {WEATHERS.map((w) => {
                    const active = weather === w.key;
                    return (
                      <button
                        key={w.key}
                        onClick={() => { audio.click(); setMatchOption('weather', w.key); }}
                        className={`flex items-start gap-3 border-b border-r border-chalk/15 px-4 py-4 text-left transition
                          ${active ? 'bg-corner/10' : 'hover:bg-chalk/5'}`}
                      >
                        <span className={`stencil-num text-[26px] leading-none ${active ? 'text-corner' : 'text-chalk-dim'}`}>
                          {w.mark}
                        </span>
                        <div>
                          <div className={`font-stencil text-[13px] font-extrabold uppercase ${active ? 'text-corner' : 'text-chalk'}`}>
                            {w.key}
                          </div>
                          <div className="mt-1 font-editorial text-[11px] leading-snug text-chalk-dim">
                            {w.effect}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </NumberedSection>

              <NumberedSection num="05" title="Kick-off" hint="Night matches light the pitch differently.">
                <div className="grid grid-cols-2 gap-0 border border-chalk/15">
                  {TIMES.map((t) => {
                    const active = timeOfDay === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => { audio.click(); setMatchOption('timeOfDay', t.key); }}
                        className={`flex items-start gap-3 border-b border-r border-chalk/15 px-4 py-4 text-left transition
                          ${active ? 'bg-corner/10' : 'hover:bg-chalk/5'}`}
                      >
                        <span className={`stencil-num text-[26px] leading-none ${active ? 'text-corner' : 'text-chalk-dim'}`}>
                          {t.mark}
                        </span>
                        <div>
                          <div className={`font-stencil text-[13px] font-extrabold uppercase ${active ? 'text-corner' : 'text-chalk'}`}>
                            {t.key}
                          </div>
                          <div className="mt-1 font-editorial text-[11px] leading-snug text-chalk-dim">
                            {t.effect}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </NumberedSection>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================ */

function NumberedSection({
  num,
  title,
  hint,
  children,
}: {
  num: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10 last:mb-0">
      <div className="mb-4 flex items-baseline gap-4">
        <span className="stencil-num text-[36px] leading-none text-chalk-dim/70">{num}</span>
        <div className="min-w-0">
          <div className="font-stencil text-[22px] font-extrabold uppercase text-chalk">
            {title}
          </div>
          <div className="mt-0.5 font-editorial text-[12px] italic text-chalk-dim">
            {hint}
          </div>
        </div>
        <span className="chalk-rule ml-auto flex-1 max-w-[200px] self-center" />
      </div>
      {children}
    </section>
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
    <div className={`flex min-w-0 items-center gap-4 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <span
        className="h-[52px] w-1 shrink-0"
        style={{ background: team.primaryColor }}
        aria-hidden
      />
      <TeamCrest team={team} size={52} />
      <div className="min-w-0">
        <div className="eyebrow">{tag}</div>
        <div className="mt-1 truncate font-stencil text-[20px] font-extrabold uppercase leading-none text-chalk sm:text-[26px]">
          {team.name}
        </div>
        <div className={`mt-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-chalk-dim ${align === 'right' ? 'justify-end' : ''}`}>
          <span>OVR <span className="text-chalk">{rating}</span></span>
          <span>·</span>
          <span>{formation}</span>
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value, tone = 'corner' }: { label: string; value: number; tone?: 'corner' | 'chalk' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = tone === 'chalk' ? '#F2EFE4' : '#E5484D';
  return (
    <div>
      <div className="mb-1.5 flex justify-between font-mono text-[10px] uppercase tracking-widest text-chalk-dim">
        <span>{label}</span>
        <span className="text-chalk">{Math.round(pct)}</span>
      </div>
      <div className="h-[3px] w-full bg-chalk/10">
        <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
