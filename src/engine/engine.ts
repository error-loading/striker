import type { Formation, Player, Team } from '../data/types';
import { POSITION_GROUP } from '../data/types';
import { DIFFICULTY, GOAL_Y_MAX, GOAL_Y_MIN, PHYS, PITCH, TIMING, WEATHER } from './constants';
import {
  angleDiff,
  angleOf,
  clamp,
  dist,
  fromAngle,
  len,
  norm,
  Rng,
  rotateToward,
  scale,
  sub,
  vec,
  type Vec2,
} from './math';
import {
  emptyInput,
  emptyStats,
  type Ball,
  type InputState,
  type MatchEvent,
  type MatchPhase,
  type MatchPlayer,
  type MatchSettings,
  type Side,
  type TeamStats,
} from './types';

const L = PITCH.length;
const W = PITCH.width;
const HALF_SECONDS = 45 * 60;
const FULL_SECONDS = 90 * 60;

export interface TeamSetup {
  team: Team;
  formation: Formation;
  /** Exactly 11 players, index-aligned to `formation.slots`. */
  starters: Player[];
  bench: Player[];
}

const lastNameOf = (name: string): string => {
  const parts = name.split(' ');
  return parts.length === 1 ? name : parts.slice(1).join(' ');
};

export class MatchEngine {
  readonly home: TeamSetup;
  readonly away: TeamSetup;
  readonly settings: MatchSettings;

  players: MatchPlayer[] = [];
  ball: Ball;
  phase: MatchPhase = 'kickoff';
  /** 1 or 2. */
  half = 1;
  /** Simulated match clock in seconds, 0..5400. */
  gameTime = 0;
  stats: [TeamStats, TeamStats] = [emptyStats(), emptyStats()];
  events: MatchEvent[] = [];
  /** Side that gets the ball when play restarts. */
  restartSide: Side = 0;
  restartTimer = 0;
  restartSpot: Vec2 = vec(L / 2, W / 2);
  /** Player designated to take the current restart. */
  restartTaker: MatchPlayer | null = null;

  /** Index into `players` of the user-controlled footballer. */
  controlledId = '';
  userSide: Side = 0;
  input: InputState = emptyInput();
  /** 0..1 shot charge, surfaced to the HUD as a power bar. */
  shotCharge = 0;
  /** Transient banner text, e.g. "GOAL!", "OFFSIDE". */
  flash: { text: string; sub: string; until: number } | null = null;
  /** Momentum drives crowd noise: -1 away, +1 home. */
  momentum = 0;
  /** Set on a goal so the UI can run a celebration. */
  lastGoalSide: Side | null = null;
  /** When true both sides are AI-driven — used for the menu attract mode. */
  autoPlay = false;

  private rng: Rng;
  private prevBall: Vec2 = vec();
  private chaser: [MatchPlayer | null, MatchPlayer | null] = [null, null];
  private chaserTimer = 0;
  private elapsed = 0;
  private timeScale: number;
  private lastPasser: MatchPlayer | null = null;
  private subsUsed: [number, number] = [0, 0];
  /** Lockout so a single strike on the frame registers once. */
  private woodworkLock = 0;

  constructor(home: TeamSetup, away: TeamSetup, settings: MatchSettings) {
    this.home = home;
    this.away = away;
    this.settings = settings;
    this.rng = new Rng(settings.seed);
    this.timeScale = FULL_SECONDS / (settings.durationMinutes * 60);
    this.ball = {
      pos: vec(L / 2, W / 2),
      z: 0,
      vel: vec(),
      vz: 0,
      spin: 0,
      owner: null,
      lastTouch: null,
      lastTouchSide: null,
      passTarget: null,
      offsideFlagged: null,
      shotBy: null,
      shotOnTarget: false,
    };
    this.buildPlayers();
    this.setupKickoff(0);
  }

  /* ------------------------------------------------------------------ */
  /* Setup                                                               */
  /* ------------------------------------------------------------------ */

  private buildPlayers() {
    this.players = [];
    for (const side of [0, 1] as Side[]) {
      const setup = side === 0 ? this.home : this.away;
      setup.starters.forEach((p, i) => {
        const slot = setup.formation.slots[i];
        this.players.push(this.makePlayer(p, side, slot.x, slot.y, slot.position));
      });
    }
    this.controlledId = this.players.find((p) => p.side === this.userSide && !p.isGK)?.id ?? '';
  }

  private makePlayer(
    source: Player,
    side: Side,
    ax: number,
    ay: number,
    slotPosition: Player['position'],
  ): MatchPlayer {
    return {
      id: `${side}-${source.id}`,
      name: source.name,
      lastName: lastNameOf(source.name),
      number: source.number,
      side,
      slotPosition,
      group: POSITION_GROUP[slotPosition],
      isGK: slotPosition === 'GK',
      overall: source.overall,
      pace: source.pace,
      shooting: source.shooting,
      passing: source.passing,
      dribbling: source.dribbling,
      defending: source.defending,
      physical: source.physical,
      anchor: vec(ax, ay),
      pos: vec(L / 2, W / 2),
      vel: vec(),
      facing: side === 0 ? 0 : Math.PI,
      stamina: 100,
      touchCooldown: 0,
      tackleTimer: 0,
      tackleRecovery: 0,
      decisionTimer: 0,
      reactTimer: 0,
      targetPos: vec(L / 2, W / 2),
      yellowCards: 0,
      sentOff: false,
      onPitch: true,
      animation: 'idle',
      source,
    };
  }

  /** +1 if `side` is attacking toward increasing x this half. */
  attackDir(side: Side): number {
    const base = side === 0 ? 1 : -1;
    return this.half === 1 ? base : -base;
  }

  /** Centre of the goal `side` is attacking. */
  targetGoal(side: Side): Vec2 {
    return vec(this.attackDir(side) > 0 ? L : 0, W / 2);
  }

  /** Centre of the goal `side` is defending. */
  ownGoal(side: Side): Vec2 {
    return vec(this.attackDir(side) > 0 ? 0 : L, W / 2);
  }

  /** Convert a formation anchor into world coordinates for the current half. */
  private anchorWorld(p: MatchPlayer): Vec2 {
    const dir = this.attackDir(p.side);
    return dir > 0
      ? vec(p.anchor.x * L, p.anchor.y * W)
      : vec(L - p.anchor.x * L, W - p.anchor.y * W);
  }

