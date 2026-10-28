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

  /** The guide sits above the app, so it closes before any of the app's own handlers run. */
  public back(id: WindowId): boolean {
    if (this.get(id)?.flags.has(WindowFlag.GUIDE)) return (this.toggle_guide(id), true);
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
  }

  destroy(): void {
    window.removeEventListener("beforeunload", this.on_before_unload);
    document.removeEventListener("visibilitychange", this.on_visibility_change);
  }
}
