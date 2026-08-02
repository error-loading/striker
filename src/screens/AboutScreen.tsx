import { audio } from '../audio/audio';
import { ACTIONS, keyLabel } from '../engine/input';
import { useGame } from '../store/gameStore';

const MECHANICS = [
  {
    title: 'Shooting',
    body: 'Hold Shoot to fill the power bar, steer with your movement input, release to strike. Finesse trades power for curve and accuracy — the Magnus effect bends the flight genuinely.',
  },
  {
    title: 'Passing',
    body: 'Short passes are safe. Through balls lead the runner into space but risk offside. Crosses loft over a packed box. Every pass carries error scaled by the passer, distance, pressure and weather.',
  },
  {
    title: 'Defending',
    body: 'Jockey to contain and stay goal-side. Time your tackle: close to the ball is the green zone, a late lunge at speed is a foul — and referees book persistent offenders.',
  },
  {
    title: 'Stamina',
    body: 'Sprinting drains the tank and slows a player down as it empties. Jog to recover. Fitter, more physical players last longer, and everyone gets a top-up at half time.',
  },
  {
    title: 'The laws',
    body: 'Offside is judged at the moment the pass is played against the second-last defender. Fouls in the box are penalties. Two yellows is a red, and you play the rest of the match a man down.',
  },
  {
    title: 'Difficulty',
    body: 'Each tier rewrites AI speed, reaction latency, pressing intensity and passing error, and dials down how much your own passes and shots are auto-corrected.',
  },
];

export default function AboutScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const bindings = useGame((s) => s.settings.bindings);
  const scheme = useGame((s) => s.settings.controlScheme);

  return (
    <div className="grid-bg h-full w-full overflow-y-auto bg-navy-950 scroll-thin">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-navy-950/85 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen('landing')} className="btn-ghost !px-3 !py-2 !text-[11px]">
            ← Back
          </button>
          <h1 className="heading text-lg sm:text-xl">How To Play</h1>
        </div>
        <button onClick={() => { audio.confirm(); setScreen('squad'); }} className="btn-primary !px-5 !py-2 !text-[11px]">
          Start Game →
        </button>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10">
        <h2 className="heading text-4xl sm:text-5xl">
          Your controls <span className="text-cyan">({scheme})</span>
        </h2>
        <p className="mt-3 max-w-2xl text-white/55">
          Rebind anything in Settings. Gamepads are detected automatically, and touch devices get an
          on-screen stick and action pad.
        </p>

        <div className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map((a) => (
            <div
              key={a.action}
              className="glass flex items-center gap-3 rounded-xl px-3.5 py-3"
            >
              <kbd className="shrink-0 rounded-lg border border-cyan/30 bg-cyan/10 px-2.5 py-1.5 font-mono text-[11px] font-bold text-cyan">
                {keyLabel(bindings[a.action])}
              </kbd>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold">{a.label}</div>
                <div className="truncate text-[10px] text-white/40">{a.description}</div>
              </div>
            </div>
          ))}
        </div>

        <h2 className="heading mt-16 text-3xl sm:text-4xl">Match mechanics</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {MECHANICS.map((m) => (
            <article key={m.title} className="glass rounded-2xl p-6">
              <h3 className="font-display text-base font-bold text-cyan">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{m.body}</p>
            </article>
          ))}
        </div>

        <h2 className="heading mt-16 text-3xl sm:text-4xl">Under the hood</h2>
        <div className="glass mt-6 rounded-2xl p-6">
          <ul className="space-y-3 text-sm text-white/60">
            <li>
              <span className="font-bold text-white">Fixed-timestep simulation.</span> The match runs at a
              locked 60 Hz independent of your frame rate, so physics stay identical on any display.
            </li>
            <li>
              <span className="font-bold text-white">Perspective renderer.</span> A hand-rolled camera
              projects a real 120×80 yard pitch, correct to the Laws of the Game, into a broadcast-style
              view with depth-sorted players.
            </li>
            <li>
              <span className="font-bold text-white">Positional AI.</span> All 21 non-user players hold a
              formation shape that slides with the ball, compresses out of possession and pushes on in it.
            </li>
            <li>
              <span className="font-bold text-white">Synthesised audio.</span> Crowd, whistle, ball strikes
              and the menu track are all generated with the Web Audio API at runtime.
            </li>
          </ul>
        </div>

        <p className="mt-12 text-center text-xs text-white/30">
          Built with React, TypeScript, Zustand, Tailwind and Canvas 2D. Not affiliated with EA Sports or FIFA.
        </p>
      </div>
    </div>
  );
}
