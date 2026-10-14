import { describe, expect, test } from "vitest";
import {
  add_board,
  add_card,
  add_check,
  add_column,
  add_label,
  archive_card,
  archive_done,
  checklist_progress,
  column_index_before,
  count_due,
  default_file,
  delete_archived,
  due_cards,
  due_state,
  DueState,
  find_card,
  get_board,
  index_before,
  is_over_wip,
  KanbanFileSchema,
  LabelColor,
  move_card,
  move_column,
  new_board,
  new_card,
  remove_board,
  remove_column,
  remove_label,
  restore_card,
  set_wip,
  toggle_label,
  update_card,
  update_check,
  type Board,
  type Card,
} from "./data";

const card = (id: string, extra: Partial<Card> = {}): Card => ({ ...new_card(id), id, ...extra });

function board_with(cards: Record<string, string[]>): Board {
  let board = get_board(default_file(), null);
  for (const [column, ids] of Object.entries(cards)) for (const id of ids) board = add_card(board, column, card(id));
  return board;
}

const ids = (board: Board, column: string) => board.columns.find((c) => c.id === column)!.cards.map((c) => c.id);

describe("file", () => {
  test("the default file is valid and stable", () => {
    expect(KanbanFileSchema.safeParse(default_file()).success).toBe(true);
    expect(default_file()).toEqual(default_file());
    expect(get_board(default_file(), null).columns.map((column) => column.name)).toEqual(["Later", "Next", "Doing", "Done"]);
  });

  test("schema fills optional fields and rejects other versions", () => {
    const parsed = KanbanFileSchema.parse({
      version: 1,
      boards: [{ id: "b", name: "B", columns: [{ id: "c", name: "C", cards: [{ id: "x", title: "X", created: "" }] }] }],
    });
    expect(parsed.boards[0].columns[0].cards[0]).toEqual({ id: "x", title: "X", notes: "", labels: [], due: null, checklist: [], created: "" });
    expect(parsed.boards[0].columns[0]).toMatchObject({ wip: null, done: false });
    expect(KanbanFileSchema.safeParse({ ...default_file(), version: 2 }).success).toBe(false);
    expect(KanbanFileSchema.safeParse({ version: 1, boards: [] }).success).toBe(false);
  });

  test("new boards get fresh ids", () => {
    const board = new_board("Trip");
    expect(board.name).toBe("Trip");
    expect(board.id).not.toBe("life");
    expect(board.columns.map((column) => column.id)).not.toContain("later");
  });

  test("the last board stays", () => {
    const file = default_file();
    expect(remove_board(file, "life")).toBe(file);
    const two = add_board(file, new_board("Trip"));
    expect(remove_board(two, "life").boards.map((board) => board.name)).toEqual(["Trip"]);
  });
});

describe("columns", () => {
  test("add, move, remove", () => {
    let board = add_column(board_with({}), "Waiting", "wait");
    expect(board.columns.at(-1)!.id).toBe("wait");
    board = move_column(board, "wait", 1);
    expect(board.columns.map((column) => column.id)).toEqual(["later", "wait", "next", "doing", "done"]);
    board = move_column(board, "later", 99);
    expect(board.columns.at(-1)!.id).toBe("later");
    expect(remove_column(board, "wait").columns.map((column) => column.id)).not.toContain("wait");
  });

  test("wip limits", () => {
    let board = board_with({ doing: ["a", "b", "c"] });
    expect(is_over_wip(board.columns[2])).toBe(false);
    board = set_wip(board, "doing", 2);
    expect(is_over_wip(board.columns[2])).toBe(true);
    expect(set_wip(board, "doing", 0).columns[2].wip).toBeNull();
    expect(set_wip(board, "doing", 2.7).columns[2].wip).toBe(2);
  });

  test("column_index_before", () => {
    const board = board_with({});
    expect(column_index_before(board, "doing", "later")).toBe(1);
    expect(column_index_before(board, null, "later")).toBe(3);
  });
});

