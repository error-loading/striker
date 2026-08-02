import { useState } from 'react';
import { audio } from '../audio/audio';
import { TeamCrest } from '../components/TeamCrest';
import { FORMATIONS, getFormation } from '../data/formations';
import { getTeam } from '../data/leagues';
import { useGame } from '../store/gameStore';

export default function HalfTime() {
  const engine = useGame((s) => s.engine);
  const setScreen = useGame((s) => s.setScreen);
  const userTeamId = useGame((s) => s.userTeamId);
  const opponentTeamId = useGame((s) => s.opponentTeamId);
  const formationId = useGame((s) => s.formationId);
  const setMatchOption = useGame((s) => s.setMatchOption);

  const [shape, setShape] = useState(formationId);
  const [subsMade, setSubsMade] = useState<string[]>([]);

  if (!engine) {
    setScreen('landing');
    return null;
  }

  const home = getTeam(userTeamId);
  const away = getTeam(opponentTeamId);
  const [hs, as] = engine.score;
  const [hp, ap] = engine.possessionPct();
  const onPitch = engine.players.filter((p) => p.side === 0 && p.onPitch);
  const bench = engine.home.bench;

  const applyShape = (id: string) => {
    audio.click();
    setShape(id);
    engine.applyFormation(0, getFormation(id));
    setMatchOption('formationId', id);
  };

  const makeSub = (outId: string, inIndex: number) => {
    const player = bench[inIndex];
    if (!player) return;
    if (engine.substitute(outId, player)) {
      audio.confirm();
      setSubsMade((s) => [...s, `${player.name} on`]);
    }
  };

  const resume = () => {
    audio.confirm();
    engine.beginSecondHalf();
    setScreen('match');
  };

  const tired = [...onPitch].sort((a, b) => a.stamina - b.stamina).slice(0, 5);

  return (
    <div className="grid-bg flex h-full w-full flex-col overflow-y-auto bg-navy-950 scroll-thin">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
        <h1 className="heading text-lg">Half Time</h1>
        <button onClick={resume} className="btn-primary !px-5 !py-2 !text-[11px]">
          Start Second Half →
        </button>
      </header>

      <div className="mx-auto w-full max-w-5xl px-5 py-8">
        {/* Score */}
        <div className="glass-strong flex items-center justify-center gap-6 rounded-2xl px-6 py-6 sm:gap-12">
          <div className="flex flex-1 items-center justify-end gap-3">
            <span className="truncate text-right font-display text-lg font-bold sm:text-2xl">{home.shortName}</span>
            <TeamCrest team={home} size={48} />
          </div>
          <div className="font-display text-4xl font-black tabular-nums sm:text-6xl">
            {hs} <span className="text-white/25">–</span> {as}
          </div>
          <div className="flex flex-1 items-center gap-3">
            <TeamCrest team={away} size={48} />
            <span className="truncate font-display text-lg font-bold sm:text-2xl">{away.shortName}</span>
          </div>
        </div>

        {/* Stats */}
        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="glass rounded-2xl p-5">
            <div className="label mb-4">First half stats</div>
            <Row label="Possession" home={hp} away={ap} suffix="%" />
            <Row label="Shots" home={engine.stats[0].shots} away={engine.stats[1].shots} />
            <Row label="On target" home={engine.stats[0].shotsOnTarget} away={engine.stats[1].shotsOnTarget} />
            <Row label="Passes" home={engine.stats[0].passes} away={engine.stats[1].passes} />
            <Row label="Tackles" home={engine.stats[0].tackles} away={engine.stats[1].tackles} />
            <Row label="Fouls" home={engine.stats[0].fouls} away={engine.stats[1].fouls} />
            <Row label="Corners" home={engine.stats[0].corners} away={engine.stats[1].corners} />
            <Row label="Offsides" home={engine.stats[0].offsides} away={engine.stats[1].offsides} />
          </div>

          {/* Tactical adjustments */}
          <div className="space-y-5">
            <div className="glass rounded-2xl p-5">
              <div className="label mb-3">Change shape</div>
              <div className="flex flex-wrap gap-2">
                {FORMATIONS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => applyShape(f.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold tracking-wider transition
                      ${f.id === shape ? 'border-cyan bg-cyan/15 text-cyan shadow-glow' : 'border-white/12 text-white/55 hover:border-white/30 hover:text-white'}`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-white/45">
                {getFormation(shape).description}
              </p>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="label mb-3">Substitutions</div>
              <p className="mb-3 text-[11px] text-white/45">
                Your five most tired players. Pick a replacement to bring on.
              </p>
              <div className="space-y-2">
                {tired.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2">
                    <span className="w-8 text-center text-[10px] font-bold text-white/35">{p.slotPosition}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px]">{p.name}</span>
                    <span className="w-16 shrink-0">
                      <span className="block h-1.5 overflow-hidden rounded-full bg-white/12">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${p.stamina}%`,
                            background: p.stamina > 50 ? '#4ADE80' : p.stamina > 25 ? '#FFD700' : '#FF4444',
                          }}
                        />
                      </span>
                    </span>
                    <select
                      onChange={(e) => {
                        if (e.target.value !== '') makeSub(p.id, Number(e.target.value));
                        e.target.value = '';
                      }}
                      defaultValue=""
                      className="shrink-0 rounded-md border border-white/15 bg-navy-900 px-1.5 py-1 text-[10px] outline-none focus:border-cyan"
                    >
                      <option value="">Sub…</option>
                      {bench.map((b, i) => (
                        <option key={b.id} value={i}>
                          {b.name} ({b.overall})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {subsMade.length > 0 && (
                <div className="mt-3 space-y-1">
                  {subsMade.map((s, i) => (
                    <div key={i} className="text-[10px] text-cyan">
                      ↻ {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="mt-8 flex justify-center">
          <button onClick={resume} className="btn-primary">
            Start Second Half →
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, home, away, suffix = '' }: { label: string; home: number; away: number; suffix?: string }) {
  const total = Math.max(1, home + away);
  return (
    <div className="mb-3">
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
