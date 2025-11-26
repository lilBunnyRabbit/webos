import { Flags } from "$lib/core/utils/flags";
import type { Bounds } from "$lib/core/utils/type";
import { v4 as uuid } from "uuid";
import { WindowsHelper } from "./helper";
import type { WindowsService as IWindowsService, SnapZone, WindowId, WindowInstance, WindowOpenOptions } from "./type";
import { WindowFlag } from "./type";

export class WindowsService implements IWindowsService {
  name = "WindowsService";
  description = "WindowsService";

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

  private reset_state(): void {
    this.index = {};
    this.max_order = 0;
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

    return this.container.bounds;
  }

  public destroy(id: WindowId): boolean {
    if (!this.exists(id)) {
      return false;
    }

    // Remove window from index
    delete this.index[id];

    // Reset max order if no windows are left
    if (Object.keys(this.index).length === 0) {
      this.max_order = 0;
    }

    return true;
  }

  public destroy_all(): void {
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

  public open(options: WindowOpenOptions): WindowId {
    const id = uuid();

    this.index[id] = {
      id,
      created_at: new Date(),
      order: ++this.max_order,
      flags: new Flags(),
      snap_zone: null,
      constraints: options.constraints ?? {},
      bounds: WindowsHelper.legacy_calculate_bounds(
        options.constraints ?? {},
        this.container.bounds,
        Object.keys(this.index).length
      ),
      app: options.app,
    };

    return id;
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
      instance.flags.add(WindowFlag.MINIMIZED);
    }

    return !is_minimized;
  }
}
