import type { CameraMode, Stadium } from '../data/types';
import { PITCH, TIMING } from '../engine/constants';
import type { MatchEngine } from '../engine/engine';
import { getStadium } from '../data/stadiums';
import { atmosphereFor, type Atmosphere } from './atmosphere';
import { Camera } from './camera';
import { advancePhases, drawBall, drawOffsideLine, drawPlayer, kitFor, type KitColors } from './entities';
import { drawCornerFlags, drawGoals, drawGrass, drawLighting, drawMarkings, pitchTheme } from './pitch';
import { StadiumScene } from './stadium';
import { drawSky, WeatherSystem } from './weather';

export interface RendererOptions {
  showNames: boolean;
  showOffsideLine: boolean;
  cameraMode: CameraMode;
}

/** Owns the canvas and composites one frame of the match. */
export class MatchRenderer {
  camera = new Camera();
  private weather = new WeatherSystem();
  private scene: StadiumScene;
  private stadium: Stadium;
  private night: boolean;
  private atmos: Atmosphere;
  private kits: [KitColors[], KitColors[]] = [[], []];
  private time = 0;
  private dpr = 1;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private engine: MatchEngine,
  ) {
    this.stadium = getStadium(engine.settings.stadiumId);
    this.night = engine.settings.timeOfDay === 'Night';
    this.atmos = atmosphereFor(this.night, engine.settings.weather);
    this.scene = new StadiumScene(this.stadium, this.night, {
      atmosphere: this.atmos,
      homeColor: engine.home.team.primaryColor,
      awayColor: engine.away.team.secondaryColor,
    });
    this.buildKits();
  }

  private buildKits() {
    // Home wear their first strip; away switch to their secondary to avoid a clash.
    for (const side of [0, 1] as const) {
      const setup = side === 0 ? this.engine.home : this.engine.away;
      const players = this.engine.players.filter((p) => p.side === side);
      this.kits[side] = players.map((p) => kitFor(setup.team, p.isGK, side === 1));
    }
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    this.dpr = dpr;
    const canvas = this.ctx.canvas;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    this.camera.resize(cssWidth, cssHeight);
    this.weather.setWeather(this.engine.settings.weather, cssWidth, cssHeight);
  }

  setCameraMode(mode: CameraMode) {
    if (this.camera.mode !== mode) {
      this.camera.mode = mode;
      this.camera.reset();
    }
  }

  draw(dt: number, opts: RendererOptions) {
    const ctx = this.ctx;
    const e = this.engine;
    const w = this.camera.width;
    const h = this.camera.height;
    this.time += dt;

    this.setCameraMode(opts.cameraMode);
    this.camera.update(e.ball.pos, e.ball.vel, e.attackDir(e.userSide), dt);
    advancePhases(e.players, dt);
    this.weather.update(dt, w, h);

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;

    // Pan the star field against the camera's position along the touchline, so
    // the sky stays put in the world while the camera tracks the ball.
    drawSky(ctx, w, h, this.night, e.settings.weather, this.time, this.camera.position.x / PITCH.length);

    // Excitement drives crowd animation: momentum toward either goal, plus a
    // spike right after a goal is scored.
    const excitement = Math.min(1, Math.abs(e.momentum) * 0.7 + (e.phase === 'goal' ? 1 : 0));
    this.scene.draw(ctx, this.camera, this.time, excitement);

    const theme = pitchTheme(this.night, e.settings.weather);
    // The surround follows the stadium's rounded ring, so it has to come from
    // the bowl rather than being a rectangle the pitch draws for itself.
    this.scene.drawSurround(ctx, this.camera, theme.surround);
    drawGrass(ctx, this.camera, theme);
    drawMarkings(ctx, this.camera);

    if (opts.showOffsideLine && e.phase === 'play') {
      const owner = e.ball.owner;
      if (owner && owner.side === e.userSide) {
        drawOffsideLine(ctx, this.camera, this.offsideLineX());
      }
    }

    drawGoals(ctx, this.camera, this.night, this.atmos);
    drawCornerFlags(ctx, this.camera, this.time);

    // Depth-sorted entity pass so nearer players occlude further ones.
    type Item = { d: number; draw: () => void };
    const items: Item[] = [];
    const sides: [number, number] = [0, 0];
    for (const p of e.players) {
      if (!p.onPitch) continue;
      const idx = sides[p.side]++;
      const kit = this.kits[p.side][idx] ?? this.kits[p.side][0];
      const proj = this.camera.project(p.pos.x, p.pos.y, 0);
      if (!proj.visible) continue;
      const controlled = p.id === e.controlledId && p.side === e.userSide;
      items.push({
        d: proj.d,
        draw: () =>
          drawPlayer(ctx, this.camera, p, kit, {
            controlled,
            night: this.night,
            showName: opts.showNames || controlled,
            atmos: this.atmos,
          }),
      });
    }
    const bp = this.camera.project(e.ball.pos.x, e.ball.pos.y, 0);
    if (bp.visible) {
      items.push({ d: bp.d - 0.01, draw: () => drawBall(ctx, this.camera, e.ball, this.night, this.atmos) });
    }
    items.sort((a, b) => b.d - a.d);
    for (const it of items) it.draw();

    drawLighting(ctx, this.camera, this.night, w, h, this.scene.rigPositions());
    this.weather.draw(ctx, w, h, this.night);

    // Goal flash: a bright bloom that decays over the first moments of the celebration.
    if (e.phase === 'goal') {
      const age = TIMING.goalCelebration - e.restartTimer;
      const alpha = Math.max(0, 0.6 - age * 1.1);
      if (alpha > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    ctx.restore();
  }

  /** x of the second-last defender for the user's opponents. */
  private offsideLineX(): number {
    const e = this.engine;
    const opp = e.userSide === 0 ? 1 : 0;
    const dir = e.attackDir(e.userSide);
    const xs = e.players
      .filter((p) => p.side === opp && p.onPitch)
      .map((p) => p.pos.x)
      .sort((a, b) => (dir > 0 ? b - a : a - b));
    const line = xs[1] ?? xs[0] ?? PITCH.length / 2;
    // Only meaningful in the attacking half.
    return dir > 0 ? Math.max(line, PITCH.length / 2) : Math.min(line, PITCH.length / 2);
  }
}
