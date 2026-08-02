import { getFormation } from '../data/formations';
import { getTeam } from '../data/leagues';
import type { Difficulty, Player, TimeOfDay, Weather } from '../data/types';
import { pickBestXI } from '../store/gameStore';
import { MatchEngine, type TeamSetup } from './engine';

export interface MatchConfig {
  userTeamId: string;
  opponentTeamId: string;
  formationId: string;
  opponentFormationId: string;
  /** The user's chosen XI; gaps are filled with the best available player. */
  starters: (Player | null)[];
  difficulty: Difficulty;
  weather: Weather;
  timeOfDay: TimeOfDay;
  durationMinutes: number;
  stadiumId: string;
  seed?: number;
}

function buildSetup(teamId: string, formationId: string, starters?: (Player | null)[]): TeamSetup {
  const team = getTeam(teamId);
  const formation = getFormation(formationId);
  const fallback = pickBestXI(teamId, formation);
  // Any empty slot falls back to the auto-picked XI, then to any unused squad member.
  const used = new Set<string>();
  const resolved: Player[] = formation.slots.map((_, i) => {
    const chosen = starters?.[i] ?? null;
    if (chosen && !used.has(chosen.id)) {
      used.add(chosen.id);
      return chosen;
    }
    const auto = fallback[i];
    if (auto && !used.has(auto.id)) {
      used.add(auto.id);
      return auto;
    }
    const spare = team.players.find((p) => !used.has(p.id))!;
    used.add(spare.id);
    return spare;
  });
  return {
    team,
    formation,
    starters: resolved,
    bench: team.players.filter((p) => !used.has(p.id)),
  };
}

export function createMatch(config: MatchConfig): MatchEngine {
  const home = buildSetup(config.userTeamId, config.formationId, config.starters);
  const away = buildSetup(config.opponentTeamId, config.opponentFormationId);
  return new MatchEngine(home, away, {
    difficulty: config.difficulty,
    weather: config.weather,
    timeOfDay: config.timeOfDay,
    durationMinutes: config.durationMinutes,
    stadiumId: config.stadiumId,
    seed: config.seed ?? (Date.now() & 0x7fffffff),
  });
}

/** A CPU-vs-CPU match used as the animated backdrop on the menus. */
export function createAttractMatch(seed = Date.now() & 0x7fffffff): MatchEngine {
  const pairs: [string, string][] = [
    ['mci', 'rma'],
    ['liv', 'bar'],
    ['ars', 'bay'],
    ['int', 'psg'],
    ['mun', 'juv'],
  ];
  const [a, b] = pairs[seed % pairs.length];
  const engine = createMatch({
    userTeamId: a,
    opponentTeamId: b,
    formationId: '4-3-3',
    opponentFormationId: '4-2-3-1',
    starters: [],
    difficulty: 'World Class',
    weather: 'Clear',
    timeOfDay: 'Night',
    durationMinutes: 90,
    stadiumId: getTeam(a).stadiumId,
    seed,
  });
  engine.autoPlay = true;
  return engine;
}
