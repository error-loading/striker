import { useEffect, useState } from 'react';
import { audio } from '../audio/audio';
import type { CameraMode } from '../data/types';
import { ACTIONS, ARCADE_BINDINGS, DEFAULT_BINDINGS, keyLabel, type Action } from '../engine/input';
import { useGame } from '../store/gameStore';

const CAMERAS: CameraMode[] = ['Sideline', 'Broadcast', 'Behind Ball', 'End to End', 'Tactical'];
const GROUPS = ['Movement', 'Attacking', 'Defending', 'System'] as const;

export default function SettingsScreen() {
  const settings = useGame((s) => s.settings);
  const updateSettings = useGame((s) => s.updateSettings);
  const setScreen = useGame((s) => s.setScreen);
  const engine = useGame((s) => s.engine);
  const [listening, setListening] = useState<Action | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListening(null);
        return;
      }
      const taken = Object.entries(settings.bindings).find(
        ([a, code]) => code === e.code && a !== listening,
      );
      const next = { ...settings.bindings, [listening]: e.code };
      if (taken) {
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
    <div className="pitch-bg h-full w-full overflow-y-auto font-editorial text-chalk scroll-thin">
      {/* ─────────────────────── Match-card header ─────────────────────── */}
      <header className="sticky top-0 z-20 flex items-stretch border-b border-chalk/15 bg-pitch-950/95 backdrop-blur">
        <button
          onClick={() => setScreen(engine ? 'match' : 'landing')}
          className="flex items-center gap-2 border-r border-chalk/15 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-chalk-dim transition hover:text-chalk"
        >
          <span className="font-mono">←</span> Back
        </button>
        <div className="flex items-center gap-3 border-r border-chalk/15 px-5 py-3">
          <span className="stencil-num flex h-9 w-9 items-center justify-center bg-chalk text-[18px] leading-none text-pitch-950">
            04
          </span>
          <div className="leading-none">
            <div className="font-stencil text-[18px] font-extrabold tracking-tight uppercase">
              Referee's Notebook
            </div>
            <div className="eyebrow mt-1">Controls · camera · audio</div>
          </div>
        </div>

        <div className="ml-auto flex items-center px-4">
          <button
            onClick={() => {
              audio.click();
              updateSettings({
                bindings:
                  settings.controlScheme === 'Arcade'
                    ? { ...ARCADE_BINDINGS }
                    : { ...DEFAULT_BINDINGS },
              });
            }}
            className="ghost-btn !py-2 !px-4 !text-[12px]"
          >
            Reset controls
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1080px] px-6 py-10">
        {/* -------- Control scheme -------- */}
        <NumberedSection num="01" title="Control scheme" hint="How much the game does for you">
          <div className="grid gap-0 border border-chalk/15 sm:grid-cols-2">
            {(['Pro', 'Arcade'] as const).map((s) => {
              const active = settings.controlScheme === s;
              return (
                <button
                  key={s}
                  onClick={() => { audio.click(); updateSettings({ controlScheme: s }); }}
                  className={`flex flex-col items-start gap-3 border-b border-r border-chalk/15 px-5 py-5 text-left transition
                    ${active ? 'bg-corner/10' : 'hover:bg-chalk/5'}`}
                >
                  <div className="flex items-baseline gap-3">
                    <span className={`stencil-num text-[28px] leading-none ${active ? 'text-corner' : 'text-chalk-dim'}`}>
                      {s === 'Pro' ? '◆' : '◇'}
                    </span>
                    <div>
                      <div className={`font-stencil text-[18px] font-extrabold uppercase ${active ? 'text-corner' : 'text-chalk'}`}>
                        {s} mode
                      </div>
                      <div className="mt-1 font-editorial text-[12px] leading-relaxed text-chalk-dim">
                        {s === 'Pro'
                          ? 'Hold Shoot to charge the power bar, release to strike. WASD movement, full modifier set.'
                          : 'Tap to shoot at auto-weighted power. Arrow keys, fewer modifiers, more assistance.'}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </NumberedSection>

        {/* -------- Key bindings -------- */}
        <NumberedSection
          num="02"
          title="Key bindings"
          hint="Click a binding, then press any key or right / middle mouse. Escape cancels."
          right={conflict ? <span className="font-mono text-[10px] text-corner">{conflict}</span> : null}
        >
          {GROUPS.map((group) => (
            <div key={group} className="mb-6 last:mb-0">
              <div className="mb-3 flex items-center gap-4">
                <span className="eyebrow">{group}</span>
                <span className="chalk-rule flex-1" />
              </div>
              <div className="grid gap-0 border border-chalk/15 sm:grid-cols-2">
                {ACTIONS.filter((a) => a.group === group).map((a) => (
                  <div
                    key={a.action}
                    className="flex items-center gap-3 border-b border-r border-chalk/15 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-editorial text-[13px] font-semibold text-chalk">
                        {a.label}
                      </div>
                      <div className="truncate font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
                        {a.description}
                      </div>
                    </div>
                    <span className="shrink-0 border border-chalk/15 px-1.5 py-0.5 font-mono text-[9px] text-chalk-dim/70">
                      {a.pad}
                    </span>
                    <button
                      onClick={() => { audio.click(); setListening(a.action); }}
                      className={`min-w-[5rem] shrink-0 border px-2.5 py-1.5 font-mono text-[11px] font-bold transition
                        ${listening === a.action
                          ? 'border-corner bg-corner/15 text-corner'
                          : 'border-chalk/25 bg-pitch-950/60 text-chalk hover:border-corner/60'}`}
                    >
                      {listening === a.action ? 'Press…' : keyLabel(settings.bindings[a.action])}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </NumberedSection>

        {/* -------- Camera + display -------- */}
        <NumberedSection num="03" title="Camera" hint="Broadcast is the default. Tactical for the deepest zoom out.">
          <div className="flex flex-wrap gap-0 border border-chalk/15">
            {CAMERAS.map((c) => {
              const active = settings.cameraMode === c;
              return (
                <button
                  key={c}
                  onClick={() => { audio.click(); updateSettings({ cameraMode: c }); }}
                  className={`border-r border-chalk/15 px-5 py-3 font-stencil text-[12px] font-bold uppercase tracking-[0.08em] transition
                    ${active
                      ? 'bg-corner text-chalk'
                      : 'text-chalk-dim hover:bg-chalk/5 hover:text-chalk'}`}
                >
                  {c}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-0 border border-chalk/15 sm:grid-cols-2">
            <Toggle
              label="Show player names"
              hint="Name plates and stamina bars above every player"
              value={settings.showPlayerNames}
              onChange={(v) => updateSettings({ showPlayerNames: v })}
            />
            <Toggle
              label="Show offside line"
              hint="Broadcast-style line at the last defender when you attack"
              value={settings.showOffsideLine}
              onChange={(v) => updateSettings({ showOffsideLine: v })}
            />
          </div>
        </NumberedSection>

        {/* -------- Audio -------- */}
        <NumberedSection num="04" title="Audio" hint="Every sound is synthesised in the browser — no downloads">
          <div className="grid gap-0 border border-chalk/15">
            <Toggle
              label="Sound on"
              hint="Master switch for the whole audio system"
              value={settings.audioEnabled}
              onChange={(v) => { updateSettings({ audioEnabled: v }); audio.setEnabled(v); }}
              full
            />
          </div>
          <div className="mt-4 grid gap-6 border border-chalk/15 px-5 py-5 sm:grid-cols-2">
            <Slider label="Master" value={settings.masterVolume} onChange={(v) => updateSettings({ masterVolume: v })} />
            <Slider label="Music" value={settings.musicVolume} onChange={(v) => updateSettings({ musicVolume: v })} />
            <Slider label="Effects" value={settings.sfxVolume} onChange={(v) => updateSettings({ sfxVolume: v })} />
            <Slider label="Crowd" value={settings.crowdVolume} onChange={(v) => updateSettings({ crowdVolume: v })} />
          </div>
        </NumberedSection>
      </div>
    </div>
  );
}

/* ============================================================ */

const preventDefault = (e: Event) => e.preventDefault();

function NumberedSection({
  num,
  title,
  hint,
  right,
  children,
}: {
  num: string;
  title: string;
  hint: string;
  right?: React.ReactNode;
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
        {right}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
  full = false,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  full?: boolean;
}) {
  return (
    <button
      onClick={() => { audio.click(); onChange(!value); }}
      className={`flex w-full items-center gap-3 border-b border-r border-chalk/15 px-5 py-3 text-left transition hover:bg-chalk/5 ${full ? 'sm:col-span-2' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <div className="font-editorial text-[13px] font-semibold text-chalk">{label}</div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim/70">
          {hint}
        </div>
      </div>
      <span
        className={`relative flex h-6 w-11 shrink-0 items-center transition ${value ? 'bg-corner' : 'bg-chalk/20'}`}
        style={{ borderRadius: '2px' }}
        role="switch"
        aria-checked={value}
      >
        <span
          className="absolute top-1 h-4 w-4 bg-chalk transition-all"
          style={{ left: value ? '1.6rem' : '0.2rem', borderRadius: '2px' }}
        />
      </span>
    </button>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-widest text-chalk-dim">
        <span>{label}</span>
        <span className="text-chalk">{Math.round(value * 100)}</span>
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