  private setupKickoff(kickingSide: Side) {
    this.ball.pos = vec(L / 2, W / 2);
    this.ball.z = 0;
    this.ball.vel = vec();
    this.ball.vz = 0;
    this.ball.spin = 0;
    this.ball.owner = null;
    this.ball.passTarget = null;
    this.ball.offsideFlagged = null;

    for (const p of this.players) {
      if (!p.onPitch) continue;
      const a = this.anchorWorld(p);
      // Everyone starts in their own half for a kickoff.
      const dir = this.attackDir(p.side);
      let x = a.x;
      if (dir > 0) x = Math.min(x, L / 2 - 1.5);
      else x = Math.max(x, L / 2 + 1.5);
      p.pos = vec(x, a.y);
      p.vel = vec();
      p.targetPos = vec(x, a.y);
      p.facing = dir > 0 ? 0 : Math.PI;
      p.touchCooldown = 0;
    }

    // The kicking side puts two players on the centre spot.
    const takers = this.players
      .filter((p) => p.side === kickingSide && p.onPitch && !p.isGK)
      .sort((a, b) => dist(a.pos, this.ball.pos) - dist(b.pos, this.ball.pos))
      .slice(0, 2);
    if (takers[0]) {
      takers[0].pos = vec(L / 2 - this.attackDir(kickingSide) * 1.0, W / 2 + 0.4);
      this.restartTaker = takers[0];
    }
    if (takers[1]) takers[1].pos = vec(L / 2 - this.attackDir(kickingSide) * 2.2, W / 2 - 2.4);

    this.restartSide = kickingSide;
    this.phase = 'kickoff';
    this.restartTimer = TIMING.kickoffPause;
    if (this.userSide === kickingSide && takers[0]) this.controlledId = takers[0].id;
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  setInput(input: InputState) {
    this.input = input;
  }

  get controlled(): MatchPlayer | null {
    return this.players.find((p) => p.id === this.controlledId) ?? null;
  }

  get score(): [number, number] {
    return [this.stats[0].goals, this.stats[1].goals];
  }

  possessionPct(): [number, number] {
    const total = this.stats[0].possessionTime + this.stats[1].possessionTime;
    if (total < 1) return [50, 50];
    const h = Math.round((this.stats[0].possessionTime / total) * 100);
    return [h, 100 - h];
  }

  /** Whole minutes on the match clock, 0..90. */
  get displayMinute(): number {
    return Math.floor(this.gameTime / 60);
  }

  /** Swap a starter for a bench player. Returns false if the sub is illegal. */
  substitute(outId: string, inSource: Player): boolean {
    const out = this.players.find((p) => p.id === outId);
    if (!out || !out.onPitch || out.sentOff) return false;
    if (this.subsUsed[out.side] >= 5) return false;
    const replacement = this.makePlayer(
      inSource,
      out.side,
      out.anchor.x,
      out.anchor.y,
      out.slotPosition,
    );
    replacement.pos = { ...out.pos };
    replacement.targetPos = { ...out.pos };
    replacement.facing = out.facing;
    out.onPitch = false;
    if (this.ball.owner === out) this.ball.owner = replacement;
    this.players[this.players.indexOf(out)] = replacement;
    this.subsUsed[out.side]++;
    if (this.controlledId === outId) this.controlledId = replacement.id;
    this.log(out.side, 'sub', `${replacement.lastName} on for ${out.lastName}`);
    return true;
  }

  /** Re-shape a side mid-match; used by the half-time tactics screen. */
  applyFormation(side: Side, formation: Formation) {
    const squad = this.players.filter((p) => p.side === side && p.onPitch);
    squad.forEach((p, i) => {
      const slot = formation.slots[i];
      if (!slot) return;
      p.anchor = vec(slot.x, slot.y);
      p.slotPosition = slot.position;
      p.group = POSITION_GROUP[slot.position];
      p.isGK = slot.position === 'GK';
    });
  }

  beginSecondHalf() {
    this.half = 2;
    this.gameTime = HALF_SECONDS;
    for (const p of this.players) p.stamina = Math.min(100, p.stamina + 26);
    // Sides change ends, so the team that did not kick off starts the half.
    this.setupKickoff(1);
    this.log(0, 'half', 'Second half under way');
  }

  /* ------------------------------------------------------------------ */
  /* Main step                                                           */
  /* ------------------------------------------------------------------ */

  step(dt: number) {
    if (this.phase === 'halftime' || this.phase === 'fulltime') return;
    this.elapsed += dt;

    // The match clock runs through stoppages, as it does in real football —
    // only the interval and the final whistle stop it.
    this.gameTime += dt * this.timeScale;
    const running = this.phase === 'play';
    if (running) {
      const owner = this.ball.owner;
      if (owner) this.stats[owner.side].possessionTime += dt;
    }

    if (this.restartTimer > 0) {
      this.restartTimer -= dt;
      if (this.restartTimer <= 0) this.resumePlay();
    }

    this.chaserTimer -= dt;
    if (this.chaserTimer <= 0) {
      this.pickChasers();
      this.chaserTimer = 0.22;
    }

    this.prevBall = { ...this.ball.pos };

    this.updateControlSwitch();
    for (const p of this.players) {
      if (!p.onPitch) continue;
      this.updatePlayer(p, dt);
    }
    this.updateBall(dt);
    if (running) {
      // Boundaries first: a keeper's reach extends behind the goal line, so
      // contesting before this check would let them "save" a ball that has
      // already crossed it, cancelling goals and corners.
      this.checkBoundaries();
      if (this.phase === 'play') this.resolveContests(dt);
    }
    this.decayMomentum(dt);
    this.checkPeriodEnd();
  }

  private decayMomentum(dt: number) {
    const owner = this.ball.owner;
    if (owner) {
      const target = owner.side === 0 ? 1 : -1;
      this.momentum += (target - this.momentum) * dt * 0.28;
    } else {
      this.momentum *= 1 - dt * 0.2;
    }
  }

  private checkPeriodEnd() {
    if (this.half === 1 && this.gameTime >= HALF_SECONDS) {
      this.gameTime = HALF_SECONDS;
      this.phase = 'halftime';
      this.log(0, 'half', 'Half time');
    } else if (this.half === 2 && this.gameTime >= FULL_SECONDS) {
      this.gameTime = FULL_SECONDS;
      this.phase = 'fulltime';
      this.log(0, 'half', 'Full time');
    }
  }

  private resumePlay() {
    if (this.phase === 'goal') {
      // Concede, then the conceding side restarts from the centre.
      const conceding: Side = this.lastGoalSide === 0 ? 1 : 0;
      this.setupKickoff(conceding);
      return;
    }
    if (this.phase === 'kickoff' && this.restartTaker) {
      this.ball.owner = this.restartTaker;
      this.restartTaker.touchCooldown = 0;
    } else if (this.restartTaker) {
      this.ball.pos = { ...this.restartSpot };
      this.ball.vel = vec();
      this.ball.vz = 0;
      this.ball.z = 0;
      this.ball.owner = this.restartTaker;
      this.restartTaker.pos = { ...this.restartSpot };
      this.restartTaker.touchCooldown = 0;
    }
    this.ball.offsideFlagged = null;
    this.ball.passTarget = null;
    this.phase = 'play';
    if (this.restartTaker && this.restartTaker.side === this.userSide) {
      this.controlledId = this.restartTaker.id;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Player update                                                       */
  /* ------------------------------------------------------------------ */

  private weather() {
    return WEATHER[this.settings.weather] ?? WEATHER.Clear;
  }

  private difficulty() {
    return DIFFICULTY[this.settings.difficulty] ?? DIFFICULTY.Professional;
  }

  private maxSpeed(p: MatchPlayer, sprinting: boolean): number {
    const base = 4.9 + (p.pace / 99) * 3.5;
    const staminaFactor = 0.72 + 0.28 * (p.stamina / 100);
    let s = base * staminaFactor;
    if (sprinting) s *= 1.27;
    if (this.ball.owner === p) s *= 0.8 + (p.dribbling / 99) * 0.14;
    if (p.side !== this.userSide) s *= this.difficulty().aiSpeed;
    return s;
  }

  private updatePlayer(p: MatchPlayer, dt: number) {
    p.touchCooldown = Math.max(0, p.touchCooldown - dt);
    p.tackleRecovery = Math.max(0, p.tackleRecovery - dt);
    p.decisionTimer -= dt;
    p.reactTimer = Math.max(0, p.reactTimer - dt);
    if (p.tackleTimer > 0) p.tackleTimer -= dt;

    const isUser = !this.autoPlay && p.id === this.controlledId && p.side === this.userSide;
    let desired: Vec2;
    let sprinting = false;

    if (this.phase !== 'play' && this.phase !== 'kickoff') {
      // Drift back toward shape during stoppages.
      desired = this.anchorWorld(p);
    } else if (isUser) {
      const r = this.userMovement(p, dt);
      desired = r.desired;
      sprinting = r.sprinting;
    } else if (p.isGK) {
      desired = this.keeperTarget(p);
    } else {
      desired = this.aiTarget(p);
      sprinting = this.aiShouldSprint(p);
    }

    p.targetPos = desired;

    // Steering: accelerate toward the target, cap at current max speed.
    const toTarget = sub(desired, p.pos);
    const d = len(toTarget);
    const grip = this.weather().grip;
    const maxSp = this.maxSpeed(p, sprinting);
    let wish: Vec2;
    if (d < 0.35) {
      wish = vec();
    } else {
      // Ease off near the target so players settle rather than jitter.
      const speed = maxSp * clamp(d / 2.2, 0.25, 1);
      wish = scale(norm(toTarget), speed);
    }
    const accel = 13 * grip;
    p.vel.x += clamp(wish.x - p.vel.x, -accel * dt, accel * dt) * 3;
    p.vel.y += clamp(wish.y - p.vel.y, -accel * dt, accel * dt) * 3;
    const sp = len(p.vel);
    if (sp > maxSp) {
      p.vel = scale(p.vel, maxSp / sp);
    }
    // Friction when idle so players come to rest.
    if (d < 0.35) p.vel = scale(p.vel, 1 - Math.min(1, dt * 8));

    p.pos.x = clamp(p.pos.x + p.vel.x * dt, -2, L + 2);
    p.pos.y = clamp(p.pos.y + p.vel.y * dt, -2, W + 2);

    // Facing follows movement, but the ball carrier looks where they're going.
    if (sp > 0.6) {
      p.facing = rotateToward(p.facing, angleOf(p.vel), dt * 9);
    } else if (this.ball.owner !== p) {
      const toBall = sub(this.ball.pos, p.pos);
      if (len(toBall) > 0.4) p.facing = rotateToward(p.facing, angleOf(toBall), dt * 5);
    }

    // Stamina: sprinting burns, jogging recovers.
    const exertion = sp / Math.max(1, this.maxSpeed(p, false));
    if (sprinting || exertion > 1.02) {
      p.stamina = Math.max(4, p.stamina - dt * (3.1 - (p.physical / 99) * 1.5) * this.timeScale * 0.16);
    } else if (exertion < 0.55) {
      p.stamina = Math.min(100, p.stamina + dt * 1.9 * this.timeScale * 0.16);
    }

    p.animation =
      this.ball.owner === p && this.shotCharge > 0 && isUser
        ? 'shoot'
        : p.tackleTimer > 0
          ? 'tackle'
          : sp > this.maxSpeed(p, false) * 0.92
            ? 'sprint'
            : sp > 0.8
              ? 'run'
              : 'idle';

    this.separate(p);
  }

  /** Cheap collision resolution so players don't stack on the same pixel. */
  private separate(p: MatchPlayer) {
    for (const q of this.players) {
      if (q === p || !q.onPitch) continue;
      const dx = p.pos.x - q.pos.x;
      const dy = p.pos.y - q.pos.y;
      const d2 = dx * dx + dy * dy;
      const min = PHYS.playerRadius * 2;
      if (d2 > min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      p.pos.x += nx * push;
      p.pos.y += ny * push;
      q.pos.x -= nx * push;
      q.pos.y -= ny * push;
    }
  }

  /* ------------------------------------------------------------------ */
  /* User control                                                        */
  /* ------------------------------------------------------------------ */

  private updateControlSwitch() {
    if (this.autoPlay) return;
    const cur = this.controlled;
    const owner = this.ball.owner;

    // Possession by a teammate hands control to whoever has the ball.
    if (owner && owner.side === this.userSide && owner !== cur && !owner.isGK) {
      this.controlledId = owner.id;
      this.shotCharge = 0;
      return;
    }
    if (!cur || !cur.onPitch || cur.sentOff) {
      this.controlledId = this.nearestToBall(this.userSide, true)?.id ?? '';
      return;
    }
    // Manual switch, or automatic when the opposition has it.
    const wantSwitch = this.input.switchPlayer;
    const oppHasIt = owner && owner.side !== this.userSide;
    if (wantSwitch) {
      const candidates = this.players
        .filter((p) => p.side === this.userSide && p.onPitch && p !== cur && !p.isGK)
        .sort((a, b) => dist(a.pos, this.ball.pos) - dist(b.pos, this.ball.pos));
      if (candidates[0]) this.controlledId = candidates[0].id;
      this.input.switchPlayer = false;
    } else if ((oppHasIt || !owner) && dist(cur.pos, this.ball.pos) > 14) {
      const near = this.nearestToBall(this.userSide, true);
      if (near && near !== cur) this.controlledId = near.id;
    }
  }

  private nearestToBall(side: Side, excludeGK: boolean): MatchPlayer | null {
    let best: MatchPlayer | null = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.side !== side || !p.onPitch) continue;
      if (excludeGK && p.isGK) continue;
      const d = dist(p.pos, this.ball.pos);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private userMovement(p: MatchPlayer, dt: number): { desired: Vec2; sprinting: boolean } {
    const inp = this.input;
    const mv = vec(inp.moveX, inp.moveY);
    const mag = len(mv);
    const hasBall = this.ball.owner === p;

    // Actions are edge-triggered; consume them here.
    if (inp.cancel) {
      this.shotCharge = 0;
      inp.cancel = false;
    }

    if (hasBall && this.phase === 'play') {
      if (inp.shootHeld) {
        this.shotCharge = Math.min(1, this.shotCharge + dt / TIMING.maxChargeTime);
      }
      if (inp.shootReleased) {
        const power = this.shotCharge > 0.02 ? this.shotCharge : 0.45;
        this.userShoot(p, power, inp.finesse);
        this.shotCharge = 0;
        inp.shootReleased = false;
        inp.finesse = false;
      }
      if (inp.pass) {
        this.userPass(p, 'ground');
        inp.pass = false;
      }
      if (inp.through) {
        this.userPass(p, 'through');
        inp.through = false;
      }
      if (inp.cross) {
        this.userPass(p, 'lob');
        inp.cross = false;
      }
      if (inp.skill) {
        this.performSkillMove(p);
        inp.skill = false;
      }
    } else {
      this.shotCharge = 0;
      inp.shootReleased = false;
      inp.pass = false;
      inp.through = false;
      inp.cross = false;
      inp.skill = false;
      // Off the ball, the pass button switches player.
      if (inp.tackleHeld && p.tackleTimer <= 0 && p.tackleRecovery <= 0) {
        p.tackleTimer = TIMING.tackleWindow;
      }
    }

    let desired: Vec2;
    if (mag > 0.15) {
      const dirv = scale(norm(mv), 6);
      desired = vec(p.pos.x + dirv.x, p.pos.y + dirv.y);
    } else if (!hasBall && !inp.jockey) {
      // No input: drift toward the ball if it's close, otherwise hold position.
      const d = dist(p.pos, this.ball.pos);
      desired = d < 9 ? { ...this.ball.pos } : { ...p.pos };
    } else {
      desired = { ...p.pos };
    }

    // Jockeying: face the ball, move at reduced speed.
    if (inp.jockey && !hasBall) {
      const toBall = sub(this.ball.pos, p.pos);
      if (len(toBall) > 0.3) p.facing = angleOf(toBall);
      desired = vec(p.pos.x + (desired.x - p.pos.x) * 0.45, p.pos.y + (desired.y - p.pos.y) * 0.45);
    }

    return { desired, sprinting: inp.sprint && mag > 0.15 && !inp.jockey };
  }

  /** Quick lateral shimmy — effectiveness scales with dribbling. */
  private performSkillMove(p: MatchPlayer) {
    if (p.touchCooldown > 0) return;
    const quality = p.dribbling / 99;
    const side = this.rng.chance(0.5) ? 1 : -1;
    const perp = fromAngle(p.facing + (Math.PI / 2) * side, 2.4 + quality * 1.4);
    this.ball.vel = vec(perp.x * 1.7, perp.y * 1.7);
    this.ball.owner = null;
    p.touchCooldown = 0.16;
    // The dribbler gets a head start proportional to their skill.
    p.pos.x += perp.x * 0.35 * quality;
    p.pos.y += perp.y * 0.35 * quality;
    // Nearby defenders are briefly wrong-footed.
    for (const q of this.players) {
      if (q.side === p.side || !q.onPitch) continue;
      if (dist(q.pos, p.pos) < 3.2) q.tackleRecovery = Math.max(q.tackleRecovery, 0.28 * quality + 0.1);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Passing and shooting                                                */
  /* ------------------------------------------------------------------ */

  private userPass(p: MatchPlayer, kind: 'ground' | 'lob' | 'through') {
    if (p.touchCooldown > 0) return;
    const inp = this.input;
    const assist = this.difficulty().userAssist;
    // Aim direction comes from the stick; fall back to where the player faces.
    const stick = vec(inp.moveX, inp.moveY);
    const aim = len(stick) > 0.15 ? angleOf(stick) : p.facing;

    const mates = this.players.filter(
      (q) => q.side === p.side && q !== p && q.onPitch && (!q.isGK || kind === 'ground'),
    );
    let best: MatchPlayer | null = null;
    let bestScore = -Infinity;
    for (const m of mates) {
      const to = sub(m.pos, p.pos);
      const d = len(to);
      if (d < 2 || d > (kind === 'lob' ? 55 : 42)) continue;
      const off = Math.abs(angleDiff(angleOf(to), aim));
      if (off > Math.PI / 2.1) continue;
      // Prefer teammates in the aimed direction, closer, and unmarked.
      const openness = this.opennessOf(m);
      let score = -off * 3.2 - d * 0.045 + openness * 1.6;
      if (kind === 'through') score += (this.forwardness(m) - this.forwardness(p)) * 0.09;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }

    if (!best) {
      // Nothing on: knock it into space along the aim line.
      this.kickBall(p, fromAngle(aim, 1), kind === 'lob' ? 17 : 14, kind === 'lob' ? 5.2 : 0.4, 0);
      return;
    }

    const roughD = dist(p.pos, best.pos);
    const roughSpeed = kind === 'lob' ? clamp(roughD * 0.72 + 6, 12, 26) : clamp(roughD * 1.05 + 7, 10, 32);
    // Through balls are played into the space ahead of the runner.
    const extra =
      kind === 'through'
        ? vec(this.attackDir(p.side) * (5.5 + best.pace / 14), 0)
        : vec();
    const targetPos = this.leadTarget(p.pos, best, roughSpeed, extra);

    const toTarget = sub(targetPos, p.pos);
    const d = len(toTarget);
    // The stick chooses *who* to pass to (the cone search above); the ball is
    // then aimed at that player. Assist governs how much error creeps in, not
    // how far off-line the pass is thrown.
    const error = this.passError(p, d) * (1.35 - assist);
    const finalDir = fromAngle(angleOf(toTarget) + error, 1);
    const speed = kind === 'lob' ? clamp(d * 0.72 + 6, 12, 26) : clamp(d * 1.05 + 7, 10, 32);
    const lift = kind === 'lob' ? clamp(d * 0.2 + 3.4, 4, 9.5) : 0.25;
    this.kickBall(p, finalDir, speed, lift, 0);
    this.ball.passTarget = best;
    this.lastPasser = p;
    this.stats[p.side].passes++;
    this.checkOffsideOnPass(p, best);
  }

  private passError(p: MatchPlayer, d: number): number {
    const pressure = this.pressureOn(p);
    const base = (1 - p.passing / 110) * 0.075;
    const distFactor = clamp(d / 45, 0, 1) * 0.035;
    const w = this.weather().errorBonus * 0.009;
    const staminaPenalty = (1 - p.stamina / 100) * 0.02;
    const aiMult = p.side === this.userSide ? 1 : this.difficulty().aiError;
    return this.rng.gauss((base + distFactor + w + staminaPenalty + pressure * 0.028) * aiMult);
  }

  private userShoot(p: MatchPlayer, power: number, finesse: boolean) {
    if (p.touchCooldown > 0) return;
    const goal = this.targetGoal(p.side);
    const inp = this.input;
    const assist = this.difficulty().userAssist;

    // Aim: stick input nudges the target within the goal mouth.
    const aimOffset = clamp(inp.moveY, -1, 1) * (PITCH.goalWidth / 2 - 0.35);
    const targetY = clamp(goal.y + aimOffset, GOAL_Y_MIN + 0.3, GOAL_Y_MAX - 0.3);
    const target = vec(goal.x, targetY);

    const toGoal = sub(target, p.pos);
    const d = len(toGoal);
    const pressure = this.pressureOn(p);

    // Error grows with distance, pressure, fatigue and weather; finesse is tighter.
    const acc = finesse ? 0.62 : 1;
    const base = (1 - p.shooting / 115) * 0.085 * acc;
    const distErr = clamp((d - 8) / 40, 0, 1) * 0.075 * acc;
    const err =
      this.rng.gauss(
        (base + distErr + pressure * 0.028 + this.weather().errorBonus * 0.012) * (1.15 - assist * 0.45),
      );

    const dir = fromAngle(angleOf(toGoal) + err, 1);
    const speed = (finesse ? 17 : 20) + power * (finesse ? 9 : 15) + (p.shooting / 99) * 6;
    // Lift: enough to clear the keeper on power shots, low and placed on finesse.
    // The vertical error is what sends a rushed effort over the bar.
    const liftErr = this.rng.gauss(
      (0.5 + clamp((d - 8) / 30, 0, 1) * 1.1 + pressure * 0.35) * (finesse ? 0.6 : 1) * (1.1 - assist * 0.4),
    );
    const lift = clamp(
      (finesse ? 1.6 + power * 1.4 : clamp(1.1 + power * 3.4 - d * 0.02, 0.4, 6.2)) + liftErr,
      0.2,
      9,
    );
    const spin = finesse ? (err >= 0 ? -1 : 1) * (0.9 + p.shooting / 140) : this.rng.gauss(0.25);

    this.kickBall(p, dir, speed, lift, spin);
    this.registerShot(p);
  }

  /**
   * Book the shot and work out whether it was on target, by projecting the
   * ball's launch trajectory forward to the goal plane.
   */
  private registerShot(p: MatchPlayer) {
    const b = this.ball;
    this.stats[p.side].shots++;
    this.ball.passTarget = null;
    this.lastPasser = null;
    this.momentum += p.side === 0 ? 0.12 : -0.12;

    const onTarget = this.projectOnTarget(this.targetGoal(p.side).x);
    b.shotBy = p;
    b.shotOnTarget = onTarget;
    if (onTarget) this.stats[p.side].shotsOnTarget++;

    // The keeper cannot react instantly: better keepers set off sooner, and a
    // shot struck from close range leaves less time regardless.
    const keeper = this.players.find((q) => q.side !== p.side && q.isGK && q.onPitch);
    if (keeper) {
      const base = 0.34 - (keeper.overall / 99) * 0.16;
      keeper.reactTimer = clamp(base / this.difficulty().aiKeeper, 0.06, 0.4);
    }
  }

  /**
   * Integrate a copy of the ball's flight to see whether it would reach the
   * goal frame. Doing it properly — with drag, gravity and bounce — matters:
   * a straight-line estimate badly over-counts shots as on target.
   */
  private projectOnTarget(goalX: number): boolean {
    const b = this.ball;
    const w = this.weather();
    let px = b.pos.x;
    let py = b.pos.y;
    let pz = b.z;
    let vx = b.vel.x;
    let vy = b.vel.y;
    let vz = b.vz;
    const dt = 1 / 60;
    const toward = Math.sign(goalX - px);
    if (toward === 0 || Math.sign(vx) !== toward) return false;

    for (let i = 0; i < 180; i++) {
      const prevX = px;
      px += vx * dt;
      py += vy * dt;
      pz += vz * dt;
      if (pz > 0.001) {
        vz -= PHYS.gravity * dt;
        const drag = 1 - PHYS.airDrag * w.drag * dt;
        vx *= drag;
        vy *= drag;
      } else {
        pz = 0;
        if (vz < -0.6) {
          vz = -vz * PHYS.bounce;
          vx *= PHYS.bounceFriction;
          vy *= PHYS.bounceFriction;
        } else {
          vz = 0;
          const f = Math.max(0, 1 - PHYS.groundFriction * w.friction * dt);
          vx *= f;
          vy *= f;
        }
      }
      // Crossed the goal plane?
      if ((prevX - goalX) * (px - goalX) <= 0) {
        return py > GOAL_Y_MIN && py < GOAL_Y_MAX && pz >= 0 && pz < PITCH.goalHeight;
      }
      if (py < -1 || py > W + 1) return false;
      if (Math.abs(vx) < 0.4) return false; // Ran out of legs before the line.
    }
    return false;
  }


  /**
   * Where to aim so a moving teammate and the ball arrive together. The ball
   * decelerates under rolling friction, so travel time is solved iteratively
   * rather than assumed — a fixed lead lands the pass behind a running player.
   */
  private leadTarget(from: Vec2, receiver: MatchPlayer, speed: number, extra: Vec2 = vec()): Vec2 {
    let aim = vec(receiver.pos.x + extra.x, receiver.pos.y + extra.y);
    // Effective average ball speed after friction over a typical pass.
    const effective = Math.max(4, speed * 0.72);
    for (let i = 0; i < 3; i++) {
      const t = clamp(dist(from, aim) / effective, 0, 2.2);
      aim = vec(
        receiver.pos.x + extra.x + receiver.vel.x * t,
        receiver.pos.y + extra.y + receiver.vel.y * t,
      );
    }
    return this.clampToPitch(aim);
  }

  /** Apply a kick to the ball and hand the striker a brief touch cooldown. */
  private kickBall(p: MatchPlayer, dir: Vec2, speed: number, lift: number, spin: number) {
    this.ball.owner = null;
    this.ball.pos = vec(
      p.pos.x + dir.x * (PHYS.playerRadius + 0.25),
      p.pos.y + dir.y * (PHYS.playerRadius + 0.25),
    );
    this.ball.z = Math.max(this.ball.z, 0.12);
    this.ball.vel = scale(dir, speed);
    this.ball.vz = lift;
    this.ball.spin = spin;
    this.ball.lastTouch = p;
    this.ball.lastTouchSide = p.side;
    this.ball.shotBy = null;
    this.ball.shotOnTarget = false;
    p.touchCooldown = TIMING.releaseCooldown;
    p.animation = 'pass';
    // Everyone else can pick it up immediately.
    for (const q of this.players) if (q !== p) q.touchCooldown = Math.min(q.touchCooldown, 0.05);
  }

  /** 0 (free) .. ~3 (swarmed): how many opponents are breathing down a player's neck. */
  private pressureOn(p: MatchPlayer): number {
    let pressure = 0;
    for (const q of this.players) {
      if (q.side === p.side || !q.onPitch) continue;
      const d = dist(q.pos, p.pos);
      if (d < 6) pressure += (6 - d) / 6;
    }
    return pressure;
  }

  /** Inverse of pressure, normalised to 0..1 for pass scoring. */
  private opennessOf(p: MatchPlayer): number {
    return clamp(1 - this.pressureOn(p) / 2.4, 0, 1);
  }

  /**
   * How far up the pitch a player is, measured in `side`'s attacking direction.
   * Offside comparisons must put attackers and defenders in the *same* frame,
   * so the reference side is always passed explicitly.
   */
  private forwardnessFor(side: Side, p: MatchPlayer): number {
    return this.attackDir(side) > 0 ? p.pos.x : L - p.pos.x;
  }

  /** How far up the pitch a player is, in their own attacking direction. */
  private forwardness(p: MatchPlayer): number {
    return this.forwardnessFor(p.side, p);
  }

  private checkOffsideOnPass(passer: MatchPlayer, receiver: MatchPlayer) {
    // Everything below is measured in the passing side's attacking direction.
    const side = passer.side;
    const recvLine = this.forwardnessFor(side, receiver);
    if (recvLine <= L / 2) return; // Can't be offside in your own half.
    if (recvLine <= this.forwardnessFor(side, passer)) return;

    // Second-last defender, including the keeper.
    const defenders = this.players
      .filter((q) => q.side !== side && q.onPitch)
      .map((q) => this.forwardnessFor(side, q))
      .sort((a, b) => b - a);
    const secondLast = defenders[1] ?? defenders[0] ?? L;
    const ballLine = this.attackDir(side) > 0 ? this.ball.pos.x : L - this.ball.pos.x;
    // A small tolerance keeps marginal calls from dominating the match.
    if (recvLine > secondLast + 0.6 && recvLine > ballLine) {
      this.ball.offsideFlagged = receiver;
    }
  }

  /* ------------------------------------------------------------------ */
  /* AI                                                                  */
  /* ------------------------------------------------------------------ */

  private pickChasers() {
    for (const side of [0, 1] as Side[]) {
      let best: MatchPlayer | null = null;
      let bestCost = Infinity;
      for (const p of this.players) {
        if (p.side !== side || !p.onPitch || p.isGK) continue;
        // Cost = time to reach the ball, biased toward players already goal-side.
        const d = dist(p.pos, this.ball.pos);
        const cost = d / Math.max(3, this.maxSpeed(p, true)) + (p.group === 'FWD' ? 0.35 : 0);
        if (cost < bestCost) {
          bestCost = cost;
          best = p;
        }
      }
      this.chaser[side] = best;
    }
  }

  private aiShouldSprint(p: MatchPlayer): boolean {
    if (p.stamina < 18) return false;
    const d = dist(p.pos, p.targetPos);
    if (this.ball.owner === p) return d > 3 && this.pressureOn(p) > 0.4;
    if (this.chaser[p.side] === p) return true;
    return d > 7;
  }

  private aiTarget(p: MatchPlayer): Vec2 {
    const owner = this.ball.owner;

    if (owner === p) return this.aiWithBall(p);

    const anchor = this.shapedAnchor(p);
    const weHaveIt = owner ? owner.side === p.side : false;
    const theyHaveIt = owner ? owner.side !== p.side : false;

    // Ball in flight or loose.
    if (!owner) {
      // The intended receiver of a pass always goes to meet it — without this
      // the ball is simply left to whichever chaser happens to be closest.
      if (this.ball.passTarget === p) return this.interceptPoint(p);
      if (this.chaser[p.side] === p) return this.interceptPoint(p);
      return anchor;
    }

    if (weHaveIt) {
      // Off-ball attacking movement: push into space, hold width, make runs.
      const target = { ...anchor };
      const dir = this.attackDir(p.side);
      if (p.group === 'FWD') {
        // Stay onside: cap the run at the second-last defender.
        const line = this.offsideLine(p.side);
        const desiredX = target.x + dir * 5.5;
        target.x = dir > 0 ? Math.min(desiredX, line - 0.6) : Math.max(desiredX, line + 0.6);
      } else if (p.group === 'MID') {
        target.x += dir * 2.5;
      }
      return this.clampToPitch(target);
    }

    if (theyHaveIt) {
      const press = this.difficulty().aiPressing;
      const isPresser = this.chaser[p.side] === p;
      if (isPresser) return this.interceptPoint(p);

      // Second presser supports when the AI is set to press hard.
      const d = dist(p.pos, this.ball.pos);
      if (d < 12 + press * 8 && p.group !== 'FWD') {
        const marked = this.markTarget(p);
        if (marked) {
          // Goal-side marking: sit between the opponent and our goal.
          const goal = this.ownGoal(p.side);
          const toGoal = norm(sub(goal, marked.pos));
          return this.clampToPitch(vec(marked.pos.x + toGoal.x * 1.9, marked.pos.y + toGoal.y * 1.9));
        }
      }
      return anchor;
    }

    return anchor;
  }

  /** Formation anchor, shifted for ball position and phase of play. */
  private shapedAnchor(p: MatchPlayer): Vec2 {
    const a = this.anchorWorld(p);
    const dir = this.attackDir(p.side);
    const owner = this.ball.owner;
    const attacking = owner ? owner.side === p.side : false;

    // Slide the whole block toward the ball, longitudinally and laterally.
    const longShift = (this.ball.pos.x - L / 2) * 0.2;
    const latShift = (this.ball.pos.y - W / 2) * 0.3;
    // Compression: push up when we have it, drop off when we don't.
    const phaseShift = attacking ? dir * 7 : -dir * 5;

    // Defenders track the ball line more tightly than forwards.
    const groupWeight = p.group === 'DEF' ? 1.15 : p.group === 'MID' ? 1 : 0.75;

    let x = a.x + longShift * groupWeight + phaseShift;
    let y = a.y + latShift * (p.group === 'DEF' ? 0.9 : 0.7);

    // Never let outfielders drift behind their own keeper.
    if (dir > 0) x = clamp(x, 3, L - 2);
    else x = clamp(x, 2, L - 3);

    return this.clampToPitch(vec(x, y));
  }

  private clampToPitch(v: Vec2): Vec2 {
    return vec(clamp(v.x, 0.6, L - 0.6), clamp(v.y, 0.6, W - 0.6));
  }

  /** The x-line of the second-last defender for `side`'s opponents. */
  private offsideLine(side: Side): number {
    const opp: Side = side === 0 ? 1 : 0;
    const xs = this.players
      .filter((q) => q.side === opp && q.onPitch)
      .map((q) => q.pos.x)
      .sort((a, b) => (this.attackDir(side) > 0 ? b - a : a - b));
    return xs[1] ?? xs[0] ?? (this.attackDir(side) > 0 ? L : 0);
  }

  /** Lead the ball rather than chasing its current position. */
  private interceptPoint(p: MatchPlayer): Vec2 {
    const b = this.ball;
    const speed = Math.max(3, this.maxSpeed(p, true));
    // Iterate a couple of times to converge on a rough intercept time.
    let t = dist(p.pos, b.pos) / speed;
    for (let i = 0; i < 2; i++) {
      const px = b.pos.x + b.vel.x * t * 0.75;
      const py = b.pos.y + b.vel.y * t * 0.75;
      t = dist(p.pos, vec(px, py)) / speed;
    }
    t = clamp(t, 0, 1.4);
    return this.clampToPitch(vec(b.pos.x + b.vel.x * t * 0.75, b.pos.y + b.vel.y * t * 0.75));
  }

  /** Nearest unmarked opponent for a defender to pick up. */
  private markTarget(p: MatchPlayer): MatchPlayer | null {
    let best: MatchPlayer | null = null;
    let bestD = Infinity;
    for (const q of this.players) {
      if (q.side === p.side || !q.onPitch || q.isGK) continue;
      const goalDist = dist(q.pos, this.ownGoal(p.side));
      if (goalDist > 45) continue;
      const d = dist(q.pos, p.pos);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    return best;
  }

  /** Ball-carrier AI: shoot, pass, or drive forward. */
  private aiWithBall(p: MatchPlayer): Vec2 {
    const goal = this.targetGoal(p.side);
    const dGoal = dist(p.pos, goal);
    const pressure = this.pressureOn(p);
    const diff = this.difficulty();

    if (p.decisionTimer <= 0 && p.touchCooldown <= 0 && this.phase === 'play') {
      p.decisionTimer = diff.aiReaction + this.rng.range(0, 0.12);

      // Shoot when in range and the angle is respectable.
      const angleOk = Math.abs(p.pos.y - W / 2) < 22 + (30 - Math.min(30, dGoal));
      const shootUrge = clamp((28 - dGoal) / 24, 0, 1) * (0.55 + p.shooting / 240);
      if (dGoal < 30 && angleOk && this.rng.chance(shootUrge * 0.5)) {
        this.aiShoot(p);
        return { ...p.pos };
      }

      // Otherwise look for a pass — mandatory when hemmed in.
      const pass = this.bestPass(p);
      const mustPass = pressure > 1.35;
      if (pass && (mustPass || this.rng.chance(0.16 + pass.score * 0.1))) {
        this.aiPass(p, pass.target, pass.kind);
        return { ...p.pos };
      }
    }

    // Drive at goal, steering around the nearest opponent.
    const toGoal = norm(sub(goal, p.pos));
    let steer = vec(toGoal.x, toGoal.y);
    let nearest: MatchPlayer | null = null;
    let nd = Infinity;
    for (const q of this.players) {
      if (q.side === p.side || !q.onPitch) continue;
      const d = dist(q.pos, p.pos);
      if (d < nd) {
        nd = d;
        nearest = q;
      }
    }
    if (nearest && nd < 6) {
      const away = norm(sub(p.pos, nearest.pos));
      const w = (6 - nd) / 6;
      steer = norm(vec(steer.x + away.x * w * 1.5, steer.y + away.y * w * 1.5));
    }
    return this.clampToPitch(vec(p.pos.x + steer.x * 8, p.pos.y + steer.y * 8));
  }

  private bestPass(
    p: MatchPlayer,
  ): { target: MatchPlayer; kind: 'ground' | 'lob' | 'through'; score: number } | null {
    let best: { target: MatchPlayer; kind: 'ground' | 'lob' | 'through'; score: number } | null = null;
    const myForward = this.forwardness(p);
    const line = this.offsideLine(p.side);
    const dir = this.attackDir(p.side);

    for (const m of this.players) {
      if (m.side !== p.side || m === p || !m.onPitch) continue;
      const d = dist(p.pos, m.pos);
      if (d < 3 || d > 45) continue;

      const openness = this.opennessOf(m);
      const gain = (this.forwardness(m) - myForward) / 30;
      const laneClear = this.laneClearance(p.pos, m.pos);
      // Backward passes to the keeper are a last resort.
      let score = openness * 1.5 + gain * 1.1 + laneClear * 1.2 - d * 0.012;
      if (m.isGK) score -= 1.6;

      let kind: 'ground' | 'lob' | 'through' = 'ground';
      // A blocked lane can be chipped instead.
      if (laneClear < 0.4 && d > 12) {
        kind = 'lob';
        score += 0.35;
      }
      // Through ball when the receiver has grass ahead and is onside.
      const mForwardX = m.pos.x + dir * 6;
      const onside = dir > 0 ? mForwardX < line : mForwardX > line;
      if (onside && gain > 0.2 && openness > 0.55 && d > 10) {
        kind = 'through';
        score += 0.5;
      }

      if (!best || score > best.score) best = { target: m, kind, score };
    }
    return best && best.score > 0.15 ? best : null;
  }

  /** 1 = clean lane, 0 = an opponent is standing in the passing line. */
  private laneClearance(from: Vec2, to: Vec2): number {
    const seg = sub(to, from);
    const segLen = len(seg);
    if (segLen < 1e-3) return 1;
    const dirv = scale(seg, 1 / segLen);
    let worst = 1;
    for (const q of this.players) {
      if (!q.onPitch) continue;
      const rel = sub(q.pos, from);
      const along = rel.x * dirv.x + rel.y * dirv.y;
      if (along < 0.5 || along > segLen - 0.5) continue;
      const perp = Math.abs(rel.x * -dirv.y + rel.y * dirv.x);
      worst = Math.min(worst, clamp(perp / 2.6, 0, 1));
    }
    return worst;
  }

  private aiPass(p: MatchPlayer, target: MatchPlayer, kind: 'ground' | 'lob' | 'through') {
    const dir = this.attackDir(p.side);
    const roughD = dist(p.pos, target.pos);
    const roughSpeed = kind === 'lob' ? clamp(roughD * 0.7 + 6, 12, 25) : clamp(roughD * 1.02 + 6.5, 10, 31);
    const extra = kind === 'through' ? vec(dir * (5 + target.pace / 16), 0) : vec();
    const aimAt = this.leadTarget(p.pos, target, roughSpeed, extra);

    const to = sub(aimAt, p.pos);
    const d = len(to);
    const err = this.passError(p, d);
    const finalDir = fromAngle(angleOf(to) + err, 1);
    const speed = kind === 'lob' ? clamp(d * 0.7 + 6, 12, 25) : clamp(d * 1.02 + 6.5, 10, 31);
    const lift = kind === 'lob' ? clamp(d * 0.2 + 3.2, 4, 9) : 0.25;
    this.kickBall(p, finalDir, speed, lift, 0);
    this.ball.passTarget = target;
    this.lastPasser = p;
    this.stats[p.side].passes++;
    this.checkOffsideOnPass(p, target);
  }

  private aiShoot(p: MatchPlayer) {
    const goal = this.targetGoal(p.side);
    // Aim off-centre, toward the corner the keeper is further from.
    const keeper = this.players.find((q) => q.side !== p.side && q.isGK && q.onPitch);
    const bias = keeper && keeper.pos.y > W / 2 ? -1 : 1;
    const targetY = clamp(
      goal.y + bias * this.rng.range(0.8, PITCH.goalWidth / 2 - 0.4),
      GOAL_Y_MIN + 0.35,
      GOAL_Y_MAX - 0.35,
    );
    const target = vec(goal.x, targetY);
    const to = sub(target, p.pos);
    const d = len(to);
    const pressure = this.pressureOn(p);
    const base = (1 - p.shooting / 115) * 0.09;
    const distErr = clamp((d - 8) / 40, 0, 1) * 0.085;
    const err = this.rng.gauss(
      (base + distErr + pressure * 0.032 + this.weather().errorBonus * 0.012) * this.difficulty().aiError,
    );
    const power = clamp(0.45 + (30 - d) / 60, 0.35, 1);
    const dirv = fromAngle(angleOf(to) + err, 1);
    const speed = 19 + power * 14 + (p.shooting / 99) * 6;
    const liftErr = this.rng.gauss(
      (0.5 + clamp((d - 8) / 30, 0, 1) * 1.15 + pressure * 0.4) * this.difficulty().aiError,
    );
    const lift = clamp(1.0 + power * 3.2 - d * 0.02 + liftErr, 0.2, 9);
    this.kickBall(p, dirv, speed, lift, this.rng.gauss(0.3));
    this.registerShot(p);
  }

  /* ------------------------------------------------------------------ */
  /* Goalkeeper                                                          */
  /* ------------------------------------------------------------------ */

  private keeperTarget(p: MatchPlayer): Vec2 {
    const goal = this.ownGoal(p.side);
    const dir = this.attackDir(p.side);
    const b = this.ball;
    const toBall = sub(b.pos, goal);
    const dBall = len(toBall);

    // Distribute when holding the ball.
    if (b.owner === p) {
      if (p.decisionTimer <= 0) {
        p.decisionTimer = 0.9;
        const pass = this.bestPass(p);
        if (pass) this.aiPass(p, pass.target, pass.kind === 'through' ? 'ground' : pass.kind);
        else this.kickBall(p, fromAngle(dir > 0 ? 0 : Math.PI, 1), 24, 7, 0);
      }
      return { ...p.pos };
    }

    // Rush out to smother when an attacker is through on goal.
    const attackerNear = this.players.some(
      (q) => q.side !== p.side && q.onPitch && b.owner === q && dist(q.pos, goal) < 17,
    );
    const sweepRange = attackerNear ? 13 : 6.5;
    const advance = clamp(dBall * 0.16, 1.2, sweepRange);

    // Sit on the bisector between the ball and the goal centre.
    const unit = dBall < 0.5 ? vec(dir, 0) : scale(toBall, 1 / dBall);
    let x = goal.x + unit.x * advance;
    let y = goal.y + unit.y * advance * 0.85;

    // Shot-stopping: slide along the goal line toward the ball's projected path.
    const speedTowardGoal = dir > 0 ? -b.vel.x : b.vel.x;
    if (speedTowardGoal > 6 && dBall < 40 && b.owner === null && p.reactTimer <= 0) {
      const t = clamp(Math.abs((b.pos.x - goal.x) / (b.vel.x || 1)), 0, 1.6);
      const projY = b.pos.y + b.vel.y * t;
      const reaction = this.difficulty().aiKeeper * (0.42 + p.overall / 260);
      y = goal.y + (clamp(projY, GOAL_Y_MIN - 1.6, GOAL_Y_MAX + 1.6) - goal.y) * reaction;
      x = goal.x + unit.x * clamp(advance, 0.6, 2.6);
    }

    y = clamp(y, GOAL_Y_MIN - 3.2, GOAL_Y_MAX + 3.2);
    return vec(clamp(x, 0.4, L - 0.4), y);
  }

  /* ------------------------------------------------------------------ */
  /* Ball                                                                */
  /* ------------------------------------------------------------------ */

  private updateBall(dt: number) {
    const b = this.ball;
    const w = this.weather();

    if (b.owner) {
      const o = b.owner;
      // Glue the ball just ahead of the dribbler, with a small touch cadence.
      const lead = PHYS.dribbleLead + Math.min(1, len(o.vel) / 8) * 0.5;
      const wobble = Math.sin(this.elapsed * 7) * 0.08;
      const f = fromAngle(o.facing, lead);
      b.pos.x = o.pos.x + f.x + wobble;
      b.pos.y = o.pos.y + f.y;
      b.z = 0;
      b.vel = { ...o.vel };
      b.vz = 0;
      b.spin = 0;
      return;
    }

    // Magnus effect: spin bends the flight path while airborne.
    const speed = len(b.vel);
    if (b.z > 0.05 && speed > 1) {
      const perp = vec(-b.vel.y / speed, b.vel.x / speed);
      const m = b.spin * speed * PHYS.magnus * dt;
      b.vel.x += perp.x * m;
      b.vel.y += perp.y * m;
      b.spin *= 1 - dt * 0.35;
    }

    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.z += b.vz * dt;

    if (b.z > 0.001) {
      b.vz -= PHYS.gravity * dt;
      const drag = 1 - PHYS.airDrag * w.drag * dt;
      b.vel.x *= drag;
      b.vel.y *= drag;
    }

    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -0.6) {
        b.vz = -b.vz * PHYS.bounce;
        b.vel = scale(b.vel, PHYS.bounceFriction);
      } else {
        b.vz = 0;
        // Rolling friction on the deck.
        const f = 1 - PHYS.groundFriction * w.friction * dt;
        b.vel = scale(b.vel, Math.max(0, f));
        if (len(b.vel) < 0.12) b.vel = vec();
      }
    }

    this.checkWoodwork(dt);
  }

  /**
   * Posts and crossbar are solid: the ball rebounds off them. This is
   * edge-triggered with a short lockout — checked naively every frame, a ball
   * loitering near a post re-registers and has its velocity flipped repeatedly.
   */
  private checkWoodwork(dt: number) {
    const b = this.ball;
    this.woodworkLock = Math.max(0, this.woodworkLock - dt);
    if (this.woodworkLock > 0) return;
    // Only a ball actually travelling can strike the frame.
    if (len(b.vel) < 1.5 && Math.abs(b.vz) < 1.5) return;

    for (const gx of [0, L]) {
      if (Math.abs(b.pos.x - gx) > 0.5) continue;
      // Must have moved into the post plane this frame, not merely be sitting in it.
      const crossedPlane = (this.prevBall.x - gx) * (b.pos.x - gx) <= 0;
      const hitPost =
        (Math.abs(b.pos.y - GOAL_Y_MIN) < 0.16 || Math.abs(b.pos.y - GOAL_Y_MAX) < 0.16) &&
        b.z < PITCH.goalHeight &&
        crossedPlane;
      const hitBar =
        b.pos.y > GOAL_Y_MIN &&
        b.pos.y < GOAL_Y_MAX &&
        Math.abs(b.z - PITCH.goalHeight) < 0.18 &&
        b.vz > 0 &&
        crossedPlane;
      if (hitPost) {
        b.vel.y = -b.vel.y * 0.6;
        b.vel.x = -b.vel.x * 0.65;
        b.pos.x = gx + Math.sign(b.vel.x || 1) * 0.2;
        this.woodworkLock = 0.5;
        this.log(b.lastTouchSide ?? 0, 'woodwork', 'Off the post!');
      } else if (hitBar) {
        b.vz = -Math.abs(b.vz) * 0.5;
        b.vel.x = -b.vel.x * 0.55;
        b.pos.x = gx + Math.sign(b.vel.x || 1) * 0.2;
        this.woodworkLock = 0.5;
        this.log(b.lastTouchSide ?? 0, 'woodwork', 'Off the bar!');
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Contests: control, tackles, fouls                                   */
  /* ------------------------------------------------------------------ */

  private resolveContests(dt: number) {
    const b = this.ball;

    // Active tackle attempts.
    for (const p of this.players) {
      if (!p.onPitch || p.tackleTimer <= 0) continue;
      const owner = b.owner;
      if (owner && owner.side !== p.side && dist(p.pos, owner.pos) < 2.6) {
        this.attemptTackle(p, owner);
        p.tackleTimer = 0;
        p.tackleRecovery = TIMING.tackleRecovery;
      }
    }

    // AI defenders tackle automatically when they get tight.
    const owner = b.owner;
    if (owner) {
      for (const p of this.players) {
        if (!p.onPitch || p.side === owner.side || p.isGK) continue;
        if (!this.autoPlay && p.side === this.userSide && p.id === this.controlledId) continue;
        if (p.tackleRecovery > 0) continue;
        const d = dist(p.pos, owner.pos);
        if (d < 1.5 && this.rng.chance(this.difficulty().aiPressing * dt * 3.4)) {
          this.attemptTackle(p, owner);
          p.tackleRecovery = TIMING.tackleRecovery;
        }
      }
    }

    // Loose ball: try to control it, otherwise it can deflect off a body.
    // Nobody may play a ball that is already out of the field of play.
    const inPlay = b.pos.x > 0 && b.pos.x < L && b.pos.y > 0 && b.pos.y < W;
    if (!b.owner && b.z < 2.5 && inPlay) {
      const ballSpeed = len(b.vel);
      let best: MatchPlayer | null = null;
      let bestD = Infinity;
      let blocker: MatchPlayer | null = null;
      let blockerD = Infinity;

      for (const p of this.players) {
        if (!p.onPitch || p.touchCooldown > 0 || p.tackleRecovery > 0.35) continue;
        // Outfielders can only play a ball near the deck; keepers get up to it.
        if (b.z > (p.isGK ? 2.5 : 1.9)) continue;
        const radius = p.isGK ? PHYS.gkControlRadius : PHYS.controlRadius;
        const d = dist(p.pos, b.pos);
        if (d > radius) continue;

        // A keeper within reach of a struck shot still has to actually stop it.
        // Without this roll, being in range is a guaranteed save and almost
        // nothing goes in.
        if (p.isGK && b.shotBy && b.shotBy.side !== p.side && ballSpeed > 12) {
          const reach = 1 - d / radius; // Right at them is far easier than at full stretch.
          const saveChance = clamp(
            (0.3 + (p.overall / 99) * 0.45 + reach * 0.34 - ballSpeed / 210) *
              this.difficulty().aiKeeper,
            0.06,
            0.94,
          );
          if (!this.rng.chance(saveChance)) {
            // Beaten. Lock the keeper out so the same shot isn't re-rolled.
            p.touchCooldown = 0.55;
            continue;
          }
          // How the save is made. A keeper at full stretch does not hold on to
          // it — they claw it over the bar or turn it round the post, which is
          // where most corners come from.
          const wide = Math.abs(b.pos.y - W / 2) > 2.2;
          const stretched = d > PHYS.gkControlRadius * 0.45;
          if (b.z > 1.05 && this.rng.chance(0.55)) {
            this.tipOver(p, 'over the bar');
            return;
          }
          if (wide && stretched && this.rng.chance(0.5)) {
            this.tipOver(p, 'round the post');
            return;
          }
        }

        // Faster balls are harder to bring under control. Nobody cushions a
        // fiercely struck ball out of the air — an outfielder in the way blocks
        // it, and that is what produces rebounds, deflections and corners.
        const control = p.isGK
          ? 0.4 + (p.overall / 99) * 0.5
          : ballSpeed > 22
            ? 0.12 + p.dribbling / 420
            : 0.45 + p.dribbling / 190;
        const hard = ballSpeed > (p.isGK ? 21 : 16);
        if (hard && !this.rng.chance(control)) {
          // Failed to control it, but the body is still in the way.
          if (d < blockerD) {
            blockerD = d;
            blocker = p;
          }
          continue;
        }
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }

      if (best) this.takePossession(best);
      else if (blocker) this.deflect(blocker, ballSpeed);
    }
  }

  /** Keeper turns the ball behind for a corner, over the bar or round the post. */
  private tipOver(keeper: MatchPlayer, how: string) {
    const b = this.ball;
    const attacking: Side = keeper.side === 0 ? 1 : 0;
    this.log(keeper.side, 'save', `${keeper.lastName} turns it ${how}`);
    this.stats[attacking].corners++;
    const goal = this.ownGoal(keeper.side);
    const cornerY = b.pos.y < W / 2 ? 0.4 : W - 0.4;
    b.lastTouch = keeper;
    b.lastTouchSide = keeper.side;
    this.log(attacking, 'corner', 'Corner');
    this.awardRestart(attacking, vec(goal.x === 0 ? 0.4 : L - 0.4, cornerY), 'corner');
  }

  /**
   * A block, parry or deflection. Keeps the ball live, credits the touch to the
   * blocker, and is what produces rebounds and corners after a defender gets
   * something on a shot or a clearance.
   */
  private deflect(p: MatchPlayer, ballSpeed: number) {
    const b = this.ball;
    const incoming = ballSpeed > 0.5 ? norm(b.vel) : fromAngle(p.facing, 1);
    const away = norm(sub(b.pos, p.pos));

    let dirv: Vec2;
    let retained: number;
    if (p.isGK) {
      // Keepers palm the ball wide of the near post rather than back into play.
      const lateral = b.pos.y >= W / 2 ? 1 : -1;
      const intoPlay = this.attackDir(p.side); // away from the goal being defended
      dirv = norm(vec(intoPlay * 0.45 + this.rng.gauss(0.25), lateral * 1.15));
      retained = 0.42;
    } else {
      // A block glances off: it mostly carries on, but skewed off the body.
      dirv = norm(vec(incoming.x * 0.55 + away.x * 0.55, incoming.y * 0.55 + away.y * 0.55));
      dirv = fromAngle(angleOf(dirv) + this.rng.gauss(0.55), 1);
      retained = 0.5;
    }

    b.vel = scale(dirv, Math.max(3.5, ballSpeed * retained));
    b.vz = Math.max(b.vz * 0.4, p.isGK ? 2.6 : 1.6);
    b.spin *= 0.4;
    b.lastTouch = p;
    b.lastTouchSide = p.side;
    b.passTarget = null;
    b.offsideFlagged = null;
    // Brief lockout so the blocker doesn't instantly re-collect their own parry.
    p.touchCooldown = p.isGK ? 0.32 : 0.22;
    if (b.shotBy && b.shotBy.side !== p.side && b.shotOnTarget) {
      this.log(p.side, 'save', p.isGK ? `${p.lastName} parries it clear` : `${p.lastName} blocks it`);
    }
    b.shotBy = null;
    b.shotOnTarget = false;
    this.lastPasser = null;
  }

  private takePossession(p: MatchPlayer) {
    const b = this.ball;

    // Offside is only punished once the flagged player actually receives it.
    if (b.offsideFlagged && b.offsideFlagged === p) {
      this.stats[p.side].offsides++;
      const opp: Side = p.side === 0 ? 1 : 0;
      this.log(p.side, 'offside', `Offside — ${p.lastName}`);
      this.flashMessage('OFFSIDE', `${p.lastName} was ahead of the last man`);
      this.awardRestart(opp, { ...b.pos }, 'freekick');
      b.offsideFlagged = null;
      return;
    }

    // A keeper gathering an on-target effort is a save.
    if (p.isGK && b.shotBy && b.shotBy.side !== p.side && b.shotOnTarget) {
      this.log(p.side, 'save', `${p.lastName} saves from ${b.shotBy.lastName}`);
    }
    b.shotBy = null;
    b.shotOnTarget = false;

    const prevOwnerSide = b.lastTouchSide;
    b.owner = p;
    b.lastTouch = p;
    b.lastTouchSide = p.side;
    b.z = 0;
    b.vz = 0;
    b.spin = 0;
    b.offsideFlagged = null;

    // Completed pass bookkeeping.
    if (this.lastPasser && this.lastPasser.side === p.side && this.lastPasser !== p) {
      this.stats[p.side].passesCompleted++;
    }
    this.lastPasser = null;
    b.passTarget = null;

    if (prevOwnerSide !== null && prevOwnerSide !== p.side) {
      this.momentum += p.side === 0 ? 0.08 : -0.08;
    }
  }

  private attemptTackle(defender: MatchPlayer, attacker: MatchPlayer) {
    const b = this.ball;
    const d = dist(defender.pos, b.pos);
    if (d > 3) return;

    this.stats[defender.side].tackles++;

    const staminaF = 0.7 + 0.3 * (defender.stamina / 100);
    const quality = defender.defending * staminaF;
    const evade = attacker.dribbling * (0.75 + 0.25 * (attacker.stamina / 100));
    // Proximity is the timing window: close = "green zone".
    const proximity = clamp(1 - (d - 0.7) / 2.0, 0, 1);
    const diffMult = defender.side === this.userSide ? 1 : 0.85 + this.difficulty().aiPressing * 0.3;
    const successChance = clamp((quality / (quality + evade)) * proximity * 1.5 * diffMult, 0.03, 0.93);

    if (this.rng.chance(successChance)) {
      // Won it: the ball squirts toward the defender's forward direction.
      const dirv = fromAngle(defender.facing, 1);
      b.owner = null;
      b.vel = scale(dirv, 3.2);
      b.pos = { ...b.pos };
      b.lastTouch = defender;
      b.lastTouchSide = defender.side;
      attacker.touchCooldown = 0.42;
      defender.touchCooldown = 0.1;
      this.momentum += defender.side === 0 ? 0.1 : -0.1;
      return;
    }

    // Missed. A mistimed lunge at speed is a foul.
    const closingSpeed = len(sub(defender.vel, attacker.vel));
    const foulChance = clamp(0.28 + closingSpeed * 0.045 + (1 - proximity) * 0.35, 0, 0.92);
    if (this.rng.chance(foulChance)) {
      this.awardFoul(defender, attacker, closingSpeed);
    } else {
      defender.tackleRecovery = TIMING.tackleRecovery;
    }
  }

  private awardFoul(offender: MatchPlayer, victim: MatchPlayer, severity: number) {
    this.stats[offender.side].fouls++;
    const spot = { ...victim.pos };
    const attackingSide = victim.side;

    // Fouls in your own box are penalties.
    const ownGoal = this.ownGoal(offender.side);
    const inBox =
      Math.abs(spot.x - ownGoal.x) < PITCH.penaltyAreaDepth &&
      Math.abs(spot.y - W / 2) < PITCH.penaltyAreaWidth / 2;

    // Card decision: hard, fast challenges and repeat offending get punished.
    const cardRoll = severity * 0.05 + (inBox ? 0.12 : 0) + this.rng.next() * 0.4;
    if (cardRoll > 0.56 || (offender.yellowCards >= 1 && cardRoll > 0.48)) {
      offender.yellowCards++;
      if (offender.yellowCards >= 2) {
        offender.sentOff = true;
        offender.onPitch = false;
        this.stats[offender.side].redCards++;
        this.log(offender.side, 'red', `${offender.lastName} sent off (second yellow)`);
        this.flashMessage('RED CARD', `${offender.lastName} walks`);
        if (this.controlledId === offender.id) {
          this.controlledId = this.nearestToBall(this.userSide, true)?.id ?? '';
        }
      } else {
        this.stats[offender.side].yellowCards++;
        this.log(offender.side, 'yellow', `${offender.lastName} booked`);
        this.flashMessage('YELLOW CARD', offender.name);
      }
    } else {
      this.log(offender.side, 'foul', `Foul by ${offender.lastName}`);
    }

    if (inBox) {
      const spotX = ownGoal.x + (ownGoal.x === 0 ? PITCH.penaltySpot : -PITCH.penaltySpot);
      this.flashMessage('PENALTY', `${victim.source.name} is brought down`);
      this.awardRestart(attackingSide, vec(spotX, W / 2), 'penalty');
    } else {
      this.awardRestart(attackingSide, spot, 'freekick');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Boundaries and restarts                                             */
  /* ------------------------------------------------------------------ */

  private checkBoundaries() {
    const b = this.ball;
    if (b.owner) {
      // A dribbler carrying it out concedes the restart too.
      if (b.pos.y < 0 || b.pos.y > W || b.pos.x < 0 || b.pos.x > L) {
        // Nudge the carrier back in and let the loose-ball path handle it.
        b.owner = null;
      } else {
        return;
      }
    }

    // Goal line: goal, corner, or goal kick.
    const crossedLeft = this.prevBall.x >= 0 && b.pos.x < 0;
    const crossedRight = this.prevBall.x <= L && b.pos.x > L;
    if (crossedLeft || crossedRight) {
      const inMouth = b.pos.y > GOAL_Y_MIN && b.pos.y < GOAL_Y_MAX && b.z < PITCH.goalHeight;
      if (inMouth) {
        // The team attacking that goal scores.
        const scoring: Side = crossedRight ? (this.attackDir(0) > 0 ? 0 : 1) : this.attackDir(0) > 0 ? 1 : 0;
        this.scoreGoal(scoring);
        return;
      }
      // Whose goal line was it? The defending side gets a goal kick.
      const goalX = crossedLeft ? 0 : L;
      const defending: Side = this.ownGoal(0).x === goalX ? 0 : 1;
      const lastTouch = b.lastTouchSide;
      if (lastTouch === defending) {
        this.stats[defending === 0 ? 1 : 0].corners++;
        const cornerY = b.pos.y < W / 2 ? 0.4 : W - 0.4;
        const attacking: Side = defending === 0 ? 1 : 0;
        this.log(attacking, 'corner', 'Corner');
        this.awardRestart(attacking, vec(goalX === 0 ? 0.4 : L - 0.4, cornerY), 'corner');
      } else {
        const spotX = goalX === 0 ? PITCH.goalAreaDepth : L - PITCH.goalAreaDepth;
        this.awardRestart(defending, vec(spotX, W / 2), 'goalkick');
      }
      return;
    }

    // Touchline: throw-in to whoever did not touch it last.
    if (b.pos.y < 0 || b.pos.y > W) {
      const conceded = b.lastTouchSide ?? 0;
      const to: Side = conceded === 0 ? 1 : 0;
      const y = b.pos.y < 0 ? 0.3 : W - 0.3;
      this.awardRestart(to, vec(clamp(b.pos.x, 1, L - 1), y), 'throwin');
    }
  }

  private awardRestart(side: Side, spot: Vec2, phase: MatchPhase) {
    const b = this.ball;
    b.owner = null;
    b.vel = vec();
    b.vz = 0;
    b.z = 0;
    b.spin = 0;
    b.pos = { ...spot };
    b.offsideFlagged = null;
    b.passTarget = null;
    b.shotBy = null;
    b.shotOnTarget = false;

    this.restartSide = side;
    this.restartSpot = { ...spot };
    this.phase = phase;
    this.restartTimer = phase === 'penalty' ? TIMING.restartPause * 1.6 : TIMING.restartPause;

    // Pick a sensible taker.
    const eligible = this.players.filter((p) => p.side === side && p.onPitch);
    let taker: MatchPlayer | null = null;
    if (phase === 'goalkick') {
      taker = eligible.find((p) => p.isGK) ?? null;
    } else if (phase === 'penalty') {
      taker = eligible.filter((p) => !p.isGK).sort((a, b2) => b2.shooting - a.shooting)[0] ?? null;
    } else if (phase === 'corner') {
      taker = eligible.filter((p) => !p.isGK).sort((a, b2) => b2.passing - a.passing)[0] ?? null;
    } else {
      taker = eligible
        .filter((p) => !p.isGK)
        .sort((a, b2) => dist(a.pos, spot) - dist(b2.pos, spot))[0] ?? null;
    }
    this.restartTaker = taker;
    if (taker) {
      taker.pos = { ...spot };
      taker.touchCooldown = 0;
      // Face the right way for the restart.
      taker.facing = this.attackDir(side) > 0 ? 0 : Math.PI;
    }

    // Corners pull bodies into the box.
    if (phase === 'corner') {
      const goal = this.targetGoal(side);
      let i = 0;
      for (const p of this.players) {
        if (!p.onPitch || p === taker || p.isGK) continue;
        const inBox = p.side === side ? i < 5 : i < 7;
        if (inBox) {
          const spread = ((i % 5) - 2) * 3.2;
          p.pos = vec(
            goal.x + (goal.x === 0 ? 1 : -1) * (6 + (i % 3) * 3),
            clamp(W / 2 + spread, 4, W - 4),
          );
        }
        i++;
      }
    }
  }

  private scoreGoal(side: Side) {
    this.stats[side].goals++;
    this.lastGoalSide = side;
    this.phase = 'goal';
    this.restartTimer = TIMING.goalCelebration;
    this.momentum = side === 0 ? 1 : -1;

    if (!this.ball.shotOnTarget) this.stats[side].shotsOnTarget++;
    this.ball.shotBy = null;
    this.ball.shotOnTarget = false;

    const scorer = this.ball.lastTouch;
    const team = side === 0 ? this.home.team : this.away.team;
    const name = scorer ? scorer.source.name : team.name;
    this.log(side, 'goal', `${name} scores for ${team.shortName}`);
    this.flashMessage('GOAL!', `${name}  ${this.displayMinute}'`);

    if (scorer) scorer.animation = 'celebrate';
    const b = this.ball;
    b.vel = scale(b.vel, 0.2);
    b.owner = null;
  }

  private flashMessage(text: string, sub: string) {
    this.flash = { text, sub, until: this.elapsed + 3.2 };
  }

  /** Flash banner if it has not expired. */
  get activeFlash(): { text: string; sub: string } | null {
    if (!this.flash || this.elapsed > this.flash.until) return null;
    return { text: this.flash.text, sub: this.flash.sub };
  }

  private log(side: Side, type: MatchEvent['type'], text: string) {
    this.events.push({ minute: this.displayMinute, type, side, text });
    if (this.events.length > 60) this.events.shift();
  }

  /** Pick a man of the match from goals, involvement and rating. */
  manOfTheMatch(): { player: MatchPlayer; rating: number } | null {
    let best: MatchPlayer | null = null;
    let bestScore = -Infinity;
    const goalsBy = new Map<string, number>();
    for (const e of this.events) {
      if (e.type !== 'goal') continue;
      const scorer = this.players.find((p) => e.text.startsWith(p.source.name));
      if (scorer) goalsBy.set(scorer.id, (goalsBy.get(scorer.id) ?? 0) + 1);
    }
    for (const p of this.players) {
      const goals = goalsBy.get(p.id) ?? 0;
      const winBonus = this.stats[p.side].goals > this.stats[p.side === 0 ? 1 : 0].goals ? 0.6 : 0;
      const score = goals * 3 + p.overall / 22 + winBonus - (p.sentOff ? 5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) return null;
    const goals = goalsBy.get(best.id) ?? 0;
    const rating = clamp(6.3 + goals * 1.15 + (best.overall - 78) / 26, 5, 10);
    return { player: best, rating: Math.round(rating * 10) / 10 };
  }
}