describe("cards", () => {
  test("move within and between columns", () => {
    let board = board_with({ later: ["a", "b", "c"], next: ["d"] });
    board = move_card(board, "a", "later", index_before(board.columns[0], null, "a"));
    expect(ids(board, "later")).toEqual(["b", "c", "a"]);
    board = move_card(board, "c", "next", index_before(board.columns[1], "d", "c"));
    expect(ids(board, "later")).toEqual(["b", "a"]);
    expect(ids(board, "next")).toEqual(["c", "d"]);
    expect(move_card(board, "missing", "next", 0)).toBe(board);
    expect(move_card(board, "a", "missing", 0)).toBe(board);
  });

  test("update and find", () => {
    const board = update_card(board_with({ next: ["a"] }), "a", (c) => ({ ...c, title: "Groceries", due: "2026-10-14" }));
    expect(find_card(board, "a")).toMatchObject({ card: { title: "Groceries", due: "2026-10-14" }, column: { id: "next" }, index: 0 });
    expect(find_card(board, "nope")).toBeNull();
  });

  test("checklist", () => {
    let c = add_check(add_check(card("a"), "milk"), "eggs");
    c = update_check(c, c.checklist[0].id, { done: true });
    expect(checklist_progress(c)).toEqual({ done: 1, total: 2 });
  });
});

describe("archive", () => {
  const now = new Date("2026-10-14T10:00:00Z");

  test("archive and restore a card", () => {
    let board = archive_card(board_with({ next: ["a", "b"] }), "a", now);
    expect(ids(board, "next")).toEqual(["b"]);
    expect(board.archive[0]).toMatchObject({ id: "a", column: "next", archived: now.toISOString() });
    board = restore_card(board, "a");
    expect(ids(board, "next")).toEqual(["a", "b"]);
    expect(board.archive).toEqual([]);
  });

  test("restore falls back to the first column", () => {
    let board = archive_card(board_with({ next: ["a"] }), "a", now);
    board = restore_card(remove_column(board, "next"), "a");
    expect(ids(board, "later")).toEqual(["a"]);
  });

  test("archive done cards only takes done columns", () => {
    const board = archive_done(board_with({ doing: ["a"], done: ["b", "c"] }), now);
    expect(ids(board, "done")).toEqual([]);
    expect(ids(board, "doing")).toEqual(["a"]);
    expect(board.archive.map((c) => c.id)).toEqual(["b", "c"]);
    expect(delete_archived(board, "b").archive.map((c) => c.id)).toEqual(["c"]);
    expect(delete_archived(board, null).archive).toEqual([]);
  });
});

describe("labels", () => {
  test("new labels take an unused colour", () => {
    const board = add_label(board_with({}), "Money", "money");
    expect(board.labels.at(-1)).toEqual({ id: "money", name: "Money", color: LabelColor.WARNING });
  });

  test("removing a label strips it from cards", () => {
    let board = board_with({ next: ["a"] });
    board = update_card(board, "a", (c) => toggle_label(toggle_label(c, "home"), "idea"));
    board = archive_card(add_card(board, "next", card("b", { labels: ["home"] })), "b");
    board = remove_label(board, "home");
    expect(find_card(board, "a")!.card.labels).toEqual(["idea"]);
    expect(board.archive[0].labels).toEqual([]);
    expect(board.labels.map((label) => label.id)).not.toContain("home");
  });
});

describe("due dates", () => {
  test("due_state", () => {
    expect(due_state("2026-10-13", "2026-10-14")).toBe(DueState.OVERDUE);
    expect(due_state("2026-10-14", "2026-10-14")).toBe(DueState.TODAY);
    expect(due_state("2026-10-16", "2026-10-14")).toBe(DueState.SOON);
    expect(due_state("2026-10-17", "2026-10-14")).toBe(DueState.LATER);
    expect(due_state("2027-01-01", "2026-12-31")).toBe(DueState.SOON);
  });

  test("due cards across boards; the badge skips done columns and archive", () => {
    let file = default_file();
    file = { ...file, boards: [board_with({ next: ["a"], done: ["b"] })] };
    file.boards[0] = update_card(file.boards[0], "a", (c) => ({ ...c, due: "2026-10-14" }));
    file.boards[0] = update_card(file.boards[0], "b", (c) => ({ ...c, due: "2026-10-10" }));
    let trip = new_board("Trip");
    trip = add_card(trip, trip.columns[0].id, card("c", { due: "2026-10-01" }));
    trip = add_card(trip, trip.columns[0].id, card("d", { due: "2026-10-20" }));
    trip = archive_card(add_card(trip, trip.columns[0].id, card("e", { due: "2026-10-01" })), "e");
    file = add_board(file, trip);

    expect(due_cards(file).map(({ card }) => card.id)).toEqual(["c", "b", "a", "d"]);
    expect(count_due(file, "2026-10-14")).toBe(2);
    expect(count_due(file, "2026-10-20")).toBe(3);
  });
});
