import type { Formation, Position } from './types';
import { POSITION_GROUP } from './types';

/** Build a slot with its position group filled in automatically. */
const s = (x: number, y: number, position: Position) => ({
  x,
  y,
  position,
  group: POSITION_GROUP[position],
});

export const FORMATIONS: Formation[] = [
  {
    id: '4-3-3',
    name: '4-3-3',
    description: 'Wide attacking shape. Wingers hold width, single pivot screens the back four.',
    slots: [
      s(0.05, 0.5, 'GK'),
      s(0.24, 0.14, 'LB'),
      s(0.2, 0.38, 'CB'),
      s(0.2, 0.62, 'CB'),
      s(0.24, 0.86, 'RB'),
      s(0.42, 0.5, 'CDM'),
      s(0.54, 0.28, 'CM'),
      s(0.54, 0.72, 'CM'),
      s(0.78, 0.12, 'LW'),
      s(0.82, 0.5, 'ST'),
      s(0.78, 0.88, 'RW'),
    ],
  },
  {
    id: '4-2-3-1',
    name: '4-2-3-1',
    description: 'Double pivot behind a free number ten. Balanced and hard to break down.',
    slots: [
      s(0.05, 0.5, 'GK'),
      s(0.24, 0.14, 'LB'),
      s(0.2, 0.38, 'CB'),
      s(0.2, 0.62, 'CB'),
      s(0.24, 0.86, 'RB'),
      s(0.4, 0.36, 'CDM'),
      s(0.4, 0.64, 'CDM'),
      s(0.66, 0.14, 'LM'),
      s(0.66, 0.5, 'CAM'),
      s(0.66, 0.86, 'RM'),
      s(0.84, 0.5, 'ST'),
    ],
  },
  {
    id: '3-5-2',
    name: '3-5-2',
    description: 'Back three with flying wing-backs. Overloads the middle third.',
    slots: [
      s(0.05, 0.5, 'GK'),
      s(0.2, 0.26, 'CB'),
      s(0.17, 0.5, 'CB'),
      s(0.2, 0.74, 'CB'),
      s(0.5, 0.08, 'LWB'),
      s(0.42, 0.5, 'CDM'),
      s(0.56, 0.3, 'CM'),
      s(0.56, 0.7, 'CM'),
      s(0.5, 0.92, 'RWB'),
      s(0.82, 0.38, 'ST'),
      s(0.82, 0.62, 'ST'),
    ],
  },
  {
    id: '5-3-2',
    name: '5-3-2',
    description: 'Compact low block. Five at the back, counter through the front two.',
    slots: [
      s(0.05, 0.5, 'GK'),
      s(0.26, 0.08, 'LWB'),
      s(0.18, 0.28, 'CB'),
      s(0.15, 0.5, 'CB'),
      s(0.18, 0.72, 'CB'),
      s(0.26, 0.92, 'RWB'),
      s(0.44, 0.5, 'CDM'),
      s(0.52, 0.28, 'CM'),
      s(0.52, 0.72, 'CM'),
      s(0.78, 0.38, 'ST'),
      s(0.78, 0.62, 'ST'),
    ],
  },
  {
    id: '4-4-2',
    name: '4-4-2',
    description: 'Two banks of four. Classic, disciplined, strong on the counter.',
    slots: [
      s(0.05, 0.5, 'GK'),
      s(0.24, 0.14, 'LB'),
      s(0.2, 0.38, 'CB'),
      s(0.2, 0.62, 'CB'),
      s(0.24, 0.86, 'RB'),
      s(0.52, 0.12, 'LM'),
      s(0.46, 0.38, 'CM'),
      s(0.46, 0.62, 'CM'),
      s(0.52, 0.88, 'RM'),
      s(0.8, 0.38, 'ST'),
      s(0.8, 0.62, 'ST'),
    ],
  },
  {
    id: '4-1-4-1',
    name: '4-1-4-1',
    description: 'Anchor man shields the defence while the midfield four presses high.',
    slots: [
      s(0.05, 0.5, 'GK'),
      s(0.24, 0.14, 'LB'),
      s(0.2, 0.38, 'CB'),
      s(0.2, 0.62, 'CB'),
      s(0.24, 0.86, 'RB'),
      s(0.36, 0.5, 'CDM'),
      s(0.6, 0.12, 'LM'),
      s(0.56, 0.38, 'CM'),
      s(0.56, 0.62, 'CM'),
      s(0.6, 0.88, 'RM'),
      s(0.84, 0.5, 'ST'),
    ],
  },
];

export const getFormation = (id: string): Formation =>
  FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0];
