import type { DoubleFormat, MatchResult, SingleFormat } from "./bracket";

export type Source =
  | { kind: "seed"; seed: number }
  | { kind: "winner"; match: string }
  | { kind: "loser"; match: string };

export const Side = { WINNERS: "winners", LOSERS: "losers", FINAL: "final", THIRD: "third" } as const;
export type Side = (typeof Side)[keyof typeof Side];

export interface MatchSpec {
  id: string;
  side: Side;
  round: number;
  index: number;
  sources: [Source, Source];
}

export type Slot = { kind: "player"; id: string } | { kind: "bye" } | { kind: "pending" };

export const MatchStatus = {
  PENDING: "pending",
  READY: "ready",
  DONE: "done",
  WALKOVER: "walkover",
  /** The grand final reset, when the winners' side won the first final. */
  SKIPPED: "skipped",
} as const;
export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

export interface MatchState {
  spec: MatchSpec;
  a: Slot;
  b: Slot;
  status: MatchStatus;
  winner: Slot;
  loser: Slot;
}

export interface EliminationPlan {
  matches: MatchSpec[];
  size: number;
  rounds: number;
  final: string;
  reset: string | null;
  third: string | null;
  losers_final: string | null;
}

const PENDING: Slot = { kind: "pending" };
const BYE: Slot = { kind: "bye" };

export function bracket_size(players: number): number {
  let size = 2;
  while (size < players) size *= 2;
  return size;
}

/** Seeds by bracket position: 1 meets the last seed, and 1 and 2 can only meet in the final. */
export function seed_order(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
}

const seed = (value: number): Source => ({ kind: "seed", seed: value });
const winner = (match: string): Source => ({ kind: "winner", match });
const loser = (match: string): Source => ({ kind: "loser", match });
const wid = (round: number, index: number) => `w${round}-${index}`;
const lid = (round: number, index: number) => `l${round}-${index}`;

function winners_bracket(size: number): MatchSpec[] {
  const order = seed_order(size);
  const matches: MatchSpec[] = [];
  for (let round = 1, count = size / 2; count >= 1; round++, count /= 2) {
    for (let index = 0; index < count; index++) {
      const sources: [Source, Source] =
        round === 1
          ? [seed(order[index * 2]), seed(order[index * 2 + 1])]
          : [winner(wid(round - 1, index * 2)), winner(wid(round - 1, index * 2 + 1))];
      matches.push({ id: wid(round, index), side: Side.WINNERS, round, index, sources });
    }
  }
  return matches;
}

export function plan_single(players: number, format: Pick<SingleFormat, "third_place">): EliminationPlan {
  const size = bracket_size(players);
  const rounds = Math.log2(size);
  const matches = winners_bracket(size);
  let third: string | null = null;
  if (format.third_place && rounds >= 2) {
    third = "third";
    matches.push({
      id: third,
      side: Side.THIRD,
      round: rounds,
      index: 0,
      sources: [loser(wid(rounds - 1, 0)), loser(wid(rounds - 1, 1))],
    });
  }
  return { matches, size, rounds, final: wid(rounds, 0), reset: null, third, losers_final: null };
}

export function plan_double(players: number, format: Pick<DoubleFormat, "reset">): EliminationPlan {
  const size = bracket_size(players);
  const rounds = Math.log2(size);
  const matches = winners_bracket(size);
  let losers_champion: Source = loser(wid(1, 0));
  let losers_final: string | null = null;

  if (rounds >= 2) {
    let round = 1;
    let previous: string[] = [];
    for (let index = 0; index < size / 4; index++) {
      const id = lid(round, index);
      matches.push({ id, side: Side.LOSERS, round, index, sources: [loser(wid(1, index * 2)), loser(wid(1, index * 2 + 1))] });
      previous.push(id);
    }
    for (let wb_round = 2; wb_round <= rounds; wb_round++) {
      round++;
      const count = previous.length;
      // Dropping every other round in reverse keeps players who just met in the winners' bracket apart.
      const flip = wb_round % 2 === 0;
      const dropped: string[] = [];
      for (let index = 0; index < count; index++) {
        const id = lid(round, index);
        const from = flip ? count - 1 - index : index;
        matches.push({ id, side: Side.LOSERS, round, index, sources: [winner(previous[index]), loser(wid(wb_round, from))] });
        dropped.push(id);
      }
      previous = dropped;
      if (wb_round === rounds) break;
      round++;
      const merged: string[] = [];
      for (let index = 0; index < previous.length / 2; index++) {
        const id = lid(round, index);
        matches.push({ id, side: Side.LOSERS, round, index, sources: [winner(previous[index * 2]), winner(previous[index * 2 + 1])] });
        merged.push(id);
      }
      previous = merged;
    }
    losers_final = previous[0];
    losers_champion = winner(losers_final);
  }

  const final = "gf";
  matches.push({ id: final, side: Side.FINAL, round: 1, index: 0, sources: [winner(wid(rounds, 0)), losers_champion] });
  let reset: string | null = null;
  if (format.reset) {
    reset = "gf2";
    matches.push({ id: reset, side: Side.FINAL, round: 2, index: 0, sources: [winner(final), loser(final)] });
  }
  return { matches, size, rounds, final, reset, third: null, losers_final };
}

