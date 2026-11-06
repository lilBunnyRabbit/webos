import type { Note } from "./notes";

/**
 * The text being edited for one note, saved shortly after typing stops. The local text wins while the note in hand
 * holds `base` (the file as of the last edit) or `saved` (our last write): a save resolves before the reload brings
 * the saved text back, so trusting only one of them flashes the stale note and throws the caret to the end. A change
 * made elsewhere (shell, Text Editor, another window) matches neither and replaces the local text.
 */
export class NoteDraft {
  private local = $state<{ id: string; body: string; base: string; saved: string | null } | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private note: () => Note | null,
    private save: (note: Note) => Promise<boolean>
  ) {}

  get body(): string {
    const note = this.note();
    if (!note) return "";
    return this.local && this.mine(note) ? this.local.body : note.body;
  }

  edit(body: string): void {
    const note = this.note();
    if (!note) return;
    const saved = this.local && this.mine(note) ? this.local.saved : null;
    this.local = { id: note.id, body, base: note.body, saved };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.persist({ ...note, body }), 400);
  }

  /** Drops a pending save, for callers that write the note themselves (status change, delete). */
  cancel(): void {
    clearTimeout(this.timer);
  }

  private mine(note: Note): boolean {
    return this.local?.id === note.id && (note.body === this.local.base || note.body === this.local.saved);
  }

  private async persist(note: Note): Promise<void> {
    if (!(await this.save(note)) || this.local?.id !== note.id) return;
    const current = this.note();
    const base = current && this.mine(current) ? current.body : this.local.base;
    this.local = { ...this.local, base, saved: note.body };
  }
}
