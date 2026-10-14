import type { FileSystemItem } from "$lib/core/api/services/files";
import { join_path } from "$lib/core/api/services/files/path";
import { is_system_path } from "$lib/core/api/services/files/hierarchy";
import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
import { click_select, rect_from_points, same_members, type Rect } from "$lib/core/utils/selection";
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
} from "./drag";

interface FileListOptions {
  directory: () => DirectoryHandler;
  items: () => FileSystemItem[];
  multi: () => boolean;
  accepts_paths: () => boolean;
  accepts_files: () => boolean;
}

/** Rows are one fixed height with no gap, so the marquee hit-tests by index; measured once when it starts. */
interface RowGeometry {
  top: number;
  height: number;
  left: number;
  right: number;
}

interface Marquee {
  pointer: number;
  start: Position;
  current: Position;
  base: Set<string>;
  /** The list's viewport rect when the marquee started; the window can't move while the pointer is captured. */
  origin: DOMRect;
  scroll_top: number;
  rows: RowGeometry | null;
}

const mod = (event: KeyboardEvent | MouseEvent) => event.ctrlKey || event.metaKey;

export class FileListHandler {
  private chosen = $state.raw<Set<string>>(new Set());
  private anchor = $state<string | null>(null);
  private readonly order: string[];
  /** Entries deleted, renamed or filtered away drop out. */
  public readonly selection: Set<string>;
  public readonly selected_items: FileSystemItem[];

  public marquee = $state<Marquee | null>(null);
  public readonly marquee_box = $derived.by(() => {
    if (!this.marquee) return null;
    const { start, current, origin, scroll_top } = this.marquee;
    const rect = rect_from_points(start, current);
    return {
      left: rect.left - origin.left,
      top: rect.top - origin.top + scroll_top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    };
  });

  public dragging = $state.raw<Set<string>>(new Set());
  public drop_folder = $state<string | null>(null);

  constructor(private readonly options: FileListOptions) {
    this.order = $derived(options.items().map((item) => item.name));
    this.selection = $derived(new Set(this.order.filter((name) => this.chosen.has(name))));
    this.selected_items = $derived(options.items().filter((item) => this.selection.has(item.name)));
  }

  public clear(): void {
    this.chosen = new Set();
    this.anchor = null;
  }

  public select_all(): void {
    this.chosen = new Set(this.order);
  }

  public select(name: string, event: MouseEvent): void {
    ({ selection: this.chosen, anchor: this.anchor } = click_select(
      { selection: this.selection, anchor: this.anchor },
      name,
      { toggle: mod(event), range: event.shiftKey },
      this.order
    ));
  }

  public ensure_selected(item: FileSystemItem): void {
    if (this.selection.has(item.name)) return;
    this.chosen = new Set([item.name]);
    this.anchor = item.name;
  }

  /** What an action on `item` applies to: the whole selection when it's in it, else just it. */
  public targets(item: FileSystemItem): FileSystemItem[] {
    return this.selection.has(item.name) ? this.selected_items : [item];
  }

  public marquee_attachment(): Attachment<HTMLElement> {
    return (list) => {
      let frame = 0;
      let pending: Position | null = null;

      const apply = () => {
        frame = 0;
        if (!this.marquee || !pending) return;
        this.marquee.current = pending;
        this.marquee.scroll_top = list.scrollTop;
        pending = null;
        const hits = this.hit_test(rect_from_points(this.marquee.start, this.marquee.current), this.marquee);
        const next = new Set([...this.marquee.base, ...hits]);
        if (!same_members(next, this.chosen)) this.chosen = next;
      };

      const on_down = (event: PointerEvent) => {
        if (
          !this.options.multi() ||
          event.button !== 0 ||
          (event.target as Element).closest("[role=row], button, input")
        )
          return;
        const base = mod(event) ? this.selection : new Set<string>();
        if (!mod(event)) this.chosen = new Set();
        const point = { x: event.clientX, y: event.clientY };
        this.marquee = {
          pointer: event.pointerId,
          start: point,
          current: point,
          base,
          origin: list.getBoundingClientRect(),
          scroll_top: list.scrollTop,
          rows: measure_rows(list),
        };
        list.setPointerCapture(event.pointerId);
      };

      const on_move = (event: PointerEvent) => {
        if (!this.marquee || event.pointerId !== this.marquee.pointer) return;
        pending = { x: event.clientX, y: event.clientY };
        if (!frame) frame = requestAnimationFrame(apply);
      };

      const on_end = () => {
        cancelAnimationFrame(frame);
        apply();
        this.marquee = null;
      };

      // A text selection left by the drag would swallow the next click's focus.
      const on_select_start = (event: Event) => {
        if (this.marquee) event.preventDefault();
      };

      list.addEventListener("pointerdown", on_down);
      list.addEventListener("pointermove", on_move);
      list.addEventListener("lostpointercapture", on_end);
      list.addEventListener("selectstart", on_select_start);
      return () => {
        cancelAnimationFrame(frame);
        list.removeEventListener("pointerdown", on_down);
        list.removeEventListener("pointermove", on_move);
        list.removeEventListener("lostpointercapture", on_end);
        list.removeEventListener("selectstart", on_select_start);
      };
    };
  }

