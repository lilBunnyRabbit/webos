import { describe, expect, test } from "vitest";
import {
  add_todo,
  clear_todos,
  file_name_for,
  NoteStatus,
  parse_note,
  parse_todos,
  resolve_note,
  serialize_note,
  set_todo,
  tags_of,
  title_of,
  type Note,
} from "./notes";

const note = (id: string, body: string): Note => ({ id, file: `${id}.md`, status: NoteStatus.RAW, created: "", from: "", body });

describe("notes", () => {
  test("round-trips through the file format", () => {
    const original = { ...note("a3f9c1e", "fix dock gap #webos\n\nmore"), created: "2026-10-14T12:00:00.000Z", from: "text-editor /home/x.md" };
    expect(parse_note(original.file, serialize_note(original))).toEqual({ ...original, body: "fix dock gap #webos\n\nmore\n" });
  });

  test("an empty note stays empty", () => {
    const empty = note("a3f9c1e", "");
    expect(parse_note(empty.file, serialize_note(empty))?.body).toBe("");
  });

  test("rejects files that aren't notes", () => {
    expect(parse_note("x.md", "# just markdown")).toBeNull();
    expect(parse_note("x.md", "---\nid: nope\n---\n")).toBeNull();
  });

  test("title, tags and file name", () => {
    expect(title_of("\n# Call Bob #work\nbody")).toBe("Call Bob #work");
    expect(tags_of("call bob #Work and #home, not a#b")).toEqual(["work", "home"]);
    expect(file_name_for("Fix the dock gap #webos now", new Date(2026, 9, 4))).toBe("2026-10-04-fix-the-dock-gap-now.md");
  });

  test("resolves by id prefix, then title", () => {
    const notes = [note("a3f9c1e", "fix dock"), note("a3f0000", "call bob"), note("b120000", "buy milk")];
    expect(resolve_note(notes, "b12")).toMatchObject({ id: "b120000" });
    expect(resolve_note(notes, "a3f")).toMatch(/matches 2 notes/);
    expect(resolve_note(notes, "bob")).toMatchObject({ id: "a3f0000" });
    expect(resolve_note(notes, "zzz")).toMatch(/no note/);
  });
});

describe("todos", () => {
  test("add, check, clear, keeping other lines", () => {
    let text = add_todo("# Todo\n", "call bob #work");
    text = add_todo(text, "buy milk");
    expect(parse_todos(text).map((todo) => [todo.n, todo.done, todo.text])).toEqual([
      [1, false, "call bob #work"],
      [2, false, "buy milk"],
    ]);
    text = set_todo(text, 2, true)!;
    expect(parse_todos(text)[1].done).toBe(true);
    expect(set_todo(text, 9, true)).toBeNull();
    const cleared = clear_todos(text);
    expect(cleared).toEqual({ text: "# Todo\n- [ ] call bob #work\n", removed: 1 });
  });
});
