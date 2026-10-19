import type { IService } from "../../type";

/** The shell's overlay state (ADR-028): which launcher, switcher, notification center or home edit mode is open, so shortcuts and apps can open them. Also back, for the nav bar and the browser. */
export interface UiService extends IService {
  /** The open overlay. One at a time. */
  readonly overlay: UiOverlay | null;
  open(overlay: UiOverlay): void;
  close(): void;
  /** Opens `overlay`, or closes it when it's the open one. */
  toggle(overlay: UiOverlay): void;

  /** `true` while a back-guard history entry sits above the page, so the browser's back reaches `back()`. */
  readonly armed: boolean;
  /**
   * One step back, for the nav bar and the browser's back (ADR-028 revision): the overlay, the top system dialog or menu,
   * the focused window's top sheet (non-dismissible ones swallow it), the app's `on_back`, then on mobile home.
   * `false` when nothing took it.
   */
  back(): boolean;
}

export const UiOverlay = {
  /** The desktop start menu, the mobile app drawer. */
  LAUNCHER: "launcher",
  /** The mobile running-apps switcher. */
  SWITCHER: "switcher",
  /** The notification center: the tray popover on desktop, the switcher (which lists them) on mobile. */
  NOTIFICATIONS: "notifications",
  /** The mobile home's edit mode: move, resize and remove icons and widgets. */
  HOME_EDIT: "home-edit",
} as const;
export type UiOverlay = (typeof UiOverlay)[keyof typeof UiOverlay];
