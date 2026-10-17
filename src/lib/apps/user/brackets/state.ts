import { FormatKind, type Bracket, type CupFormat, type MatchResult, type RaceResult, type RoundRobinFormat } from "./bracket";
import { cup_state, type CupState, type NextRace } from "./cup";
import {
  champion,
  is_locked,
  MatchStatus,
  plan_double,
  plan_single,
  podium as elimination_podium,
  resolve,
  type EliminationPlan,
  type MatchState,
} from "./elimination";
import { results_by_fixture, schedule, standings, type RoundRobinRound, type Standing } from "./round-robin";

export interface EliminationView {
  kind: typeof FormatKind.SINGLE | typeof FormatKind.DOUBLE;
  plan: EliminationPlan;
  states: Map<string, MatchState>;
  podium: Place[];
  finished: boolean;
  played: number;
  total: number;
}

export interface RoundRobinView {
  kind: typeof FormatKind.ROUND_ROBIN;
  format: RoundRobinFormat;
  rounds: RoundRobinRound[];
  results: Map<string, MatchResult>;
  standings: Standing[];
  podium: Place[];
  finished: boolean;
  played: number;
  total: number;
}

export interface CupView {
  kind: typeof FormatKind.CUP;
  format: CupFormat;
  cup: CupState;
  podium: Place[];
  finished: boolean;
  played: number;
  total: number;
}

export type BracketView = EliminationView | RoundRobinView | CupView;

const match_results = (bracket: Bracket) => bracket.results.filter((result): result is MatchResult => result.kind === "match");
const race_results = (bracket: Bracket) => bracket.results.filter((result): result is RaceResult => result.kind === "race");

export interface Place {
  place: number;
  players: string[];
}

function podium_of(rows: readonly { player: string; rank: number }[]): Place[] {
  const places = new Map<number, string[]>();
  for (const row of rows) if (row.rank <= 3) places.set(row.rank, [...(places.get(row.rank) ?? []), row.player]);
  return [...places.entries()].sort(([a], [b]) => a - b).map(([place, players]) => ({ place, players }));
}

export function plan_of(bracket: Bracket): EliminationPlan | null {
  const { format, players } = bracket;
  if (format.kind === FormatKind.SINGLE) return plan_single(players.length, format);
  if (format.kind === FormatKind.DOUBLE) return plan_double(players.length, format);
  return null;
}

export function view_of(bracket: Bracket): BracketView {
  const ids = bracket.players.map((player) => player.id);
  const format = bracket.format;

  if (format.kind === FormatKind.ROUND_ROBIN) {
    const rounds = schedule(ids, format.legs);
    const results = results_by_fixture(rounds, match_results(bracket));
    const table = standings(ids, rounds, match_results(bracket), format);
    const total = rounds.reduce((sum, round) => sum + round.fixtures.length, 0);
    const finished = results.size === total;
    return {
      kind: format.kind,
      format,
      rounds,
      results,
      standings: table,
      podium: finished ? podium_of(table) : [],
      finished,
      played: results.size,
      total,
    };
  }

  if (format.kind === FormatKind.CUP) {
    const cup = cup_state(ids, format, race_results(bracket));
    const tables = [...cup.groups, ...(cup.final ? [cup.final] : [])];
    return {
      kind: format.kind,
      format,
      cup,
      podium: cup.finished ? podium_of(cup.overall) : [],
      finished: cup.finished,
      played: tables.reduce((sum, table) => sum + table.races.length, 0),
      total: tables.length * format.races,
    };
  }

  const plan = plan_of(bracket)!;
  const states = resolve(plan, ids, match_results(bracket));
  const playable = [...states.values()].filter(
    (state) => state.status !== MatchStatus.WALKOVER && state.status !== MatchStatus.SKIPPED
  );
  return {
    kind: format.kind,
    plan,
    states,
    podium: elimination_podium(plan, states)
      .map((players, index) => ({ place: index + 1, players }))
      .filter((place) => place.players.length > 0),
    finished: champion(plan, states) !== null,
    played: playable.filter((state) => state.status === MatchStatus.DONE).length,
    total: playable.length,
  };
}

export function can_pick(bracket: Bracket, view: BracketView, match: string): boolean {
  if (view.kind === FormatKind.CUP) return false;
  if (view.kind === FormatKind.ROUND_ROBIN) return view.rounds.some((round) => round.fixtures.some((fixture) => fixture.id === match));
  const state = view.states.get(match);
  if (!state) return false;
  if (state.status === MatchStatus.READY) return true;
  return state.status === MatchStatus.DONE && !is_locked(view.plan, match, match_results(bracket));
}

/** Sets or replaces a match result. Picking the current winner again clears it. */
export function pick(bracket: Bracket, match: string, winner: string | null, score?: [number, number]): Bracket {
  const view = view_of(bracket);
  if (!can_pick(bracket, view, match)) return bracket;
  const previous = bracket.results.find((result) => result.kind === "match" && result.match === match) as MatchResult | undefined;
  const rest = bracket.results.filter((result) => !(result.kind === "match" && result.match === match));
  if (previous && previous.winner === winner && !score) return { ...bracket, results: rest };
  const result: MatchResult = score ? { kind: "match", match, winner, score } : { kind: "match", match, winner };
  return { ...bracket, results: [...rest, result] };
}

export function clear(bracket: Bracket, match: string): Bracket {
  if (!can_pick(bracket, view_of(bracket), match)) return bracket;
  return { ...bracket, results: bracket.results.filter((result) => !(result.kind === "match" && result.match === match)) };
}

export function record_race(bracket: Bracket, race: NextRace, order: string[]): Bracket {
  const result: RaceResult = { kind: "race", stage: race.stage, group: race.group, race: race.race, order };
  const next = { ...bracket, results: [...bracket.results, result] };
  const before = view_of(bracket);
  const after = view_of(next);
  return after.played > before.played ? next : bracket;
}

export function undo(bracket: Bracket): Bracket {
  return bracket.results.length ? { ...bracket, results: bracket.results.slice(0, -1) } : bracket;
}

export function score_outcome(a: string, b: string, score: [number, number]): string | null {
  if (score[0] === score[1]) return null;
  return score[0] > score[1] ? a : b;
}
