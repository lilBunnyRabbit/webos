import { can_redo, can_undo, create_history, current, push, redo, undo, type History } from "$kit/utils/history";
import { length_of, set_length, step_target, target_exists } from "./edit";
import { create_sketch, same_target, type Sketch, type Target } from "./model";
import { input_for, parse_input, type_key } from "./units";

export const Tool = {
  SELECT: "select",
  CORNERS: "corners",
  WALK: "walk",
  DIM: "dim",
  MARKER: "marker",
  NOTE: "note",
} as const;
export type Tool = (typeof Tool)[keyof typeof Tool];

export const Pick = {
  POINT: "point",
  PATH: "path",
  DIM: "dim",
  MARKER: "marker",
  NOTE: "note",
} as const;
export type Pick = (typeof Pick)[keyof typeof Pick];

export interface Selection {
  kind: Pick;
  id: string;
}

export class Editor {
  private history = $state.raw<History<Sketch>>(create_history(create_sketch()));
  private saved = $state.raw<Sketch>(current(this.history));
  preview = $state.raw<Sketch | null>(null);

  tool = $state<Tool>(Tool.CORNERS);
  selection = $state<Selection | null>(null);
  drawing = $state<string | null>(null);
  walk_from = $state<string | null>(null);
  dim_from = $state<string | null>(null);
  target = $state<Target | null>(null);
  input = $state("");
  /** Set once a key is typed, so stepping away from an untouched length doesn't rewrite it. */
  typed = $state(false);

  readonly sketch = $derived(this.preview ?? current(this.history));
  readonly committed = $derived(current(this.history));
  readonly dirty = $derived(current(this.history) !== this.saved);
  readonly undoable = $derived(can_undo(this.history));
  readonly redoable = $derived(can_redo(this.history));

  load(sketch: Sketch): void {
    this.history = create_history(sketch);
    this.saved = sketch;
    this.preview = null;
    this.reset_modes();
    this.tool = sketch.points.length || sketch.notes.length ? Tool.SELECT : Tool.CORNERS;
  }

  mark_saved(sketch: Sketch): void {
    this.saved = sketch;
  }

  apply(change: (sketch: Sketch) => Sketch): void {
    const before = current(this.history);
    const next = change(before);
    this.preview = null;
    if (next !== before) this.history = push(this.history, next);
  }

  undo(): void {
    this.commit_input();
    this.preview = null;
    this.history = undo(this.history);
    this.repair();
  }

  redo(): void {
    this.commit_input();
    this.preview = null;
    this.history = redo(this.history);
    this.repair();
  }

  private repair(): void {
    const sketch = current(this.history);
    const has_point = (id: string | null) => id !== null && sketch.points.some((point) => point.id === id);
    if (this.drawing && !sketch.paths.some((path) => path.id === this.drawing && !path.closed)) this.drawing = null;
    if (!has_point(this.walk_from)) this.walk_from = null;
    if (!has_point(this.dim_from)) this.dim_from = null;
    if (this.target && !target_exists(sketch, this.target)) this.close_numpad(false);
    else if (this.target) this.input = input_for(length_of(sketch, this.target), sketch.unit);
    if (this.selection && !this.selection_exists(sketch, this.selection)) this.selection = null;
  }

  private selection_exists(sketch: Sketch, selection: Selection): boolean {
    const lists: Record<Pick, { id: string }[]> = {
      point: sketch.points,
      path: sketch.paths,
      dim: sketch.dims,
      marker: sketch.markers,
      note: sketch.notes,
    };
    return lists[selection.kind].some((item) => item.id === selection.id);
  }

  reset_modes(): void {
    this.selection = null;
    this.drawing = null;
    this.walk_from = null;
    this.dim_from = null;
    this.target = null;
    this.input = "";
    this.typed = false;
  }

  open_numpad(target: Target): void {
    if (same_target(target, this.target)) return;
    this.commit_input();
    this.target = target;
    this.input = input_for(length_of(this.sketch, target), this.sketch.unit);
    this.typed = false;
  }

  press(key: string): void {
    const base = this.typed ? this.input : "";
    this.input = type_key(base, key);
    this.typed = true;
  }

  clear_input(): void {
    this.input = "";
    this.typed = true;
  }

  commit_input(): void {
    const target = this.target;
    if (!target || !this.typed) return;
    const value = parse_input(this.input, this.sketch.unit);
    this.typed = false;
    if (value === length_of(this.committed, target)) return;
    if (value === null && this.input) return;
    this.apply((sketch) => set_length_safe(sketch, target, value));
  }

  step(direction: 1 | -1): void {
    this.commit_input();
    const next = step_target(this.sketch, this.target, direction);
    if (next) this.open_numpad(next);
  }

  close_numpad(commit = true): void {
    if (commit) this.commit_input();
    this.target = null;
    this.input = "";
    this.typed = false;
  }
}

function set_length_safe(sketch: Sketch, target: Target, value: number | null): Sketch {
  return target_exists(sketch, target) ? set_length(sketch, target, value) : sketch;
}
