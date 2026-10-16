import type { IService } from "../../type";
import type { WindowId } from "../windows/type";

/**
 * Pops one window out of the tab into an always-on-top Document Picture-in-Picture window (ADR-043). Desktop only:
 * shared code checks `kernel.services.has("extract")` first. The app remounts there; the window's frame hides meanwhile.
 */
export interface ExtractService extends IService {
  /** The browser has Document Picture-in-Picture. */
  readonly supported: boolean;

  /** The window that's out, or `null`. */
  readonly current: WindowId | null;

  /** The mini window's document while one is out: `window.svelte` mounts the app into its body. */
  readonly document: Document | null;

  /**
   * The last pointerdown or keydown happened in the mini window, not the tab: where a dialog opened now belongs.
   * `document.hasFocus()` can't tell, since some builds report both documents focused.
   */
  readonly input_inside: boolean;

  /** Supported, the window exists and has no unsaved changes (the remount would drop them). */
  can_pop(id: WindowId): boolean;

  /**
   * Opens the mini window at the window's size and moves the app there, bringing back any window already out. Needs
   * user activation (a click or a keydown). When the window that's out is dirty, it only asks to bring that one back
   * (the question spends the activation) and resolves `false`; popping takes a second try. Resolves `false` when refused
   * or the browser said no.
   */
  pop(id: WindowId): Promise<boolean>;

  /**
   * Closes the mini window; the app comes back to its frame. A dirty window asks "Discard changes?" first (a sheet in the
   * mini window); resolves `false` when kept out.
   */
  bring_back(): Promise<boolean>;

  /** Brings the mini window to the front. */
  focus(): void;
}
