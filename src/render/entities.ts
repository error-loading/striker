import type { Team } from '../data/types';
import { PITCH } from '../engine/constants';
import type { Ball, MatchPlayer } from '../engine/types';
import { shadowOffset, type Atmosphere } from './atmosphere';
import type { Camera } from './camera';
import { contrastText, shade, worldLine } from './draw';

const PLAYER_HEIGHT = 1.86;

export interface KitColors {
  shirt: string;
  shorts: string;
  trim: string;
  text: string;
}

export function kitFor(team: Team, isGK: boolean, isAway: boolean): KitColors {
  if (isGK) {
    // Keepers wear a contrasting strip so they read instantly.
    const shirt = shade(team.accentColor, 0.25);
    return { shirt, shorts: shade(shirt, -0.3), trim: '#111827', text: contrastText(shirt) };
  }
  const shirt = isAway ? team.secondaryColor : team.primaryColor;
  const shorts = isAway ? team.primaryColor : team.secondaryColor;
  return {
    shirt,
    shorts: shorts === shirt ? shade(shirt, -0.35) : shorts,
    trim: team.accentColor,
    text: contrastText(shirt),
  };
}

/** Per-player animation phases, keyed by player id. */
const runPhase = new Map<string, number>();

export function advancePhases(players: MatchPlayer[], dt: number) {
  for (const p of players) {
    const speed = Math.hypot(p.vel.x, p.vel.y);
    const prev = runPhase.get(p.id) ?? 0;
    runPhase.set(p.id, prev + dt * (1.2 + speed * 1.5));
  }
}

