import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteDraft } from "./draft.svelte";
import { NoteStatus, type Note } from "./notes";

describe("NoteDraft", () => {
  let note: Note;
  let draft: NoteDraft;

  beforeEach(() => {
    vi.useFakeTimers();
    note = { id: "abc1234", file: "a.md", status: NoteStatus.RAW, created: "", from: "", body: "" };
    draft = new NoteDraft(
      () => note,
      async () => true
    );
  });

  afterEach(() => vi.useRealTimers());

  it("keeps the typed text between a save and the reload that brings it back", async () => {
    draft.edit("Hello");
    await vi.advanceTimersByTimeAsync(400);
    expect(draft.body).toBe("Hello");
    draft.edit("Hello there");
    note = { ...note, body: "Hello" };
    expect(draft.body).toBe("Hello there");
    await vi.advanceTimersByTimeAsync(400);
    expect(draft.body).toBe("Hello there");
  });

  it("takes a change made elsewhere", async () => {
    draft.edit("Hello");
    await vi.advanceTimersByTimeAsync(400);
    note = { ...note, body: "Edited in the shell" };
    expect(draft.body).toBe("Edited in the shell");
  });
});
