import { can_redo, can_undo, create_history, current, push, redo, undo, type History } from "$kit/utils/history";
import { create_wire, type Axis, type Ink, type Sign, type Wire } from "./model";
import { type_key } from "$kit/components/length-pad/keys";

export const Tool = {
  SELECT: "select",
  DRAW: "draw",
  SLOPE: "slope",
  POINT: "point",
  BOX: "box",
} as const;
export type Tool = (typeof Tool)[keyof typeof Tool];

export const Op = {
  WALK: "walk",
  MOVE: "move",
  EXTRUDE: "extrude",
  COPY: "copy",
} as const;
export type Op = (typeof Op)[keyof typeof Op];

export interface Selection {
  points: string[];
  lines: string[];
}

export interface Pending {
  axis: Axis;
  sign: Sign;
}

const EMPTY: Selection = { points: [], lines: [] };

export class Editor {
  private history = $state.raw<History<Wire>>(create_history(create_wire()));
  private saved = $state.raw<Wire>(current(this.history));

  tool = $state<Tool>(Tool.DRAW);
  op = $state<Op | null>(null);
  selection = $state.raw<Selection>(EMPTY);
  from = $state<string | null>(null);
  slope_from = $state<string | null>(null);
  pending = $state.raw<Pending | null>(null);
  input = $state("");
  /** Set once a key is typed, so the first key replaces a suggested length instead of adding to it. */
  typed = $state(false);
  /** The point a stroke was dragged onto: it's joined exactly, since the suggested text is rounded, unless a length is typed. */
  snap = $state<string | null>(null);
  count = $state(2);
  ink = $state<Ink>(null);

  readonly wire = $derived(current(this.history));
  readonly dirty = $derived(current(this.history) !== this.saved);
  readonly undoable = $derived(can_undo(this.history));
  readonly redoable = $derived(can_redo(this.history));
  readonly panel = $derived<Op | null>(this.op ?? (this.tool === Tool.DRAW ? Op.WALK : null));

  load(wire: Wire): void {
    this.history = create_history(wire);
    this.saved = wire;
    this.reset();
    this.tool = wire.points.length ? Tool.SELECT : Tool.DRAW;
  }

  mark_saved(wire: Wire): void {
    this.saved = wire;
  }

  apply(change: (wire: Wire) => Wire): void {
    const before = current(this.history);
    const next = change(before);
    if (next === before) return;
    this.history = push(this.history, next);
    this.repair();
  }

  undo(): void {
    this.history = undo(this.history);
    this.repair();
  }

  redo(): void {
    this.history = redo(this.history);
    this.repair();
  }

  private repair(): void {
    const wire = current(this.history);
    const points = new Set(wire.points.map((point) => point.id));
    const lines = new Set(wire.lines.map((line) => line.id));
    if (this.from && !points.has(this.from)) this.from = null;
    if (this.slope_from && !points.has(this.slope_from)) this.slope_from = null;
    if (this.snap && !points.has(this.snap)) this.snap = null;
    this.select({
      points: this.selection.points.filter((id) => points.has(id)),
      lines: this.selection.lines.filter((id) => lines.has(id)),
    });
  }

  reset(): void {
    this.selection = EMPTY;
    this.from = null;
    this.slope_from = null;
    this.op = null;
    this.clear_length();
  }

  select(selection: Selection): void {
    this.selection = selection;
  }

  clear_selection(): void {
    this.selection = EMPTY;
  }

  press(key: string): void {
    const base = this.typed ? this.input : "";
    this.input = type_key(base, key);
    this.typed = true;
    this.snap = null;
  }

  suggest(text: string, snap: string | null = null): void {
    this.input = text;
    this.typed = false;
    this.snap = snap;
  }

  clear_length(): void {
    this.input = "";
    this.typed = false;
    this.snap = null;
    this.pending = null;
  }
}
