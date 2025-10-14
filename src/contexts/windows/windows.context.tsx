import React from "react";
import type { WindowsState, WindowsAction, Bounds, WindowsFlag } from "./windows.type";
import type { Flags } from "@/lib/flags";

export type WindowsContextProps = WindowsState;

export const WindowsContext = React.createContext<WindowsContextProps | null>(null);

export type WindowsActionsContextProps = React.ActionDispatch<[action: WindowsAction]>;

export const WindowsActionsContext = React.createContext<WindowsActionsContextProps | null>(null);

export type WindowsContainerContextProps = Bounds;

export const WindowsContainerContext = React.createContext<WindowsContainerContextProps | null>(null);

export type WindowsFlagsContextProps = Flags<WindowsFlag>;

export const WindowsFlagsContext = React.createContext<WindowsFlagsContextProps | null>(null);
