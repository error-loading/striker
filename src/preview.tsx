/**
 * Dev-only stadium preview. Not part of the production bundle — Vite only
 * builds `index.html`, so this page exists purely to iterate on the renderer.
 *
 *   npm run dev  →  http://localhost:5173/preview.html
 *
 * Query params: ?camera=Broadcast&time=Night&weather=Clear&stadium=anfield
 * `&pause=1` freezes the sim after a warm-up so screenshots are reproducible.
 * `&rig=1` swaps the match for a player model sheet — see {@link ModelSheet}.
 */
import { StrictMode, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createMatch } from './engine/createMatch';
import { TIMING } from './engine/constants';
import { useMatchLoop } from './hooks/useMatchLoop';
import { Camera } from './render/camera';
import { atmosphereFor } from './render/atmosphere';
import { advancePhases, drawPlayer, kitFor } from './render/entities';
import { getTeam } from './data/leagues';
import type { MatchPlayer } from './engine/types';
import type { CameraMode, TimeOfDay, Weather } from './data/types';

const q = new URLSearchParams(location.search);
const camera = (q.get('camera') ?? 'Broadcast') as CameraMode;
const timeOfDay = (q.get('time') ?? 'Night') as TimeOfDay;
const weather = (q.get('weather') ?? 'Clear') as Weather;
const stadiumId = q.get('stadium') ?? 'anfield';
const warmup = Number(q.get('warmup') ?? 25);
const paused = q.get('pause') === '1';
const rig = q.get('rig') === '1';

/**
 * Player model sheet: the same squad rendered close up, one row per heading, so
 * the figure can be judged at a size a match camera never gives you. Rows turn
 * the player 45 degrees at a time; columns step through the gait cycle.
 */
function ModelSheet() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = createMatch({
      userTeamId: 'mci',
      opponentTeamId: 'rma',
      formationId: '4-3-3',
      opponentFormationId: '4-2-3-1',
      starters: [],
      difficulty: 'World Class',
      weather,
      timeOfDay,
      durationMinutes: 90,
      stadiumId,
      seed: 7,
    });
    const atmos = atmosphereFor(timeOfDay === 'Night', weather);
    const team = getTeam('mci');
    const cam = new Camera();
    cam.mode = 'Behind Ball';

    // Eight sample players, so hair, skin, boots and build all vary.
    const squad = engine.players.filter((p) => p.side === 0).slice(0, 8);
    const cols = Number(q.get('cols') ?? 8);
    const rows = Number(q.get('rows') ?? 5);
    const mag = Number(q.get('mag') ?? 1);
    let raf = 0;
    let t = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = timeOfDay === 'Night' ? '#0C2A16' : '#1A5C28';
      ctx.fillRect(0, 0, cw, ch);

      const cellW = cw / cols;
      const cellH = ch / rows;
      cam.resize(cw, ch);

      // Place the row of players just in front of a fixed camera position.
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p = squad[c % squad.length];
          const speeds = [0, 1.6, 4.2, 7.5, 7.5];
          const speed = speeds[Math.min(r, speeds.length - 1)];
          const facing = (c / cols) * Math.PI * 2;
          const clone: MatchPlayer = {
            ...p,
            pos: { x: 55, y: 36 },
            vel: { x: Math.cos(facing) * speed, y: Math.sin(facing) * speed },
            facing,
            stamina: r === 4 ? 18 : 90,
            animation: r === 4 ? 'celebrate' : speed > 5 ? 'sprint' : speed > 0.5 ? 'run' : 'idle',
          };
          advancePhases([clone], dt);

          // Frame this one cell: park the camera 6 m away at chest height.
          cam.reset();
          cam.update({ x: 55, y: 36 }, { x: 0, y: 0 }, 1, 1);
          const proj = cam.project(55, 36, 0);
          // Shift the projection into the cell, and optionally blow it up —
          // magnifying the canvas transform scales stroke widths too, so what
          // you inspect is exactly what the match camera draws.
          ctx.save();
          ctx.translate((c + 0.5) * cellW, (r + 0.9) * cellH);
          ctx.scale(mag, mag);
          ctx.translate(-proj.x, -proj.y);
          drawPlayer(ctx, cam, clone, kitFor(team, p.isGK, false), {
            controlled: false,
            night: timeOfDay === 'Night',
            atmos,
            weather,
            captain: c === 0,
            time: t,
          });
          ctx.restore();
        }
      }

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ['idle', 'walk', 'run', 'sprint', 'celebrate + tired'].forEach((label, i) => {
        ctx.fillText(label, 8, (i + 0.2) * cellH + 14);
      });
      void engine;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

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
      (window as unknown as { __cam: unknown }).__cam = r.camera;
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
  <StrictMode>{rig ? <ModelSheet /> : <Preview />}</StrictMode>,
);
