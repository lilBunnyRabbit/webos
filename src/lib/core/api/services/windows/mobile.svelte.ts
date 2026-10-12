import { Flags } from "$lib/core/utils/flags";
import type { Bounds } from "$lib/core/utils/type";
import { v4 as uuid } from "uuid";
import type { AppInstance } from "../apps/type";
import type {
  MobileWindowsService as IMobileWindowsService,
  RestoreResult,
  WindowId,
  WindowInstance,
  WindowSnapshot,
} from "./type";
import { WindowFlag } from "./type";

/** Flags that mean nothing on mobile: every window is fullscreen, and background windows are simply not focused. */
const IGNORED_FLAGS: WindowFlag[] = [WindowFlag.MINIMIZED, WindowFlag.MAXIMIZED];

export class MobileWindowsService implements IMobileWindowsService {
  name = "MobileWindowsService";
  description = "Fullscreen apps, one on screen at a time, the rest running in the background";
  inspector = () => import("./mobile-inspector.svelte");

  to_string(): string {
    return Object.entries(this.index)
      .map(([id, window]) => `- ${id}: ${window.app.manifest.name}${this.is_focused(id) ? " (on screen)" : ""}`)
      .join("\n");
  }

  public container = $state.raw<{ element: HTMLElement | null }>({ element: null });

  /** Same focus model as desktop: the window holding `max_order` is focused. Bumping it without a holder means home. */
  private max_order = $state<number>(0);
  private index = $state<Record<WindowId, WindowInstance>>({});

  /** Plain, not reactive: only read when Back is pressed. */
  private back_handlers = new Map<WindowId, Array<() => boolean>>();

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

  public back(id: WindowId): boolean {
    const handlers = [...(this.back_handlers.get(id) ?? [])].reverse();
    return handlers.some((handler) => handler());
  }

  public set_container(element?: HTMLElement | null): void {
    this.container = { element: element ?? null };
  }

  /** Recorded so a session saved on mobile restores sensibly on desktop; nothing on mobile reads it. */
  private full_bounds(): Bounds {
    const rect = this.container.element?.getBoundingClientRect();
    return { x: 0, y: 0, width: rect?.width ?? window.innerWidth, height: rect?.height ?? window.innerHeight };
  }

  private insert(app: AppInstance, flags: Iterable<WindowFlag>): WindowId {
    const id = uuid();
    this.index[id] = {
      id,
      created_at: new Date(),
      order: ++this.max_order,
      flags: new Flags([...flags].filter((flag) => !IGNORED_FLAGS.includes(flag))),
      snap_zone: null,
      constraints: {},
      bounds: this.full_bounds(),
      app,
    };
    return id;
  }

  public open(app: AppInstance): WindowId {
    return this.insert(app, app.manifest.defaults?.flags ?? []);
  }

  public restore(windows: WindowSnapshot[], create: (snapshot: WindowSnapshot) => AppInstance | null): RestoreResult {
    const result: RestoreResult = { restored: [], skipped: [] };

    for (const snapshot of windows) {
      const app = create(snapshot);
      if (!app) {
        result.skipped.push(snapshot);
        continue;
      }
      result.restored.push(this.insert(app, snapshot.flags));
    }

    // Like a phone after a restart: the apps are in the switcher, the home screen is on top.
    this.go_home();
    return result;
  }

  public close(id: WindowId): boolean {
    if (!this.exists(id)) return false;

    const was_focused = this.is_focused(id);
    delete this.index[id];
    this.back_handlers.delete(id);

    if (Object.keys(this.index).length === 0) this.max_order = 0;
    // Closing the app on screen goes home, not into another app the user didn't ask for.
    else if (was_focused) this.go_home();

    return true;
  }

  public close_all(): void {
    this.index = {};
    this.max_order = 0;
  }

  public exists(id: WindowId): boolean {
    return this.get(id) !== null;
  }

  public focus(id: WindowId): boolean {
    const instance = this.get(id);
    if (!instance || instance.order === this.max_order) return false;
    instance.order = ++this.max_order;
    return true;
  }

  public go_home(): void {
    if (this.get_focused() !== null) this.max_order++;
  }

  public get(id: WindowId): WindowInstance | null {
    return this.index[id] ?? null;
  }

  public get_focused(): WindowId | null {
    return this.list().find((id) => this.is_focused(id)) ?? null;
  }

  public is_focused(id: WindowId): boolean {
    return this.get(id)?.order === this.max_order;
  }

  public list(): WindowId[] {
    return Object.keys(this.index);
  }

  public sorted_list(
    compare?: (a: [WindowId, WindowInstance], b: [WindowId, WindowInstance]) => number
  ): [WindowId, WindowInstance][] {
    return Object.entries(this.index).sort(compare);
  }

  public recent(): WindowId[] {
    return this.sorted_list(([, a], [, b]) => b.order - a.order).map(([id]) => id);
  }

  public toggle_maximize(): boolean {
    return false;
  }

  /** Minimizing the app on screen sends it home; "restoring" a background app brings it on screen. */
  public toggle_minimize(id: WindowId): boolean {
    if (!this.exists(id)) return false;
    if (this.is_focused(id)) {
      this.go_home();
      return true;
    }
    this.focus(id);
    return false;
  }
}
