import { Flags } from "$lib/core/utils/flags";
import type { Bounds } from "$lib/core/utils/type";
import { v4 as uuid } from "uuid";
import type { AppInstance } from "../apps/type";
import type {
  MobileWindowsService as IMobileWindowsService,
  RestoreResult,
  WindowId,
  WindowFrames,
  WindowInstance,
  WindowSnapshot,
} from "./type";
import { BaseWindowsService } from "./base.svelte";
import { WindowFlag } from "./type";
import { windows_shell } from "./shell";

/** Flags that mean nothing on mobile: every window is fullscreen, and background windows are simply not focused. */
const IGNORED_FLAGS: WindowFlag[] = [WindowFlag.MINIMIZED, WindowFlag.MAXIMIZED];

export class MobileWindowsService extends BaseWindowsService implements IMobileWindowsService {
  name = "MobileWindowsService";
  description = "Fullscreen apps, one on screen at a time, the rest running in the background";
  inspector = () => import("./mobile-inspector.svelte");
  shell = () => windows_shell(this);

  to_string(): string {
    return Object.entries(this.index)
      .map(([id, window]) => `- ${id}: ${window.app.manifest.name}${this.is_focused(id) ? " (on screen)" : ""}`)
      .join("\n");
  }

  public container = $state.raw<{ element: HTMLElement | null }>({ element: null });

  /** Held, never recorded: mobile windows have no frame of their own, and the desktop's must survive a phone visit. */
  public frames = $state.raw<WindowFrames>({});

  public load_frames(frames: WindowFrames): void {
    this.frames = frames;
  }

  /** Same focus model as desktop: the window holding `max_order` is focused. Bumping it without a holder means home. */
  private max_order = $state<number>(0);

  public is_visible(id: WindowId): boolean {
    return !this.page_hidden && this.is_focused(id);
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

  // A clean window closes synchronously; only a dirty one waits for the user.
  public close(id: WindowId): Promise<boolean> {
    const instance = this.get(id);
    if (!instance) return Promise.resolve(false);
    if (!instance.dirty) return Promise.resolve(this.force_close(id));
    return this.guard.allow(instance, () => this.focus(id)).then((allowed) => allowed && this.force_close(id));
  }

  public force_close(id: WindowId): boolean {
    if (!this.exists(id)) return false;

    const was_focused = this.is_focused(id);
    delete this.index[id];
    this.back_handlers.delete(id);
    this.guard.forget(id);

    if (Object.keys(this.index).length === 0) this.max_order = 0;
    // Closing the app on screen goes home, not into another app the user didn't ask for.
    else if (was_focused) this.go_home();

    return true;
  }

  public async close_all(): Promise<boolean> {
    const instances = Object.values(this.index);
    if (instances.every((instance) => !instance.dirty)) {
      this.index = {};
      this.max_order = 0;
      this.guard.clear();
      return true;
    }
    for (const instance of instances.filter((item) => !item.dirty)) this.force_close(instance.id);
    for (const instance of instances.filter((item) => item.dirty).sort((a, b) => b.order - a.order)) {
      if (!(await this.close(instance.id))) return false;
    }
    return true;
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
