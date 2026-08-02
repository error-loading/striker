import { PITCH } from '../engine/constants';
import { clamp, lerp, type Vec2 } from '../engine/math';
import type { CameraMode } from '../data/types';

const L = PITCH.length;
const W = PITCH.width;

export interface Projected {
  x: number;
  y: number;
  /** Depth along the view axis, in metres. Used for scaling and culling. */
  d: number;
  /** Pixels-per-metre at this depth. */
  scale: number;
  visible: boolean;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface ModeConfig {
  /** Focal length as a multiple of viewport width. */
  fov: number;
  /** How far ahead of the ball the camera looks, along its velocity. */
  lead: number;
  /** Smoothing, per second. */
  damping: number;
  /**
   * Where the camera sits and what it looks at, both in world metres.
   * `lookX`/`lookY` are the ball position after leading and clamping.
   */
  place: (lookX: number, lookY: number, attackDir: number) => { pos: Vec3; target: Vec3 };
}

const MODES: Record<CameraMode, ModeConfig> = {
  // Default: raised touchline camera, angled down at the play.
  Isometric: {
    fov: 0.72,
    lead: 0.5,
    damping: 3.4,
    place: (lx) => ({ pos: { x: lx, y: -28, z: 20 }, target: { x: lx, y: W / 2, z: 0 } }),
  },
  // Higher and further back — the classic televised angle.
  Broadcast: {
    fov: 0.86,
    lead: 0.7,
    damping: 2.6,
    place: (lx) => ({ pos: { x: lx, y: -38, z: 29 }, target: { x: lx, y: W / 2 + 2, z: 0 } }),
  },
  // Low camera trailing the ball, looking toward the goal under attack.
  'Behind Ball': {
    fov: 0.8,
    lead: 0.25,
    damping: 4.2,
    place: (lx, ly, dir) => ({
      pos: { x: lx - dir * 21, y: ly - 4, z: 8.5 },
      target: { x: lx + dir * 14, y: ly * 0.6 + (W / 2) * 0.4, z: 1.4 },
    }),
  },
  // Fixed behind the goal being attacked.
  'End to End': {
    fov: 0.9,
    lead: 0.15,
    damping: 2.4,
    place: (lx, ly, dir) => ({
      pos: { x: dir > 0 ? L + 26 : -26, y: W / 2, z: 19 },
      target: { x: lx, y: ly * 0.5 + (W / 2) * 0.5, z: 0 },
    }),
  },
  // Near top-down, for reading shape.
  Tactical: {
    fov: 1.5,
    lead: 0.2,
    damping: 3,
    place: (lx) => {
      // Bias toward the centre so the whole shape stays framed.
      const cx = L / 2 + (lx - L / 2) * 0.3;
      return { pos: { x: cx, y: W / 2 - 34, z: 76 }, target: { x: cx, y: W / 2, z: 0 } };
    },
  },
};

const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
function normalize3(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/**
 * Pinhole look-at camera. World points are resolved onto the camera's
 * forward / right / up basis and divided by depth, so straight lines stay
 * straight and the pitch foreshortens correctly toward the far touchline.
 */
export class Camera {
  mode: CameraMode = 'Isometric';
  width = 1280;
  height = 720;

  private pos: Vec3 = { x: L / 2, y: -28, z: 20 };
  private target: Vec3 = { x: L / 2, y: W / 2, z: 0 };
  private fwd: Vec3 = { x: 0, y: 1, z: 0 };
  private right: Vec3 = { x: 1, y: 0, z: 0 };
  private up: Vec3 = { x: 0, y: 0, z: 1 };
  private focal = 1000;
  private cx = 640;
  private cy = 360;
  private initialised = false;

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /**
   * Move the camera for this frame.
   * @param attackDir +1 or -1, the direction the user's team attacks.
   */
  update(ball: Vec2, ballVel: Vec2, attackDir: number, dt: number) {
    const cfg = MODES[this.mode];
    const lookX = clamp(ball.x + ballVel.x * cfg.lead, 10, L - 10);
    const lookY = clamp(ball.y + ballVel.y * cfg.lead, 8, W - 8);
    const { pos, target } = cfg.place(lookX, lookY, attackDir);

    if (!this.initialised) {
      this.pos = { ...pos };
      this.target = { ...target };
      this.initialised = true;
    } else {
      const t = 1 - Math.exp(-cfg.damping * dt);
      this.pos = {
        x: lerp(this.pos.x, pos.x, t),
        y: lerp(this.pos.y, pos.y, t),
        z: lerp(this.pos.z, pos.z, t),
      };
      this.target = {
        x: lerp(this.target.x, target.x, t),
        y: lerp(this.target.y, target.y, t),
        z: lerp(this.target.z, target.z, t),
      };
    }

    this.fwd = normalize3(sub3(this.target, this.pos));
    // World up is +z; guard against a perfectly vertical view.
    const worldUp: Vec3 = Math.abs(this.fwd.z) > 0.999 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
    this.right = normalize3(cross3(this.fwd, worldUp));
    this.up = cross3(this.right, this.fwd);

    // Focal length is driven by width but clamped by height so very wide or
    // very short viewports still frame the pitch sensibly.
    this.focal = Math.min(this.width * cfg.fov, this.height * cfg.fov * 1.9);
    this.cx = this.width / 2;
    this.cy = this.height / 2;
  }

  /** Snap to the target immediately (used on scene or mode changes). */
  reset() {
    this.initialised = false;
  }

  /** Project a world point (metres, z up) to screen space. */
  project(x: number, y: number, z = 0): Projected {
    const rx = x - this.pos.x;
    const ry = y - this.pos.y;
    const rz = z - this.pos.z;
    const d = rx * this.fwd.x + ry * this.fwd.y + rz * this.fwd.z;
    if (d <= 0.6) return { x: 0, y: 0, d, scale: 0, visible: false };
    const lat = rx * this.right.x + ry * this.right.y + rz * this.right.z;
    const vert = rx * this.up.x + ry * this.up.y + rz * this.up.z;
    const s = this.focal / d;
    return { x: this.cx + lat * s, y: this.cy - vert * s, d, scale: s, visible: true };
  }

  /** True if any of the given projected points land inside the viewport. */
  anyVisible(pts: Projected[], pad = 200): boolean {
    for (const p of pts) {
      if (!p.visible) continue;
      if (p.x > -pad && p.x < this.width + pad && p.y > -pad && p.y < this.height + pad) return true;
    }
    return false;
  }

  get position(): Vec3 {
    return this.pos;
  }
}
