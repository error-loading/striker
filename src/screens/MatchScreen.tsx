import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { TeamCrest } from '../components/TeamCrest';
import TouchControls from '../components/TouchControls';
import { getTeam } from '../data/leagues';
import { getStadium } from '../data/stadiums';
import type { CameraMode } from '../data/types';
import type { MatchEngine } from '../engine/engine';
import { InputController } from '../engine/input';
import type { MatchEvent, MatchPhase } from '../engine/types';
import { useMatchLoop } from '../hooks/useMatchLoop';
import { useGame } from '../store/gameStore';

const CAMERAS: CameraMode[] = ['Sideline', 'Broadcast', 'Behind Ball', 'End to End', 'Tactical'];

interface Hud {
  minute: number;
  score: [number, number];
  possession: [number, number];
  phase: MatchPhase;
  charge: number;
  controlled: { name: string; number: number; stamina: number; position: string } | null;
  flash: { text: string; sub: string } | null;
  events: MatchEvent[];
  stats: [MatchEngine['stats'][0], MatchEngine['stats'][1]];
}

export default function MatchScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useGame((s) => s.engine);
  const settings = useGame((s) => s.settings);
  const updateSettings = useGame((s) => s.updateSettings);
  const setScreen = useGame((s) => s.setScreen);
  const userTeamId = useGame((s) => s.userTeamId);
  const opponentTeamId = useGame((s) => s.opponentTeamId);
  const stadiumId = useGame((s) => s.stadiumId);

  const [paused, setPaused] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);
  const goalSeen = useRef(0);
  const eventCount = useRef(0);

  const home = getTeam(userTeamId);
  const away = getTeam(opponentTeamId);
  const stadium = getStadium(stadiumId);

  const input = useMemo(() => {
    const ctrl = new InputController(settings.bindings);
    ctrl.arcade = settings.controlScheme === 'Arcade';
    return ctrl;
    // Rebuilt whenever the bindings change so remapping takes effect immediately.
  }, [settings.bindings, settings.controlScheme]);

  useEffect(() => {
    input.onPause = () => setPaused((p) => !p);
    input.attach();
    return () => {
      input.detach();
      input.onPause = null;
    };
  }, [input]);

  useEffect(() => {
    audio.init();
    audio.startCrowd();
    return () => audio.stopCrowd();
  }, []);

  const onTick = useCallback((e: MatchEngine) => {
    const c = e.controlled;
    setHud({
      minute: e.displayMinute,
      score: e.score,
      possession: e.possessionPct(),
      phase: e.phase,
      charge: e.shotCharge,
      controlled: c
        ? { name: c.name, number: c.number, stamina: c.stamina, position: c.slotPosition }
        : null,
      flash: e.activeFlash,
      events: e.events.slice(-5).reverse(),
      stats: e.stats,
    });
    audio.setCrowdIntensity(Math.min(1, Math.abs(e.momentum) * 0.8 + (e.phase === 'goal' ? 1 : 0)));

    // Audio cues driven by newly appended events.
    if (e.events.length > eventCount.current) {
      for (const ev of e.events.slice(eventCount.current)) {
        if (ev.type === 'foul' || ev.type === 'offside' || ev.type === 'yellow' || ev.type === 'red') {
          audio.whistle();
        } else if (ev.type === 'woodwork') {
          audio.nearMiss();
        } else if (ev.type === 'save') {
          audio.save();
        }
      }
      eventCount.current = e.events.length;
    }
  }, []);

  const onPhaseChange = useCallback(
    (phase: MatchPhase, e: MatchEngine) => {
      if (phase === 'goal') {
        goalSeen.current++;
        audio.goal();
      } else if (phase === 'halftime') {
        audio.whistle(true);
        setScreen('halftime');
      } else if (phase === 'fulltime') {
        audio.whistle(true);
        setScreen('fulltime');
      } else if (phase === 'throwin' || phase === 'corner' || phase === 'goalkick') {
        audio.whistle();
      }
      void e;
    },
    [setScreen],
  );

  useMatchLoop(canvasRef, engine, {
    cameraMode: settings.cameraMode,
    showNames: settings.showPlayerNames,
    showOffsideLine: settings.showOffsideLine,
    paused,
    onTick,
    onPhaseChange,
    input,
  });

  // No engine (e.g. deep link straight to the match): send the user back.
  useEffect(() => {
    if (!engine) setScreen('squad');
  }, [engine, setScreen]);

  if (!engine) return null;

  const cycleCamera = () => {
    const i = CAMERAS.indexOf(settings.cameraMode);
    updateSettings({ cameraMode: CAMERAS[(i + 1) % CAMERAS.length] });
    audio.click();
  };

  const clock = `${String(hud?.minute ?? 0).padStart(2, '0')}:00`;
  const [hp, ap] = hud?.possession ?? [50, 50];

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ---------------- Scoreline HUD ---------------- */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 w-[min(94vw,34rem)] -translate-x-1/2">
        <div className="glass-strong overflow-hidden rounded-2xl shadow-2xl">
          <div className="flex items-stretch">
            <TeamScore team={home} score={hud?.score[0] ?? 0} align="left" />
            <div className="flex shrink-0 flex-col items-center justify-center border-x border-white/10 px-3 py-2">
              <div className="font-display text-sm font-black tabular-nums tracking-wider text-cyan">{clock}</div>
              <div className="mt-0.5 text-[9px] uppercase tracking-widest text-white/40">
                {hud?.phase === 'goal'
                  ? 'Goal'
                  : hud?.phase === 'kickoff'
                    ? 'Kick off'
                    : hud?.phase === 'corner'
                      ? 'Corner'
                      : hud?.phase === 'throwin'
                        ? 'Throw'
                        : hud?.phase === 'freekick'
                          ? 'Free kick'
                          : hud?.phase === 'penalty'
                            ? 'Penalty'
                            : hud?.phase === 'goalkick'
                              ? 'Goal kick'
                              : engine.half === 1
                                ? '1st half'
                                : '2nd half'}
              </div>
            </div>
            <TeamScore team={away} score={hud?.score[1] ?? 0} align="right" />
          </div>
          {/* Possession bar */}
          <div className="flex h-1.5 w-full">
            <div className="transition-all duration-700" style={{ width: `${hp}%`, background: home.primaryColor }} />
            <div className="transition-all duration-700" style={{ width: `${ap}%`, background: away.primaryColor }} />
          </div>
          <div className="flex justify-between px-3 py-1 text-[9px] font-bold tabular-nums text-white/40">
            <span>{hp}% POSSESSION</span>
            <span>{ap}%</span>
          </div>
        </div>
      </div>

      {/* ---------------- Flash banner ---------------- */}
      {hud?.flash && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-30 flex flex-col items-center">
          <div
            className="heading text-[clamp(2.5rem,11vw,7rem)] leading-none text-glow"
            style={{ color: hud.flash.text === 'GOAL!' ? '#FFD700' : '#00D9FF', animation: 'fadeUp .35s cubic-bezier(.16,1,.3,1)' }}
          >
            {hud.flash.text}
          </div>
          <div className="mt-2 rounded-full bg-navy-950/80 px-5 py-1.5 text-sm font-semibold text-white/85 backdrop-blur">
            {hud.flash.sub}
          </div>
        </div>
      )}

      {/* ---------------- Event ticker ---------------- */}
      <div className="pointer-events-none absolute left-3 top-24 z-20 hidden w-56 space-y-1 sm:block">
        {hud?.events.map((ev, i) => (
          <div
            key={`${ev.minute}-${ev.text}-${i}`}
            className="glass flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[10px] animate-slideIn"
            style={{ opacity: 1 - i * 0.17 }}
          >
            <span className="font-bold tabular-nums text-cyan">{ev.minute}'</span>
            <span className="truncate text-white/70">{ev.text}</span>
          </div>
        ))}
      </div>

      {/* ---------------- Controlled player ---------------- */}
      {hud?.controlled && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-20">
          <div className="glass-strong flex items-center gap-3 rounded-xl px-3 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan/15 font-display text-base font-black text-cyan">
              {hud.controlled.number}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-bold">{hud.controlled.name}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">
                  {hud.controlled.position}
                </span>
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/12">
                  <span
                    className="block h-full rounded-full transition-all"
                    style={{
                      width: `${hud.controlled.stamina}%`,
                      background:
                        hud.controlled.stamina > 50 ? '#4ADE80' : hud.controlled.stamina > 25 ? '#FFD700' : '#FF4444',
                    }}
                  />
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Shot power meter ---------------- */}
      {(hud?.charge ?? 0) > 0.01 && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 w-56 -translate-x-1/2">
          <div className="mb-1 text-center text-[9px] font-bold uppercase tracking-[0.3em] text-white/50">Power</div>
          <div className="h-2.5 overflow-hidden rounded-full border border-white/20 bg-navy-950/80">
            <div
              className="h-full rounded-full transition-none"
              style={{
                width: `${(hud?.charge ?? 0) * 100}%`,
                background: 'linear-gradient(90deg,#4ADE80,#FFD700 60%,#FF4444)',
              }}
            />
          </div>
        </div>
      )}

      {/* ---------------- Right controls ---------------- */}
      <div className="absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2">
        <button onClick={cycleCamera} className="btn-ghost !px-3 !py-2 !text-[10px]">
          📷 {settings.cameraMode}
        </button>
        <button onClick={() => { audio.click(); setShowStats((s) => !s); }} className="btn-ghost !px-3 !py-2 !text-[10px]">
          📊 Stats
        </button>
        <button onClick={() => { audio.click(); setPaused(true); }} className="btn-ghost !px-3 !py-2 !text-[10px]">
          ⏸ Pause
        </button>
      </div>

      {/* ---------------- Live stats panel ---------------- */}
      {showStats && hud && (
        <div className="absolute right-3 top-24 z-20 w-60 animate-fadeUp">
          <div className="glass-strong rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="label">Match stats</span>
              <button onClick={() => setShowStats(false)} className="text-white/35 hover:text-white">✕</button>
            </div>
            {(
              [
                ['Shots', hud.stats[0].shots, hud.stats[1].shots],
                ['On target', hud.stats[0].shotsOnTarget, hud.stats[1].shotsOnTarget],
                ['Passes', hud.stats[0].passes, hud.stats[1].passes],
                ['Tackles', hud.stats[0].tackles, hud.stats[1].tackles],
                ['Fouls', hud.stats[0].fouls, hud.stats[1].fouls],
                ['Corners', hud.stats[0].corners, hud.stats[1].corners],
                ['Offsides', hud.stats[0].offsides, hud.stats[1].offsides],
                ['Cards', hud.stats[0].yellowCards + hud.stats[0].redCards, hud.stats[1].yellowCards + hud.stats[1].redCards],
              ] as const
            ).map(([label, h, a]) => (
              <StatRow key={label} label={label} home={h} away={a} homeColor={home.primaryColor} awayColor={away.primaryColor} />
            ))}
          </div>
        </div>
      )}

      {/* ---------------- Touch controls ---------------- */}
      <TouchControls input={input} />

      {/* ---------------- Pause menu ---------------- */}
      {paused && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-navy-950/80 backdrop-blur-lg animate-fadeIn">
          <div className="glass-strong w-[min(92vw,26rem)] rounded-3xl p-8 text-center">
            <div className="label">{stadium.name}</div>
            <h2 className="heading mt-2 text-3xl">Paused</h2>
            <div className="mt-2 font-display text-2xl font-black tabular-nums">
              {home.shortName} {hud?.score[0] ?? 0} – {hud?.score[1] ?? 0} {away.shortName}
            </div>

            <div className="mt-7 space-y-2.5">
              <button onClick={() => { audio.confirm(); setPaused(false); }} className="btn-primary w-full">
                Resume
              </button>
              <button onClick={cycleCamera} className="btn-ghost w-full">
                Camera: {settings.cameraMode}
              </button>
              <button
                onClick={() => updateSettings({ showPlayerNames: !settings.showPlayerNames })}
                className="btn-ghost w-full"
              >
                Player names: {settings.showPlayerNames ? 'On' : 'Off'}
              </button>
              <button onClick={() => { audio.click(); setScreen('settings'); }} className="btn-ghost w-full">
                Settings
              </button>
              <button
                onClick={() => { audio.click(); audio.stopCrowd(); setScreen('landing'); }}
                className="btn-ghost w-full !border-danger/40 !text-danger/90 hover:!bg-danger/10"
              >
                Quit match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamScore({ team, score, align }: { team: ReturnType<typeof getTeam>; score: number; align: 'left' | 'right' }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <TeamCrest team={team} size={28} />
      <span className="min-w-0 flex-1 truncate font-display text-sm font-extrabold uppercase tracking-wide">
        {team.shortName}
      </span>
      <span className="font-display text-2xl font-black tabular-nums leading-none">{score}</span>
    </div>
  );
}

function StatRow({
  label,
  home,
  away,
  homeColor,
  awayColor,
}: {
  label: string;
  home: number;
  away: number;
  homeColor: string;
  awayColor: string;
}) {
  const total = Math.max(1, home + away);
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-bold tabular-nums">{home}</span>
        <span className="uppercase tracking-widest text-white/40">{label}</span>
        <span className="font-bold tabular-nums">{away}</span>
      </div>
      <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-white/10">
        <div style={{ width: `${(home / total) * 100}%`, background: homeColor }} />
        <div style={{ width: `${(away / total) * 100}%`, background: awayColor }} />
      </div>
    </div>
  );
}
