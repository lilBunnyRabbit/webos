import { CupStage, group_count, type CupFormat, type RaceResult } from "./bracket";

export interface CupRow {
  player: string;
  races: (number | null)[];
  places: (number | null)[];
  total: number;
  rank: number;
}

export interface CupTable {
  players: string[];
  races: string[][];
  standings: CupRow[];
  done: boolean;
}

export interface NextRace {
  stage: CupStage;
  group: number;
  race: number;
}

export interface CupState {
  groups: CupTable[];
  /** `null` without a final stage; a table with no players until every group is done. */
  final: CupTable | null;
  overall: CupRow[];
  next: NextRace[];
  finished: boolean;
}

/** Snake order, so each group gets a fair share of the top seeds: A B C C B A A B C … */
export function split_groups(players: readonly string[], race_size: number): string[][] {
  const count = group_count(players.length, race_size);
  const groups: string[][] = Array.from({ length: count }, () => []);
  players.forEach((player, index) => {
    const lap = Math.floor(index / count);
    const position = index % count;
    groups[lap % 2 === 0 ? position : count - 1 - position].push(player);
  });
  return groups;
}

export const points_for = (points: readonly number[], place: number) => points[place] ?? 0;

export function cup_standings(players: readonly string[], races: readonly string[][], format: Pick<CupFormat, "races" | "points">): CupRow[] {
  const rows = players.map<CupRow>((player) => ({
    player,
    races: Array.from({ length: format.races }, () => null),
    places: Array.from({ length: format.races }, () => null),
    total: 0,
    rank: 0,
  }));
  const by_player = new Map(rows.map((row) => [row.player, row]));
  races.forEach((order, race) => {
    order.forEach((player, place) => {
      const row = by_player.get(player);
      if (!row) return;
      const earned = points_for(format.points, place);
      row.races[race] = earned;
      row.places[race] = place;
      row.total += earned;
    });
  });
  return rank_rows(rows, players);
}

function rank_rows(rows: CupRow[], seeds: readonly string[]): CupRow[] {
  const seed = new Map(seeds.map((player, index) => [player, index]));
  // Equal totals go to the better finishes: more wins, then more seconds, and so on.
  const finishes = (row: CupRow) => {
    const counts = Array.from({ length: seeds.length }, () => 0);
    for (const place of row.places) if (place !== null) counts[place]++;
    return counts;
  };
  const compare = (x: CupRow, y: CupRow) => {
    if (x.total !== y.total) return y.total - x.total;
    const fx = finishes(x);
    const fy = finishes(y);
    for (let i = 0; i < fx.length; i++) if (fx[i] !== fy[i]) return fy[i] - fx[i];
    return 0;
  };
  const sorted = rows.sort((x, y) => compare(x, y) || seed.get(x.player)! - seed.get(y.player)!);
  sorted.forEach((row, index) => {
    row.rank = index > 0 && compare(sorted[index - 1], row) === 0 ? sorted[index - 1].rank : index + 1;
  });
  return sorted;
}

function is_permutation(order: readonly string[], players: readonly string[]): boolean {
  if (order.length !== players.length) return false;
  const set = new Set(order);
  return set.size === order.length && players.every((player) => set.has(player));
}

function table(players: string[], races: string[][], format: CupFormat): CupTable {
  return { players, races, standings: cup_standings(players, races, format), done: races.length >= format.races };
}

export function final_players(groups: readonly CupTable[], advance: number): string[] {
  const players: string[] = [];
  for (let rank = 0; rank < advance; rank++) {
    for (const group of groups) {
      const row = group.standings[rank];
      if (row) players.push(row.player);
    }
  }
  return players;
}

export function has_final(players: number, format: Pick<CupFormat, "race_size" | "advance">): boolean {
  return format.advance > 0 && group_count(players, format.race_size) > 1;
}

/** Results that don't fit (wrong race number, wrong players) are skipped, so a hand-edited file can't break the cup. */
export function cup_state(players: readonly string[], format: CupFormat, results: readonly RaceResult[]): CupState {
  const group_players = split_groups(players, format.race_size);
  const group_races: string[][][] = group_players.map(() => []);
  for (const result of results) {
    if (result.stage !== CupStage.GROUPS) continue;
    const races = group_races[result.group];
    if (!races || result.race !== races.length || races.length >= format.races) continue;
    if (is_permutation(result.order, group_players[result.group])) races.push(result.order);
  }
  const groups = group_players.map((members, index) => table(members, group_races[index], format));
  const groups_done = groups.every((group) => group.done);

  let final: CupTable | null = null;
  if (has_final(players.length, format)) {
    const members = groups_done ? final_players(groups, format.advance) : [];
    const races: string[][] = [];
    for (const result of results) {
      if (!groups_done || result.stage !== CupStage.FINAL || result.race !== races.length || races.length >= format.races) continue;
      if (is_permutation(result.order, members)) races.push(result.order);
    }
    final = table(members, races, format);
    if (!groups_done) final.done = false;
  }

  const next: NextRace[] = [];
  if (!groups_done) {
    groups.forEach((group, index) => {
      if (!group.done) next.push({ stage: CupStage.GROUPS, group: index, race: group.races.length });
    });
  } else if (final && !final.done) {
    next.push({ stage: CupStage.FINAL, group: 0, race: final.races.length });
  }

  const finished = groups_done && (final === null || final.done);
  return { groups, final, overall: overall(players, groups, final), next, finished };
}

function overall(players: readonly string[], groups: CupTable[], final: CupTable | null): CupRow[] {
  const finalists = new Set(final?.players ?? []);
  const rest = rank_rows(
    groups.flatMap((group) => group.standings.filter((row) => !finalists.has(row.player)).map((row) => ({ ...row }))),
    players
  );
  if (finalists.size === 0) return rest;
  return [...final!.standings, ...rest.map((row) => ({ ...row, rank: row.rank + finalists.size }))];
}

export function group_label(index: number): string {
  return `Group ${String.fromCharCode(65 + (index % 26))}${index >= 26 ? Math.floor(index / 26) : ""}`;
}
