import type { Component } from "svelte";
import type { IconComponentProps } from "phosphor-svelte";
import type { IService } from "../../type";
import type { Position } from "$lib/core/utils/type";
import type { WindowId } from "../windows/type";

/** System dialogs above all windows (ADR-019), and window sheets bound to one window (ADR-025). */
export interface DialogsService extends IService {
  /** Every open dialog, system and window-bound, bottom first. */
  readonly stack: DialogEntry[];

  /** System dialogs opened in the tab: what the tab's top-layer host renders. */
  readonly system: DialogEntry[];

  /** System dialogs opened from the popped-out window `origin` (ADR-043): what its mini window's host renders. */
  for_origin(origin: WindowId): DialogEntry[];

  /** Sheets bound to `window`, bottom first: what that window renders over its content. */
  for_window(window: WindowId): DialogEntry[];

  /**
   * A context menu at `anchor` (system level, ADR-025). Resolves with the chosen item's `id`, or `null` when dismissed.
   * Items are data, so every menu in the OS looks and behaves the same.
   */
  menu(items: MenuItem[], options: { anchor: Position }): Promise<string | null>;

  /**
   * Shows `component` and resolves with the value it passes to `resolve`, or `null` when dismissed.
   * Without an anchor the dialog is centered over the focused window, else the desktop.
   */
  show<T, P extends object>(
    component: Component<P & DialogProps<T>>,
    props: P,
    options?: DialogOptions
  ): Promise<T | null>;
}

export type DialogId = string;

export interface DialogProps<T> {
  resolve(value: T | null): void;
}

export interface DialogOptions {
  /** Viewport point the dialog opens at, e.g. the click position. */
  anchor?: Position;
  /**
   * `false` for questions that must be answered: no Esc, no outside click, only the dialog's own buttons close it.
   * Defaults to `true` (menus and pickers dismiss lightly).
   */
  dismissible?: boolean;
  /**
   * Bind the dialog to a window: it renders as a sheet over that window's content, blocks only that window, moves
   * with it and resolves `null` if the window closes. Without it, the dialog is system-level (ADR-025).
   */
  window?: WindowId;
}

export interface DialogEntry {
  id: DialogId;
  component: Component<DialogProps<unknown>>;
  props: object;
  point: Position;
  /** `true`: dropdown below/right of `point`. `false`: centered on it. */
  anchored: boolean;
  dismissible: boolean;
  /** The window this sheet belongs to, or `null` for a system dialog. */
  window: WindowId | null;
  /** A system dialog opened while the popped-out window's document had focus renders there (ADR-043). */
  origin: WindowId | null;
  resolve(value: unknown): void;
}

export type MenuItem = MenuAction | MenuSubmenu | MenuSeparator;

export interface MenuAction {
  id: string;
  label: string;
  icon?: Component<IconComponentProps>;
  /** A hint only, like "F2" or "Ctrl+C"; the menu doesn't bind it. */
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuSubmenu {
  label: string;
  icon?: Component<IconComponentProps>;
  items: MenuItem[];
}

export interface MenuSeparator {
  separator: true;
}
