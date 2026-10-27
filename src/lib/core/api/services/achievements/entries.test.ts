import { describe, expect, test } from "vitest";
import { apply_achieve, apply_progress, builtin_entries, declared_entries } from "./entries";
import { empty_record, parse_record, serialize_record } from "./persistence";
import { achievements_problem, without_progress } from "./validate";
import type { Achievement } from "./type";

const WINS: Achievement = { id: "wins", title: "Veteran", text: "Win 10 games.", goal: 10 };
const FIRST: Achievement = { id: "first", title: "First", text: "Win a game." };

describe("records", () => {
  test("round-trip, and a broken or foreign file reads as empty", () => {
    const record = { unlocked: { b: 2, a: 1 }, progress: { wins: 3 } };
    expect(parse_record(serialize_record(record))).toEqual(record);
    expect(serialize_record(record)).toBe('{"version":1,"unlocked":{"a":1,"b":2},"progress":{"wins":3}}\n');
    expect(parse_record("{ nope")).toEqual(empty_record());
    expect(parse_record(JSON.stringify({ version: 2, unlocked: {}, progress: {} }))).toEqual(empty_record());
    expect(parse_record(null)).toEqual(empty_record());
  });

  test("dropping progress keeps the unlocks and leaves a broken file alone", () => {
    const text = serialize_record({ unlocked: { a: 5 }, progress: { b: 7 } });
    expect(without_progress(text)).toBe(serialize_record({ unlocked: { a: 5 }, progress: {} }));
    expect(without_progress("nope")).toBeNull();
    expect(without_progress("[]")).toBeNull();
  });
});

describe("changes", () => {
  test("achieve unlocks once", () => {
    const once = apply_achieve(empty_record(), "first", 100)!;
    expect(once.unlocked).toEqual({ first: 100 });
    expect(apply_achieve(once, "first", 200)).toBeNull();
  });

  test("progress keeps the max and unlocks at the goal", () => {
    const three = apply_progress(empty_record(), WINS, 3, 1)!;
    expect(three.progress.wins).toBe(3);
    expect(apply_progress(three, WINS, 2, 2)).toBeNull();
    const ten = apply_progress(three, WINS, 12, 3)!;
    expect(ten.unlocked.wins).toBe(3);
    expect(apply_progress(ten, WINS, 20, 4)!.unlocked.wins).toBe(3);
    expect(apply_progress(empty_record(), FIRST, 5, 1)).toBeNull();
  });
});

describe("entries", () => {
  test("declared ones carry unlock time, capped progress and its text", () => {
    const [wins, first] = declared_entries("game", [WINS, FIRST], { unlocked: { first: 9 }, progress: { wins: 4 } });
    expect(wins).toMatchObject({ unlocked: false, unlocked_at: null, progress: 4, progress_text: "4 / 10", builtin: false });
    expect(first).toMatchObject({ unlocked: true, unlocked_at: 9, progress: 0, progress_text: null });
  });

  test("built-in ones come from usage, with game wording and time labels", () => {
    const none = builtin_entries("snake", null, true);
    expect(none.every((entry) => !entry.unlocked && entry.builtin && entry.unlocked_at === null)).toBe(true);
    const some = builtin_entries("snake", { seconds: 3700, last: "", days: 5 }, true);
    expect(some.filter((entry) => entry.unlocked).map((entry) => entry.def.id)).toEqual(["os.first", "os.hour", "os.days-5"]);
    expect(some.find((entry) => entry.def.id === "os.hours-10")?.progress_text).toBe("1 h / 10 h");
    expect(some[0].def.text).toBe("Played it once.");
    expect(builtin_entries("paint", { seconds: 30, last: "", days: 1 }, false).find((entry) => entry.def.id === "os.hour")?.progress_text).toBe(
      "0 min / 1 h"
    );
  });
});

describe("achievements_problem", () => {
  test("rejects duplicate, reserved and empty ids and odd goals", () => {
    expect(achievements_problem([WINS, FIRST])).toBeNull();
    expect(achievements_problem([FIRST, FIRST])).toMatch(/twice/);
    expect(achievements_problem([{ ...FIRST, id: "os.hour" }])).toMatch(/usable/);
    expect(achievements_problem([{ ...FIRST, id: "" }])).toMatch(/usable/);
    expect(achievements_problem([{ ...WINS, goal: 2.5 }])).toMatch(/goal/);
    expect(achievements_problem([{ ...WINS, goal: 0 }])).toMatch(/goal/);
  });
});