function slot_of(source: Source, players: readonly string[], states: Map<string, MatchState>): Slot {
  if (source.kind === "seed") {
    const id = players[source.seed - 1];
    return id === undefined ? BYE : { kind: "player", id };
  }
  const state = states.get(source.match);
  if (!state) return PENDING;
  return source.kind === "winner" ? state.winner : state.loser;
}

const same = (slot: Slot, id: string) => slot.kind === "player" && slot.id === id;

export function resolve(plan: EliminationPlan, players: readonly string[], results: readonly MatchResult[]): Map<string, MatchState> {
  const decided = new Map<string, string>();
  for (const result of results) if (result.winner !== null) decided.set(result.match, result.winner);

  const states = new Map<string, MatchState>();
  for (const spec of plan.matches) {
    const a = slot_of(spec.sources[0], players, states);
    const b = slot_of(spec.sources[1], players, states);
    let state: MatchState;

    if (spec.id === plan.reset) {
      const first = states.get(plan.final);
      if (first?.status === MatchStatus.DONE && first.winner.kind === "player" && same(first.a, first.winner.id)) {
        states.set(spec.id, { spec, a, b, status: MatchStatus.SKIPPED, winner: first.winner, loser: first.loser });
        continue;
      }
    }

    if (a.kind === "pending" || b.kind === "pending") {
      state = { spec, a, b, status: MatchStatus.PENDING, winner: PENDING, loser: PENDING };
    } else if (a.kind === "bye" || b.kind === "bye") {
      state = { spec, a, b, status: MatchStatus.WALKOVER, winner: a.kind === "bye" ? b : a, loser: BYE };
    } else {
      const picked = decided.get(spec.id);
      if (picked === a.id || picked === b.id) {
        state = { spec, a, b, status: MatchStatus.DONE, winner: picked === a.id ? a : b, loser: picked === a.id ? b : a };
      } else {
        state = { spec, a, b, status: MatchStatus.READY, winner: PENDING, loser: PENDING };
      }
    }
    states.set(spec.id, state);
  }
  return states;
}

function dependents(plan: EliminationPlan): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const spec of plan.matches) {
    for (const source of spec.sources) {
      if (source.kind === "seed") continue;
      map.set(source.match, [...(map.get(source.match) ?? []), spec.id]);
    }
  }
  return map;
}

/** A result can change only while nothing after it has been played: the later match would get a different player. */
export function is_locked(plan: EliminationPlan, match: string, results: readonly MatchResult[]): boolean {
  const played = new Set(results.map((result) => result.match));
  const graph = dependents(plan);
  const stack = [...(graph.get(match) ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    if (played.has(next)) return true;
    stack.push(...(graph.get(next) ?? []));
  }
  return false;
}

export function champion(plan: EliminationPlan, states: Map<string, MatchState>): string | null {
  const last = states.get(plan.reset ?? plan.final);
  if (!last || (last.status !== MatchStatus.DONE && last.status !== MatchStatus.SKIPPED && last.status !== MatchStatus.WALKOVER)) {
    return null;
  }
  return last.winner.kind === "player" ? last.winner.id : null;
}

const player_of = (slot: Slot | undefined) => (slot?.kind === "player" ? slot.id : null);

/** Places 1, 2 and 3 once a champion exists. Without a third-place match both semifinal losers share third. */
export function podium(plan: EliminationPlan, states: Map<string, MatchState>): string[][] {
  const first = champion(plan, states);
  if (!first) return [];
  const last = states.get(plan.reset && states.get(plan.reset)?.status !== MatchStatus.SKIPPED ? plan.reset : plan.final);
  const second = player_of(last?.loser);
  let third: string[] = [];
  if (plan.third) {
    const id = player_of(states.get(plan.third)?.winner);
    if (id) third = [id];
  } else if (plan.losers_final) {
    const id = player_of(states.get(plan.losers_final)?.loser);
    if (id) third = [id];
  } else if (plan.rounds >= 2) {
    third = [0, 1].map((index) => player_of(states.get(wid(plan.rounds - 1, index))?.loser)).filter((id) => id !== null);
  }
  return [[first], second ? [second] : [], third];
}

export function rounds_of(plan: EliminationPlan, states: Map<string, MatchState>, side: Side): MatchState[][] {
  const rounds: MatchState[][] = [];
  for (const spec of plan.matches) {
    if (spec.side !== side) continue;
    (rounds[spec.round - 1] ??= []).push(states.get(spec.id)!);
  }
  return rounds.filter((round) => round !== undefined);
}

export function round_name(side: Side, round: number, total: number): string {
  if (side === Side.FINAL) return round === 1 ? "Grand final" : "Reset";
  if (side === Side.THIRD) return "Third place";
  if (side === Side.LOSERS) return round === total ? "Losers final" : `Losers ${round}`;
  const left = total - round;
  if (left === 0) return "Final";
  if (left === 1) return "Semifinals";
  if (left === 2) return "Quarterfinals";
  return `Round ${round}`;
}
