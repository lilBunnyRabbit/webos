import { can_redo, can_undo, create_history, current, push, redo, undo, type History } from "$kit/utils/history";
import { project_characters } from "./charsets";
import { create_project, type FontProject } from "./model";

const LIMITS = { max_entries: 200 };

export class FontEditor {
  private history = $state.raw<History<FontProject>>(create_history(create_project()));
  private saved = $state.raw<FontProject | null>(null);
  char = $state("A");

  constructor(project: FontProject) {
    this.history = create_history(project);
    this.saved = project;
  }

  readonly project = $derived(current(this.history));
  readonly dirty = $derived(this.project !== this.saved);
  readonly undoable = $derived(can_undo(this.history));
  readonly redoable = $derived(can_redo(this.history));
  readonly characters = $derived(project_characters(this.project.sets));

  load(project: FontProject, saved: boolean) {
    this.history = create_history(project);
    this.saved = saved ? project : null;
    if (!this.characters.includes(this.char)) this.char = this.characters[0] ?? "A";
  }

  mark_saved(project: FontProject) {
    this.saved = project;
  }

  apply(change: (project: FontProject) => FontProject) {
    const next = change(this.project);
    if (next === this.project) return;
    this.history = push(this.history, next, LIMITS);
    if (!this.characters.includes(this.char)) this.char = this.characters[0] ?? "A";
  }

  undo() {
    this.history = undo(this.history);
  }

  redo() {
    this.history = redo(this.history);
  }

  step(delta: number) {
    const list = this.characters;
    const index = list.indexOf(this.char);
    this.char = list[(index + delta + list.length) % list.length] ?? this.char;
  }
}
