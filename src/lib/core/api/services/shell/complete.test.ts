import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Kernel } from "../../kernel/kernel.svelte";
import { arg } from "./arg";
import { core_shell } from "./commands";
import { complete, type CompletionSources } from "./complete";
import { define_command } from "./define";
import type { Command, ShellSession } from "./type";

const commands: Command[] = [];
const sources: CompletionSources = {
  find: (id) => commands.find((command) => command.id === id),
  ids: () => commands.map((command) => command.id),
  completer: (kind) =>
    kind === "path"
      ? (partial) => ["My Files/", "notes.txt", "Music/"].map((name) => ({ value: name, final: !name.endsWith("/") })).filter(() => partial !== "x")
      : undefined,
  value_type: (type) => (type === "file" ? { columns: ["name", "size", "modified"], text: () => "" } : undefined),
};
commands.push(
  ...core_shell({ find: sources.find, commands: () => commands, history: () => [], kernel: {} as Kernel }).commands!,
  define_command({ id: "ls", description: "List", args: z.object({ path: arg.path().optional(), all: z.boolean().default(false) }), positional: ["path"], short: { all: "a" }, yields: "file", run: () => {} }),
  define_command({ id: "win list", description: "List windows", run: () => {} }),
  define_command({ id: "win close", description: "Close windows", run: () => {} }),
  define_command({
    id: "theme set",
    description: "Set theme",
    args: z.object({ name: z.string(), animate: z.enum(["yes", "no"]).default("yes") }),
    positional: ["name"],
    complete: (field) => (field === "name" ? [{ value: "Bunny" }, { value: "Dusk" }] : undefined),
    run: () => {},
  })
);

const session = { cwd: "/home" } as ShellSession;
const at = async (line: string) => {
  const result = await complete(line, line.length, session, sources);
  return { ...result, values: result.items.map((item) => item.value) };
};

describe("complete", () => {
  it("completes command names and groups word by word", async () => {
    expect((await at("w")).values).toEqual(["where", "win"]);
    expect((await at("win ")).values).toEqual(["close", "list"]);
    expect((await at("win c")).values).toEqual(["close"]);
  });

  it("completes args by kind, escaped, replacing only the typed token", async () => {
    const result = await at("ls My");
    expect(result.values).toEqual(["My\\ Files/"]);
    expect(result).toMatchObject({ from: 3, to: 5 });
    expect(result.items[0].final).toBe(false);
  });

  it("completes flags and enum values", async () => {
    expect((await at("ls -")).values).toEqual(["--all"]);
    expect((await at("theme set Bunny --animate ")).values).toEqual(["yes", "no"]);
  });

  it("asks the command first, then the kind", async () => {
    expect((await at("theme set D")).values).toEqual(["Dusk"]);
  });

  it("completes where fields from what flows in, through filters", async () => {
    expect((await at("ls | where ")).values).toEqual(["name", "size", "modified"]);
    expect((await at("ls | first 3 | sort s")).values).toEqual(["size"]);
    expect((await at("ls | where size ")).values).toContain(">");
  });

  it("completes after sudo like without it", async () => {
    expect((await at("sudo win c")).values).toEqual(["close"]);
  });
});
