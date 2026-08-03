import { useEffect, useMemo, useRef, useState } from 'react';
import { createAttractMatch } from '../engine/createMatch';
import { useMatchLoop } from '../hooks/useMatchLoop';
import type { CameraMode } from '../data/types';

const CAMERA_CYCLE: CameraMode[] = ['Broadcast', 'Sideline', 'Behind Ball', 'End to End'];

/**
 * A live CPU-vs-CPU match rendered behind the menus — the "gameplay highlight
 * loop" from the brief, driven by the real engine rather than a video file.
 */
export default function AttractBackground({ opacity = 0.5 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>('Broadcast');
  const engine = useMemo(() => createAttractMatch(Math.floor(Math.random() * 1000)), []);

  // Cut between camera angles like a broadcast director.
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % CAMERA_CYCLE.length;
      setCameraMode(CAMERA_CYCLE[i]);
    }, 9000);
    return () => clearInterval(id);
  }, []);

  useMatchLoop(canvasRef, engine, {
    cameraMode,
    showNames: false,
    showOffsideLine: false,
    paused: false,
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <canvas ref={canvasRef} className="h-full w-full" style={{ opacity }} />
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950/85 via-navy-950/55 to-navy-950" />
      <div className="absolute inset-0 bg-gradient-to-r from-navy-950 via-transparent to-navy-950/80" />
    </div>
  );
}
