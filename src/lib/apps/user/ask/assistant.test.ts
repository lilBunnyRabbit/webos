import { describe, expect, test } from "vitest";
import { z } from "zod";
import { define_command } from "$lib/core/api/services/shell/define";
import { tokenize } from "$lib/core/api/services/shell/tokenize";
import {
  NONE,
  breakdown,
  catalogue_line,
  clip,
  command_line,
  eligible,
  pick_messages,
  pick_schema,
  question_message,
  questions_left,
} from "./assistant";

const read = define_command({
  id: "list items",
  description: "What's on a shopping list",
  ai: "read",
  args: z.object({ list: z.string().optional() }),
  positional: ["list"],
  run: () => [],
});
const write = define_command({ id: "list add", description: "Add an item", run: () => [] });

describe("catalogue", () => {
  test("only commands marked for reading are offered, each as one usage line", () => {
    expect(eligible([write, read])).toEqual([read]);
    expect(catalogue_line(read)).toBe("- list items [list]: What's on a shopping list");
  });

  test("the pick sees the catalogue, the question and what the previous question ran", () => {
    const [system, user] = pick_messages([read], "and the other list?", { question: "what's on groceries", line: 'list items "Groceries"' });
    expect(system.content).toContain("- list items [list]");
    expect(user.content).toBe('Previous question: "what\'s on groceries" (ran: list items "Groceries")\nQuestion: and the other list?');
  });

  test("the schema allows only switched-on ids or none", () => {
    const schema = pick_schema(["list items"]);
    expect(schema.parse({ command: NONE, args: [] })).toEqual({ command: NONE, args: [] });
    expect(() => schema.parse({ command: "list add", args: [] })).toThrow();
  });
});

describe("command_line", () => {
  test("arguments stay arguments: no pipe or second command gets through", () => {
    const line = command_line({ command: "list items", args: ['Groceries" | rm -r /home', "--days", "7"] });
    const tokens = tokenize(line);
    expect(tokens.some((token) => token.pipe)).toBe(false);
    expect(tokens.map((token) => token.value)).toEqual(["list", "items", 'Groceries" | rm -r /home', "--days", "7"]);
  });
});

describe("question_message", () => {
  test("carries the data read for it, or says the command failed", () => {
    expect(question_message("hi", null)).toBe("hi");
    const ok = question_message("what's on my list", { line: "list items", text: "[ ] milk", failed: false });
    expect(ok).toContain("from `list items`");
    expect(ok).toContain("[ ] milk");
    expect(question_message("x", { line: "cal", text: "boom", failed: true })).toContain("The command failed: boom");
    expect(clip("abcdef", 3)).toBe("abc\n… (cut here, more data follows)");
  });
});

describe("memory", () => {
  test("splits a session into instructions, conversation and free, and guesses questions left", () => {
    const parts = breakdown({ used: 1000, window: 6000 }, 200);
    expect(parts).toEqual({ window: 6000, instructions: 200, conversation: 800, free: 5000 });
    expect(questions_left(parts, 2)).toBe(12);
    expect(questions_left(parts, 0)).toBeNull();
  });
});
