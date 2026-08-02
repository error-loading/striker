import { useEffect, useRef } from 'react';
import type { CameraMode } from '../data/types';
import { TIMING } from '../engine/constants';
import type { MatchEngine } from '../engine/engine';
import type { InputController } from '../engine/input';
import { MatchRenderer } from '../render/renderer';

export interface LoopOptions {
  cameraMode: CameraMode;
  showNames: boolean;
  showOffsideLine: boolean;
  paused: boolean;
  /** Fires roughly 8x a second so React can refresh the HUD cheaply. */
  onTick?: (engine: MatchEngine) => void;
  /** Fires once per simulation event the UI may want to react to. */
  onPhaseChange?: (phase: MatchEngine['phase'], engine: MatchEngine) => void;
  input?: InputController | null;
}

/**
 * Drives one match: a fixed-timestep simulation with a decoupled render pass,
 * plus canvas sizing. Options are read through a ref so changing them never
 * restarts the loop.
 */
export function useMatchLoop(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  engine: MatchEngine | null,
  options: LoopOptions,
) {
  const optsRef = useRef(options);
  optsRef.current = options;
  const rendererRef = useRef<MatchRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engine) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const renderer = new MatchRenderer(ctx, engine);
    rendererRef.current = renderer;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      // Cap DPR: the stadium fill rate is the bottleneck on retina displays.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(Math.max(320, rect.width), Math.max(240, rect.height), dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    let raf = 0;
    let last = performance.now();
    let accumulator = 0;
    let tickAccum = 0;
    let lastPhase = engine.phase;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // Clamp so a backgrounded tab doesn't fast-forward the match on return.
      const frameTime = Math.min(0.25, (now - last) / 1000);
      last = now;

      const o = optsRef.current;
      if (!o.paused) {
        if (o.input) engine.setInput(o.input.poll());
        accumulator += frameTime;
        let steps = 0;
        while (accumulator >= TIMING.dt && steps < 6) {
          engine.step(TIMING.dt);
          accumulator -= TIMING.dt;
          steps++;
        }
        if (steps >= 6) accumulator = 0;

        if (engine.phase !== lastPhase) {
          o.onPhaseChange?.(engine.phase, engine);
          lastPhase = engine.phase;
        }

        tickAccum += frameTime;
        if (tickAccum > 0.125) {
          tickAccum = 0;
          o.onTick?.(engine);
        }
      }

      renderer.draw(o.paused ? 0 : frameTime, {
        cameraMode: o.cameraMode,
        showNames: o.showNames,
        showOffsideLine: o.showOffsideLine,
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      rendererRef.current = null;
    };
  }, [canvasRef, engine]);

  return rendererRef;
}
