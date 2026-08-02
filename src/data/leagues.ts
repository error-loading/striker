import type { Foot, League, Player, Position, Team } from './types';

/**
 * Compact roster tuple: [name, shirt number, position, overall, foot, nationality, age].
 * Kept terse so ~380 players stay readable; `buildPlayer` expands each into a full record
 * and derives the six face-card attributes from overall + position.
 */
type Row = [string, number, Position, number, 'L' | 'R', string, number];

interface TeamSeed {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  stadiumId: string;
  roster: Row[];
}

/* ------------------------------------------------------------------ */
/* Attribute derivation                                                */
/* ------------------------------------------------------------------ */

/** Deterministic hash so a given player always gets the same attribute spread. */
function seedOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Per-position weighting of the six visible attributes, relative to overall. */
const ATTR_BIAS: Record<Position, [number, number, number, number, number, number]> = {
  //        pace  shoot  pass  drib  def   phys
  GK: [-22, -34, -12, -20, -30, 2],
  CB: [-9, -26, -10, -13, 8, 8],
  LB: [4, -16, -3, -1, 3, -2],
  RB: [4, -16, -3, -1, 3, -2],
  LWB: [7, -13, -2, 1, 0, -3],
  RWB: [7, -13, -2, 1, 0, -3],
  CDM: [-6, -12, 1, -3, 7, 5],
  CM: [-3, -5, 5, 2, 0, 0],
  CAM: [0, 2, 7, 6, -14, -6],
  LM: [6, -4, 2, 5, -10, -6],
  RM: [6, -4, 2, 5, -10, -6],
  LW: [9, 2, 0, 8, -20, -9],
  RW: [9, 2, 0, 8, -20, -9],
  ST: [5, 9, -6, 3, -24, 3],
  CF: [4, 7, 2, 6, -20, 0],
};

const clamp = (v: number, lo = 34, hi = 99) => Math.max(lo, Math.min(hi, Math.round(v)));

function buildPlayer(row: Row, teamId: string, index: number): Player {
  const [name, number, position, overall, foot, nationality, age] = row;
  const bias = ATTR_BIAS[position];
  const seed = seedOf(name + teamId);
  // Spread of +/-4 keeps sibling attributes from looking cloned.
  const jitter = (i: number) => (((seed * (i + 3) * 9973) % 1) - 0.5) * 8;
  return {
    // Squad index rather than shirt number: guarantees uniqueness even if two
    // squad members are listed with the same number.
    id: `${teamId}-${index}`,
    name,
    number,
    position,
    overall,
    foot: foot === 'L' ? ('Left' as Foot) : ('Right' as Foot),
    nationality,
    teamId,
    age,
    pace: clamp(overall + bias[0] + jitter(0)),
    shooting: clamp(overall + bias[1] + jitter(1)),
    passing: clamp(overall + bias[2] + jitter(2)),
    dribbling: clamp(overall + bias[3] + jitter(3)),
    defending: clamp(overall + bias[4] + jitter(4)),
    physical: clamp(overall + bias[5] + jitter(5)),
  };
}

/* ------------------------------------------------------------------ */
/* Squads                                                              */
/* ------------------------------------------------------------------ */

