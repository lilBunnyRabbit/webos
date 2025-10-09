import Apps from "@/apps";
import React from "react";
import { v4 as uuidv4 } from "uuid";
import type { WindowInstance, WindowsAction, WindowsState } from "./windows.type";
import { calculateWindowPosition, calculateSnapPosition } from "./windows.helpers";

export function windowsReducer(state: WindowsState, action: WindowsAction) {
  // console.log(`Action::${action.type}`, action, state);

  switch (action.type) {
    case "CREATE_WINDOW": {
      const id = uuidv4();
      const appConfig = Apps[action.appId];

      const size =
        "CONFIG" in appConfig
          ? {
              width: appConfig.CONFIG.window.defaultWidth,
              height: appConfig.CONFIG.window.defaultHeight,
            }
          : { width: 600, height: 400 };

      const instance: WindowInstance & { app: React.ReactNode } = {
        id,
        appId: action.appId,
        isMinimized: false,
        isMaximized: false,
        snapZone: null,
        createdAt: new Date(),
        config: {
          size,
          position: calculateWindowPosition(size, state.instances.length),
        },
        app: React.createElement(appConfig.App, {
          key: `${action.appId}-${id}`,
        }),
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
            snapZone: null, // Clear snap zone when maximizing
          },
        },
      };
    }

    case "SNAP_WINDOW": {
      const window = state.index[action.windowId];
      if (!window) return state;

      // If snapZone is null, it means we're unsnapping
      if (action.snapZone === null) {
        return {
          ...state,
          index: {
            ...state.index,
            [action.windowId]: {
              ...window,
              snapZone: null,
              isMaximized: false,
            },
          },
        };
      }

      // Calculate new position and size based on snap zone
      const snapPosition = calculateSnapPosition(action.snapZone);

      return {
        ...state,
        index: {
          ...state.index,
          [action.windowId]: {
            ...window,
            snapZone: action.snapZone,
            isMaximized: false,
            config: {
              ...window.config,
              position: {
                x: snapPosition.x,
                y: snapPosition.y,
              },
              size: {
                width: snapPosition.width,
                height: snapPosition.height,
              },
            },
          },
        },
      };
    }

    default:
      return state;
  }
}
