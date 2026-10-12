import type { IService } from "../../type";

/** The shell's overlay state (ADR-028): which launcher, switcher or notification center is open, so shortcuts and apps can open them. */
export interface UiService extends IService {
  /** The open overlay. One at a time. */
  readonly overlay: UiOverlay | null;
  open(overlay: UiOverlay): void;
  close(): void;
  /** Opens `overlay`, or closes it when it's the open one. */
  toggle(overlay: UiOverlay): void;
}

export const UiOverlay = {
  /** The desktop start menu, the mobile app drawer. */
  LAUNCHER: "launcher",
  /** The mobile running-apps switcher. */
  SWITCHER: "switcher",
  /** The notification center: the tray popover on desktop, the switcher (which lists them) on mobile. */
  NOTIFICATIONS: "notifications",
} as const;
export type UiOverlay = (typeof UiOverlay)[keyof typeof UiOverlay];
