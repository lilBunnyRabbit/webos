import type { MatchResult, RoundRobinFormat } from "./bracket";

export interface Fixture {
  id: string;
  round: number;
  a: string;
  b: string;
}

export interface RoundRobinRound {
  round: number;
  fixtures: Fixture[];
  resting: string | null;
}

/** Circle method: the first player stays put while everyone else rotates one place each round. */
export function schedule(players: readonly string[], legs: 1 | 2 = 1): RoundRobinRound[] {
  const circle: (string | null)[] = [...players];
  if (circle.length % 2 === 1) circle.push(null);
  const size = circle.length;
  const first_leg: RoundRobinRound[] = [];

  for (let round = 1; round < size; round++) {
    const fixtures: Fixture[] = [];
    let resting: string | null = null;
    for (let index = 0; index < size / 2; index++) {
      let a = circle[index];
      let b = circle[size - 1 - index];
      if (a === null || b === null) {
        resting = a ?? b;
        continue;
      }
      // The fixed player would otherwise always be listed first.
      if (index === 0 && round % 2 === 0) [a, b] = [b, a];
      fixtures.push({ id: `r${round}-${fixtures.length}`, round, a, b });
    }
    first_leg.push({ round, fixtures, resting });
    circle.splice(1, 0, circle.pop()!);
  }

  if (legs === 1) return first_leg;
  const offset = first_leg.length;
  const second_leg = first_leg.map(({ round, fixtures, resting }) => ({
    round: round + offset,
    resting,
    fixtures: fixtures.map((fixture, index) => ({ id: `r${round + offset}-${index}`, round: round + offset, a: fixture.b, b: fixture.a })),
  }));
  return [...first_leg, ...second_leg];
}

export interface Standing {
  player: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
  points: number;
  rank: number;
}

const blank = (player: string): Standing => ({
  player,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  scored: 0,
  conceded: 0,
  points: 0,
  rank: 0,
});

export function results_by_fixture(rounds: readonly RoundRobinRound[], results: readonly MatchResult[]): Map<string, MatchResult> {
  const fixtures = new Map(rounds.flatMap((round) => round.fixtures.map((fixture) => [fixture.id, fixture] as const)));
  const map = new Map<string, MatchResult>();
  for (const result of results) {
    const fixture = fixtures.get(result.match);
    if (!fixture) continue;
    if (result.winner !== null && result.winner !== fixture.a && result.winner !== fixture.b) continue;
    map.set(result.match, result);
  }
  return map;
}

function tally(
  players: readonly string[],
  fixtures: readonly Fixture[],
  results: Map<string, MatchResult>,
  format: Pick<RoundRobinFormat, "win" | "draw" | "loss">
): Map<string, Standing> {
  const table = new Map(players.map((player) => [player, blank(player)]));
  for (const fixture of fixtures) {
    const result = results.get(fixture.id);
    const a = table.get(fixture.a);
    const b = table.get(fixture.b);
    if (!result || !a || !b) continue;
    a.played++;
    b.played++;
    if (result.score) {
      a.scored += result.score[0];
      a.conceded += result.score[1];
      b.scored += result.score[1];
      b.conceded += result.score[0];
    }
    if (result.winner === null) {
      a.drawn++;
      b.drawn++;
      a.points += format.draw;
      b.points += format.draw;
    } else {
      const [won, lost] = result.winner === fixture.a ? [a, b] : [b, a];
      won.won++;
      lost.lost++;
      won.points += format.win;
      lost.points += format.loss;
    }
  }
  return table;
}

/**
 * Ranked by points; ties go to points between the tied players only, then score difference, then scored, then wins,
 * then seed. Equal on everything shares a rank.
 */
export function standings(
  players: readonly string[],
  rounds: readonly RoundRobinRound[],
  results: readonly MatchResult[],
  format: Pick<RoundRobinFormat, "win" | "draw" | "loss">
): Standing[] {
  const fixtures = rounds.flatMap((round) => round.fixtures);
  const by_fixture = results_by_fixture(rounds, results);
  const table = tally(players, fixtures, by_fixture, format);
  const seed = new Map(players.map((player, index) => [player, index]));

  const head_to_head = new Map<string, number>();
  const tied_groups = new Map<number, Standing[]>();
  for (const standing of table.values()) tied_groups.set(standing.points, [...(tied_groups.get(standing.points) ?? []), standing]);
  for (const group of tied_groups.values()) {
    if (group.length < 2) continue;
    const ids = new Set(group.map((standing) => standing.player));
    const mini = tally(
      [...ids],
      fixtures.filter((fixture) => ids.has(fixture.a) && ids.has(fixture.b)),
      by_fixture,
      format
    );
    for (const [player, standing] of mini) head_to_head.set(player, standing.points);
  }

  const key = (standing: Standing) => [
    standing.points,
    head_to_head.get(standing.player) ?? 0,
    standing.scored - standing.conceded,
    standing.scored,
    standing.won,
  ];
  const compare = (x: Standing, y: Standing) => {
    const kx = key(x);
    const ky = key(y);
    for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return ky[i] - kx[i];
    return 0;
  };

  const sorted = [...table.values()].sort((x, y) => compare(x, y) || seed.get(x.player)! - seed.get(y.player)!);
  sorted.forEach((standing, index) => {
    standing.rank = index > 0 && compare(sorted[index - 1], standing) === 0 ? sorted[index - 1].rank : index + 1;
  });
  return sorted;
}

export function fixture_count(rounds: readonly RoundRobinRound[]): number {
  return rounds.reduce((total, round) => total + round.fixtures.length, 0);
}
