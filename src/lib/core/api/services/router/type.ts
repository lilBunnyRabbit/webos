import type { IService } from "../../type";
import type { WindowId } from "../windows/type";
import type { RouteKind } from "./route";

export const LinkOutcome = {
  OPENED: "opened",
  NOT_A_LINK: "not a link",
  UNKNOWN_APP: "unknown app",
  INVALID_PROPS: "invalid props",
} as const;
export type LinkOutcome = (typeof LinkOutcome)[keyof typeof LinkOutcome];

/**
 * Deep links (ADR-010): opens `#/app/{id}?{props}` after the session's Restore answer, then clears the hash. A solo link
 * `#/solo/{id}?{props}` opens the same way in solo mode and stays in the URL (ADR-047). Copies a link to any window;
 * props that point at this device's files are left out (`shareable_props`).
 */
export interface RouterService extends IService {
  /** The last hash handled in this tab, and what came of it. */
  readonly last_link: { hash: string; outcome: LinkOutcome } | null;

  /** A full URL that opens this window's app with its shareable launch props, or `null` when the window doesn't exist. */
  link_for(id: WindowId, kind?: RouteKind): string | null;
  /** Copies `link_for(id, kind)` to the system clipboard and confirms with a toast. */
  copy_link(id: WindowId, kind?: RouteKind): Promise<void>;
}
