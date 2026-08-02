import type { Weather } from '../data/types';
import { Rng } from '../engine/math';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  /** Parallax layer, 0 = far, 1 = near. */
  depth: number;
}

/** Screen-space precipitation. Cheap, and reads well over the pitch. */
export class WeatherSystem {
  private particles: Particle[] = [];
  private kind: Weather = 'Clear';
  private rng = new Rng(0x51ee);
  private w = 0;
  private h = 0;

  setWeather(kind: Weather, width: number, height: number) {
    if (this.kind === kind && this.w === width && this.h === height) return;
    this.kind = kind;
    this.w = width;
    this.h = height;
    this.particles = [];
    const count = kind === 'Rainy' ? 420 : kind === 'Snowy' ? 300 : 0;
    for (let i = 0; i < count; i++) this.particles.push(this.spawn(true));
  }

  private spawn(anywhere: boolean): Particle {
    const depth = this.rng.range(0.25, 1);
    if (this.kind === 'Snowy') {
      return {
        x: this.rng.range(-40, this.w + 40),
        y: anywhere ? this.rng.range(0, this.h) : -10,
        vx: this.rng.range(-18, 18) * depth,
        vy: this.rng.range(28, 62) * depth,
        size: this.rng.range(1.4, 3.6) * depth,
        depth,
      };
    }
    return {
      x: this.rng.range(-80, this.w + 80),
      y: anywhere ? this.rng.range(0, this.h) : -20,
      vx: this.rng.range(-90, -40) * depth,
      vy: this.rng.range(620, 900) * depth,
      size: this.rng.range(7, 17) * depth,
      depth,
    };
  }

  update(dt: number, width: number, height: number) {
    this.w = width;
    this.h = height;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (this.kind === 'Snowy') p.x += Math.sin((p.y + p.depth * 100) * 0.02) * 12 * dt;
      if (p.y > height + 20 || p.x < -100 || p.x > width + 100) this.particles[i] = this.spawn(false);
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, night: boolean) {
    if (this.kind === 'Clear') return;

    if (this.kind === 'Foggy') {
      // Two drifting bands read as depth-dependent haze.
      const g = ctx.createLinearGradient(0, height * 0.15, 0, height);
      g.addColorStop(0, night ? 'rgba(150,168,190,0.42)' : 'rgba(214,224,235,0.5)');
      g.addColorStop(0.55, night ? 'rgba(150,168,190,0.2)' : 'rgba(214,224,235,0.26)');
      g.addColorStop(1, 'rgba(200,214,230,0.06)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      return;
    }

    ctx.save();
    if (this.kind === 'Rainy') {
      ctx.strokeStyle = night ? 'rgba(190,215,255,0.42)' : 'rgba(225,238,255,0.5)';
      ctx.lineCap = 'round';
      for (const p of this.particles) {
        ctx.lineWidth = p.depth * 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.size);
        ctx.stroke();
      }
      // Overall wet-weather cast.
      ctx.fillStyle = night ? 'rgba(20,40,70,0.18)' : 'rgba(120,150,185,0.14)';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const p of this.particles) {
        ctx.globalAlpha = 0.35 + p.depth * 0.55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(226,238,250,0.12)';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }
}

/** Sky backdrop behind the stands. */
export function drawSky(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  night: boolean,
  weather: Weather,
) {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  if (night) {
    g.addColorStop(0, '#03060F');
    g.addColorStop(0.55, '#071026');
    g.addColorStop(1, '#0A1830');
  } else if (weather === 'Rainy') {
    g.addColorStop(0, '#3F4C5C');
    g.addColorStop(0.6, '#5D6B7C');
    g.addColorStop(1, '#7C8896');
  } else if (weather === 'Snowy') {
    g.addColorStop(0, '#8D9BAB');
    g.addColorStop(0.6, '#B6C3D0');
    g.addColorStop(1, '#D7E1EA');
  } else if (weather === 'Foggy') {
    g.addColorStop(0, '#8F9CA8');
    g.addColorStop(0.6, '#AEB9C4');
    g.addColorStop(1, '#C6CFD8');
  } else {
    g.addColorStop(0, '#2E6FA8');
    g.addColorStop(0.5, '#63A2CE');
    g.addColorStop(1, '#A8CBE4');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}
