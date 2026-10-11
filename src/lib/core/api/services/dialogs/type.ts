import type { Component } from "svelte";
import type { IService } from "../../type";
import type { Position } from "$lib/core/utils/type";

/** System dialogs above all windows (ADR-019). */
export interface DialogsService extends IService {
  /** Open dialogs, bottom first. */
  readonly stack: DialogEntry[];

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
}

export interface DialogEntry {
  id: DialogId;
  component: Component<DialogProps<unknown>>;
  props: object;
  point: Position;
  /** `true`: dropdown below/right of `point`. `false`: centered on it. */
  anchored: boolean;
  dismissible: boolean;
  resolve(value: unknown): void;
}
