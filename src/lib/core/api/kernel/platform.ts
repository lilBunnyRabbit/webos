export const Platform = {
  DESKTOP: "desktop",
  MOBILE: "mobile",
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

/**
 * Read once at boot (ADR-016). `?platform=mobile|desktop` wins, for trying the other shell on one machine. Otherwise a
 * touch-first device (coarse primary pointer that can't hover: phones, tablets) is mobile.
 */
export function detect_platform(
  search: string = location.search,
  touch_first: boolean = matchMedia("(pointer: coarse) and (hover: none)").matches
): Platform {
  const forced = new URLSearchParams(search).get("platform");
  if (forced === Platform.MOBILE || forced === Platform.DESKTOP) return forced;
  return touch_first ? Platform.MOBILE : Platform.DESKTOP;
}
