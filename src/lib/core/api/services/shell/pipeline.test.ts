import { describe, expect, it } from "vitest";
import { z } from "zod";
import { core_shell } from "./commands";
import { define_command } from "./define";
import { GroupListing, plan, run_stages, type Registry } from "./pipeline";
import type { Command, ShellSession, Value } from "./type";
import type { Kernel } from "../../kernel/kernel.svelte";

const closed: string[] = [];

const numbers = define_command({
  id: "numbers",
  description: "1, 2, 3, ... up to max",
  args: z.object({ max: z.number().default(5) }),
  positional: ["max"],
  async *run({ args }) {
    try {
      for (let n = 1; n <= args.max; n++) yield { $type: "n", n, even: n % 2 === 0 };
    } finally {
      closed.push("numbers");
    }
  },
});

const forever = define_command({
  id: "forever",
  description: "Never ends",
  run: () => new Promise<never>(() => {}),
});

const win_close = define_command({ id: "win close", description: "Close", available: () => false, run: () => {} });
const win_list = define_command({ id: "win list", description: "List", run: () => [] });

function registry(): Registry & { commands: Command[] } {
  const commands: Command[] = [];
  const self = {
    commands,
    find: (id: string) => commands.find((command) => command.id === id),
    ids: () => commands.map((command) => command.id),
  };
  const core = core_shell({ find: self.find, commands: () => commands, history: () => ["a", "b"], kernel: {} as Kernel });
  commands.push(...core.commands!, numbers, forever, win_close, win_list);
  return self;
}

const session = { cwd: "/home", entries: [], run: () => { throw new Error(); }, clear: () => {}, restore: () => {} } as ShellSession;

async function run(line: string, signal = new AbortController().signal): Promise<Value[]> {
  const out: Value[] = [];
  await run_stages(plan(line, registry()), { session, signal, emit: (value) => out.push(value) });
  return out;
}

describe("plan", () => {
  it("reports typos with suggestions, empty stages and unavailable commands", () => {
    const reg = registry();
    expect(() => plan("numbrs", reg)).toThrow(/unknown command "numbrs". Did you mean numbers/);
    expect(() => plan("numbers |", reg)).toThrow(/nothing after \|/);
    expect(() => plan("win close", reg)).toThrow(/not available/);
    expect(plan("", reg)).toEqual([]);
  });

  it("lists a group named alone", () => {
    expect(() => plan("win", registry())).toThrow(GroupListing);
  });

  it("marks sudo stages as elevated", () => {
    const [stage] = plan("sudo numbers 2", registry());
    expect(stage).toMatchObject({ elevated: true, args: { max: 2 } });
  });
});

describe("run_stages", () => {
  it("pipes values through verbs", async () => {
    expect(await run("numbers 6 | where even == true | get n")).toEqual([2, 4, 6]);
    expect(await run("numbers 6 | sort -r n | first 2 | get n")).toEqual([6, 5]);
    expect(await run("numbers 6 | last 2 | select n")).toEqual([{ n: 5 }, { n: 6 }]);
    expect(await run("numbers 4 | count")).toEqual([4]);
    expect(await run("echo hello world")).toEqual(["hello world"]);
  });

  it("closes upstream generators when a later stage stops reading", async () => {
    closed.length = 0;
    expect(await run("numbers 1000000 | first 1 | get n")).toEqual([1]);
    expect(closed).toEqual(["numbers"]);
  });

  it("stops waiting the moment the run is aborted", async () => {
    const controller = new AbortController();
    const done = run("forever", controller.signal);
    controller.abort();
    await expect(done).rejects.toThrow();
  });
});