const PREMIER_LEAGUE: TeamSeed[] = [
  {
    id: 'mci', name: 'Manchester City', shortName: 'MCI',
    primaryColor: '#6BB7D6', secondaryColor: '#FFFFFF', accentColor: '#1C2C5B', stadiumId: 'etihad',
    roster: [
      ['Ederson', 31, 'GK', 87, 'L', 'Brazil', 32],
      ['Stefan Ortega', 18, 'GK', 80, 'R', 'Germany', 33],
      ['Rúben Dias', 3, 'CB', 89, 'R', 'Portugal', 28],
      ['Joško Gvardiol', 24, 'LB', 86, 'L', 'Croatia', 24],
      ['Manuel Akanji', 25, 'CB', 84, 'R', 'Switzerland', 30],
      ['Nathan Aké', 6, 'CB', 82, 'L', 'Netherlands', 31],
      ['Kyle Walker', 2, 'RB', 82, 'R', 'England', 35],
      ['Rico Lewis', 82, 'RB', 79, 'R', 'England', 21],
      ['Rodri', 16, 'CDM', 91, 'R', 'Spain', 29],
      ['Mateo Kovačić', 8, 'CM', 83, 'R', 'Croatia', 31],
      ['Bernardo Silva', 20, 'CM', 87, 'L', 'Portugal', 31],
      ['Kevin De Bruyne', 17, 'CAM', 90, 'R', 'Belgium', 34],
      ['Phil Foden', 47, 'CAM', 88, 'L', 'England', 25],
      ['Jérémy Doku', 11, 'LW', 84, 'L', 'Belgium', 23],
      ['Savinho', 26, 'RW', 82, 'L', 'Brazil', 21],
      ['Erling Haaland', 9, 'ST', 92, 'L', 'Norway', 25],
    ],
  },
  {
    id: 'ars', name: 'Arsenal', shortName: 'ARS',
    primaryColor: '#EF0107', secondaryColor: '#FFFFFF', accentColor: '#063672', stadiumId: 'emirates',
    roster: [
      ['David Raya', 22, 'GK', 85, 'R', 'Spain', 30],
      ['Neto', 32, 'GK', 78, 'R', 'Brazil', 36],
      ['William Saliba', 2, 'CB', 87, 'R', 'France', 24],
      ['Gabriel Magalhães', 6, 'CB', 86, 'L', 'Brazil', 27],
      ['Jurriën Timber', 12, 'RB', 83, 'R', 'Netherlands', 24],
      ['Ben White', 4, 'RB', 83, 'R', 'England', 28],
      ['Riccardo Calafiori', 33, 'LB', 81, 'L', 'Italy', 23],
      ['Myles Lewis-Skelly', 49, 'LB', 76, 'L', 'England', 19],
      ['Declan Rice', 41, 'CDM', 88, 'R', 'England', 26],
      ['Martin Ødegaard', 8, 'CAM', 88, 'L', 'Norway', 26],
      ['Mikel Merino', 23, 'CM', 83, 'L', 'Spain', 29],
      ['Bukayo Saka', 7, 'RW', 88, 'L', 'England', 24],
      ['Gabriel Martinelli', 11, 'LW', 83, 'R', 'Brazil', 24],
      ['Leandro Trossard', 19, 'LW', 83, 'R', 'Belgium', 30],
      ['Kai Havertz', 29, 'ST', 84, 'L', 'Germany', 26],
      ['Gabriel Jesus', 9, 'ST', 82, 'R', 'Brazil', 28],
    ],
  },
  {
    id: 'liv', name: 'Liverpool', shortName: 'LIV',
    primaryColor: '#C8102E', secondaryColor: '#FFFFFF', accentColor: '#00B2A9', stadiumId: 'anfield',
    roster: [
      ['Alisson', 1, 'GK', 89, 'R', 'Brazil', 33],
      ['Giorgi Mamardashvili', 25, 'GK', 82, 'R', 'Georgia', 25],
      ['Virgil van Dijk', 4, 'CB', 89, 'R', 'Netherlands', 34],
      ['Ibrahima Konaté', 5, 'CB', 85, 'R', 'France', 26],
      ['Trent Alexander-Arnold', 66, 'RB', 87, 'R', 'England', 27],
      ['Andrew Robertson', 26, 'LB', 84, 'L', 'Scotland', 31],
      ['Konstantinos Tsimikas', 21, 'LB', 78, 'L', 'Greece', 29],
      ['Ryan Gravenberch', 38, 'CDM', 83, 'R', 'Netherlands', 23],
      ['Alexis Mac Allister', 10, 'CM', 86, 'R', 'Argentina', 26],
      ['Dominik Szoboszlai', 8, 'CAM', 84, 'R', 'Hungary', 25],
      ['Curtis Jones', 17, 'CM', 80, 'R', 'England', 24],
      ['Mohamed Salah', 11, 'RW', 90, 'L', 'Egypt', 33],
      ['Luis Díaz', 7, 'LW', 85, 'R', 'Colombia', 28],
      ['Cody Gakpo', 18, 'LW', 83, 'R', 'Netherlands', 26],
      ['Darwin Núñez', 9, 'ST', 82, 'R', 'Uruguay', 26],
      ['Diogo Jota', 20, 'ST', 83, 'R', 'Portugal', 28],
    ],
  },
  {
    id: 'mun', name: 'Manchester United', shortName: 'MUN',
    primaryColor: '#DA291C', secondaryColor: '#FBE122', accentColor: '#000000', stadiumId: 'oldtrafford',
    roster: [
      ['André Onana', 24, 'GK', 83, 'R', 'Cameroon', 29],
      ['Altay Bayındır', 1, 'GK', 76, 'R', 'Türkiye', 27],
      ['Lisandro Martínez', 6, 'CB', 84, 'L', 'Argentina', 27],
      ['Matthijs de Ligt', 4, 'CB', 84, 'R', 'Netherlands', 26],
      ['Leny Yoro', 15, 'CB', 78, 'R', 'France', 20],
      ['Noussair Mazraoui', 3, 'RB', 82, 'R', 'Morocco', 28],
      ['Diogo Dalot', 20, 'RB', 82, 'R', 'Portugal', 26],
      ['Luke Shaw', 23, 'LB', 80, 'L', 'England', 30],
      ['Bruno Fernandes', 8, 'CAM', 88, 'R', 'Portugal', 31],
      ['Casemiro', 18, 'CDM', 82, 'R', 'Brazil', 33],
      ['Manuel Ugarte', 25, 'CDM', 81, 'R', 'Uruguay', 24],
      ['Kobbie Mainoo', 37, 'CM', 80, 'R', 'England', 20],
      ['Mason Mount', 7, 'CAM', 80, 'R', 'England', 27],
      ['Amad Diallo', 16, 'RW', 80, 'L', 'Ivory Coast', 23],
      ['Marcus Rashford', 10, 'LW', 83, 'R', 'England', 28],
      ['Rasmus Højlund', 11, 'ST', 80, 'R', 'Denmark', 22],
    ],
  },
  {
    id: 'che', name: 'Chelsea', shortName: 'CHE',
    primaryColor: '#034694', secondaryColor: '#FFFFFF', accentColor: '#DBA111', stadiumId: 'stamford',
    roster: [
      ['Robert Sánchez', 1, 'GK', 79, 'R', 'Spain', 28],
      ['Filip Jörgensen', 12, 'GK', 76, 'R', 'Sweden', 23],
      ['Levi Colwill', 6, 'CB', 82, 'L', 'England', 22],
      ['Wesley Fofana', 29, 'CB', 81, 'R', 'France', 25],
      ['Benoît Badiashile', 5, 'CB', 79, 'L', 'France', 24],
      ['Reece James', 24, 'RB', 84, 'R', 'England', 26],
      ['Malo Gusto', 27, 'RB', 79, 'R', 'France', 22],
      ['Marc Cucurella', 3, 'LB', 82, 'L', 'Spain', 27],
      ['Moisés Caicedo', 25, 'CDM', 85, 'R', 'Ecuador', 24],
      ['Enzo Fernández', 8, 'CM', 85, 'R', 'Argentina', 25],
      ['Roméo Lavia', 45, 'CDM', 79, 'R', 'Belgium', 22],
      ['Cole Palmer', 20, 'CAM', 88, 'L', 'England', 23],
      ['Noni Madueke', 11, 'RW', 80, 'L', 'England', 23],
      ['Pedro Neto', 7, 'RW', 82, 'R', 'Portugal', 25],
      ['Jadon Sancho', 19, 'LW', 81, 'L', 'England', 25],
      ['Nicolas Jackson', 15, 'ST', 81, 'R', 'Senegal', 24],
    ],
  },
  {
    id: 'tot', name: 'Tottenham Hotspur', shortName: 'TOT',
    primaryColor: '#132257', secondaryColor: '#FFFFFF', accentColor: '#8DB8E0', stadiumId: 'tottenham',
    roster: [
      ['Guglielmo Vicario', 1, 'GK', 83, 'R', 'Italy', 29],
      ['Fraser Forster', 20, 'GK', 74, 'R', 'England', 37],
      ['Cristian Romero', 17, 'CB', 86, 'R', 'Argentina', 27],
      ['Micky van de Ven', 37, 'CB', 84, 'L', 'Netherlands', 24],
      ['Radu Drăgușin', 6, 'CB', 77, 'R', 'Romania', 23],
      ['Pedro Porro', 23, 'RB', 83, 'R', 'Spain', 26],
      ['Destiny Udogie', 13, 'LB', 81, 'L', 'Italy', 23],
      ['Djed Spence', 24, 'LB', 75, 'R', 'England', 25],
      ['Yves Bissouma', 8, 'CDM', 80, 'R', 'Mali', 29],
      ['Rodrigo Bentancur', 30, 'CM', 81, 'R', 'Uruguay', 28],
      ['James Maddison', 10, 'CAM', 84, 'R', 'England', 29],
      ['Pape Matar Sarr', 29, 'CM', 79, 'R', 'Senegal', 23],
      ['Son Heung-min', 7, 'LW', 86, 'R', 'South Korea', 33],
      ['Dejan Kulusevski', 21, 'RW', 84, 'L', 'Sweden', 25],
      ['Brennan Johnson', 22, 'RW', 79, 'R', 'Wales', 24],
      ['Dominic Solanke', 19, 'ST', 82, 'R', 'England', 28],
    ],
  },
  {
    id: 'new', name: 'Newcastle United', shortName: 'NEW',
    primaryColor: '#241F20', secondaryColor: '#FFFFFF', accentColor: '#41B6E6', stadiumId: 'stjames',
    roster: [
      ['Nick Pope', 22, 'GK', 82, 'R', 'England', 33],
      ['Martin Dúbravka', 32, 'GK', 77, 'R', 'Slovakia', 36],
      ['Sven Botman', 4, 'CB', 82, 'L', 'Netherlands', 25],
      ['Fabian Schär', 5, 'CB', 81, 'R', 'Switzerland', 34],
      ['Dan Burn', 33, 'CB', 78, 'L', 'England', 33],
      ['Kieran Trippier', 2, 'RB', 82, 'R', 'England', 35],
      ['Tino Livramento', 21, 'RB', 78, 'R', 'England', 23],
      ['Lewis Hall', 20, 'LB', 76, 'L', 'England', 21],
      ['Bruno Guimarães', 39, 'CDM', 86, 'R', 'Brazil', 28],
      ['Sandro Tonali', 8, 'CM', 83, 'R', 'Italy', 25],
      ['Joelinton', 7, 'CM', 82, 'R', 'Brazil', 29],
      ['Joe Willock', 28, 'CM', 77, 'R', 'England', 26],
      ['Anthony Gordon', 10, 'LW', 83, 'L', 'England', 24],
      ['Jacob Murphy', 23, 'RW', 78, 'R', 'England', 30],
      ['Harvey Barnes', 15, 'LW', 79, 'R', 'England', 28],
      ['Alexander Isak', 14, 'ST', 87, 'R', 'Sweden', 26],
    ],
  },
  {
    id: 'avl', name: 'Aston Villa', shortName: 'AVL',
    primaryColor: '#95BFE5', secondaryColor: '#670E36', accentColor: '#FFE500', stadiumId: 'villapark',
    roster: [
      ['Emiliano Martínez', 1, 'GK', 86, 'L', 'Argentina', 33],
      ['Robin Olsen', 26, 'GK', 73, 'R', 'Sweden', 35],
      ['Pau Torres', 14, 'CB', 82, 'L', 'Spain', 28],
      ['Ezri Konsa', 4, 'CB', 81, 'R', 'England', 28],
      ['Diego Carlos', 3, 'CB', 78, 'R', 'Brazil', 32],
      ['Matty Cash', 2, 'RB', 78, 'R', 'Poland', 28],
      ['Lucas Digne', 12, 'LB', 79, 'L', 'France', 32],
      ['Ian Maatsen', 22, 'LB', 76, 'L', 'Netherlands', 23],
      ['Boubacar Kamara', 44, 'CDM', 82, 'R', 'France', 26],
      ['Youri Tielemans', 8, 'CM', 82, 'R', 'Belgium', 28],
      ['John McGinn', 7, 'CM', 80, 'R', 'Scotland', 31],
      ['Amadou Onana', 24, 'CDM', 81, 'R', 'Belgium', 24],
      ['Leon Bailey', 31, 'RW', 81, 'L', 'Jamaica', 28],
      ['Morgan Rogers', 27, 'CAM', 78, 'R', 'England', 23],
      ['Ollie Watkins', 11, 'ST', 85, 'R', 'England', 29],
      ['Jhon Durán', 9, 'ST', 78, 'R', 'Colombia', 22],
    ],
  },
];

