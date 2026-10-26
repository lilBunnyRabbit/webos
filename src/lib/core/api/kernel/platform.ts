export const Platform = {
  DESKTOP: "desktop",
  MOBILE: "mobile",
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

interface NavigatorUAData {
  mobile: boolean;
}

/**
 * Read once at boot (ADR-016). `?platform=mobile|desktop` wins, for trying the other shell on one machine. Otherwise a
 * phone (User-Agent Client Hints `mobile`) or a touch-first device (coarse primary pointer that can't hover: tablets)
 * is mobile. Hints come first because Samsung Internet on Galaxy phones reports `hover: hover`.
 */
export function detect_platform(
  search: string = globalThis.location?.search ?? "",
  touch_first: boolean = globalThis.matchMedia?.("(pointer: coarse) and (hover: none)").matches ?? false,
  phone: boolean = (globalThis.navigator as (Navigator & { userAgentData?: NavigatorUAData }) | undefined)?.userAgentData?.mobile ?? false
): Platform {
  const forced = new URLSearchParams(search).get("platform");
  if (forced === Platform.MOBILE || forced === Platform.DESKTOP) return forced;
  return phone || touch_first ? Platform.MOBILE : Platform.DESKTOP;
}
