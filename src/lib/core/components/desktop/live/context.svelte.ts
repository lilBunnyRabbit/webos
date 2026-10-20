import kernel, { WindowFlag, type DesktopWindowsService, type ExtractService, type GridDesktopService } from "$lib/core/api";
import { dot_cells, tile_cells, type Point, type Rect } from "./geometry";
import type { LiveContext } from "./registry";

/** The Settings thumbnail's dot spacing (`.dots` in `sections/wallpaper.svelte`). */
const PREVIEW_CELL = 14;

const to_dom_rect = ({ x, y, width, height }: Rect) => new DOMRect(x, y, width, height);

export class LiveContextState implements LiveContext {
  public pointer = $state<Point | null>(null);
  public readonly preview: boolean;

  private hidden = $state(false);
  private fullscreen = $state(false);
  private host_rect = $state.raw<Rect>({ x: 0, y: 0, width: 0, height: 0 });

  private windows_service: DesktopWindowsService;
  private desktop: GridDesktopService;
  private extract: ExtractService | null;
  private covered: boolean;
  private grid: DOMRect[];

  constructor(
    preview: boolean,
    private readonly host: () => HTMLElement | null
  ) {
    this.preview = preview;
    this.windows_service = $derived(kernel.service<DesktopWindowsService>("windows"));
    this.desktop = $derived(kernel.service<GridDesktopService>("desktop"));
    this.extract = $derived(kernel.services.has("extract") ? kernel.service<ExtractService>("extract") : null);
    this.covered = $derived(
      this.windows_service.list().some((id) => {
        const flags = this.windows_service.get(id)?.flags;
        return flags?.has(WindowFlag.MAXIMIZED) && !flags.has(WindowFlag.MINIMIZED) && this.extract?.current !== id;
      })
    );
    this.grid = $derived(
      this.preview ? [] : dot_cells(this.desktop.container.bounds, this.desktop.container.cell, this.desktop.container.grid).map(to_dom_rect)
    );
  }

  public get paused(): boolean {
    return this.preview || this.hidden || this.fullscreen || this.covered;
  }

  public get cells(): DOMRect[] {
    if (!this.preview) return this.grid;
    // The size is tracked so a resize redraws; the position is read now, since a moved Settings window doesn't resize.
    const { width, height } = this.host_rect;
    const origin = this.host()?.getBoundingClientRect();
    return origin ? tile_cells({ x: origin.x, y: origin.y, width, height }, PREVIEW_CELL).map(to_dom_rect) : [];
  }

  // Measured, not read from `bounds`: a window being dragged, snapped or maximized is drawn from local state and CSS.
  public get windows(): DOMRect[] {
    const container = this.preview ? null : this.windows_service.container.element;
    if (!container) return [];
    const rects: DOMRect[] = [];
    for (const id of this.windows_service.list()) {
      const instance = this.windows_service.get(id);
      if (!instance || instance.flags.has(WindowFlag.MINIMIZED) || this.extract?.current === id) continue;
      const element = container.querySelector(`[data-window-id="${CSS.escape(id)}"]`);
      const rect = element?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) rects.push(rect);
    }
    return rects;
  }

  /** Starts the listeners; returns their cleanup. A preview only tracks its host's size. */
  public attach(): () => void {
    const host = this.host();
    if (this.preview) {
      if (!host) return () => {};
      const observer = new ResizeObserver(() => {
        const { x, y, width, height } = host.getBoundingClientRect();
        this.host_rect = { x, y, width, height };
      });
      observer.observe(host);
      return () => observer.disconnect();
    }

    const on_move = (event: PointerEvent) => (this.pointer = { x: event.clientX, y: event.clientY });
    const on_leave = () => (this.pointer = null);
    const on_visibility = () => (this.hidden = document.hidden);
    const on_fullscreen = () => (this.fullscreen = document.fullscreenElement !== null);
    on_visibility();
    on_fullscreen();
    window.addEventListener("pointermove", on_move, { passive: true });
    document.documentElement.addEventListener("pointerleave", on_leave);
    document.addEventListener("visibilitychange", on_visibility);
    document.addEventListener("fullscreenchange", on_fullscreen);
    return () => {
      window.removeEventListener("pointermove", on_move);
      document.documentElement.removeEventListener("pointerleave", on_leave);
      document.removeEventListener("visibilitychange", on_visibility);
      document.removeEventListener("fullscreenchange", on_fullscreen);
    };
  }
}