  private hit_test(rect: Rect, { origin, scroll_top, rows }: Marquee): string[] {
    if (!rows || rows.height <= 0) return [];
    if (rect.left >= rows.right || rect.right <= rows.left) return [];
    const top = origin.top - scroll_top + rows.top;
    const first = Math.max(0, Math.floor((rect.top - top) / rows.height));
    const last = Math.min(this.order.length - 1, Math.ceil((rect.bottom - top) / rows.height) - 1);
    return first <= last ? this.order.slice(first, last + 1) : [];
  }

  public drag_start(event: DragEvent, item: FileSystemItem): void {
    this.ensure_selected(item);
    const items = this.targets(item);
    const { segments } = this.options.directory();
    set_drag_paths(
      event,
      items.map((entry) => join_path(segments, entry.name))
    );
    this.dragging = new Set(items.map((entry) => entry.name));
  }

  public drag_end(): void {
    this.dragging = new Set();
    this.drop_folder = null;
  }

  public drop_attachment(): Attachment<HTMLElement> {
    return (list) => {
      const on_over = (event: DragEvent) => {
        const kind = this.drop_kind(event);
        if (!kind || !this.drop_target(event)) {
          this.drop_folder = null;
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = kind === "os" ? "copy" : "move";
        this.drop_folder = this.folder_under(event);
      };

      const on_leave = (event: DragEvent) => {
        if (!list.contains(event.relatedTarget as Node | null)) this.drop_folder = null;
      };

      const on_drop = async (event: DragEvent) => {
        const kind = this.drop_kind(event);
        const target = this.drop_target(event);
        if (!kind || !target) return;
        event.preventDefault();
        this.drop_folder = null;
        this.dragging = new Set();
        if (kind === "os") await import_dropped(read_os_entries(event), target);
        else await drop_paths(read_drag_paths(event), target);
      };

      list.addEventListener("dragover", on_over);
      list.addEventListener("dragleave", on_leave);
      list.addEventListener("drop", on_drop);
      return () => {
        list.removeEventListener("dragover", on_over);
        list.removeEventListener("dragleave", on_leave);
        list.removeEventListener("drop", on_drop);
      };
    };
  }

  /** The folder row under the pointer, unless it's being dragged itself. */
  private folder_under(event: DragEvent): string | null {
    const row = (event.target as Element).closest<HTMLElement>("[data-entry-name]");
    const name = row?.dataset.entryName;
    if (!name || row.dataset.entryKind !== "directory" || this.dragging.has(name)) return null;
    return name;
  }

  /** WebOS paths move (desktop pointer only); real files from the OS import, on every platform. */
  private drop_kind(event: DragEvent): "paths" | "os" | null {
    if (has_drag_paths(event)) return this.options.accepts_paths() ? "paths" : null;
    return has_os_files(event) && this.options.accepts_files() ? "os" : null;
  }

  private drop_target(event: DragEvent): string | null {
    const directory = this.options.directory();
    const folder = this.folder_under(event);
    const target = folder ? join_path(directory.segments, folder) : directory.path;
    return is_system_path(target) ? null : target;
  }
}

function measure_rows(list: HTMLElement): RowGeometry | null {
  const rows = list.querySelectorAll<HTMLElement>("[data-entry-name]");
  if (rows.length === 0) return null;
  const origin = list.getBoundingClientRect();
  const first = rows[0].getBoundingClientRect();
  const last = rows[rows.length - 1].getBoundingClientRect();
  return {
    top: first.top - origin.top + list.scrollTop,
    height: rows.length > 1 ? (last.top - first.top) / (rows.length - 1) : first.height,
    left: first.left,
    right: first.right,
  };
}
