/** Shared domain types for teams, players, stadiums and formations. */

export type Position =
  | 'GK'
  | 'CB'
  | 'LB'
  | 'RB'
  | 'LWB'
  | 'RWB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LM'
  | 'RM'
  | 'LW'
  | 'RW'
  | 'ST'
  | 'CF';

export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'FWD';

export type Foot = 'Left' | 'Right';

export interface Player {
  id: string;
  name: string;
  number: number;
  position: Position;
  overall: number;
  foot: Foot;
  nationality: string;
  teamId: string;
  /** Derived attributes, seeded from overall + position so ratings stay coherent. */
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  age: number;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  league: string;
  primaryColor: string;
  secondaryColor: string;
  /** Accent used for crest detailing and GK kit. */
  accentColor: string;
  stadiumId: string;
  players: Player[];
  rating: number;
}

export interface League {
  id: string;
  name: string;
  country: string;
  teams: Team[];
}

export interface Stadium {
  id: string;
  name: string;
  city: string;
  capacity: number;
  /** Dominant seat colour, used by the renderer to paint the stands. */
  seatColor: string;
  /** Secondary seat colour for the tier banding. */
  seatColorAlt: string;
  roof: 'open' | 'partial' | 'closed';
}

export type Difficulty = 'Amateur' | 'Semi-Pro' | 'Professional' | 'World Class' | 'Legendary';

export type Weather = 'Clear' | 'Rainy' | 'Snowy' | 'Foggy';

export type TimeOfDay = 'Day' | 'Night';

export type CameraMode = 'Isometric' | 'Broadcast' | 'Behind Ball' | 'End to End' | 'Tactical';

export interface FormationSlot {
  /** Normalised pitch coords for the home side: 0 = own goal line, 1 = opposition goal line. */
  x: number;
  /** 0 = left touchline, 1 = right touchline. */
  y: number;
  position: Position;
  group: PositionGroup;
}

export interface Formation {
  id: string;
  name: string;
  description: string;
  slots: FormationSlot[];
}

export const POSITION_GROUP: Record<Position, PositionGroup> = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  LWB: 'DEF',
  RWB: 'DEF',
  CDM: 'MID',
  CM: 'MID',
  CAM: 'MID',
  LM: 'MID',
  RM: 'MID',
  LW: 'FWD',
  RW: 'FWD',
  ST: 'FWD',
  CF: 'FWD',
};

export const GROUP_COLOR: Record<PositionGroup, string> = {
  GK: '#FFD700',
  DEF: '#00D9FF',
  MID: '#4ADE80',
  FWD: '#FF7A45',
};

/** How readily a player slots into a given position — drives the chemistry score. */
export function positionAffinity(actual: Position, slot: Position): number {
  if (actual === slot) return 1;
  if (POSITION_GROUP[actual] === 'GK' || POSITION_GROUP[slot] === 'GK') return 0;
  const families: Position[][] = [
    ['CB'],
    ['LB', 'LWB'],
    ['RB', 'RWB'],
    ['CDM', 'CM'],
    ['CM', 'CAM'],
    ['LM', 'LW'],
    ['RM', 'RW'],
    ['ST', 'CF'],
    ['CF', 'CAM'],
  ];
  for (const fam of families) {
    if (fam.includes(actual) && fam.includes(slot)) return 0.75;
  }
  return POSITION_GROUP[actual] === POSITION_GROUP[slot] ? 0.55 : 0.25;
}
