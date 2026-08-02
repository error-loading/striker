import { useEffect, useState } from 'react';
import { audio } from '../audio/audio';
import type { CameraMode } from '../data/types';
import { ACTIONS, ARCADE_BINDINGS, DEFAULT_BINDINGS, keyLabel, type Action } from '../engine/input';
import { useGame } from '../store/gameStore';

const CAMERAS: CameraMode[] = ['Isometric', 'Broadcast', 'Behind Ball', 'End to End', 'Tactical'];
const GROUPS = ['Movement', 'Attacking', 'Defending', 'System'] as const;

export default function SettingsScreen() {
  const settings = useGame((s) => s.settings);
  const updateSettings = useGame((s) => s.updateSettings);
  const setScreen = useGame((s) => s.setScreen);
  const engine = useGame((s) => s.engine);
  const [listening, setListening] = useState<Action | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  // While rebinding, the next key press is captured as the new binding.
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListening(null);
        return;
      }
      const taken = Object.entries(settings.bindings).find(([a, code]) => code === e.code && a !== listening);
      const next = { ...settings.bindings, [listening]: e.code };
      if (taken) {
        // Swap rather than leave two actions fighting over one key.
        next[taken[0] as Action] = settings.bindings[listening];
        setConflict(`${keyLabel(e.code)} was taken — swapped with ${taken[0]}`);
        setTimeout(() => setConflict(null), 2600);
      }
      updateSettings({ bindings: next });
      audio.confirm();
      setListening(null);
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button !== 1 && e.button !== 2) return;
      e.preventDefault();
      const code = e.button === 2 ? 'MouseRight' : 'MouseMiddle';
      updateSettings({ bindings: { ...settings.bindings, [listening]: code } });
      audio.confirm();
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('contextmenu', preventDefault, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.removeEventListener('contextmenu', preventDefault, true);
    };
  }, [listening, settings.bindings, updateSettings]);

  return (
    <div className="grid-bg h-full w-full overflow-y-auto bg-navy-950 scroll-thin">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-navy-950/85 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen(engine ? 'match' : 'landing')} className="btn-ghost !px-3 !py-2 !text-[11px]">
            ← Back
          </button>
          <h1 className="heading text-lg sm:text-xl">Settings</h1>
        </div>
        <button
          onClick={() => {
            audio.click();
            updateSettings({ bindings: settings.controlScheme === 'Arcade' ? { ...ARCADE_BINDINGS } : { ...DEFAULT_BINDINGS } });
          }}
          className="btn-ghost !px-4 !py-2 !text-[11px]"
        >
          Reset Controls
        </button>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-5 py-8">
        {/* Control scheme */}
        <section className="glass rounded-2xl p-6">
          <div className="label mb-3">Control scheme</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['Pro', 'Arcade'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { audio.click(); updateSettings({ controlScheme: s }); }}
                className={`rounded-xl border p-4 text-left transition
                  ${settings.controlScheme === s ? 'border-cyan bg-cyan/10 shadow-glow' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}
              >
                <div className="font-display text-base font-bold">{s} Mode</div>
                <p className="mt-1 text-[11px] leading-relaxed text-white/50">
                  {s === 'Pro'
                    ? 'Hold Shoot to charge the power bar and release to strike. WASD movement, full modifier set.'
                    : 'Tap to shoot at auto-weighted power. Arrow keys, fewer modifiers, more assistance.'}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Key bindings */}
        <section className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="label">Key bindings</div>
            {conflict && <span className="text-[10px] text-gold">{conflict}</span>}
          </div>
          <p className="mb-4 text-[11px] text-white/45">
            Click a binding then press any key (or right / middle mouse). Escape cancels. Gamepads work out
            of the box — the pad equivalent is listed beside each action.
          </p>

          {GROUPS.map((group) => (
            <div key={group} className="mb-5 last:mb-0">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan/70">{group}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACTIONS.filter((a) => a.group === group).map((a) => (
                  <div
                    key={a.action}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold">{a.label}</div>
                      <div className="truncate text-[10px] text-white/40">{a.description}</div>
                    </div>
                    <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-white/35">
                      {a.pad}
                    </span>
                    <button
                      onClick={() => { audio.click(); setListening(a.action); }}
                      className={`min-w-[4.5rem] shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition
                        ${listening === a.action ? 'animate-pulseGlow border-cyan bg-cyan/20 text-cyan' : 'border-white/15 bg-white/5 hover:border-cyan/50'}`}
                    >
                      {listening === a.action ? 'Press…' : keyLabel(settings.bindings[a.action])}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Camera + display */}
        <section className="glass rounded-2xl p-6">
          <div className="label mb-3">Camera</div>
          <div className="flex flex-wrap gap-2">
            {CAMERAS.map((c) => (
              <button
                key={c}
                onClick={() => { audio.click(); updateSettings({ cameraMode: c }); }}
                className={`rounded-lg border px-4 py-2 text-xs font-bold tracking-wider transition
                  ${settings.cameraMode === c ? 'border-cyan bg-cyan/15 text-cyan shadow-glow' : 'border-white/12 text-white/55 hover:border-white/30 hover:text-white'}`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-2">
            <Toggle
              label="Show player names"
              hint="Name plates and stamina bars above every player"
              value={settings.showPlayerNames}
              onChange={(v) => updateSettings({ showPlayerNames: v })}
            />
            <Toggle
              label="Show offside line"
              hint="Broadcast-style line at the last defender while you attack"
              value={settings.showOffsideLine}
              onChange={(v) => updateSettings({ showOffsideLine: v })}
            />
          </div>
        </section>

        {/* Audio */}
        <section className="glass rounded-2xl p-6">
          <div className="label mb-3">Audio</div>
          <Toggle
            label="Sound"
            hint="All audio is synthesised in the browser — no downloads"
            value={settings.audioEnabled}
            onChange={(v) => { updateSettings({ audioEnabled: v }); audio.setEnabled(v); }}
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Slider label="Master" value={settings.masterVolume} onChange={(v) => updateSettings({ masterVolume: v })} />
            <Slider label="Music" value={settings.musicVolume} onChange={(v) => updateSettings({ musicVolume: v })} />
            <Slider label="Effects" value={settings.sfxVolume} onChange={(v) => updateSettings({ sfxVolume: v })} />
            <Slider label="Crowd" value={settings.crowdVolume} onChange={(v) => updateSettings({ crowdVolume: v })} />
          </div>
        </section>
      </div>
    </div>
  );
}

const preventDefault = (e: Event) => e.preventDefault();

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => { audio.click(); onChange(!value); }}
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition hover:border-white/25"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{label}</div>
        <div className="text-[10px] text-white/40">{hint}</div>
      </div>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? 'bg-cyan' : 'bg-white/15'}`}
        role="switch"
        aria-checked={value}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
          style={{ left: value ? '1.375rem' : '0.125rem' }}
        />
      </span>
    </button>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex justify-between text-[10px] uppercase tracking-widest text-white/40">
        <span>{label}</span>
        <span className="text-cyan">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}
