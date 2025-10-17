import React from "react";
import type { WindowManagerState, WindowManagerAction, Bounds, WindowManagerFlag } from "./window-manager.type";
import type { Flags } from "@/core/lib/flags";

export type WindowManagerContextProps = WindowManagerState;

export const WindowManagerContext = React.createContext<WindowManagerContextProps | null>(null);

export type WindowManagerActionsContextProps = React.ActionDispatch<[action: WindowManagerAction]>;

export const WindowManagerActionsContext = React.createContext<WindowManagerActionsContextProps | null>(null);

export type WindowManagerContainerContextProps = Bounds;

export const WindowManagerContainerContext = React.createContext<WindowManagerContainerContextProps | null>(null);

export type WindowManagerFlagsContextProps = Flags<WindowManager>;

export const WindowManagerFlagsContext = React.createContext<WindowManagerFlagsContextProps | null>(null);
