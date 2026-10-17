import { describe, expect, test } from "vitest";
import { plan_renames, type RenameRule, type RenameSource } from "./rename-pattern";

const MODIFIED = new Date(2026, 9, 17, 14, 3, 9).getTime();
const file = (path: string, modified: number | null = MODIFIED): RenameSource => ({ path, modified });

function names(paths: string[], rule: RenameRule, others: string[] = []): string[] {
  const plan = plan_renames(paths.map((path) => file(path)), rule, new Map([["/p", [...paths.map((path) => path.slice(3)), ...others]]]));
  expect(plan.error).toBeNull();
  return plan.steps.map((step) => step.new_name);
}

describe("tokens", () => {
  test("name, ext and a counter", () => {
    expect(names(["/p/a.JPG", "/p/b.png"], { pattern: "trip-{n}{ext}" })).toEqual(["trip-1.JPG", "trip-2.png"]);
  });

  test("padding, start and step", () => {
    expect(names(["/p/a", "/p/b", "/p/c"], { pattern: "{n:3}-{name}", start: 10, step: 5 })).toEqual(["010-a", "015-b", "020-c"]);
  });

  test("the modified date, formatted", () => {
    expect(names(["/p/a.txt"], { pattern: "{date}_{name}{ext}" })).toEqual(["2026-10-17_a.txt"]);
    expect(names(["/p/a.txt"], { pattern: "{date:yyMMdd-HHmmss}{ext}" })).toEqual(["261017-140309.txt"]);
  });

  test("the parent folder", () => {
    expect(names(["/p/a.txt"], { pattern: "{parent}-{name}{ext}" })).toEqual(["p-a.txt"]);
  });

  test("case modifiers", () => {
    expect(names(["/p/My photo.JPG"], { pattern: "{name:upper}{ext:lower}" })).toEqual(["MY PHOTO.jpg"]);
    expect(names(["/p/my best-day.txt"], { pattern: "{name:title}{ext}" })).toEqual(["My Best-Day.txt"]);
  });

  test("dotfiles are all stem, and doubled braces are literal", () => {
    expect(names(["/p/.env"], { pattern: "{{{name}}}{ext}" })).toEqual(["{.env}"]);
  });

  test("an empty pattern keeps the name", () => {
    expect(names(["/p/a.txt"], { pattern: "" })).toEqual(["a.txt"]);
  });

  test("unknown tokens and bad options are a rule error", () => {
    const sources = [file("/p/a.txt")];
    expect(plan_renames(sources, { pattern: "{size}" }, new Map()).error).toMatch(/Unknown token/);
    expect(plan_renames(sources, { pattern: "{n:x}" }, new Map()).error).toMatch(/width/);
    expect(plan_renames(sources, { pattern: "{name:shout}" }, new Map()).blocked).toBe(true);
  });

  test("a folder has no date", () => {
    const plan = plan_renames([file("/p/folder", null)], { pattern: "{date}" }, new Map([["/p", ["folder"]]]));
    expect(plan.steps[0].problem).toMatch(/no modified date/);
  });
});

describe("regex and find", () => {
  test("a regex with groups on the whole name", () => {
    expect(names(["/p/IMG_0042.jpg"], { pattern: "/IMG_(\\d+)/photo-$1/" })).toEqual(["photo-0042.jpg"]);
  });

  test("flags, and tokens in the replacement", () => {
    expect(names(["/p/a-a.txt"], { pattern: "/a/{n:2}/g" })).toEqual(["01-01.txt"]);
    expect(names(["/p/Report.txt"], { pattern: "/report/{parent}/i" })).toEqual(["p.txt"]);
  });

  test("a $ in a token value stays literal", () => {
    const plan = plan_renames([file("/$1/a.txt")], { pattern: "/a/{parent}/" }, new Map([["/$1", ["a.txt"]]]));
    expect(plan.steps[0].new_name).toBe("$1.txt");
  });

  test("a broken regex is a rule error", () => {
    expect(plan_renames([file("/p/a")], { pattern: "/(/x/" }, new Map()).error).toMatch(/Invalid regex/);
    expect(plan_renames([file("/p/a")], { pattern: "/a/b" }, new Map()).error).toMatch(/looks like/);
  });

  test("find and replace, case-insensitive unless asked", () => {
    expect(names(["/p/Draft draft.txt"], { pattern: "", find: "draft", replace: "final" })).toEqual(["final final.txt"]);
    expect(names(["/p/Draft draft.txt"], { pattern: "", find: "draft", replace: "final", match_case: true })).toEqual(["Draft final.txt"]);
  });

  test("find runs after the pattern, and the replacement is literal", () => {
    expect(names(["/p/a.txt"], { pattern: "x-{name}{ext}", find: "x-", replace: "$&-" })).toEqual(["$&-a.txt"]);
  });
});

describe("clashes", () => {
  const plan = (paths: string[], rule: RenameRule, folder: string[]) =>
    plan_renames(paths.map((path) => file(path)), rule, new Map([["/p", folder]]));

  test("a name another entry keeps blocks", () => {
    const result = plan(["/p/a.txt"], { pattern: "b{ext}" }, ["a.txt", "b.txt"]);
    expect(result.steps[0].problem).toMatch(/already has/);
    expect(result.blocked).toBe(true);
  });

  test("two entries getting one name both block", () => {
    const result = plan(["/p/a.txt", "/p/b.txt"], { pattern: "same{ext}" }, ["a.txt", "b.txt"]);
    expect(result.steps.map((step) => step.problem)).toEqual([expect.stringMatching(/same name/), expect.stringMatching(/same name/)]);
  });

  test("an entry that keeps its name still holds it", () => {
    const result = plan(["/p/a.txt", "/p/b.txt"], { pattern: "/a/b/" }, ["a.txt", "b.txt"]);
    expect(result.blocked).toBe(true);
  });

  test("swaps are fine", () => {
    const result = plan(["/p/a.txt", "/p/b.txt"], { pattern: "", find: "a", replace: "b" }, ["a.txt", "b.txt"]);
    expect(result.blocked).toBe(true);
    const swap = plan_renames(
      [file("/p/1.txt"), file("/p/2.txt")],
      { pattern: "{n}{ext}", start: 2, step: -1 },
      new Map([["/p", ["1.txt", "2.txt"]]])
    );
    expect(swap.steps.map((step) => step.new_name)).toEqual(["2.txt", "1.txt"]);
    expect(swap.blocked).toBe(false);
    expect(swap.changed).toBe(2);
  });

  test("bad names", () => {
    expect(plan(["/p/a"], { pattern: ".." }, ["a"]).steps[0].problem).toMatch(/reserved/);
    expect(plan(["/p/a"], { pattern: "/a/ /" }, ["a"]).steps[0].problem).toMatch(/empty/);
  });

  test("the same path twice counts once, and nothing changed is no change", () => {
    const result = plan(["/p/a", "/p/a"], { pattern: "" }, ["a"]);
    expect(result.steps).toHaveLength(1);
    expect(result).toMatchObject({ changed: 0, blocked: false });
  });

  test("folders are checked separately", () => {
    const result = plan_renames(
      [file("/p/a.txt"), file("/q/b.txt")],
      { pattern: "x{ext}" },
      new Map([
        ["/p", ["a.txt"]],
        ["/q", ["b.txt"]],
      ])
    );
    expect(result.blocked).toBe(false);
  });
});
