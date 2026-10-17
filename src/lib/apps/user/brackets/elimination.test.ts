import { describe, expect, test } from "vitest";
import type { MatchResult } from "./bracket";
import {
  bracket_size,
  champion,
  is_locked,
  MatchStatus,
  plan_double,
  plan_single,
  podium,
  resolve,
  rounds_of,
  seed_order,
  Side,
  type EliminationPlan,
  type MatchState,
} from "./elimination";

const ids = (count: number) => Array.from({ length: count }, (_, index) => `p${index + 1}`);
const win = (match: string, winner: string): MatchResult => ({ kind: "match", match, winner });
const who = (state: MatchState) => [state.a, state.b].map((slot) => (slot.kind === "player" ? slot.id : slot.kind));

function play_out(plan: EliminationPlan, players: string[], pick = (a: string, b: string) => (Number(a.slice(1)) < Number(b.slice(1)) ? a : b)) {
  const results: MatchResult[] = [];
  for (;;) {
    const states = resolve(plan, players, results);
    const ready = [...states.values()].find((state) => state.status === MatchStatus.READY);
    if (!ready) return { results, states };
    const [a, b] = who(ready);
    results.push(win(ready.spec.id, pick(a, b)));
  }
}

describe("seeding", () => {
  test("bracket size is the next power of two", () => {
    expect([2, 3, 4, 5, 8, 9, 16, 17, 32].map(bracket_size)).toEqual([2, 4, 4, 8, 8, 16, 16, 32, 32]);
  });

  test("seed order pairs 1 with the last seed and keeps 1 and 2 in opposite halves", () => {
    expect(seed_order(2)).toEqual([1, 2]);
    expect(seed_order(4)).toEqual([1, 4, 2, 3]);
    expect(seed_order(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const order = seed_order(16);
    expect(order.slice(0, 8)).toContain(1);
    expect(order.slice(8)).toContain(2);
    for (let i = 0; i < 16; i += 2) expect(order[i] + order[i + 1]).toBe(17);
  });

  test("byes go to the top seeds and walk them through", () => {
    const plan = plan_single(5, { third_place: false });
    const states = resolve(plan, ids(5), []);
    const first = rounds_of(plan, states, Side.WINNERS)[0];
    expect(first.map(who)).toEqual([
      ["p1", "bye"],
      ["p4", "p5"],
      ["p2", "bye"],
      ["p3", "bye"],
    ]);
    expect(first.filter((state) => state.status === MatchStatus.WALKOVER)).toHaveLength(3);
    expect(who(states.get("w2-1")!)).toEqual(["p2", "p3"]);
    expect(states.get("w2-1")!.status).toBe(MatchStatus.READY);
    expect(states.get("w2-0")!.status).toBe(MatchStatus.PENDING);
  });

  test("three players: the top seed waits for the winner of 2 v 3", () => {
    const plan = plan_single(3, { third_place: false });
    const states = resolve(plan, ids(3), [win("w1-1", "p3")]);
    expect(who(states.get("w2-0")!)).toEqual(["p1", "p3"]);
  });
});

describe("single elimination", () => {
  test("8 players: 7 matches, the top seed wins, podium with shared third", () => {
    const plan = plan_single(8, { third_place: false });
    expect(plan.matches).toHaveLength(7);
    const { results, states } = play_out(plan, ids(8));
    expect(results).toHaveLength(7);
    expect(champion(plan, states)).toBe("p1");
    expect(podium(plan, states)).toEqual([["p1"], ["p2"], ["p4", "p3"]]);
  });

  test("third-place match decides third", () => {
    const plan = plan_single(8, { third_place: true });
    const { states } = play_out(plan, ids(8));
    expect(states.get("third")!.status).toBe(MatchStatus.DONE);
    expect(podium(plan, states)).toEqual([["p1"], ["p2"], ["p3"]]);
  });

  test("a result can change until the next match is played", () => {
    const plan = plan_single(4, { third_place: false });
    const results = [win("w1-0", "p1")];
    expect(is_locked(plan, "w1-0", results)).toBe(false);
    results.push(win("w1-1", "p2"), win("w2-0", "p2"));
    expect(is_locked(plan, "w1-0", results)).toBe(true);
    expect(is_locked(plan, "w2-0", results)).toBe(false);
  });

  test("a winner that isn't in the match is ignored", () => {
    const plan = plan_single(4, { third_place: false });
    expect(resolve(plan, ids(4), [win("w1-0", "p2")]).get("w1-0")!.status).toBe(MatchStatus.READY);
  });

  test("32 players: 31 matches over 5 rounds", () => {
    const plan = plan_single(32, { third_place: false });
    expect(plan.rounds).toBe(5);
    const { results, states } = play_out(plan, ids(32));
    expect(results).toHaveLength(31);
    expect(champion(plan, states)).toBe("p1");
  });
});

describe("double elimination", () => {
  test("8 players: losers bracket has 4 rounds of 2, 2, 1, 1", () => {
    const plan = plan_double(8, { reset: true });
    const states = resolve(plan, ids(8), []);
    expect(rounds_of(plan, states, Side.LOSERS).map((round) => round.length)).toEqual([2, 2, 1, 1]);
    expect(plan.losers_final).toBe("l4-0");
  });

  test("losers drop into the losers bracket", () => {
    const plan = plan_double(8, { reset: true });
    const results = [win("w1-0", "p1"), win("w1-1", "p4"), win("w1-2", "p2"), win("w1-3", "p3")];
    const states = resolve(plan, ids(8), results);
    expect(who(states.get("l1-0")!)).toEqual(["p8", "p5"]);
    expect(who(states.get("l1-1")!)).toEqual(["p7", "p6"]);
    results.push(win("w2-0", "p1"), win("w2-1", "p2"), win("l1-0", "p5"), win("l1-1", "p6"));
    const next = resolve(plan, ids(8), results);
    // Reversed drop: p5 lost to p4 in round 1, so they must not meet again straight away.
    expect(who(next.get("l2-0")!)).toEqual(["p5", "p3"]);
    expect(who(next.get("l2-1")!)).toEqual(["p6", "p4"]);
  });

  test("winners' champion takes the grand final: no reset", () => {
    const plan = plan_double(8, { reset: true });
    const { results, states } = play_out(plan, ids(8));
    expect(states.get("gf")!.status).toBe(MatchStatus.DONE);
    expect(states.get("gf2")!.status).toBe(MatchStatus.SKIPPED);
    expect(champion(plan, states)).toBe("p1");
    expect(results).toHaveLength(14);
    expect(podium(plan, states)).toEqual([["p1"], ["p2"], ["p3"]]);
  });

  test("losers' champion wins the grand final: the reset decides", () => {
    const plan = plan_double(4, { reset: true });
    const results = [win("w1-0", "p1"), win("w1-1", "p2"), win("w2-0", "p1"), win("l1-0", "p3"), win("l2-0", "p2")];
    let states = resolve(plan, ids(4), results);
    expect(who(states.get("gf")!)).toEqual(["p1", "p2"]);
    results.push(win("gf", "p2"));
    states = resolve(plan, ids(4), results);
    expect(states.get("gf2")!.status).toBe(MatchStatus.READY);
    expect(champion(plan, states)).toBeNull();
    results.push(win("gf2", "p2"));
    states = resolve(plan, ids(4), results);
    expect(champion(plan, states)).toBe("p2");
    expect(podium(plan, states)).toEqual([["p2"], ["p1"], ["p3"]]);
  });

  test("without reset the grand final is the last match", () => {
    const plan = plan_double(4, { reset: false });
    const results = [win("w1-0", "p1"), win("w1-1", "p2"), win("w2-0", "p1"), win("l1-0", "p3"), win("l2-0", "p2"), win("gf", "p2")];
    expect(champion(plan, resolve(plan, ids(4), results))).toBe("p2");
  });

  test("byes walk through both brackets", () => {
    const plan = plan_double(5, { reset: true });
    const { results, states } = play_out(plan, ids(5));
    expect(champion(plan, states)).toBe("p1");
    expect(results).toHaveLength(8);
  });

  test("every player loses twice before going out, whoever wins", () => {
    for (const count of [3, 6, 12, 16, 24]) {
      const plan = plan_double(count, { reset: true });
      const { results, states } = play_out(plan, ids(count), (a, b) => (Number(a.slice(1)) > Number(b.slice(1)) ? a : b));
      const champ = champion(plan, states);
      expect(champ).not.toBeNull();
      const losses = new Map<string, number>();
      for (const result of results) {
        const state = states.get(result.match)!;
        if (state.loser.kind === "player") losses.set(state.loser.id, (losses.get(state.loser.id) ?? 0) + 1);
      }
      for (const player of ids(count)) {
        if (player === champ) expect(losses.get(player) ?? 0).toBeLessThanOrEqual(1);
        else expect(losses.get(player)).toBe(2);
      }
    }
  });
});
