import type { Note } from "./notes";

/**
 * The text being edited for one note, saved shortly after typing stops. `base` is the file's text as of our last save:
 * while the file still holds it, the local text wins (a reload racing a save would otherwise drop keystrokes); a change
 * made elsewhere (shell, Text Editor, another window) replaces it.
 */
export class NoteDraft {
  private local = $state<{ id: string; body: string; base: string } | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private note: () => Note | null,
    private save: (note: Note) => Promise<boolean>
  ) {}

  get body(): string {
    const note = this.note();
    if (!note) return "";
    return this.local?.id === note.id && this.local.base === note.body ? this.local.body : note.body;
  }

  edit(body: string): void {
    const note = this.note();
    if (!note) return;
    const base = this.local?.id === note.id && this.local.base === note.body ? this.local.base : note.body;
    this.local = { id: note.id, body, base };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.persist({ ...note, body }), 400);
  }

  /** Drops a pending save, for callers that write the note themselves (status change, delete). */
  cancel(): void {
    clearTimeout(this.timer);
  }

  private async persist(note: Note): Promise<void> {
    if ((await this.save(note)) && this.local?.id === note.id) this.local = { ...this.local, base: note.body };
  }
}
