import kernel, { type AppsService, type DesktopItem as Item, type GridDesktopService } from "$lib/core/api";
import { has_drag_app, is_quick_launch_drag, read_drag_app } from "../apps/drag";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { item_span, snap_cells, type ResizeTarget } from "$lib/core/api/services/desktop/helper";
import type { WidgetSize } from "$lib/core/api/services/apps/type";
import { click_select, intersects, rect_from_points, same_members, type Rect } from "$lib/core/utils/selection";
import type { Position } from "$lib/core/utils/type";
import type { Attachment } from "svelte/attachments";
import {
  drop_paths,
  has_drag_paths,
  has_os_files,
  import_dropped,
  read_drag_paths,
  read_os_entries,
  set_drag_paths,
} from "../files/drag";
import { desktop_path } from "./desktop-actions";

type Widget = Extract<Item, { kind: "widget" }>;

interface Cell {
  item: Item;
  x: number;
  y: number;
}

interface Marquee {
  pointer: number;
  start: Position;
  current: Position;
  base: Set<string>;
}

interface Resizing {
  name: string;
  pointer: number;
  start: Position;
  from: WidgetSize;
  target: ResizeTarget;
}

const is_mod = (event: MouseEvent | KeyboardEvent) => event.ctrlKey || event.metaKey;

export class DesktopHandler {
  private desktop = $derived(kernel.service<GridDesktopService>("desktop"));

  private chosen = $state.raw<Set<string>>(new Set());
  private anchor = $state<string | null>(null);
  private readonly order: string[];
  public readonly cell_of: Map<string, Position>;
  /** Selection is this surface's own UI state (ADR-011 revision). Entries deleted or renamed elsewhere drop out. */
  public readonly selection: Set<string>;
  public readonly selected_items: Item[];

  public marquee = $state<Marquee | null>(null);
  public readonly marquee_rect: Rect | null;

  public resizing = $state<Resizing | null>(null);
  // A refused keyboard resize flashes its outline, so Shift+arrow against a neighbour isn't silent.
  private refused = $state<{ name: string; target: ResizeTarget } | null>(null);
  private refused_timer: ReturnType<typeof setTimeout> | undefined;
  public readonly resize_preview: { name: string; target: ResizeTarget } | null;

  // `drag` is only set for drags that started here; drags from Explorer windows carry their paths in the data transfer.
  public drag = $state<{ names: string[]; grab: Position } | null>(null);
  public hover = $state<{ cell: Position; folder: string | null } | null>(null);
  public readonly drag_targets: { x: number; y: number; w: number; h: number }[];

  constructor(private readonly cells: () => Cell[]) {
    this.order = $derived(cells().map(({ item }) => item.name));
    this.cell_of = $derived(new Map(cells().map(({ item, x, y }) => [item.name, { x, y }])));
    this.selection = $derived(new Set(this.order.filter((name) => this.chosen.has(name))));
    this.selected_items = $derived(
      cells()
        .filter(({ item }) => this.selection.has(item.name))
        .map(({ item }) => item)
    );
    this.marquee_rect = $derived(this.marquee && rect_from_points(this.marquee.start, this.marquee.current));
    this.resize_preview = $derived(this.resizing ?? this.refused);
    this.drag_targets = $derived.by(() => {
      if (!this.drag || !this.hover || this.hover.folder) return [];
      const { grab } = this.drag;
      const { cell } = this.hover;
      return this.drag.names.flatMap((name) => {
        const from = this.cell_of.get(name);
        const item = cells().find((entry) => entry.item.name === name)?.item;
        return from && item ? [{ x: from.x - grab.x + cell.x, y: from.y - grab.y + cell.y, ...item_span(item) }] : [];
      });
    });
  }

  public select(name: string, event: MouseEvent): void {
    ({ selection: this.chosen, anchor: this.anchor } = click_select(
      { selection: this.selection, anchor: this.anchor },
      name,
      { toggle: is_mod(event), range: event.shiftKey },
      this.order
    ));
  }

  public select_all(): void {
    this.chosen = new Set(this.order);
  }

  public clear(): void {
    this.chosen = new Set();
  }

  public ensure_selected(item: Item): void {
    if (this.selection.has(item.name)) return;
    this.chosen = new Set([item.name]);
    this.anchor = item.name;
  }

  /** What an action on `item` applies to: the whole selection when it's in it, else just it. */
  public targets(item: Item): Item[] {
    return this.selection.has(item.name) ? this.selected_items : [item];
  }

