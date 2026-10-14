import { describe, expect, it } from "vitest";
import { z } from "zod";
import { arg } from "./arg";
import { define_command } from "./define";
import { bind, fields, resolve, usage } from "./parse";
import { tokenize } from "./tokenize";
import { ShellError } from "./type";

const cp = define_command({
  id: "cp",
  description: "Copy",
  args: z.object({
    from: z.array(arg.path()).min(1),
    to: arg.path().describe("Target"),
    recursive: z.boolean().default(false),
    depth: z.number().optional(),
    mode: z.enum(["fast", "safe"]).default("safe"),
  }),
  positional: ["to", "from"],
  short: { recursive: "r", depth: "d" },
  run: () => {},
});

const parse = (input: string) => bind(cp, tokenize(input));

describe("fields", () => {
  it("reads types, kinds, descriptions and positional order from the schema", () => {
    const list = fields(cp);
    expect(list.map((field) => field.name)).toEqual(["to", "from", "recursive", "depth", "mode"]);
    expect(list[0]).toMatchObject({ type: "string", kind: "path", description: "Target", positional: true, optional: false });
    expect(list[1]).toMatchObject({ type: "array", element: "string", kind: "path" });
    expect(list[4]).toMatchObject({ type: "enum", options: ["fast", "safe"], optional: true });
  });
});

describe("bind", () => {
  it("fills positionals in order, the array taking the rest", () => {
    expect(parse("/tmp a b")).toMatchObject({ to: "/tmp", from: ["a", "b"], recursive: false, mode: "safe" });
  });

  it("leaves the positionals after an array their tokens", () => {
    const copy = define_command({
      id: "copy",
      description: "",
      args: z.object({ from: z.array(z.string()).default([]), to: z.string() }),
      positional: ["from", "to"],
      run: () => {},
    });
    expect(bind(copy, tokenize("a b /tmp"))).toEqual({ from: ["a", "b"], to: "/tmp" });
    expect(bind(copy, tokenize("/tmp"))).toEqual({ from: [], to: "/tmp" });
  });

  it("reads long, inline, short and combined flags", () => {
    expect(parse("--recursive --depth=3 /tmp a")).toMatchObject({ recursive: true, depth: 3 });
    expect(parse("-r -d 2 /tmp a")).toMatchObject({ recursive: true, depth: 2 });
    expect(parse("-rd5 /tmp a")).toMatchObject({ recursive: true, depth: 5 });
    expect(parse("--mode fast /tmp a")).toMatchObject({ mode: "fast" });
  });

  it("treats quoted dashes and anything after -- as positional", () => {
    expect(parse(`/tmp "-r"`)).toMatchObject({ from: ["-r"], recursive: false });
    expect(parse(`/tmp -- -r`)).toMatchObject({ from: ["-r"] });
  });

  it("reports what's wrong in the user's terms", () => {
    expect(() => parse("/tmp")).toThrow(/missing from/);
    expect(() => parse("--depth x /tmp a")).toThrow(/depth: "x" is not a number/);
    expect(() => parse("--nope /tmp a")).toThrow(/unknown flag --nope/);
    expect(() => parse("-z /tmp a")).toThrow(ShellError);
    expect(() => parse("--mode slow /tmp a")).toThrow(/mode/);
  });

  it("refuses extra positionals when nothing takes the rest", () => {
    const echo = define_command({ id: "one", description: "", args: z.object({ a: z.string() }), positional: ["a"], run: () => {} });
    expect(() => bind(echo, tokenize("x y"))).toThrow(/unexpected "y"/);
  });
});

describe("resolve", () => {
  it("takes the longest prefix that is a command", () => {
    const ids = new Set(["win", "win close"]);
    const find = (id: string) => (ids.has(id) ? cp : undefined);
    expect(resolve(["win", "close", "3"], find)?.length).toBe(2);
    expect(resolve(["win", "list"], find)?.length).toBe(1);
    expect(resolve(["nope"], find)).toBeNull();
  });
});

describe("usage", () => {
  it("shows positionals, then flags", () => {
    expect(usage(cp)).toBe("cp <to> [from...] [-r|--recursive] [-d|--depth <n>] [--mode fast|safe]");
  });
});