const LA_LIGA: TeamSeed[] = [
  {
    id: 'rma', name: 'Real Madrid', shortName: 'RMA',
    primaryColor: '#FFFFFF', secondaryColor: '#FEBE10', accentColor: '#00529F', stadiumId: 'bernabeu',
    roster: [
      ['Thibaut Courtois', 1, 'GK', 89, 'L', 'Belgium', 33],
      ['Andriy Lunin', 13, 'GK', 80, 'R', 'Ukraine', 26],
      ['Antonio Rüdiger', 22, 'CB', 86, 'R', 'Germany', 32],
      ['Éder Militão', 3, 'CB', 84, 'R', 'Brazil', 27],
      ['David Alaba', 4, 'CB', 82, 'L', 'Austria', 33],
      ['Dani Carvajal', 2, 'RB', 85, 'R', 'Spain', 33],
      ['Ferland Mendy', 23, 'LB', 82, 'L', 'France', 30],
      ['Fran García', 20, 'LB', 77, 'L', 'Spain', 26],
      ['Aurélien Tchouaméni', 14, 'CDM', 85, 'R', 'France', 25],
      ['Federico Valverde', 15, 'CM', 88, 'R', 'Uruguay', 27],
      ['Jude Bellingham', 5, 'CAM', 90, 'R', 'England', 22],
      ['Eduardo Camavinga', 12, 'CM', 84, 'L', 'France', 23],
      ['Vinícius Júnior', 7, 'LW', 91, 'R', 'Brazil', 25],
      ['Rodrygo', 11, 'RW', 86, 'R', 'Brazil', 25],
      ['Brahim Díaz', 21, 'RW', 81, 'L', 'Morocco', 26],
      ['Kylian Mbappé', 9, 'ST', 91, 'R', 'France', 27],
    ],
  },
  {
    id: 'bar', name: 'FC Barcelona', shortName: 'BAR',
    primaryColor: '#A50044', secondaryColor: '#004D98', accentColor: '#EDBB00', stadiumId: 'campnou',
    roster: [
      ['Marc-André ter Stegen', 1, 'GK', 87, 'R', 'Germany', 33],
      ['Iñaki Peña', 13, 'GK', 76, 'R', 'Spain', 26],
      ['Pau Cubarsí', 2, 'CB', 82, 'R', 'Spain', 18],
      ['Íñigo Martínez', 5, 'CB', 82, 'L', 'Spain', 34],
      ['Ronald Araújo', 4, 'CB', 85, 'R', 'Uruguay', 26],
      ['Jules Koundé', 23, 'RB', 84, 'R', 'France', 27],
      ['Alejandro Balde', 3, 'LB', 81, 'L', 'Spain', 22],
      ['Héctor Fort', 32, 'RB', 72, 'R', 'Spain', 19],
      ['Frenkie de Jong', 21, 'CM', 85, 'R', 'Netherlands', 28],
      ['Pedri', 8, 'CM', 87, 'R', 'Spain', 23],
      ['Gavi', 6, 'CM', 83, 'R', 'Spain', 21],
      ['Marc Casadó', 17, 'CDM', 76, 'R', 'Spain', 22],
      ['Lamine Yamal', 19, 'RW', 87, 'L', 'Spain', 18],
      ['Raphinha', 11, 'LW', 86, 'L', 'Brazil', 29],
      ['Dani Olmo', 20, 'CAM', 85, 'R', 'Spain', 27],
      ['Robert Lewandowski', 9, 'ST', 87, 'R', 'Poland', 37],
    ],
  },
  {
    id: 'atm', name: 'Atlético de Madrid', shortName: 'ATM',
    primaryColor: '#CB3524', secondaryColor: '#FFFFFF', accentColor: '#272E61', stadiumId: 'metropolitano',
    roster: [
      ['Jan Oblak', 13, 'GK', 87, 'R', 'Slovenia', 32],
      ['Juan Musso', 1, 'GK', 77, 'R', 'Argentina', 31],
      ['José María Giménez', 2, 'CB', 84, 'R', 'Uruguay', 30],
      ['Robin Le Normand', 24, 'CB', 83, 'R', 'Spain', 29],
      ['Clément Lenglet', 15, 'CB', 79, 'L', 'France', 30],
      ['Nahuel Molina', 16, 'RB', 80, 'R', 'Argentina', 27],
      ['Reinildo Mandava', 23, 'LB', 78, 'L', 'Mozambique', 31],
      ['Javi Galán', 21, 'LB', 77, 'L', 'Spain', 30],
      ['Rodrigo De Paul', 5, 'CM', 83, 'R', 'Argentina', 31],
      ['Koke', 6, 'CM', 82, 'R', 'Spain', 33],
      ['Pablo Barrios', 8, 'CM', 79, 'R', 'Spain', 22],
      ['Marcos Llorente', 14, 'RM', 83, 'R', 'Spain', 30],
      ['Antoine Griezmann', 7, 'CF', 87, 'L', 'France', 34],
      ['Samuel Lino', 12, 'LW', 79, 'R', 'Brazil', 26],
      ['Julián Álvarez', 19, 'ST', 86, 'R', 'Argentina', 25],
      ['Alexander Sørloth', 9, 'ST', 82, 'L', 'Norway', 30],
    ],
  },
  {
    id: 'ath', name: 'Athletic Club', shortName: 'ATH',
    primaryColor: '#EE2523', secondaryColor: '#FFFFFF', accentColor: '#000000', stadiumId: 'sanmames',
    roster: [
      ['Unai Simón', 1, 'GK', 85, 'R', 'Spain', 28],
      ['Julen Agirrezabala', 13, 'GK', 74, 'R', 'Spain', 25],
      ['Dani Vivian', 3, 'CB', 81, 'R', 'Spain', 26],
      ['Aitor Paredes', 24, 'CB', 78, 'R', 'Spain', 25],
      ['Yeray Álvarez', 5, 'CB', 78, 'R', 'Spain', 30],
      ['Óscar de Marcos', 18, 'RB', 77, 'R', 'Spain', 36],
      ['Yuri Berchiche', 17, 'LB', 78, 'L', 'Spain', 35],
      ['Andoni Gorosabel', 15, 'RB', 75, 'R', 'Spain', 29],
      ['Mikel Vesga', 6, 'CDM', 76, 'R', 'Spain', 32],
      ['Mikel Jauregizar', 20, 'CDM', 74, 'R', 'Spain', 22],
      ['Oihan Sancet', 8, 'CAM', 82, 'R', 'Spain', 25],
      ['Beñat Prados', 16, 'CM', 74, 'R', 'Spain', 24],
      ['Nico Williams', 10, 'LW', 85, 'R', 'Spain', 23],
      ['Iñaki Williams', 9, 'RW', 82, 'R', 'Ghana', 31],
      ['Álex Berenguer', 7, 'LW', 79, 'R', 'Spain', 30],
      ['Gorka Guruzeta', 12, 'ST', 77, 'R', 'Spain', 29],
    ],
  },
];

