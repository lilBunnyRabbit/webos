import React from "react";
import type { WindowsState, WindowsAction } from "./windows.type";

export type WindowsContextProps = WindowsState;

export const WindowsContext = React.createContext<WindowsContextProps | null>(null);

export type WindowsActionsContextProps = React.ActionDispatch<[action: WindowsAction]>;

export const WindowsActionsContext = React.createContext<WindowsActionsContextProps | null>(null);
