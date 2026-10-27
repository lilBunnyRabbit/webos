import { describe, expect, test } from "vitest";
import { BracketSchema, create_bracket, CupStage, default_format, file_name_for, FormatKind, parse_names, parse_points } from "./bracket";
import { crowned, pick, record_race, undo, view_of } from "./state";

const names = ["Ana", "Bor", "Cene", "Dora"];

describe("bracket file", () => {
  test("a new bracket passes its own schema", () => {
    for (const kind of Object.values(FormatKind)) {
      const bracket = create_bracket("Friday", names, default_format(kind, names.length), 1);
      expect(BracketSchema.safeParse(bracket).success).toBe(true);
    }
  });

  test("duplicate player ids are rejected", () => {
    const bracket = create_bracket("Friday", names, default_format(FormatKind.SINGLE, 4), 1);
    bracket.players[1].id = bracket.players[0].id;
    expect(BracketSchema.safeParse(bracket).success).toBe(false);
  });

  test("names and points parse from text", () => {
    expect(parse_names(" Ana \n\nBor\n  ")).toEqual(["Ana", "Bor"]);
    expect(parse_points("15, 12 10;9 x")).toEqual([15, 12, 10, 9]);
    expect(file_name_for('Mario: "Kart"/night')).toBe("Mario Kart night.bracket");
  });
});

describe("results", () => {
  test("pick, change, clear and undo", () => {
    let bracket = create_bracket("Friday", names, default_format(FormatKind.SINGLE, 4), 1);
    bracket = pick(bracket, "w1-0", "p1");
    bracket = pick(bracket, "w1-0", "p4");
    expect(bracket.results).toEqual([{ kind: "match", match: "w1-0", winner: "p4" }]);
    bracket = pick(bracket, "w1-0", "p4");
    expect(bracket.results).toEqual([]);
    bracket = pick(bracket, "w1-0", "p1");
    bracket = pick(bracket, "w1-1", "p2");
    bracket = pick(bracket, "w2-0", "p2");
    expect(view_of(bracket).finished).toBe(true);
    expect(view_of(bracket).podium.map((place) => place.players)).toEqual([["p2"], ["p1"], ["p4", "p3"]]);
    expect(pick(bracket, "w1-0", "p4")).toBe(bracket);
    bracket = undo(bracket);
    expect(view_of(bracket).finished).toBe(false);
    expect(pick(bracket, "w1-0", "p4").results.at(-1)).toEqual({ kind: "match", match: "w1-0", winner: "p4" });
  });

  test("round robin finishes when every fixture has a result", () => {
    let bracket = create_bracket("Friday", names.slice(0, 3), default_format(FormatKind.ROUND_ROBIN, 3), 1);
    const view = view_of(bracket);
    if (view.kind !== FormatKind.ROUND_ROBIN) throw new Error("expected round robin");
    for (const round of view.rounds) for (const fixture of round.fixtures) bracket = pick(bracket, fixture.id, fixture.a);
    const done = view_of(bracket);
    expect(done.finished).toBe(true);
    expect(done.played).toBe(3);
    expect(done.podium.flatMap((place) => place.players)).toHaveLength(3);
  });

  test("cup races only record in order and with the right players", () => {
    const format = default_format(FormatKind.CUP, 4);
    if (format.kind !== FormatKind.CUP) throw new Error("expected cup");
    let bracket = create_bracket("Friday", names, { ...format, races: 1 }, 1);
    expect(record_race(bracket, { stage: CupStage.GROUPS, group: 0, race: 1 }, ["p1", "p2", "p3", "p4"])).toBe(bracket);
    expect(record_race(bracket, { stage: CupStage.GROUPS, group: 0, race: 0 }, ["p1", "p2"])).toBe(bracket);
    bracket = record_race(bracket, { stage: CupStage.GROUPS, group: 0, race: 0 }, ["p3", "p1", "p2", "p4"]);
    const view = view_of(bracket);
    expect(view.finished).toBe(true);
    expect(view.podium).toEqual([
      { place: 1, players: ["p3"] },
      { place: 2, players: ["p1"] },
      { place: 3, players: ["p2"] },
    ]);
  });
});

describe("crowned", () => {
  test("only the result that decides the champion crowns", () => {
    const start = create_bracket("Friday", names, default_format(FormatKind.SINGLE, 4), 1);
    const semis = pick(pick(start, "w1-0", "p1"), "w1-1", "p2");
    const final = pick(semis, "w2-0", "p2");
    expect(crowned(start, pick(start, "w1-0", "p1"))).toBe(false);
    expect(crowned(semis, final)).toBe(true);
    expect(crowned(final, { ...final, name: "Renamed" })).toBe(false);
    expect(crowned(final, undo(final))).toBe(false);
  });
});
