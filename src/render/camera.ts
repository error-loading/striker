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

/** A world point on the camera's own axes: lateral, vertical, and depth. */
export interface ViewPoint {
  lat: number;
  vert: number;
  d: number;
}

/** Near plane, in metres. Nothing closer than this can be drawn. */
const NEAR = 0.6;

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

const DEG = Math.PI / 180;

/**
 * A camera mounted on the near-side gantry, the way a broadcast main camera is
 * rigged: a fixed elevation above the pitch, a fixed slant range to whatever it
 * is aiming at, and a pan that tracks the ball.
 *
 * `track` is how much of the ball's lateral position the aim point inherits. At
 * 0 the camera always stares at the middle of the pitch and play on the near
 * touchline falls out of the bottom of frame; at 1 it follows the ball across
 * and the pitch appears to slide. Real gantry operators sit in between.
 */
function gantry(elevation: number, distance: number, track: number, aimHeight = 1.2) {
  const el = elevation * DEG;
  const ground = Math.cos(el) * distance;
  const height = Math.sin(el) * distance;
  return (lx: number, ly: number) => {
    const aimY = W / 2 + (ly - W / 2) * track;
    return {
      pos: { x: lx, y: aimY - ground, z: height },
      target: { x: lx, y: aimY, z: aimHeight },
    };
  };
}

const MODES: Record<CameraMode, ModeConfig> = {
  // Default gameplay camera: the broadcast gantry, tight enough that players
  // read as players. Roughly a 27 degree look-down.
  Sideline: {
    fov: 0.74,
    lead: 0.5,
    damping: 3.4,
    place: gantry(24, 80, 0.5),
  },
  // The wide televised angle — higher and further back, framing the whole
  // pitch including both penalty areas when play is central.
  Broadcast: {
    fov: 0.8,
    lead: 0.7,
    damping: 2.6,
    place: gantry(31, 92, 0.34),
  },
  // Low camera trailing the ball, looking toward the goal under attack.
  'Behind Ball': {
    fov: 0.8,
    lead: 0.25,
    damping: 4.2,
    place: (lx, ly, dir) => ({
      pos: { x: lx - dir * 23, y: ly - 5, z: 10.5 },
      target: { x: lx + dir * 14, y: ly * 0.6 + (W / 2) * 0.4, z: 1.6 },
    }),
  },
  // Fixed behind the goal being attacked.
  'End to End': {
    fov: 0.9,
    lead: 0.15,
    damping: 2.4,
    place: (lx, ly, dir) => ({
      pos: { x: dir > 0 ? L + 32 : -32, y: W / 2, z: 24 },
      target: { x: lx, y: ly * 0.5 + (W / 2) * 0.5, z: 1 },
    }),
  },
  // Near top-down, for reading shape. `fov` is a focal length, so it has to go
  // *down* to widen the view — the whole point of this mode is seeing the
  // block of players, and a long lens shows a handful of them.
  Tactical: {
    fov: 0.6,
    lead: 0.2,
    damping: 3,
    place: (lx) => {
      // Bias toward the centre so the whole shape stays framed.
      const cx = L / 2 + (lx - L / 2) * 0.3;
      return { pos: { x: cx, y: W / 2 - 40, z: 92 }, target: { x: cx, y: W / 2, z: 0 } };
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
  mode: CameraMode = 'Sideline';
  width = 1280;
  height = 720;

  private pos: Vec3 = { x: L / 2, y: -28, z: 20 };
  private target: Vec3 = { x: L / 2, y: W / 2, z: 1.2 };
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
    //
    // The lower bound is what stops a tall or near-square viewport turning into
    // a fisheye: widen the vertical field far enough and the bottom-of-frame ray
    // dips below the gantry, so the camera ends up looking down onto the roof of
    // the very stand it is mounted in. On a normal 16:9 window it never binds.
    this.focal = Math.max(
      this.height * 1.25,
      Math.min(this.width * cfg.fov, this.height * cfg.fov * 1.9),
    );
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
    if (d <= NEAR) return { x: 0, y: 0, d, scale: 0, visible: false };
    const lat = rx * this.right.x + ry * this.right.y + rz * this.right.z;
    const vert = rx * this.up.x + ry * this.up.y + rz * this.up.z;
    const s = this.focal / d;
    return { x: this.cx + lat * s, y: this.cy - vert * s, d, scale: s, visible: true };
  }

  /**
   * World point resolved onto the camera basis, before the divide by depth.
   * Polygons are clipped here rather than in screen space, so a face with one
   * vertex behind the lens is trimmed instead of dropped.
   */
  view(x: number, y: number, z: number): ViewPoint {
    const rx = x - this.pos.x;
    const ry = y - this.pos.y;
    const rz = z - this.pos.z;
    return {
      lat: rx * this.right.x + ry * this.right.y + rz * this.right.z,
      vert: rx * this.up.x + ry * this.up.y + rz * this.up.z,
      d: rx * this.fwd.x + ry * this.fwd.y + rz * this.fwd.z,
    };
  }

  /** Screen position of an already-resolved view point. */
  fromView(v: ViewPoint): { x: number; y: number } {
    const s = this.focal / Math.max(NEAR, v.d);
    return { x: this.cx + v.lat * s, y: this.cy - v.vert * s };
  }

  get near(): number {
    return NEAR;
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
