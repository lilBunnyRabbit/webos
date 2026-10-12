import type { IService } from "../../type";
import type { WindowId, WindowSnapshot } from "../windows/type";

export const SessionStatus = {
  /** Nothing was saved, so nothing to offer. */
  NONE: "none",
  /** The restore dialog is open; saving waits for the answer. */
  PENDING: "pending",
  RESTORED: "restored",
  DECLINED: "declined",
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

/** Saves open windows to `/var/lib/session/session.json` and offers to restore them at boot (ADR-023). */
export interface SessionService extends IService {
  readonly status: SessionStatus;
  /** Windows in the last saved session, oldest-first in z-order. */
  readonly saved_count: number;
  /** When the session was last written in this tab, or `null` before the first save. */
  readonly last_saved: Date | null;

  /** Recently closed windows, newest first, at most 10. Memory only (ADR-023 revision). */
  readonly closed: WindowSnapshot[];

  /** Reopens the most recently closed window, un-minimized and focused. `null` when there's none or its app is gone. */
  reopen_closed(): WindowId | null;
}
