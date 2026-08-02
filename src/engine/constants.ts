/**
 * Pitch geometry in metres. Dimensions follow the 120yd x 80yd brief; all
 * interior markings use the real Laws of the Game measurements so the rendered
 * pitch matches a broadcast one.
 */
export const PITCH = {
  /** 120 yards. */
  length: 109.73,
  /** 80 yards. */
  width: 73.15,
  /** Penalty area: 18yd deep, 44yd wide. */
  penaltyAreaDepth: 16.46,
  penaltyAreaWidth: 40.32,
  /** Goal area ("six yard box"): 6yd deep, 20yd wide. */
  goalAreaDepth: 5.49,
  goalAreaWidth: 18.32,
  /** Penalty spot is 12yd from the goal line. */
  penaltySpot: 10.97,
  /** Centre circle and penalty arc radius: 10yd. */
  circleRadius: 9.15,
  cornerArc: 1.0,
  /** Goal mouth: 8yd x 8ft. */
  goalWidth: 7.32,
  goalHeight: 2.44,
  /** Grass run-off beyond the touchlines before the stands begin. */
  margin: 5.5,
} as const;

export const GOAL_Y_MIN = PITCH.width / 2 - PITCH.goalWidth / 2;
export const GOAL_Y_MAX = PITCH.width / 2 + PITCH.goalWidth / 2;

/** Physics tuning. */
export const PHYS = {
  gravity: 9.81,
  /** Rolling friction on grass, per second. */
  groundFriction: 0.62,
  /** Air drag while the ball is off the deck. */
  airDrag: 0.09,
  /** Vertical restitution on bounce. */
  bounce: 0.56,
  /** Horizontal damping on bounce. */
  bounceFriction: 0.76,
  /** Magnus coefficient — converts spin into lateral acceleration. */
  magnus: 0.55,
  ballRadius: 0.11,
  /** Distance at which a player can take a loose ball under control. */
  controlRadius: 1.35,
  gkControlRadius: 1.95,
  /** How far in front of the dribbler the ball sits. */
  dribbleLead: 0.95,
  playerRadius: 0.45,
} as const;

export const TIMING = {
  /** Fixed simulation step. */
  dt: 1 / 60,
  /** Seconds to fully charge a shot. */
  maxChargeTime: 1.15,
  /** Lockout after a player releases the ball, stops instant re-collection. */
  releaseCooldown: 0.32,
  /** Duration of a tackle attempt's active window. */
  tackleWindow: 0.3,
  tackleRecovery: 0.7,
  /** Pause lengths for stoppages. */
  goalCelebration: 4.2,
  restartPause: 1.4,
  kickoffPause: 1.8,
} as const;

/** Per-difficulty AI and assist tuning. */
export interface DifficultyProfile {
  /** Multiplier on AI top speed. */
  aiSpeed: number;
  /** Seconds of AI decision latency — lower reacts faster. */
  aiReaction: number;
  /** 0..1, how tightly the AI presses the ball. */
  aiPressing: number;
  /** Multiplier on AI pass/shot error. Lower is more accurate. */
  aiError: number;
  /** 0..1, how strongly user passes/shots are auto-corrected toward intent. */
  userAssist: number;
  /** Multiplier on AI keeper reactions. */
  aiKeeper: number;
}

export const DIFFICULTY: Record<string, DifficultyProfile> = {
  Amateur: { aiSpeed: 0.86, aiReaction: 0.55, aiPressing: 0.4, aiError: 1.75, userAssist: 0.92, aiKeeper: 0.78 },
  'Semi-Pro': { aiSpeed: 0.92, aiReaction: 0.4, aiPressing: 0.55, aiError: 1.4, userAssist: 0.8, aiKeeper: 0.86 },
  Professional: { aiSpeed: 0.985, aiReaction: 0.28, aiPressing: 0.7, aiError: 1.1, userAssist: 0.66, aiKeeper: 0.94 },
  'World Class': { aiSpeed: 1.035, aiReaction: 0.18, aiPressing: 0.85, aiError: 0.86, userAssist: 0.5, aiKeeper: 1.0 },
  Legendary: { aiSpeed: 1.08, aiReaction: 0.1, aiPressing: 0.97, aiError: 0.68, userAssist: 0.36, aiKeeper: 1.06 },
};

/** Weather effects on movement and ball behaviour. */
export interface WeatherProfile {
  /** Multiplier on ground friction — rain makes the surface quicker. */
  friction: number;
  /** Multiplier on player acceleration and turning. */
  grip: number;
  /** Extra error added to passes and shots. */
  errorBonus: number;
  /** Multiplier on ball air drag. */
  drag: number;
}

export const WEATHER: Record<string, WeatherProfile> = {
  Clear: { friction: 1, grip: 1, errorBonus: 0, drag: 1 },
  Rainy: { friction: 0.78, grip: 0.88, errorBonus: 0.9, drag: 1.05 },
  Snowy: { friction: 1.45, grip: 0.76, errorBonus: 1.6, drag: 1.12 },
  Foggy: { friction: 1.02, grip: 0.96, errorBonus: 0.55, drag: 1 },
};
