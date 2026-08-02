import { useEffect, useMemo } from 'react';
import { audio } from '../audio/audio';
import { TeamCrest } from '../components/TeamCrest';
import { FLAG } from '../data/flags';
import { getTeam } from '../data/leagues';
import { getStadium } from '../data/stadiums';
import { createMatch } from '../engine/createMatch';
import { useGame } from '../store/gameStore';

export default function FullTime() {
  const state = useGame();
  const { engine, setScreen, setEngine, userTeamId, opponentTeamId } = state;

  useEffect(() => {
    audio.stopCrowd();
    audio.startMusic();
    return () => audio.stopMusic();
  }, []);

  const motm = useMemo(() => engine?.manOfTheMatch() ?? null, [engine]);

  if (!engine) {
    setScreen('landing');
    return null;
  }

  const home = getTeam(userTeamId);
  const away = getTeam(opponentTeamId);
  const [hs, as] = engine.score;
  const [hp, ap] = engine.possessionPct();
  const stadium = getStadium(state.stadiumId);
  const result = hs > as ? 'win' : hs < as ? 'loss' : 'draw';
  const goals = engine.events.filter((e) => e.type === 'goal');
  const cards = engine.events.filter((e) => e.type === 'yellow' || e.type === 'red');

  const playAgain = () => {
    audio.confirm();
    const next = createMatch({
      userTeamId,
      opponentTeamId,
      formationId: state.formationId,
      opponentFormationId: state.opponentFormationId,
      starters: state.starters,
      difficulty: state.difficulty,
      weather: state.weather,
      timeOfDay: state.timeOfDay,
      durationMinutes: state.durationMinutes,
      stadiumId: state.stadiumId,
    });
    setEngine(next);
    setScreen('prematch');
  };

  const headline =
    result === 'win' ? 'Victory' : result === 'loss' ? 'Defeated' : 'Honours Even';
  const headlineColor = result === 'win' ? '#FFD700' : result === 'loss' ? '#FF4444' : '#00D9FF';

  return (
    <div className="grid-bg h-full w-full overflow-y-auto bg-navy-950 scroll-thin">
      <div className="mx-auto w-full max-w-5xl px-5 py-10">
        {/* Result */}
        <div className="text-center">
          <div className="label">{stadium.name} · Full Time</div>
          <h1
            className="heading mt-3 text-[clamp(2.5rem,9vw,5rem)] leading-none text-glow"
            style={{ color: headlineColor }}
          >
            {headline}
          </h1>
        </div>

        <div className="glass-strong mt-8 flex items-center justify-center gap-6 rounded-3xl px-6 py-8 sm:gap-12">
          <div className="flex flex-1 flex-col items-center gap-3 sm:flex-row sm:justify-end">
            <span className="order-2 truncate text-center font-display text-lg font-bold sm:order-1 sm:text-right sm:text-2xl">
              {home.name}
            </span>
            <TeamCrest team={home} size={64} className="order-1 sm:order-2" />
          </div>
          <div className="font-display text-5xl font-black tabular-nums sm:text-7xl">
            {hs} <span className="text-white/20">–</span> {as}
          </div>
          <div className="flex flex-1 flex-col items-center gap-3 sm:flex-row">
            <TeamCrest team={away} size={64} />
            <span className="truncate text-center font-display text-lg font-bold sm:text-left sm:text-2xl">
              {away.name}
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_20rem]">
          {/* Stats */}
          <section className="glass rounded-2xl p-6">
            <div className="label mb-5">Full time stats</div>
            <Row label="Possession" home={hp} away={ap} suffix="%" />
            <Row label="Shots" home={engine.stats[0].shots} away={engine.stats[1].shots} />
            <Row label="On target" home={engine.stats[0].shotsOnTarget} away={engine.stats[1].shotsOnTarget} />
            <Row label="Passes" home={engine.stats[0].passes} away={engine.stats[1].passes} />
            <Row
              label="Pass accuracy"
              home={pct(engine.stats[0].passesCompleted, engine.stats[0].passes)}
              away={pct(engine.stats[1].passesCompleted, engine.stats[1].passes)}
              suffix="%"
            />
            <Row label="Tackles" home={engine.stats[0].tackles} away={engine.stats[1].tackles} />
            <Row label="Fouls" home={engine.stats[0].fouls} away={engine.stats[1].fouls} />
            <Row label="Corners" home={engine.stats[0].corners} away={engine.stats[1].corners} />
            <Row label="Offsides" home={engine.stats[0].offsides} away={engine.stats[1].offsides} />
            <Row label="Yellow cards" home={engine.stats[0].yellowCards} away={engine.stats[1].yellowCards} />
            <Row label="Red cards" home={engine.stats[0].redCards} away={engine.stats[1].redCards} />
          </section>

          <div className="space-y-5">
            {/* Man of the match */}
            {motm && (
              <section className="glass relative overflow-hidden rounded-2xl p-6">
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gold/25 blur-3xl" />
                <div className="label">Man of the match</div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-gold/15 font-display text-xl font-black text-gold">
                    {motm.rating.toFixed(1)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-display text-base font-bold">{motm.player.name}</div>
                    <div className="text-[11px] text-white/45">
                      {FLAG[motm.player.source.nationality] ?? ''} {motm.player.slotPosition} ·{' '}
                      {(motm.player.side === 0 ? home : away).shortName}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Timeline */}
            <section className="glass rounded-2xl p-6">
              <div className="label mb-3">Key moments</div>
              {goals.length === 0 && cards.length === 0 ? (
                <p className="text-[11px] text-white/35">A goalless, card-free affair.</p>
              ) : (
                <ul className="space-y-2">
                  {[...goals, ...cards]
                    .sort((a, b) => a.minute - b.minute)
                    .map((e, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px]">
                        <span className="w-8 shrink-0 font-bold tabular-nums text-cyan">{e.minute}'</span>
                        <span className="shrink-0">
                          {e.type === 'goal' ? '⚽' : e.type === 'yellow' ? '🟨' : '🟥'}
                        </span>
                        <span className="min-w-0 flex-1 text-white/70">{e.text}</span>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <button onClick={playAgain} className="btn-primary">
            ▶ Play Again
          </button>
          <button onClick={() => { audio.click(); setScreen('squad'); }} className="btn-gold">
            Squad Builder
          </button>
          <button onClick={() => { audio.click(); setScreen('setup'); }} className="btn-ghost">
            Change Opponent
          </button>
          <button onClick={() => { audio.click(); setEngine(null); setScreen('landing'); }} className="btn-ghost">
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}

const pct = (a: number, b: number) => (b <= 0 ? 0 : Math.round((a / b) * 100));

function Row({ label, home, away, suffix = '' }: { label: string; home: number; away: number; suffix?: string }) {
  const total = Math.max(1, home + away);
  return (
    <div className="mb-3.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold tabular-nums">
          {home}
          {suffix}
        </span>
        <span className="uppercase tracking-widest text-white/40">{label}</span>
        <span className="font-bold tabular-nums">
          {away}
          {suffix}
        </span>
      </div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="bg-cyan transition-all duration-700" style={{ width: `${(home / total) * 100}%` }} />
        <div className="bg-gold transition-all duration-700" style={{ width: `${(away / total) * 100}%` }} />
      </div>
    </div>
  );
}
