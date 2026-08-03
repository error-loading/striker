import { create } from 'zustand';
import { getTeam } from '../data/leagues';
import { FORMATIONS, getFormation } from '../data/formations';
import { positionAffinity, type CameraMode, type Difficulty, type Formation, type Player, type TimeOfDay, type Weather } from '../data/types';
import { ARCADE_BINDINGS, DEFAULT_BINDINGS, type Bindings } from '../engine/input';
import type { MatchEngine } from '../engine/engine';

export type Screen =
  | 'landing'
  | 'squad'
  | 'setup'
  | 'prematch'
  | 'match'
  | 'halftime'
  | 'fulltime'
  | 'settings'
  | 'about';

export interface SavedSquad {
  id: string;
  name: string;
  teamId: string;
  formationId: string;
  /** Player ids, index-aligned with the formation slots. */
  starterIds: string[];
  savedAt: number;
}

export interface UserSettings {
  bindings: Bindings;
  controlScheme: 'Pro' | 'Arcade';
  cameraMode: CameraMode;
  showPlayerNames: boolean;
  showOffsideLine: boolean;
  audioEnabled: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  crowdVolume: number;
}

interface GameState {
  screen: Screen;
  userTeamId: string;
  opponentTeamId: string;
  formationId: string;
  opponentFormationId: string;
  /** Index-aligned with the chosen formation's slots. */
  starters: (Player | null)[];
  difficulty: Difficulty;
  weather: Weather;
  timeOfDay: TimeOfDay;
  durationMinutes: number;
  stadiumId: string;
  savedSquads: SavedSquad[];
  settings: UserSettings;
  /** Live engine; deliberately not used for reactive rendering. */
  engine: MatchEngine | null;

  setScreen: (s: Screen) => void;
  selectTeam: (teamId: string) => void;
  setOpponent: (teamId: string) => void;
  setFormation: (id: string) => void;
  setStarter: (index: number, player: Player | null) => void;
  swapStarters: (a: number, b: number) => void;
  autoPickSquad: () => void;
  setMatchOption: <K extends keyof GameState>(key: K, value: GameState[K]) => void;
  updateSettings: (patch: Partial<UserSettings>) => void;
  saveSquad: (name: string) => void;
  loadSquad: (id: string) => void;
  deleteSquad: (id: string) => void;
  setEngine: (e: MatchEngine | null) => void;
  /** Bench = squad members not in the XI. */
  bench: () => Player[];
  squadRating: () => number;
  chemistry: () => number;
}

const SETTINGS_KEY = 'fifa26:settings';
const SQUADS_KEY = 'fifa26:squads';

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as T) } as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Settings saved before the camera rework name a mode that no longer exists.
 * Map it onto its replacement rather than leaving the renderer without a mode.
 */
function migrateSettings(s: UserSettings): UserSettings {
  const legacy = s.cameraMode as CameraMode | 'Isometric';
  return legacy === 'Isometric' ? { ...s, cameraMode: 'Sideline' } : s;
}

function loadSquads(): SavedSquad[] {
  try {
    const raw = localStorage.getItem(SQUADS_KEY);
    return raw ? (JSON.parse(raw) as SavedSquad[]) : [];
  } catch {
    return [];
  }
}

const DEFAULT_SETTINGS: UserSettings = {
  bindings: DEFAULT_BINDINGS,
  controlScheme: 'Pro',
  cameraMode: 'Sideline',
  showPlayerNames: false,
  showOffsideLine: true,
  audioEnabled: true,
  masterVolume: 0.7,
  musicVolume: 0.3,
  sfxVolume: 0.8,
  crowdVolume: 0.55,
};

/**
 * Fill a formation with the best available players, matching each slot to the
 * highest-rated squad member who can play there.
 */
export function pickBestXI(teamId: string, formation: Formation): (Player | null)[] {
  const squad = [...getTeam(teamId).players];
  const used = new Set<string>();
  const result: (Player | null)[] = [];

  // Keepers first — nobody else can do the job.
  for (const slot of formation.slots) {
    if (slot.position !== 'GK') {
      result.push(null);
      continue;
    }
    const gk = squad
      .filter((p) => p.position === 'GK' && !used.has(p.id))
      .sort((a, b) => b.overall - a.overall)[0];
    if (gk) used.add(gk.id);
    result.push(gk ?? null);
  }

  // Then outfield slots, most specialised first so wingers aren't eaten by CMs.
  const order = formation.slots
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => slot.position !== 'GK');

  for (const { slot, i } of order) {
    const best = squad
      .filter((p) => p.position !== 'GK' && !used.has(p.id))
      .map((p) => ({ p, score: p.overall * (0.55 + positionAffinity(p.position, slot.position) * 0.75) }))
      .sort((a, b) => b.score - a.score)[0];
    if (best) {
      used.add(best.p.id);
      result[i] = best.p;
    }
  }
  return result;
}

