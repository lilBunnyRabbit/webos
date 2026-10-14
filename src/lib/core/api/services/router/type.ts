import type { IService } from "../../type";
import type { WindowId } from "../windows/type";

export const LinkOutcome = {
  OPENED: "opened",
  NOT_A_LINK: "not a link",
  UNKNOWN_APP: "unknown app",
  INVALID_PROPS: "invalid props",
} as const;
export type LinkOutcome = (typeof LinkOutcome)[keyof typeof LinkOutcome];

/**
 * Deep links (ADR-010): opens `#/app/{id}?{props}` after the session's Restore answer, then clears the hash. Copies a
 * link to a window whose app doesn't take a file path.
 */
export interface RouterService extends IService {
  /** The last hash handled in this tab, and what came of it. */
  readonly last_link: { hash: string; outcome: LinkOutcome } | null;

  /** A full URL that opens this window's app with its launch props, or `null` when the app can't be shared. */
  link_for(id: WindowId): string | null;
  /** Copies `link_for(id)` to the system clipboard and confirms with a toast. */
  copy_link(id: WindowId): Promise<void>;
}