const SERIE_A: TeamSeed[] = [
  {
    id: 'int', name: 'Inter', shortName: 'INT',
    primaryColor: '#0068A8', secondaryColor: '#000000', accentColor: '#FFFFFF', stadiumId: 'sansiro',
    roster: [
      ['Yann Sommer', 1, 'GK', 84, 'R', 'Switzerland', 37],
      ['Josep Martínez', 13, 'GK', 76, 'R', 'Spain', 27],
      ['Alessandro Bastoni', 95, 'CB', 86, 'L', 'Italy', 26],
      ['Francesco Acerbi', 15, 'CB', 81, 'L', 'Italy', 37],
      ['Benjamin Pavard', 28, 'CB', 83, 'R', 'France', 29],
      ['Stefan de Vrij', 6, 'CB', 80, 'R', 'Netherlands', 33],
      ['Denzel Dumfries', 2, 'RWB', 82, 'R', 'Netherlands', 29],
      ['Federico Dimarco', 32, 'LWB', 85, 'L', 'Italy', 28],
      ['Nicolò Barella', 23, 'CM', 87, 'R', 'Italy', 28],
      ['Hakan Çalhanoğlu', 20, 'CDM', 86, 'R', 'Türkiye', 31],
      ['Henrikh Mkhitaryan', 22, 'CM', 82, 'R', 'Armenia', 36],
      ['Davide Frattesi', 16, 'CM', 80, 'R', 'Italy', 26],
      ['Piotr Zieliński', 7, 'CM', 82, 'R', 'Poland', 31],
      ['Lautaro Martínez', 10, 'ST', 89, 'R', 'Argentina', 28],
      ['Marcus Thuram', 9, 'ST', 85, 'R', 'France', 28],
      ['Mehdi Taremi', 99, 'ST', 82, 'R', 'Iran', 33],
    ],
  },
  {
    id: 'mil', name: 'AC Milan', shortName: 'MIL',
    primaryColor: '#FB090B', secondaryColor: '#000000', accentColor: '#D4AF37', stadiumId: 'sansiro',
    roster: [
      ['Mike Maignan', 16, 'GK', 87, 'R', 'France', 30],
      ['Marco Sportiello', 57, 'GK', 74, 'R', 'Italy', 33],
      ['Fikayo Tomori', 23, 'CB', 83, 'R', 'England', 28],
      ['Malick Thiaw', 28, 'CB', 79, 'R', 'Germany', 24],
      ['Strahinja Pavlović', 31, 'CB', 79, 'L', 'Serbia', 24],
      ['Theo Hernández', 19, 'LB', 86, 'L', 'France', 28],
      ['Emerson Royal', 22, 'RB', 78, 'R', 'Brazil', 26],
      ['Davide Calabria', 2, 'RB', 78, 'R', 'Italy', 29],
      ['Tijjani Reijnders', 14, 'CM', 83, 'R', 'Netherlands', 27],
      ['Youssouf Fofana', 29, 'CDM', 81, 'R', 'France', 26],
      ['Ruben Loftus-Cheek', 8, 'CM', 79, 'R', 'England', 29],
      ['Christian Pulisic', 11, 'RW', 84, 'R', 'United States', 27],
      ['Rafael Leão', 10, 'LW', 86, 'R', 'Portugal', 26],
      ['Samuel Chukwueze', 21, 'RW', 78, 'L', 'Nigeria', 26],
      ['Álvaro Morata', 7, 'ST', 82, 'R', 'Spain', 33],
      ['Tammy Abraham', 90, 'ST', 78, 'R', 'England', 28],
    ],
  },
  {
    id: 'juv', name: 'Juventus', shortName: 'JUV',
    primaryColor: '#000000', secondaryColor: '#FFFFFF', accentColor: '#D4AF37', stadiumId: 'allianzstadium',
    roster: [
      ['Michele Di Gregorio', 29, 'GK', 81, 'R', 'Italy', 28],
      ['Mattia Perin', 36, 'GK', 77, 'R', 'Italy', 33],
      ['Gleison Bremer', 3, 'CB', 85, 'R', 'Brazil', 28],
      ['Federico Gatti', 4, 'CB', 79, 'R', 'Italy', 27],
      ['Pierre Kalulu', 15, 'CB', 79, 'R', 'France', 25],
      ['Andrea Cambiaso', 27, 'LB', 81, 'L', 'Italy', 25],
      ['Juan Cabal', 32, 'LB', 75, 'L', 'Colombia', 24],
      ['Nicolò Savona', 37, 'RB', 72, 'R', 'Italy', 22],
      ['Manuel Locatelli', 5, 'CDM', 81, 'R', 'Italy', 27],
      ['Khéphren Thuram', 19, 'CM', 80, 'R', 'France', 24],
      ['Teun Koopmeiners', 8, 'CAM', 84, 'R', 'Netherlands', 27],
      ['Weston McKennie', 16, 'CM', 79, 'R', 'United States', 27],
      ['Nicolás González', 22, 'LW', 82, 'R', 'Argentina', 27],
      ['Kenan Yıldız', 10, 'CAM', 79, 'L', 'Türkiye', 20],
      ['Francisco Conceição', 7, 'RW', 78, 'L', 'Portugal', 23],
      ['Dušan Vlahović', 9, 'ST', 84, 'L', 'Serbia', 25],
    ],
  },
  {
    id: 'nap', name: 'Napoli', shortName: 'NAP',
    primaryColor: '#12A0D7', secondaryColor: '#FFFFFF', accentColor: '#003C82', stadiumId: 'maradona',
    roster: [
      ['Alex Meret', 1, 'GK', 81, 'R', 'Italy', 28],
      ['Elia Caprile', 25, 'GK', 74, 'R', 'Italy', 24],
      ['Amir Rrahmani', 13, 'CB', 82, 'R', 'Kosovo', 31],
      ['Alessandro Buongiorno', 4, 'CB', 82, 'L', 'Italy', 26],
      ['Juan Jesus', 5, 'CB', 76, 'L', 'Brazil', 34],
      ['Giovanni Di Lorenzo', 22, 'RB', 84, 'R', 'Italy', 32],
      ['Mathías Olivera', 17, 'LB', 79, 'L', 'Uruguay', 28],
      ['Leonardo Spinazzola', 37, 'LB', 77, 'L', 'Italy', 32],
      ['Stanislav Lobotka', 68, 'CDM', 84, 'R', 'Slovakia', 31],
      ['Frank Anguissa', 99, 'CM', 83, 'R', 'Cameroon', 30],
      ['Scott McTominay', 8, 'CM', 81, 'R', 'Scotland', 29],
      ['Billy Gilmour', 6, 'CM', 76, 'R', 'Scotland', 24],
      ['Khvicha Kvaratskhelia', 77, 'LW', 87, 'R', 'Georgia', 25],
      ['Matteo Politano', 21, 'RW', 80, 'L', 'Italy', 32],
      ['David Neres', 7, 'RW', 80, 'L', 'Brazil', 29],
      ['Romelu Lukaku', 11, 'ST', 84, 'L', 'Belgium', 32],
    ],
  },
];

