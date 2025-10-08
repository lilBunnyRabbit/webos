import Apps from "@/apps";
import React from "react";
import { v4 as uuidv4 } from "uuid";
import type { WindowsAction, WindowsState } from "./windows.type";

export function windowsReducer(state: WindowsState, action: WindowsAction) {
  console.log(`Action::${action.type}`, action, state);

  switch (action.type) {
    case "CREATE_WINDOW": {
      const id = uuidv4();

      return {
        ...state,
        index: {
          ...state.index,
          [id]: {
            id,
            appId: action.appId,
            isMinimized: false,
            isMaximized: false,
            createdAt: new Date(),
            app: React.createElement(Apps[action.appId].App, {
              key: `${action.appId}-${id}`,
            }),
          },
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
      const newIndex = window.isMinimized
        ? {
            ...state.index,
            [action.windowId]: {
              ...window,
              isMinimized: false,
              isMaximized: false,
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
            isMinimized: !window.isMinimized,
          },
        },
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
            isMaximized: !window.isMaximized,
          },
        },
      };
    }

    default:
      return state;
  }
}
