import { Flags } from "$lib/core/utils/flags";
import type { Bounds } from "$lib/core/utils/type";
import { v4 as uuid } from "uuid";
import { WindowsHelper } from "./helper";
import type {
  DesktopWindowsService,
  RestoreResult,
  SnapZone,
  WindowId,
  WindowInstance,
  WindowFrames,
  WindowSnapshot,
} from "./type";
import { WindowFlag } from "./type";
import type { AppInstance } from "../apps/type";

export class WindowsService implements DesktopWindowsService {
  name = "WindowsService";
  description = "Window lifecycle, geometry and z-order";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return Object.entries(this.index)
      .map(([id, window]) => `- ${id}: ${window.app.manifest.name}`)
      .join("\n");
  }

  public container = $state.raw<{ bounds: Bounds; element: HTMLElement | null }>({
    bounds: {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    element: null,
  });

  private max_order = $state<number>(0);
  // TODO: map?
  private index = $state<Record<WindowId, WindowInstance>>({});

  public frames = $state.raw<WindowFrames>({});

  public load_frames(frames: WindowFrames): void {
    this.frames = frames;
  }

  /** `bounds` is the normal frame even while maximized or snapped: those are a flag and a zone on top. */
  private record_frames(instances: WindowInstance[]): void {
    if (instances.length === 0) return;
    const frames = { ...this.frames };
    for (const instance of instances.sort((a, b) => a.order - b.order)) frames[instance.app.id] = { ...instance.bounds };
    this.frames = frames;
  }

  private reset_state(): void {
    this.index = {};
    this.max_order = 0;
  }

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

  public set_container(element?: HTMLElement | null): Bounds {
    if (!element) {
      this.container = {
        bounds: {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        },
        element: null,
      };

      // console.log("WindowService:set_container", this.container);

      return this.container.bounds;
    }

    const rect = element.getBoundingClientRect();

    this.container = {
      bounds: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
      element,
    };

    // console.log("WindowService:set_container", this.container);

    // TODO: recalculate bounds for all windows

    return this.container.bounds;
  }

  public close(id: WindowId): boolean {
    if (!this.exists(id)) {
      return false;
    }

    const was_focused = this.is_focused(id);
    this.record_frames([this.index[id]]);

    // Remove window from index
    delete this.index[id];
    this.back_handlers.delete(id);

    // Reset max order if no windows are left
    if (Object.keys(this.index).length === 0) {
      this.max_order = 0;
    } else if (was_focused) {
      this.focus_next();
    }

    return true;
  }

  public close_all(): void {
    this.record_frames(Object.values(this.index));
    this.reset_state();
  }

  public exists(id: WindowId): boolean {
    return this.get(id) !== null;
  }

  public focus(id: WindowId): boolean {
    const instance = this.get(id);
    if (!instance) {
      return false;
    }

    // If already focused, do nothing
    if (instance.order === this.max_order) {
      return false;
    }

    // Increment max order and set new order
    instance.order = ++this.max_order;

    return true;
  }

  public get(id: WindowId): WindowInstance | null {
    return this.index[id] ?? null;
  }

  public get_focused(): WindowId | null {
    return this.list().find((id) => this.is_focused(id)) ?? null;
  }

  public is_focused(id: WindowId): boolean {
    const instance = this.get(id);
    if (!instance) {
      return false;
    }

    return instance.order === this.max_order;
  }

  public list(): WindowId[] {
    return Object.keys(this.index) as WindowId[];
  }

  public sorted_list(
    compare?: (a: [WindowId, WindowInstance], b: [WindowId, WindowInstance]) => number
  ): [WindowId, WindowInstance][] {
    return Object.entries(this.index).sort(compare) as [WindowId, WindowInstance][];
  }

  public open(app: AppInstance): WindowId {
    const id = uuid();

    const options = app.manifest.defaults ?? {};
    const sibling = Object.values(this.index)
      .filter((instance) => instance.app.id === app.id)
      .sort((a, b) => b.order - a.order)[0];

    this.index[id] = {
      id,
      created_at: new Date(),
      order: ++this.max_order,
      flags: new Flags(options.flags ?? []),
      snap_zone: options.snap_zone ?? null,
      constraints: options.constraints ?? {},
      bounds: WindowsHelper.place({
        constraints: options.constraints ?? {},
        container: this.container.bounds,
        sibling: sibling?.bounds ?? null,
        frame: this.frames[app.id] ?? null,
      }),
      app,
    };

    return id;
  }

  public restore(
    windows: WindowSnapshot[],
    create: (snapshot: WindowSnapshot) => AppInstance | null
  ): RestoreResult {
    const result: RestoreResult = { restored: [], skipped: [] };

    for (const snapshot of windows) {
      const app = create(snapshot);
      if (!app) {
        result.skipped.push(snapshot);
        continue;
      }

      const id = uuid();
      const constraints = app.manifest.defaults?.constraints ?? {};
      this.index[id] = {
        id,
        created_at: new Date(),
        order: ++this.max_order,
        flags: new Flags(snapshot.flags),
        snap_zone: snapshot.snap_zone,
        constraints,
        bounds: WindowsHelper.clamp_bounds(snapshot.bounds, this.container.bounds),
        app,
      };
      result.restored.push(id);
    }

    // The top restored window may be minimized; hand focus to the topmost visible one instead.
    this.focus_next();
    return result;
  }

  public snap(id: WindowId, zone: SnapZone | null): boolean {
    const instance = this.get(id);
    if (!instance) {
      return false;
    }

    instance.snap_zone = zone;
    return true;
  }

  public toggle_maximize(id: WindowId): boolean {
    const instance = this.get(id);
    if (!instance) {
      return false;
    }

    const is_maximized = instance.flags.has(WindowFlag.MAXIMIZED);
    if (is_maximized) {
      instance.flags.delete(WindowFlag.MAXIMIZED);
    } else {
      instance.flags.add(WindowFlag.MAXIMIZED);
      this.focus(id);
    }

    return !is_maximized;
  }

  public toggle_minimize(id: WindowId): boolean {
    const instance = this.get(id);
    if (!instance) {
      return false;
    }

    const is_minimized = instance.flags.has(WindowFlag.MINIMIZED);

    if (is_minimized) {
      instance.flags.delete(WindowFlag.MINIMIZED);
      this.focus(id);
    } else {
      const was_focused = this.is_focused(id);
      instance.flags.add(WindowFlag.MINIMIZED);
      if (was_focused) this.focus_next();
    }

    return !is_minimized;
  }

  /** Hands focus to the topmost visible window, or to none when every window is minimized. */
  private focus_next(): void {
    const next = Object.values(this.index)
      .filter((instance) => !instance.flags.has(WindowFlag.MINIMIZED))
      .sort((a, b) => b.order - a.order)[0];

    if (next) {
      this.focus(next.id);
    } else {
      // No instance holds the new max order, so nothing reads as focused.
      this.max_order++;
    }
  }
}