export const useGame = create<GameState>((set, get) => ({
  screen: 'landing',
  userTeamId: 'mci',
  opponentTeamId: 'rma',
  formationId: '4-3-3',
  opponentFormationId: '4-2-3-1',
  starters: pickBestXI('mci', getFormation('4-3-3')),
  difficulty: 'Professional',
  weather: 'Clear',
  timeOfDay: 'Night',
  durationMinutes: 6,
  stadiumId: getTeam('mci').stadiumId,
  savedSquads: loadSquads(),
  settings: migrateSettings(loadJSON<UserSettings>(SETTINGS_KEY, DEFAULT_SETTINGS)),
  engine: null,

  setScreen: (screen) => set({ screen }),

  selectTeam: (teamId) => {
    const { formationId } = get();
    const team = getTeam(teamId);
    set({
      userTeamId: teamId,
      starters: pickBestXI(teamId, getFormation(formationId)),
      stadiumId: team.stadiumId,
      // Never let the user face themselves.
      opponentTeamId: get().opponentTeamId === teamId ? (teamId === 'rma' ? 'bar' : 'rma') : get().opponentTeamId,
    });
  },

  setOpponent: (teamId) => set({ opponentTeamId: teamId }),

  setFormation: (id) => {
    const formation = getFormation(id);
    const { starters } = get();
    const existing = starters.filter((p): p is Player => !!p);
    // Re-seat the current XI into the new shape rather than starting over.
    const used = new Set<string>();
    const next: (Player | null)[] = formation.slots.map((slot) => {
      if (slot.position === 'GK') {
        const gk = existing.find((p) => p.position === 'GK' && !used.has(p.id));
        if (gk) used.add(gk.id);
        return gk ?? null;
      }
      return null;
    });
    formation.slots.forEach((slot, i) => {
      if (slot.position === 'GK') return;
      const best = existing
        .filter((p) => p.position !== 'GK' && !used.has(p.id))
        .map((p) => ({ p, score: p.overall * (0.55 + positionAffinity(p.position, slot.position) * 0.75) }))
        .sort((a, b) => b.score - a.score)[0];
      if (best) {
        used.add(best.p.id);
        next[i] = best.p;
      }
    });
    set({ formationId: id, starters: next });
  },

  setStarter: (index, player) => {
    const starters = [...get().starters];
    // A player can only occupy one slot: clear any previous seat.
    if (player) {
      const prev = starters.findIndex((p) => p?.id === player.id);
      if (prev >= 0 && prev !== index) starters[prev] = starters[index];
    }
    starters[index] = player;
    set({ starters });
  },

  swapStarters: (a, b) => {
    const starters = [...get().starters];
    [starters[a], starters[b]] = [starters[b], starters[a]];
    set({ starters });
  },

  autoPickSquad: () => {
    const { userTeamId, formationId } = get();
    set({ starters: pickBestXI(userTeamId, getFormation(formationId)) });
  },

  setMatchOption: (key, value) => set({ [key]: value } as Partial<GameState>),

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    // Switching scheme swaps in that scheme's default layout.
    if (patch.controlScheme && patch.controlScheme !== get().settings.controlScheme) {
      settings.bindings = patch.controlScheme === 'Arcade' ? { ...ARCADE_BINDINGS } : { ...DEFAULT_BINDINGS };
    }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable — settings stay in memory */
    }
    set({ settings });
  },

  saveSquad: (name) => {
    const { userTeamId, formationId, starters, savedSquads } = get();
    const squad: SavedSquad = {
      id: `sq-${Date.now()}`,
      name: name.trim() || `${getTeam(userTeamId).shortName} ${formationId}`,
      teamId: userTeamId,
      formationId,
      starterIds: starters.map((p) => p?.id ?? ''),
      savedAt: Date.now(),
    };
    const next = [squad, ...savedSquads].slice(0, 12);
    try {
      localStorage.setItem(SQUADS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set({ savedSquads: next });
  },

  loadSquad: (id) => {
    const squad = get().savedSquads.find((s) => s.id === id);
    if (!squad) return;
    const team = getTeam(squad.teamId);
    const starters = squad.starterIds.map((pid) => team.players.find((p) => p.id === pid) ?? null);
    set({
      userTeamId: squad.teamId,
      formationId: squad.formationId,
      starters,
      stadiumId: team.stadiumId,
    });
  },

  deleteSquad: (id) => {
    const next = get().savedSquads.filter((s) => s.id !== id);
    try {
      localStorage.setItem(SQUADS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    set({ savedSquads: next });
  },

  setEngine: (engine) => set({ engine }),

  bench: () => {
    const { userTeamId, starters } = get();
    const ids = new Set(starters.filter(Boolean).map((p) => p!.id));
    return getTeam(userTeamId).players.filter((p) => !ids.has(p.id));
  },

  squadRating: () => {
    const xi = get().starters.filter((p): p is Player => !!p);
    if (!xi.length) return 0;
    return Math.round(xi.reduce((s, p) => s + p.overall, 0) / xi.length);
  },

  /**
   * Chemistry rewards players lining up in their natural position and playing
   * alongside compatriots — a nod to how FUT scores a side.
   */
  chemistry: () => {
    const { starters, formationId } = get();
    const formation = getFormation(formationId);
    const xi = starters.filter((p): p is Player => !!p);
    if (xi.length < 11) return Math.round((xi.length / 11) * 40);

    let total = 0;
    const nationCounts = new Map<string, number>();
    for (const p of xi) nationCounts.set(p.nationality, (nationCounts.get(p.nationality) ?? 0) + 1);

    starters.forEach((p, i) => {
      if (!p) return;
      const slot = formation.slots[i];
      const fit = positionAffinity(p.position, slot.position);
      const countrymen = (nationCounts.get(p.nationality) ?? 1) - 1;
      const nationBonus = Math.min(2, countrymen * 0.5);
      total += fit * 7 + nationBonus;
    });
    return Math.round(Math.min(100, (total / (11 * 9)) * 100));
  },
}));

export const FORMATION_LIST = FORMATIONS;
