import { WindowFlag, type WindowId, type WindowInstance } from "./type";
import { CloseGuard, type ClosePrompt, type DirtyOptions } from "./close-guard";

export abstract class BaseWindowsService {
  protected index = $state<Record<WindowId, WindowInstance>>({});

  /** Plain, not reactive: only read when Back is pressed. */
  protected readonly back_handlers = new Map<WindowId, Array<() => boolean>>();
  protected readonly guard = new CloseGuard();

  public page_hidden = $state(document.hidden);

  abstract get(id: WindowId): WindowInstance | null;
  abstract focus(id: WindowId): boolean;
  protected abstract bring_forward(id: WindowId): void;

  protected can_immerse(_id: WindowId): boolean {
    return true;
  }

  /** The page was in fullscreen at the last `fullscreenchange`, so leaving it is the browser leaving ours. */
  private page_fullscreen = false;
  private stop_fullscreen_sync: (() => void) | null = null;

  public set_immersive(id: WindowId, on: boolean): boolean {
    const instance = this.get(id);
    if (!instance) return false;
    if (on && !this.can_immerse(id)) return instance.flags.has(WindowFlag.IMMERSIVE);
    if (on) {
      instance.flags.add(WindowFlag.IMMERSIVE);
      this.bring_forward(id);
      request_page_fullscreen();
    } else {
      instance.flags.delete(WindowFlag.IMMERSIVE);
    }
    return on;
  }

  protected any_immersive(): boolean {
    return Object.values(this.index).some((instance) => instance.flags.has(WindowFlag.IMMERSIVE));
  }

  private leave_all_immersive(): void {
    for (const instance of Object.values(this.index)) instance.flags.delete(WindowFlag.IMMERSIVE);
  }

  private on_fullscreen_change = () => {
    const now = document.fullscreenElement === document.documentElement;
    if (this.page_fullscreen && !now) this.leave_all_immersive();
    // A request that lands after its window already left immersive (or closed) has nothing left to show.
    else if (now && !this.any_immersive()) exit_page_fullscreen();
    this.page_fullscreen = now;
  };

  public toggle_guide(id: WindowId): boolean {
    const instance = this.get(id);
    if (!instance) return false;
    instance.flags.toggle(WindowFlag.GUIDE);
    const shown = instance.flags.has(WindowFlag.GUIDE);
    if (shown) this.focus(id);
    return shown;
  }

  public add_back_handler(id: WindowId, handler: () => boolean): () => void {
    const handlers = this.back_handlers.get(id) ?? [];
    handlers.push(handler);
    this.back_handlers.set(id, handlers);
    return () => {
      const current = this.back_handlers.get(id);
      if (!current) return;
      const index = current.lastIndexOf(handler);
      if (index !== -1) current.splice(index, 1);
      if (current.length === 0) this.back_handlers.delete(id);
    };
  }

  /** The guide sits above the app, so it closes first; then immersive, before any of the app's own handlers run. */
  public back(id: WindowId): boolean {
    if (this.get(id)?.flags.has(WindowFlag.GUIDE)) return (this.toggle_guide(id), true);
    if (this.get(id)?.flags.has(WindowFlag.IMMERSIVE)) return (this.set_immersive(id, false), true);
    const handlers = [...(this.back_handlers.get(id) ?? [])].reverse();
    return handlers.some((handler) => handler());
  }

  public set_close_prompt(prompt: ClosePrompt): () => void {
    return this.guard.set_prompt(prompt);
  }

  public set_title(id: WindowId, title: string | null): void {
    const instance = this.get(id);
    if (instance) instance.title = title ?? undefined;
  }

  public set_dirty(id: WindowId, dirty: boolean, options: DirtyOptions = {}): void {
    const instance = this.get(id);
    if (!instance) return;
    if (instance.dirty !== dirty) instance.dirty = dirty;
    this.guard.set_save(id, dirty ? options.save : undefined);
  }

  public has_dirty(): boolean {
    return Object.values(this.index).some((instance) => instance.dirty);
  }

  /** The browser's own "Leave site?" prompt; it can't show ours while unloading (ADR-029). */
  private on_before_unload = (event: BeforeUnloadEvent) => {
    if (this.has_dirty()) event.preventDefault();
  };

  private on_visibility_change = () => {
    this.page_hidden = document.hidden;
  };

  init(): void {
    window.addEventListener("beforeunload", this.on_before_unload);
    document.addEventListener("visibilitychange", this.on_visibility_change);
    document.addEventListener("fullscreenchange", this.on_fullscreen_change);
    // Leaving immersive, or closing the last immersive window, hands the browser's bars back.
    this.stop_fullscreen_sync = $effect.root(() => {
      $effect(() => {
        if (!this.any_immersive()) exit_page_fullscreen();
      });
    });
  }

  destroy(): void {
    window.removeEventListener("beforeunload", this.on_before_unload);
    document.removeEventListener("visibilitychange", this.on_visibility_change);
    document.removeEventListener("fullscreenchange", this.on_fullscreen_change);
    this.stop_fullscreen_sync?.();
    this.stop_fullscreen_sync = null;
  }
}

/** The whole page, so dialogs, menus and toasts still show. Missing (iPhone) or refused (no gesture): only our bars hide. */
function request_page_fullscreen(): void {
  if (!document.fullscreenEnabled || document.fullscreenElement) return;
  document.documentElement.requestFullscreen().catch(() => {});
}

function exit_page_fullscreen(): void {
  if (document.fullscreenElement === document.documentElement) document.exitFullscreen().catch(() => {});
}
