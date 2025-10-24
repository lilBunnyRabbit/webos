import { adjustWindowSize, calculateWindowPosition } from "$lib/core/utils/window";
import { v4 as uuid } from "uuid";
import type { WindowId, WindowInstance } from "./window-manager.type";
import { Flags } from "$lib/core/utils/flags";

let _maxOrder = $state(0);
const _index = $state<Record<WindowId, WindowInstance>>({});

export const index = _index;

export function get(id: WindowId) {
  return _index[id];
}

export function create(content: string) {
  const id: WindowId = uuid();

  const size = adjustWindowSize({ width: 600, height: 400 });
  const instance: WindowInstance = {
    id,
    // flags: action.defaults?.flags ? action.defaults.flags.clone() : new Flags(),
    flags: new Flags(),
    createdAt: new Date(),
    // snapZone: action.defaults?.snapZone ?? null,
    bounds: {
      ...size,
      ...calculateWindowPosition(size, Object.keys(_index).length),
    },
    zIndex: ++_maxOrder,
    // app: action.app,
    tmp__content: content,
  };

  _index[id] = instance;
}

export function destroy(id: WindowId) {
  delete _index[id];
  if (Object.keys(_index).length === 0) _maxOrder = 0;
}

export function focus(id: WindowId) {
  const instance = _index[id];
  if (!instance) return;

  instance.zIndex = ++_maxOrder;
}
