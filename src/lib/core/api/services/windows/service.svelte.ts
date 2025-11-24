import type { IService } from "../../api.type";
import type { WindowConstraints, WindowId, WindowInstance, WindowOpenOptions } from "./type";
import { v4 as uuid } from "uuid";
import { Flags } from "$lib/core/utils/flags";
import { WindowsHelper } from "./helper";

export class WindowsService implements IService {
  name = "WindowsService";
  description = "WindowsService";

  private max_order = $state<number>(0);
  // TODO: map?
  private index = $state<Record<WindowId, WindowInstance>>({});

  private reset_state(): void {
    this.index = {};
    this.max_order = 0;
  }

  public list(): WindowId[] {
    return Object.keys(this.index) as WindowId[];
  }

  public open(options: WindowOpenOptions): WindowId {
    const id = uuid();

    // TODO: implement
    const constraints: WindowConstraints = {};

    this.index[id] = {
      id,
      created_at: new Date(),
      order: ++this.max_order,
      flags: new Flags(),
      snapZone: null,
      constraints,
      bounds: WindowsHelper.calculateBounds(constraints),
    };

    return id;
  }

  public destroy(id: WindowId): void {
    // Remove window from index
    delete this.index[id];

    // Reset max order if no windows are left
    if (Object.keys(this.index).length === 0) {
      this.max_order = 0;
    }
  }

  public destroy_all(): void {
    this.reset_state();
  }

  public focus(id: WindowId): boolean {
    const instance = this.index[id];
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
}
