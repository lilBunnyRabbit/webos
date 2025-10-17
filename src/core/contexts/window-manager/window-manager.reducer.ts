import { Flags } from "@/core/lib/flags";
import { v4 as uuid } from "uuid";
import { adjustWindowSize, calculateWindowPosition } from "../../lib/windows";
import {
  WindowFlag,
  WindowManagerFlag,
  type WindowId,
  type WindowInstance,
  type WindowManagerAction,
  type WindowManagerState,
} from "./window-manager.type";
import { ID as PROFILER_ID } from "@/apps/profiler";

export function windowManagerReducer(state: WindowManagerState, action: WindowManagerAction): WindowManagerState {
  // console.log(`Action::${action.type}`, action, state);

  switch (action.type) {
    case "CREATE_WINDOW": {
      const id: WindowId = uuid();

      const size = adjustWindowSize(action.defaults?.size ? action.defaults.size : { width: 600, height: 400 });
      const instance: WindowInstance = {
        id,
        flags: action.defaults?.flags ? action.defaults.flags.clone() : new Flags(),
        createdAt: new Date(),
        snapZone: action.defaults?.snapZone ?? null,
        config: {
          size,
          position: calculateWindowPosition(size, state.order.size),
        },
        app: action.app,
      };

      const flags =
        action.app.id === PROFILER_ID ? new Flags<WindowManager>().add(WindowManagerFlag.PROFILER_ENABLED) : state.flags;

      return {
        ...state,
        flags,
        index: {
          ...state.index,
          [id]: instance,
        },
        order: state.order.add(id).clone(),
      };
    }

    case "DESTROY_WINDOW": {
      const appId = state.index[action.windowId].app.id;

      const index = { ...state.index };
      delete index[action.windowId];

      const flags =
        appId === PROFILER_ID && !Object.values(index).some((value) => value.app.id === PROFILER_ID)
          ? state.flags.remove(WindowManagerFlag.PROFILER_ENABLED)
          : state.flags;

      return {
        ...state,
        flags,
        index,
        order: state.order.remove(action.windowId).clone(),
      };
    }

    case "FOCUS_WINDOW": {
      const window = state.index[action.windowId];
      if (!window) return state;

      // If window is minimized, restore it first
      const newIndex = window.flags.has(WindowFlag.MINIMIZED)
        ? {
            ...state.index,
            [action.windowId]: {
              ...window,
              flags: window.flags.clone().remove(WindowFlag.MINIMIZED),
            },
          }
        : state.index;

      // If already focused, just restore if minimized
      if (state.order.isFocused(action.windowId)) {
        return {
          ...state,
          index: newIndex,
          order: state.order.clone(),
        };
      }

      return {
        ...state,
        index: newIndex,
        order: state.order.toFront(action.windowId).clone(),
      };
    }

    case "TOGGLE_WINDOW": {
      const window = state.index[action.windowId];
      if (!window) return state;

      return {
        ...state,
        index: {
          ...state.index,
          [action.windowId]: {
            ...window,
            flags: window.flags.clone().toggle(WindowFlag.MINIMIZED),
          },
        },
      };
    }

    case "MINIMIZE_ALL_WINDOWS": {
      return {
        ...state,
        index: Object.fromEntries(
          Object.entries(state.index).map(([key, value]) => [
            key,
            { ...value, flags: value.flags.clone().add(WindowFlag.MINIMIZED) },
          ])
        ),
      };
    }

    case "RESTORE_ALL_WINDOWS": {
      return {
        ...state,
        index: Object.fromEntries(
          Object.entries(state.index).map(([key, value]) => [
            key,
            { ...value, flags: value.flags.clone().remove(WindowFlag.MINIMIZED) },
          ])
        ),
      };
    }

    case "TOGGLE_MAXIMIZE_WINDOW": {
      const window = state.index[action.windowId];
      if (!window) return state;

      const flags = window.flags.clone().toggle(WindowFlag.MAXIMIZED);

      return {
        ...state,
        index: {
          ...state.index,
          [action.windowId]: {
            ...window,
            flags,
          },
        },
        order:
          flags.has(WindowFlag.MAXIMIZED) && !state.order.isFocused(action.windowId)
            ? state.order.toFront(action.windowId).clone()
            : state.order,
      };
    }

    case "SET_SNAP_ZONE": {
      const window = state.index[action.windowId];
      if (!window) return state;

      return {
        ...state,
        index: {
          ...state.index,
          [action.windowId]: {
            ...window,
            snapZone: action.snapZone,
          },
        },
      };
    }

    default:
      return state;
  }
}
