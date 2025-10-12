import { Flags } from "@/lib/flags";
import { v4 as uuid } from "uuid";
import { calculateWindowPosition } from "./windows.helpers";
import { WindowFlag, type WindowId, type WindowInstance, type WindowsAction, type WindowsState } from "./windows.type";

export function windowsReducer(state: WindowsState, action: WindowsAction): WindowsState {
  // console.log(`Action::${action.type}`, action, state);

  switch (action.type) {
    case "CREATE_WINDOW": {
      const id: WindowId = uuid();

      const size = action.defaults?.size ? action.defaults.size : { width: 600, height: 400 };
      const instance: WindowInstance = {
        id,
        flags: action.defaults?.flags ? action.defaults.flags.clone() : new Flags(),
        createdAt: new Date(),
        config: {
          size,
          position: calculateWindowPosition(size, state.instances.length),
        },
        app: action.app,
      };

      return {
        ...state,
        index: {
          ...state.index,
          [id]: instance,
        },
        instances: [...state.instances, id],
      };
    }

    case "DESTROY_WINDOW": {
      const index = { ...state.index };
      delete index[action.windowId];

      return {
        ...state,
        index,
        instances: state.instances.filter((instance) => instance !== action.windowId),
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
      if (state.instances[state.instances.length - 1] === action.windowId) {
        return {
          index: newIndex,
          instances: state.instances,
        };
      }

      const newInstances = state.instances.filter((instance) => instance !== action.windowId);
      newInstances.push(action.windowId);

      return {
        ...state,
        index: newIndex,
        instances: newInstances,
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

    case "TOGGLE_MAXIMIZE_WINDOW": {
      const window = state.index[action.windowId];
      if (!window) return state;

      return {
        ...state,
        index: {
          ...state.index,
          [action.windowId]: {
            ...window,
            flags: window.flags.clone().toggle(WindowFlag.MAXIMIZED),
          },
        },
      };
    }

    default:
      return state;
  }
}
