import { describe, expect, test } from "vitest";
import { add_board, add_card, default_file, new_board, type Card, type KanbanFile } from "./data";
import { first_open_column, resolve_board, resolve_card, resolve_column, resolve_note } from "./lookup";

const card = (id: string, title: string): Card => ({ id, title, notes: "", labels: [], due: null, checklist: [], created: "2026-10-15T00:00:00.000Z" });

function file(): KanbanFile {
  const base = default_file();
  let life = add_card(base.boards[0], "later", card("a1b2c3d4", "Buy milk"));
  life = add_card(life, "next", card("a1ff0000", "Book dentist"));
  life = add_card(life, "done", card("9f9f9f9f", "Buy bread"));
  return add_board({ ...base, boards: [life] }, { ...new_board("Work"), id: "work" });
}

describe("resolve_card", () => {
  test("by id, unique id prefix, exact title or title fragment", () => {
    expect(resolve_card(file(), "a1b2c3d4")).toMatchObject({ card: { title: "Buy milk" } });
    expect(resolve_card(file(), "a1f")).toMatchObject({ card: { title: "Book dentist" }, column: { id: "next" } });
    expect(resolve_card(file(), "buy BREAD")).toMatchObject({ card: { id: "9f9f9f9f" }, column: { done: true } });
    expect(resolve_card(file(), "dent")).toMatchObject({ card: { id: "a1ff0000" } });
  });

  test("ambiguous and missing read as errors", () => {
    expect(resolve_card(file(), "a1")).toMatch(/matches 2 cards/);
    expect(resolve_card(file(), "buy")).toMatch(/matches 2 cards: a1b2c3d4 Buy milk, 9f9f9f9f Buy bread/);
    expect(resolve_card(file(), "nope")).toBe('no card "nope"');
    expect(resolve_card(file(), " ")).toBe("no card given");
  });
});

describe("columns and boards", () => {
  const board = file().boards[0];

  test("column by id, name or name prefix", () => {
    expect(resolve_column(board, "doing")).toMatchObject({ id: "doing" });
    expect(resolve_column(board, "Do")).toMatch(/matches 2 columns: Doing, Done/);
    expect(resolve_column(board, "Don")).toMatchObject({ id: "done" });
    expect(resolve_column(board, "x")).toBe('no column "x"');
  });

  test("board by name", () => {
    expect(resolve_board(file(), "work")).toMatchObject({ name: "Work" });
    expect(resolve_board(file(), "li")).toMatchObject({ id: "life" });
  });

  test("folder board file by name, title or fragment; ambiguous lists the candidates", () => {
    const notes = [
      { file: "first-quest.md", title: "First quest", fields: {} },
      { file: "second.md", title: "Second quest", fields: {} },
    ];
    expect(resolve_note(notes, "SECOND")).toMatchObject({ file: "second.md" });
    expect(resolve_note(notes, "first-quest.md")).toMatchObject({ title: "First quest" });
    expect(resolve_note(notes, "first QUEST")).toMatchObject({ file: "first-quest.md" });
    expect(resolve_note(notes, "quest")).toBe('"quest" matches 2 cards: first-quest.md First quest, second.md Second quest');
    expect(resolve_note(notes, "third")).toBe('no card "third"');
  });

  test("first open column skips done ones", () => {
    const done_first = { ...board, columns: [{ ...board.columns[3] }, ...board.columns.slice(0, 3)] };
    expect(first_open_column(done_first)?.id).toBe("later");
    expect(first_open_column({ ...board, columns: [] })).toBeNull();
  });
});
