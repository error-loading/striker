import { useEffect, useRef, useState } from 'react';
import type { Action, InputController } from '../engine/input';

const BUTTONS: { action: Action; label: string; tone: string }[] = [
  { action: 'pass', label: 'PASS', tone: '#4ADE80' },
  { action: 'shoot', label: 'SHOOT', tone: '#FFD700' },
  { action: 'through', label: 'THRU', tone: '#00D9FF' },
  { action: 'cross', label: 'CROSS', tone: '#A78BFA' },
  { action: 'tackle', label: 'TACKLE', tone: '#FF7A45' },
  { action: 'sprint', label: 'SPRINT', tone: '#FF4444' },
];

/**
 * On-screen joystick and action pad. Only mounts on coarse-pointer devices, so
 * desktop keeps a clean view.
 */
export default function TouchControls({ input }: { input: InputController }) {
  const [isTouch, setIsTouch] = useState(false);
  const padRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const touchId = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setIsTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    // Clear the virtual stick when the pad unmounts.
    return () => {
      input.virtualStick = null;
    };
  }, [input]);

  if (!isTouch) return null;

  const radius = 56;

  const updateStick = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > radius) {
      dx = (dx / d) * radius;
      dy = (dy / d) * radius;
    }
    setKnob({ x: dx, y: dy });
    input.virtualStick = { x: dx / radius, y: dy / radius };
  };

  const release = () => {
    touchId.current = null;
    setKnob({ x: 0, y: 0 });
    input.virtualStick = null;
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* Joystick */}
      <div
        ref={padRef}
        className="pointer-events-auto absolute bottom-6 left-6 h-32 w-32 touch-none rounded-full border border-white/20 bg-navy-950/45 backdrop-blur"
        onTouchStart={(e) => {
          const t = e.changedTouches[0];
          touchId.current = t.identifier;
          updateStick(t.clientX, t.clientY);
        }}
        onTouchMove={(e) => {
          for (const t of Array.from(e.changedTouches)) {
            if (t.identifier === touchId.current) updateStick(t.clientX, t.clientY);
          }
        }}
        onTouchEnd={release}
        onTouchCancel={release}
      >
        <div
          className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border border-cyan/50 bg-cyan/25 shadow-glow"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>

      {/* Action buttons */}
      <div className="pointer-events-auto absolute bottom-6 right-6 grid grid-cols-3 gap-2">
        {BUTTONS.map((b) => (
          <button
            key={b.action}
            className="h-14 w-14 touch-none rounded-full border text-[9px] font-black tracking-wider backdrop-blur active:scale-95"
            style={{ borderColor: `${b.tone}66`, background: `${b.tone}22`, color: b.tone }}
            onTouchStart={(e) => {
              e.preventDefault();
              input.setVirtual(b.action, true);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              input.setVirtual(b.action, false);
            }}
            onTouchCancel={() => input.setVirtual(b.action, false)}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Switch player */}
      <button
        className="pointer-events-auto absolute bottom-44 right-6 h-11 w-14 touch-none rounded-xl border border-white/25 bg-navy-950/50 text-[9px] font-black tracking-wider text-white/70 backdrop-blur active:scale-95"
        onTouchStart={(e) => {
          e.preventDefault();
          input.setVirtual('switchPlayer', true);
        }}
        onTouchEnd={() => input.setVirtual('switchPlayer', false)}
      >
        SWITCH
      </button>
    </div>
  );
}