  private cell_rect(x: number, y: number, span = { w: 1, h: 1 }): Rect {
    const { bounds, cell } = this.desktop.container;
    const left = bounds.x + x * cell.width;
    const top = bounds.y + y * cell.height;
    return { left, top, right: left + cell.width * span.w, bottom: top + cell.height * span.h };
  }

  private cell_at(client_x: number, client_y: number): Position {
    const { bounds, cell, grid } = this.desktop.container;
    return {
      x: Math.max(0, Math.min(grid.columns - 1, Math.floor((client_x - bounds.x) / cell.width))),
      y: Math.max(0, Math.min(grid.rows - 1, Math.floor((client_y - bounds.y) / cell.height))),
    };
  }

  /** Marquee on empty desktop and widget resize. Hit-testing is cell math, no DOM reads, once per frame. */
  public pointer_attachment(): Attachment<HTMLElement> {
    return (surface) => {
      let frame = 0;
      let pending: PointerEvent | null = null;

      const apply = () => {
        frame = 0;
        const event = pending;
        pending = null;
        if (!event) return;
        if (this.resizing && event.pointerId === this.resizing.pointer) {
          const { cell } = this.desktop.container;
          const size = {
            w: this.resizing.from.w + snap_cells(event.clientX - this.resizing.start.x, cell.width),
            h: this.resizing.from.h + snap_cells(event.clientY - this.resizing.start.y, cell.height),
          };
          this.resizing.target = this.desktop.resize_target(this.resizing.name, size) ?? this.resizing.target;
          return;
        }
        if (!this.marquee || event.pointerId !== this.marquee.pointer) return;
        this.marquee.current = { x: event.clientX, y: event.clientY };
        const rect = rect_from_points(this.marquee.start, this.marquee.current);
        const hits = this.cells()
          .filter(({ item, x, y }) => intersects(this.cell_rect(x, y, item_span(item)), rect))
          .map(({ item }) => item.name);
        const next = new Set([...this.marquee.base, ...hits]);
        if (!same_members(next, this.chosen)) this.chosen = next;
      };

      const on_down = (event: PointerEvent) => {
        if (event.button !== 0 || (event.target as Element).closest("button, [data-widget-body]")) return;
        surface.focus({ preventScroll: true });
        const base = is_mod(event) ? this.selection : new Set<string>();
        if (!is_mod(event)) this.chosen = new Set();
        const point = { x: event.clientX, y: event.clientY };
        this.marquee = { pointer: event.pointerId, start: point, current: point, base };
        surface.setPointerCapture(event.pointerId);
      };

      const on_move = (event: PointerEvent) => {
        if (event.pointerId !== (this.resizing ?? this.marquee)?.pointer) return;
        pending = event;
        if (!frame) frame = requestAnimationFrame(apply);
      };

      const on_end = (event: PointerEvent) => {
        cancelAnimationFrame(frame);
        apply();
        this.marquee = null;
        this.finish_resize(event);
      };

      // A text selection left by the drag would swallow the next click's focus.
      const on_select_start = (event: Event) => {
        if (this.marquee) event.preventDefault();
      };

      surface.addEventListener("pointerdown", on_down);
      surface.addEventListener("pointermove", on_move);
      surface.addEventListener("lostpointercapture", on_end);
      surface.addEventListener("selectstart", on_select_start);
      return () => {
        cancelAnimationFrame(frame);
        surface.removeEventListener("pointerdown", on_down);
        surface.removeEventListener("pointermove", on_move);
        surface.removeEventListener("lostpointercapture", on_end);
        surface.removeEventListener("selectstart", on_select_start);
      };
    };
  }