const BUNDESLIGA: TeamSeed[] = [
  {
    id: 'bay', name: 'Bayern München', shortName: 'BAY',
    primaryColor: '#DC052D', secondaryColor: '#FFFFFF', accentColor: '#0066B2', stadiumId: 'allianzarena',
    roster: [
      ['Manuel Neuer', 1, 'GK', 87, 'R', 'Germany', 39],
      ['Sven Ulreich', 26, 'GK', 75, 'R', 'Germany', 37],
      ['Dayot Upamecano', 2, 'CB', 84, 'R', 'France', 27],
      ['Kim Min-jae', 3, 'CB', 84, 'R', 'South Korea', 29],
      ['Eric Dier', 15, 'CB', 79, 'R', 'England', 31],
      ['Alphonso Davies', 19, 'LB', 85, 'L', 'Canada', 25],
      ['Josip Stanišić', 44, 'RB', 77, 'R', 'Croatia', 25],
      ['Konrad Laimer', 27, 'RB', 80, 'R', 'Austria', 28],
      ['Joshua Kimmich', 6, 'CDM', 87, 'R', 'Germany', 30],
      ['Leon Goretzka', 8, 'CM', 82, 'R', 'Germany', 31],
      ['Aleksandar Pavlović', 45, 'CDM', 79, 'R', 'Germany', 21],
      ['Jamal Musiala', 42, 'CAM', 88, 'R', 'Germany', 22],
      ['Michael Olise', 17, 'RW', 85, 'L', 'France', 24],
      ['Leroy Sané', 10, 'RW', 84, 'L', 'Germany', 30],
      ['Kingsley Coman', 11, 'LW', 84, 'R', 'France', 29],
      ['Harry Kane', 9, 'ST', 90, 'R', 'England', 32],
    ],
  },
  {
    id: 'lev', name: 'Bayer 04 Leverkusen', shortName: 'B04',
    primaryColor: '#E32221', secondaryColor: '#000000', accentColor: '#FFFFFF', stadiumId: 'bayarena',
    roster: [
      ['Lukáš Hrádecký', 1, 'GK', 83, 'L', 'Finland', 36],
      ['Matěj Kovář', 12, 'GK', 75, 'R', 'Czechia', 25],
      ['Jonathan Tah', 4, 'CB', 84, 'R', 'Germany', 29],
      ['Edmond Tapsoba', 6, 'CB', 83, 'R', 'Burkina Faso', 26],
      ['Piero Hincapié', 3, 'CB', 82, 'L', 'Ecuador', 23],
      ['Jeremie Frimpong', 30, 'RWB', 84, 'R', 'Netherlands', 25],
      ['Alejandro Grimaldo', 20, 'LWB', 85, 'L', 'Spain', 30],
      ['Arthur Augusto', 2, 'CB', 74, 'R', 'Brazil', 22],
      ['Granit Xhaka', 34, 'CDM', 85, 'L', 'Switzerland', 33],
      ['Exequiel Palacios', 25, 'CM', 82, 'R', 'Argentina', 27],
      ['Robert Andrich', 8, 'CDM', 80, 'R', 'Germany', 31],
      ['Florian Wirtz', 10, 'CAM', 89, 'R', 'Germany', 22],
      ['Amine Adli', 21, 'LW', 79, 'R', 'Morocco', 25],
      ['Nathan Tella', 24, 'RW', 78, 'R', 'Nigeria', 26],
      ['Patrik Schick', 14, 'ST', 83, 'R', 'Czechia', 29],
      ['Victor Boniface', 22, 'ST', 82, 'R', 'Nigeria', 25],
    ],
  },
  {
    id: 'bvb', name: 'Borussia Dortmund', shortName: 'BVB',
    primaryColor: '#FDE100', secondaryColor: '#000000', accentColor: '#FFFFFF', stadiumId: 'signaliduna',
    roster: [
      ['Gregor Kobel', 1, 'GK', 86, 'R', 'Switzerland', 28],
      ['Alexander Meyer', 33, 'GK', 72, 'R', 'Germany', 34],
      ['Nico Schlotterbeck', 4, 'CB', 83, 'L', 'Germany', 26],
      ['Niklas Süle', 25, 'CB', 81, 'R', 'Germany', 30],
      ['Waldemar Anton', 2, 'CB', 79, 'R', 'Germany', 29],
      ['Julian Ryerson', 26, 'RB', 79, 'R', 'Norway', 28],
      ['Ramy Bensebaini', 5, 'LB', 79, 'L', 'Algeria', 30],
      ['Yan Couto', 7, 'RB', 77, 'R', 'Brazil', 23],
      ['Emre Can', 23, 'CDM', 80, 'R', 'Germany', 31],
      ['Pascal Groß', 13, 'CM', 81, 'R', 'Germany', 34],
      ['Marcel Sabitzer', 20, 'CM', 81, 'R', 'Austria', 31],
      ['Felix Nmecha', 8, 'CM', 78, 'R', 'Germany', 25],
      ['Julian Brandt', 19, 'CAM', 83, 'L', 'Germany', 29],
      ['Karim Adeyemi', 27, 'LW', 81, 'L', 'Germany', 24],
      ['Donyell Malen', 21, 'RW', 81, 'R', 'Netherlands', 26],
      ['Serhou Guirassy', 9, 'ST', 84, 'R', 'Guinea', 29],
    ],
  },
  {
    id: 'rbl', name: 'RB Leipzig', shortName: 'RBL',
    primaryColor: '#DD0741', secondaryColor: '#FFFFFF', accentColor: '#001F47', stadiumId: 'redbullarena',
    roster: [
      ['Péter Gulácsi', 1, 'GK', 81, 'R', 'Hungary', 35],
      ['Maarten Vandevoordt', 21, 'GK', 74, 'R', 'Belgium', 24],
      ['Willi Orbán', 4, 'CB', 82, 'R', 'Hungary', 33],
      ['Castello Lukeba', 5, 'CB', 81, 'L', 'France', 23],
      ['Lutsharel Geertruida', 6, 'CB', 79, 'R', 'Netherlands', 25],
      ['Benjamin Henrichs', 39, 'RB', 78, 'R', 'Germany', 28],
      ['David Raum', 22, 'LB', 80, 'L', 'Germany', 27],
      ['El Chadaille Bitshiabu', 3, 'CB', 74, 'L', 'France', 20],
      ['Xaver Schlager', 24, 'CDM', 81, 'R', 'Austria', 28],
      ['Kevin Kampl', 44, 'CM', 78, 'R', 'Slovenia', 35],
      ['Christoph Baumgartner', 14, 'CAM', 80, 'R', 'Austria', 26],
      ['Nicolas Seiwald', 13, 'CDM', 78, 'R', 'Austria', 24],
      ['Xavi Simons', 10, 'CAM', 84, 'R', 'Netherlands', 22],
      ['Antonio Nusa', 7, 'LW', 78, 'R', 'Norway', 20],
      ['Loïs Openda', 17, 'ST', 84, 'R', 'Belgium', 25],
      ['Benjamin Šeško', 30, 'ST', 82, 'R', 'Slovenia', 22],
    ],
  },
];

