import type { Player, PositionGroup, Position, Difficulty, Weather, TimeOfDay } from '../data/types';
import type { Vec2 } from './math';

export type Side = 0 | 1;

export type MatchPhase =
  | 'kickoff'
  | 'play'
  | 'goal'
  | 'throwin'
  | 'corner'
  | 'goalkick'
  | 'freekick'
  | 'penalty'
  | 'halftime'
  | 'fulltime';

export interface MatchPlayer {
  id: string;
  name: string;
  lastName: string;
  number: number;
  side: Side;
  /** Slot the player occupies in the formation. */
  slotPosition: Position;
  group: PositionGroup;
  isGK: boolean;
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  /** Normalised formation anchor for this player's own attacking direction. */
  anchor: Vec2;
  pos: Vec2;
  vel: Vec2;
  facing: number;
  stamina: number;
  /** Seconds until this player may touch the ball again. */
  touchCooldown: number;
  /** Countdown on an active tackle attempt. */
  tackleTimer: number;
  tackleRecovery: number;
  /** Time since the AI last re-evaluated its target — throttles decisions. */
  decisionTimer: number;
  /** Keeper reaction latency remaining before they can track a struck ball. */
  reactTimer: number;
  targetPos: Vec2;
  yellowCards: number;
  sentOff: boolean;
  onPitch: boolean;
  /** Set when the engine wants a visible celebration/animation beat. */
  animation: 'idle' | 'run' | 'sprint' | 'tackle' | 'shoot' | 'pass' | 'celebrate';
  /** Source squad record, for the HUD and post-match screens. */
  source: Player;
}

export interface Ball {
  pos: Vec2;
  z: number;
  vel: Vec2;
  vz: number;
  /** Signed lateral spin, drives the Magnus curve. */
  spin: number;
  owner: MatchPlayer | null;
  lastTouch: MatchPlayer | null;
  lastTouchSide: Side | null;
  /** Set while a pass is in flight, so the receiver can be checked for offside. */
  passTarget: MatchPlayer | null;
  offsideFlagged: MatchPlayer | null;
  /** Set while a shot is in flight, so keeper saves can be credited. */
  shotBy: MatchPlayer | null;
  /** Whether the in-flight shot was heading inside the goal frame. */
  shotOnTarget: boolean;
}

export interface TeamStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passesCompleted: number;
  tackles: number;
  fouls: number;
  corners: number;
  offsides: number;
  yellowCards: number;
  redCards: number;
  /** Accumulated seconds in possession. */
  possessionTime: number;
}

export interface MatchEvent {
  /** Game clock minute. */
  minute: number;
  type: 'goal' | 'yellow' | 'red' | 'foul' | 'offside' | 'save' | 'corner' | 'half' | 'sub' | 'woodwork';
  side: Side;
  text: string;
}

export interface MatchSettings {
  difficulty: Difficulty;
  weather: Weather;
  timeOfDay: TimeOfDay;
  /** Real-world minutes for the whole match, split across two halves. */
  durationMinutes: number;
  stadiumId: string;
  seed: number;
}

export interface InputState {
  moveX: number;
  moveY: number;
  sprint: boolean;
  /** Level-triggered: true while held. */
  shootHeld: boolean;
  jockey: boolean;
  tackleHeld: boolean;
  /** Edge-triggered: consumed by the engine on the next step. */
  pass: boolean;
  through: boolean;
  cross: boolean;
  shootReleased: boolean;
  skill: boolean;
  finesse: boolean;
  cancel: boolean;
  switchPlayer: boolean;
}

export const emptyInput = (): InputState => ({
  moveX: 0,
  moveY: 0,
  sprint: false,
  shootHeld: false,
  jockey: false,
  tackleHeld: false,
  pass: false,
  through: false,
  cross: false,
  shootReleased: false,
  skill: false,
  finesse: false,
  cancel: false,
  switchPlayer: false,
});

export const emptyStats = (): TeamStats => ({
  goals: 0,
  shots: 0,
  shotsOnTarget: 0,
  passes: 0,
  passesCompleted: 0,
  tackles: 0,
  fouls: 0,
  corners: 0,
  offsides: 0,
  yellowCards: 0,
  redCards: 0,
  possessionTime: 0,
});