  public resize_start(event: PointerEvent, item: Widget, surface: HTMLElement | null): void {
    if (event.button !== 0) return;
    const target = this.desktop.resize_target(item.name, item.size);
    if (!target) return;
    event.preventDefault();
    surface?.focus({ preventScroll: true });
    this.chosen = new Set([item.name]);
    this.anchor = item.name;
    this.resizing = {
      name: item.name,
      pointer: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      from: item.size,
      target,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  private finish_resize(event: PointerEvent): void {
    if (!this.resizing || event.pointerId !== this.resizing.pointer) return;
    const { name, from, target } = this.resizing;
    this.resizing = null;
    if (target.valid && (target.size.w !== from.w || target.size.h !== from.h))
      void this.desktop.resize_widget(name, target.size);
  }

  public cancel_resize(): void {
    this.resizing = null;
  }

  public resize_by(item: Widget, dw: number, dh: number): boolean {
    const target = this.desktop.resize_target(item.name, { w: item.size.w + dw, h: item.size.h + dh });
    if (!target) return false;
    if (target.valid) {
      if (target.size.w !== item.size.w || target.size.h !== item.size.h)
        void this.desktop.resize_widget(item.name, target.size);
      return true;
    }
    clearTimeout(this.refused_timer);
    this.refused = { name: item.name, target };
    this.refused_timer = setTimeout(() => (this.refused = null), 600);
    return true;
  }

  public drag_start(event: DragEvent, item: Item): void {
    this.ensure_selected(item);
    const items = this.targets(item);
    set_drag_paths(event, items.map(desktop_path));
    this.drag = { names: items.map(({ name }) => name), grab: this.cell_of.get(item.name) ?? { x: 0, y: 0 } };
  }

  public drag_end(): void {
    this.drag = null;
    this.hover = null;
  }

  /** A folder under the pointer that isn't part of the drag. */
  private folder_under(event: DragEvent): string | null {
    const name = (event.target as Element).closest<HTMLElement>("[data-desktop-name]")?.dataset.desktopName;
    if (!name || this.drag?.names.includes(name)) return null;
    return this.cells().find(({ item }) => item.name === name)?.item.kind === "directory" ? name : null;
  }

  public drop_attachment(): Attachment<HTMLElement> {
    return (surface) => {
      const on_over = (event: DragEvent) => {
        const os = !this.drag && !has_drag_paths(event) && has_os_files(event);
        const app = !this.drag && has_drag_app(event) && !is_quick_launch_drag(event);
        if (!this.drag && !has_drag_paths(event) && !os && !app) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = os || app ? "copy" : "move";
        this.hover = { cell: this.cell_at(event.clientX, event.clientY), folder: app ? null : this.folder_under(event) };
      };

      const on_leave = (event: DragEvent) => {
        if (!surface.contains(event.relatedTarget as Node | null)) this.hover = null;
      };

      surface.addEventListener("dragover", on_over);
      surface.addEventListener("dragleave", on_leave);
      surface.addEventListener("drop", this.on_drop);
      return () => {
        surface.removeEventListener("dragover", on_over);
        surface.removeEventListener("dragleave", on_leave);
        surface.removeEventListener("drop", this.on_drop);
      };
    };
  }

  private on_drop = async (event: DragEvent) => {
    event.preventDefault();
    const local = this.drag;
    const folder = this.folder_under(event);
    const cell = this.cell_at(event.clientX, event.clientY);
    this.hover = null;
    this.drag = null;

    // An app from the start menu or the App Library: pinned where it was dropped (ADR-042).
    const app = !local && has_drag_app(event) && !is_quick_launch_drag(event) ? read_drag_app(event) : null;
    if (app) {
      kernel.service<AppsService>("apps").install(app);
      const name = await this.desktop.pin(app);
      if (name) this.desktop.move_items([{ name, to: cell }]);
      return;
    }

    // Real files from the OS: imported, not moved (ADR-005 revision).
    if (!local && !has_drag_paths(event) && has_os_files(event)) {
      const imported = await import_dropped(
        read_os_entries(event),
        folder ? `${PATHS.desktop}/${folder}` : PATHS.desktop
      );
      if (!folder)
        this.desktop.move_items(imported.map((path) => ({ name: path.slice(path.lastIndexOf("/") + 1), to: cell })));
      return;
    }

    if (folder) {
      const paths = local ? local.names.map((name) => `${PATHS.desktop}/${name}`) : read_drag_paths(event);
      await drop_paths(paths, `${PATHS.desktop}/${folder}`);
      return;
    }

    if (local) {
      this.desktop.move_items(
        local.names.flatMap((name) => {
          const from = this.cell_of.get(name);
          return from ? [{ name, to: { x: from.x - local.grab.x + cell.x, y: from.y - local.grab.y + cell.y } }] : [];
        })
      );
      return;
    }

    // From an Explorer window: into /home/Desktop, then onto the cell it was dropped on.
    const moved = await drop_paths(read_drag_paths(event), PATHS.desktop);
    this.desktop.move_items(moved.map((path) => ({ name: path.slice(path.lastIndexOf("/") + 1), to: cell })));
  };
}