const LIGUE_1: TeamSeed[] = [
  {
    id: 'psg', name: 'Paris Saint-Germain', shortName: 'PSG',
    primaryColor: '#004170', secondaryColor: '#DA291C', accentColor: '#FFFFFF', stadiumId: 'parcdesprinces',
    roster: [
      ['Gianluigi Donnarumma', 99, 'GK', 87, 'R', 'Italy', 26],
      ['Matvey Safonov', 39, 'GK', 78, 'R', 'Russia', 26],
      ['Marquinhos', 5, 'CB', 85, 'R', 'Brazil', 31],
      ['Willian Pacho', 51, 'CB', 82, 'L', 'Ecuador', 24],
      ['Lucas Beraldo', 35, 'CB', 76, 'L', 'Brazil', 22],
      ['Achraf Hakimi', 2, 'RB', 86, 'R', 'Morocco', 27],
      ['Nuno Mendes', 25, 'LB', 84, 'L', 'Portugal', 23],
      ['Lucas Hernández', 21, 'CB', 81, 'L', 'France', 29],
      ['Vitinha', 17, 'CM', 85, 'R', 'Portugal', 25],
      ['João Neves', 87, 'CDM', 84, 'R', 'Portugal', 21],
      ['Fabián Ruiz', 8, 'CM', 84, 'L', 'Spain', 29],
      ['Warren Zaïre-Emery', 33, 'CM', 82, 'R', 'France', 19],
      ['Ousmane Dembélé', 10, 'RW', 85, 'L', 'France', 28],
      ['Bradley Barcola', 29, 'LW', 83, 'R', 'France', 23],
      ['Désiré Doué', 14, 'CAM', 79, 'L', 'France', 20],
      ['Gonçalo Ramos', 9, 'ST', 82, 'R', 'Portugal', 24],
    ],
  },
  {
    id: 'om', name: 'Olympique de Marseille', shortName: 'OM',
    primaryColor: '#2FAEE0', secondaryColor: '#FFFFFF', accentColor: '#003B73', stadiumId: 'velodrome',
    roster: [
      ['Gerónimo Rulli', 16, 'GK', 80, 'R', 'Argentina', 33],
      ['Jeffrey de Lange', 30, 'GK', 71, 'R', 'Netherlands', 27],
      ['Leonardo Balerdi', 5, 'CB', 79, 'R', 'Argentina', 27],
      ['Derek Cornelius', 15, 'CB', 74, 'L', 'Canada', 28],
      ['Lilian Brassier', 4, 'CB', 74, 'L', 'France', 26],
      ['Amir Murillo', 12, 'RB', 76, 'R', 'Panama', 29],
      ['Quentin Merlin', 27, 'LB', 75, 'L', 'France', 23],
      ['Ulisses Garcia', 23, 'LB', 73, 'L', 'Switzerland', 29],
      ['Geoffrey Kondogbia', 20, 'CDM', 79, 'R', 'Central African Rep.', 32],
      ['Pierre-Emile Højbjerg', 21, 'CM', 82, 'R', 'Denmark', 30],
      ['Valentin Rongier', 17, 'CM', 77, 'R', 'France', 31],
      ['Adrien Rabiot', 25, 'CM', 83, 'L', 'France', 30],
      ['Mason Greenwood', 10, 'RW', 82, 'L', 'England', 24],
      ['Luis Henrique', 11, 'RW', 76, 'R', 'Brazil', 24],
      ['Amine Gouiri', 7, 'ST', 78, 'R', 'Algeria', 25],
      ['Elye Wahi', 9, 'ST', 77, 'R', 'France', 23],
    ],
  },
  {
    id: 'asm', name: 'AS Monaco', shortName: 'ASM',
    primaryColor: '#CE1126', secondaryColor: '#FFFFFF', accentColor: '#000000', stadiumId: 'louisii',
    roster: [
      ['Philipp Köhn', 1, 'GK', 77, 'R', 'Switzerland', 27],
      ['Radosław Majecki', 16, 'GK', 73, 'R', 'Poland', 26],
      ['Thilo Kehrer', 4, 'CB', 79, 'R', 'Germany', 29],
      ['Mohammed Salisu', 24, 'CB', 78, 'R', 'Ghana', 26],
      ['Christian Mawissa', 32, 'CB', 72, 'R', 'France', 20],
      ['Vanderson', 12, 'RB', 78, 'R', 'Brazil', 24],
      ['Caio Henrique', 6, 'LB', 78, 'L', 'Brazil', 28],
      ['Jordan Teze', 2, 'RB', 76, 'R', 'Netherlands', 26],
      ['Denis Zakaria', 20, 'CDM', 82, 'R', 'Switzerland', 29],
      ['Lamine Camara', 22, 'CM', 75, 'R', 'Senegal', 21],
      ['Aleksandr Golovin', 11, 'CAM', 82, 'R', 'Russia', 29],
      ['Eliesse Ben Seghir', 7, 'CAM', 78, 'R', 'Morocco', 20],
      ['Takumi Minamino', 18, 'CAM', 78, 'R', 'Japan', 30],
      ['Maghnes Akliouche', 8, 'RW', 78, 'R', 'France', 23],
      ['Folarin Balogun', 21, 'ST', 78, 'L', 'United States', 24],
      ['Breel Embolo', 36, 'ST', 78, 'R', 'Switzerland', 28],
    ],
  },
  {
    id: 'ol', name: 'Olympique Lyonnais', shortName: 'OL',
    primaryColor: '#FFFFFF', secondaryColor: '#D6001C', accentColor: '#0B3C7E', stadiumId: 'groupama',
    roster: [
      ['Lucas Perri', 1, 'GK', 78, 'R', 'Brazil', 28],
      ['Rémy Descamps', 30, 'GK', 71, 'R', 'France', 29],
      ['Moussa Niakhaté', 5, 'CB', 78, 'L', 'Senegal', 29],
      ['Duje Ćaleta-Car', 4, 'CB', 76, 'R', 'Croatia', 29],
      ['Clinton Mata', 3, 'CB', 76, 'R', 'Angola', 33],
      ['Saël Kumbedi', 24, 'RB', 73, 'R', 'France', 20],
      ['Nicolás Tagliafico', 12, 'LB', 78, 'L', 'Argentina', 33],
      ['Abner Vinícius', 22, 'LB', 74, 'L', 'Brazil', 25],
      ['Nemanja Matić', 31, 'CDM', 78, 'L', 'Serbia', 37],
      ['Corentin Tolisso', 8, 'CM', 79, 'R', 'France', 31],
      ['Maxence Caqueret', 6, 'CM', 77, 'R', 'France', 25],
      ['Jordan Veretout', 27, 'CM', 76, 'R', 'France', 32],
      ['Rayan Cherki', 18, 'CAM', 80, 'L', 'France', 22],
      ['Malick Fofana', 11, 'LW', 76, 'R', 'Belgium', 20],
      ['Alexandre Lacazette', 10, 'ST', 80, 'R', 'France', 34],
      ['Georges Mikautadze', 69, 'ST', 78, 'R', 'Georgia', 25],
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

function buildTeam(seed: TeamSeed, league: string): Team {
  const players = seed.roster.map((row, i) => buildPlayer(row, seed.id, i));
  // Club rating = mean of the eleven best, which tracks how EA rates a squad.
  const top11 = [...players].sort((a, b) => b.overall - a.overall).slice(0, 11);
  const rating = Math.round(top11.reduce((sum, p) => sum + p.overall, 0) / top11.length);
  return { ...seed, league, players, rating };
}

export const LEAGUES: League[] = [
  { id: 'pl', name: 'Premier League', country: 'England', teams: PREMIER_LEAGUE.map((t) => buildTeam(t, 'Premier League')) },
  { id: 'liga', name: 'LaLiga', country: 'Spain', teams: LA_LIGA.map((t) => buildTeam(t, 'LaLiga')) },
  { id: 'seriea', name: 'Serie A', country: 'Italy', teams: SERIE_A.map((t) => buildTeam(t, 'Serie A')) },
  { id: 'bundesliga', name: 'Bundesliga', country: 'Germany', teams: BUNDESLIGA.map((t) => buildTeam(t, 'Bundesliga')) },
  { id: 'ligue1', name: 'Ligue 1', country: 'France', teams: LIGUE_1.map((t) => buildTeam(t, 'Ligue 1')) },
];

export const ALL_TEAMS: Team[] = LEAGUES.flatMap((l) => l.teams);

export const getTeam = (id: string): Team =>
  ALL_TEAMS.find((t) => t.id === id) ?? ALL_TEAMS[0];

export const ALL_PLAYERS: Player[] = ALL_TEAMS.flatMap((t) => t.players);
