/**
 * Dev-only stadium preview. Not part of the production bundle — Vite only
 * builds `index.html`, so this page exists purely to iterate on the renderer.
 *
 *   npm run dev  →  http://localhost:5173/preview.html
 *
 * Query params: ?camera=Broadcast&time=Night&weather=Clear&stadium=anfield
 * `&pause=1` freezes the sim after a warm-up so screenshots are reproducible.
 */
import { StrictMode, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createMatch } from './engine/createMatch';
import { TIMING } from './engine/constants';
import { useMatchLoop } from './hooks/useMatchLoop';
import type { CameraMode, TimeOfDay, Weather } from './data/types';

const q = new URLSearchParams(location.search);
const camera = (q.get('camera') ?? 'Broadcast') as CameraMode;
const timeOfDay = (q.get('time') ?? 'Night') as TimeOfDay;
const weather = (q.get('weather') ?? 'Clear') as Weather;
const stadiumId = q.get('stadium') ?? 'anfield';
const warmup = Number(q.get('warmup') ?? 25);
const paused = q.get('pause') === '1';

function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useMemo(() => {
    const e = createMatch({
      userTeamId: 'liv',
      opponentTeamId: 'rma',
      formationId: '4-3-3',
      opponentFormationId: '4-2-3-1',
      starters: [],
      difficulty: 'World Class',
      weather,
      timeOfDay,
      durationMinutes: 90,
      stadiumId,
      seed: 20260802,
    });
    e.autoPlay = true;
    // Fast-forward so play has spread out from kickoff before the first frame.
    for (let i = 0; i < warmup * 60; i++) e.step(TIMING.dt);
    return e;
  }, []);

  useEffect(() => {
    (window as unknown as { __engine: unknown }).__engine = engine;
  }, [engine]);

  const renderer = useMatchLoop(canvasRef, engine, {
    cameraMode: camera,
    showNames: false,
    showOffsideLine: false,
    paused,
  });

  // Expose a synchronous render benchmark. requestAnimationFrame is throttled
  // when the preview pane is backgrounded, so timing real frames is useless —
  // this drives draw() directly instead.
  useEffect(() => {
    (window as unknown as { __bench: unknown }).__bench = (n = 120) => {
      const r = renderer.current;
      if (!r) return 'no renderer';
      const opts = { cameraMode: camera, showNames: false, showOffsideLine: false };
      for (let i = 0; i < 20; i++) r.draw(1 / 60, opts);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) r.draw(1 / 60, opts);
      const ms = (performance.now() - t0) / n;
      return { msPerDraw: +ms.toFixed(2), impliedFps: Math.round(1000 / ms) };
    };
  }, [renderer]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

// Reuse the root across hot reloads, or React warns on every save.
const host = window as unknown as { __root?: ReturnType<typeof createRoot> };
host.__root ??= createRoot(document.getElementById('root')!);
host.__root.render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