/**
 * Draw a footballer as a depth-scaled billboard: shadow, legs with a run
 * cycle, torso in the kit colours, shirt number, and head.
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  p: MatchPlayer,
  kit: KitColors,
  opts: { controlled: boolean; night: boolean; showName: boolean; atmos: Atmosphere },
) {
  const base = cam.project(p.pos.x, p.pos.y, 0);
  const head = cam.project(p.pos.x, p.pos.y, PLAYER_HEIGHT);
  if (!base.visible || !head.visible) return;
  if (base.x < -120 || base.x > cam.width + 120) return;

  const h = base.y - head.y;
  if (h < 3) return;
  const w = h * 0.42;
  const phase = runPhase.get(p.id) ?? 0;
  const speed = Math.hypot(p.vel.x, p.vel.y);
  const stride = Math.min(1, speed / 7);

  // Cast shadow. Thrown away from the key light and stretched along its
  // direction, so the whole team's shadows agree with the floodlights.
  const off = shadowOffset(opts.atmos, PLAYER_HEIGHT * 0.55);
  const tip = cam.project(p.pos.x + off.dx, p.pos.y + off.dy, 0);
  ctx.save();
  ctx.globalAlpha = opts.night ? 0.42 : 0.3;
  ctx.fillStyle = '#04121F';
  if (tip.visible) {
    const dx = tip.x - base.x;
    const dy = tip.y - base.y;
    const len = Math.hypot(dx, dy);
    ctx.beginPath();
    ctx.ellipse(
      base.x + dx * 0.5,
      base.y + dy * 0.5,
      Math.max(w * 0.34, len * 0.5 + w * 0.3),
      w * 0.24,
      Math.atan2(dy, dx),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, w * 0.62, w * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Selection ring for the player under control.
  if (opts.controlled) {
    ctx.save();
    ctx.strokeStyle = '#00D9FF';
    ctx.lineWidth = Math.max(1.5, h * 0.045);
    ctx.shadowColor = '#00D9FF';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, w * 0.8, w * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const legH = h * 0.42;
  const torsoH = h * 0.36;
  const headR = h * 0.115;
  const swing = Math.sin(phase * 2.6) * stride;

  // Legs.
  ctx.fillStyle = kit.shorts;
  const legW = w * 0.24;
  for (const side of [-1, 1]) {
    const off = side * (w * 0.16) + swing * side * w * 0.34;
    ctx.fillRect(base.x + off - legW / 2, base.y - legH, legW, legH);
  }
  // Socks.
  ctx.fillStyle = shade(kit.shirt, -0.25);
  for (const side of [-1, 1]) {
    const off = side * (w * 0.16) + swing * side * w * 0.34;
    ctx.fillRect(base.x + off - legW / 2, base.y - legH * 0.38, legW, legH * 0.38);
  }

  // Torso.
  const torsoY = base.y - legH - torsoH;
  const torsoW = w * 0.72;
  ctx.fillStyle = kit.shirt;
  ctx.beginPath();
  ctx.moveTo(base.x - torsoW / 2, torsoY + torsoH);
  ctx.lineTo(base.x - torsoW / 2 - w * 0.04, torsoY + torsoH * 0.15);
  ctx.lineTo(base.x - torsoW * 0.3, torsoY);
  ctx.lineTo(base.x + torsoW * 0.3, torsoY);
  ctx.lineTo(base.x + torsoW / 2 + w * 0.04, torsoY + torsoH * 0.15);
  ctx.lineTo(base.x + torsoW / 2, torsoY + torsoH);
  ctx.closePath();
  ctx.fill();

  // Sleeve trim.
  ctx.fillStyle = kit.trim;
  ctx.fillRect(base.x - torsoW / 2 - w * 0.05, torsoY + torsoH * 0.12, w * 0.11, torsoH * 0.3);
  ctx.fillRect(base.x + torsoW / 2 - w * 0.06, torsoY + torsoH * 0.12, w * 0.11, torsoH * 0.3);

  // Shirt number, once the player is big enough on screen to read it.
  if (h > 26) {
    ctx.fillStyle = kit.text;
    ctx.font = `700 ${Math.round(h * 0.17)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.number), base.x, torsoY + torsoH * 0.52);
  }

  // Head.
  ctx.fillStyle = '#C68A62';
  ctx.beginPath();
  ctx.arc(base.x, torsoY - headR * 0.85, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#231A16';
  ctx.beginPath();
  ctx.arc(base.x, torsoY - headR * 1.05, headR * 0.92, Math.PI, Math.PI * 2);
  ctx.fill();

  // Name plate above the controlled player, or when explicitly requested.
  if (opts.showName && h > 20) {
    const label = p.lastName.toUpperCase();
    ctx.font = `700 ${Math.max(9, Math.round(h * 0.13))}px Inter, system-ui, sans-serif`;
    const tw = ctx.measureText(label).width;
    const ty = torsoY - headR * 2.4;
    ctx.fillStyle = 'rgba(5,11,24,0.78)';
    ctx.fillRect(base.x - tw / 2 - 5, ty - 12, tw + 10, 16);
    ctx.fillStyle = opts.controlled ? '#00D9FF' : '#E8E8E8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, base.x, ty - 4);

    // Stamina bar under the name.
    const barW = tw + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(base.x - barW / 2, ty + 5, barW, 3);
    const st = p.stamina / 100;
    ctx.fillStyle = st > 0.5 ? '#4ADE80' : st > 0.25 ? '#FFD700' : '#FF4444';
    ctx.fillRect(base.x - barW / 2, ty + 5, barW * st, 3);
  }
}

export function drawBall(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ball: Ball,
  night: boolean,
  atmos: Atmosphere,
) {
  const p = cam.project(ball.pos.x, ball.pos.y, ball.z + 0.11);
  // The shadow tracks the light, so a lofted ball's shadow runs ahead of it on
  // the grass instead of sitting glued underneath.
  const off = shadowOffset(atmos, ball.z);
  const ground = cam.project(ball.pos.x + off.dx, ball.pos.y + off.dy, 0);
  if (!p.visible || !ground.visible) return;

  // Shadow spreads and fades as the ball rises.
  const lift = Math.min(1, ball.z / 6);
  ctx.save();
  ctx.globalAlpha = (night ? 0.5 : 0.34) * (1 - lift * 0.6);
  ctx.fillStyle = '#04121F';
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, ground.scale * 0.14 * (1 + lift), ground.scale * 0.06 * (1 + lift), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const r = Math.max(1.6, p.scale * 0.115);

  // Motion trail on a struck ball.
  const speed = Math.hypot(ball.vel.x, ball.vel.y);
  if (speed > 14) {
    const back = cam.project(
      ball.pos.x - ball.vel.x * 0.045,
      ball.pos.y - ball.vel.y * 0.045,
      Math.max(0, ball.z - ball.vz * 0.045) + 0.11,
    );
    if (back.visible) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = r * 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(back.x, back.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.72, '#E9EEF4');
  g.addColorStop(1, '#A8B4C4');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Panel hint, only when the ball is large enough to warrant it.
  if (r > 3.4) {
    ctx.fillStyle = 'rgba(20,30,48,0.72)';
    ctx.beginPath();
    ctx.arc(p.x + r * 0.1, p.y - r * 0.05, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Live offside line for the attacking team, as broadcast graphics show it. */
export function drawOffsideLine(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  color = 'rgba(0,217,255,0.55)',
) {
  worldLine(ctx, cam, x, 0, x, PITCH.width, 0.16, color);
}
