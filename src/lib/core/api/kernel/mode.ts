export const Mode = {
  FULL: "full",
  /** One app, full page, from a `#/solo/` link (ADR-047). */
  SOLO: "solo",
} as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export const SOLO_PREFIX = "#/solo/";

/** Read once at boot, like the platform: solo swaps services at registration, so it can't change while the page lives. */
export function detect_mode(hash: string = location.hash): Mode {
  return hash.startsWith(SOLO_PREFIX) ? Mode.SOLO : Mode.FULL;
}
