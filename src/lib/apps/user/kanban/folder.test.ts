import { describe, expect, test } from "vitest";
import { BoardSchema, new_folder_board, set_done_column, type Board } from "./data";
import { card_fields, folder_board, NO_VALUE, order_columns, pin_columns, read_note, split_list } from "./folder";

const note = (file: string, status: string | null, extra = "") =>
  read_note(file, `---\n${status === null ? "" : `status: ${status}\n`}${extra}---\n\n# ${file.replace(".md", "")}\n`);

const board = (): Board => new_folder_board("Quests", "/home/quests");

describe("folder_board", () => {
  test("columns in order of first appearance, cards by title", () => {
    const shown = folder_board(board(), board().folder!, [note("b.md", "ready"), note("a.md", "raw"), note("c.md", "ready")]);
    expect(shown.columns.map((column) => column.id)).toEqual(["ready", "raw"]);
    expect(shown.columns[0].cards.map((card) => card.id)).toEqual(["b.md", "c.md"]);
  });

  test("stored order wins, with empty stored columns kept", () => {
    const stored = order_columns(board(), ["raw", "ready", "done"]);
    const shown = folder_board(stored, stored.folder!, [note("a.md", "ready"), note("b.md", "odd"), note("c.md", "raw")]);
    expect(shown.columns.map((column) => column.id)).toEqual(["raw", "ready", "done", "odd"]);
    expect(shown.columns[2].cards).toEqual([]);
  });

  test("cards without the field go last", () => {
    const shown = folder_board(board(), board().folder!, [note("a.md", null), note("b.md", "raw")]);
    expect(shown.columns.map((column) => [column.id, column.name])).toEqual([
      ["raw", "raw"],
      [NO_VALUE, "No status"],
    ]);
  });

  test("a due field becomes the card's due day", () => {
    const shown = folder_board(board(), board().folder!, [note("a.md", "raw", "due: 2026-10-20\n")]);
    expect(shown.columns[0].cards[0].due).toBe("2026-10-20");
  });
});

describe("column config", () => {
  test("pinning stores the shown order without cards or the missing column", () => {
    const shown = folder_board(board(), board().folder!, [note("a.md", "ready"), note("b.md", null)]);
    const pinned = set_done_column(pin_columns(board(), shown), "ready", true);
    expect(pinned.columns).toEqual([{ id: "ready", name: "ready", wip: null, done: true, cards: [] }]);
    expect(BoardSchema.safeParse(pinned).success).toBe(true);
  });

  test("a typed order keeps flags and drops duplicates", () => {
    const flagged = set_done_column(order_columns(board(), ["done"]), "done", true);
    const next = order_columns(flagged, split_list("raw, done, raw, ,"));
    expect(next.columns.map((column) => [column.id, column.done])).toEqual([
      ["raw", false],
      ["done", true],
    ]);
  });
});

describe("card_fields", () => {
  test("chosen fields, lists joined, wikilinks plain", () => {
    const quest = note("a.md", "raw", 'project: astra\nrelated: ["[[one]]", "[[two|Two]]"]\nsession:\n');
    expect(card_fields(quest, ["project", "related", "session", "missing"])).toEqual([
      { key: "project", text: "astra" },
      { key: "related", text: "one, Two" },
    ]);
  });
});
