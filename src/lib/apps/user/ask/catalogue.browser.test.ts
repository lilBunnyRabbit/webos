import { expect, test } from "vitest";
import "$lib/core/api";
import type { ShellContribution } from "$lib/core/api/services/shell/type";
import { PICK_RULES, catalogue_line, eligible } from "./assistant";

// Gemini Nano's window is a few thousand tokens; every switched-on command is sent with every question.
const BUDGET_CHARS = 4_000;

test("all commands the assistant can read fit in the pick's budget", async () => {
  const modules = import.meta.glob<{ default: ShellContribution }>("/src/lib/apps/*/*/commands.ts");
  const commands = (await Promise.all(Object.values(modules).map((load) => load()))).flatMap((module) => module.default.commands ?? []);
  const catalogue = eligible(commands);
  expect(catalogue.map((command) => command.id)).toContain("list items");
  const size = PICK_RULES.length + catalogue.map(catalogue_line).join("\n").length;
  expect(size).toBeLessThan(BUDGET_CHARS);
});
