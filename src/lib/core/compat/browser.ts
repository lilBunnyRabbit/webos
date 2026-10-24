import type { MinVersions } from "./features";

export const Engine = {
  CHROMIUM: "chromium",
  GECKO: "gecko",
  WEBKIT: "webkit",
} as const;
export type Engine = (typeof Engine)[keyof typeof Engine];

export interface Browser {
  name: string | null;
  version: string | null;
  os: string | null;
  engine: Engine | null;
  // Every iOS browser runs WebKit, so it carries the iOS version.
  engine_version: string | null;
}

export const MIN_KEY: Record<Engine, keyof MinVersions> = {
  [Engine.CHROMIUM]: "chrome",
  [Engine.GECKO]: "firefox",
  [Engine.WEBKIT]: "safari",
};

// iOS 26 froze the OS in every iOS browser's UA at 18.6; only Safari's `Version/` still tells.
const FROZEN_IOS = "18.6";

const CHROMIUM_BRANDS: [RegExp, string][] = [
  [/\bEdg(?:A)?\/(\d+)/, "Edge"],
  [/\bOPR\/(\d+)/, "Opera"],
  [/\bSamsungBrowser\/(\d+(?:\.\d+)?)/, "Samsung Internet"],
  [/\bYaBrowser\/(\d+)/, "Yandex"],
  [/\bVivaldi\/(\d+(?:\.\d+)?)/, "Vivaldi"],
];

const IOS_BRANDS: [RegExp, string][] = [
  [/\bCriOS\/(\d+)/, "Chrome"],
  [/\bFxiOS\/(\d+)/, "Firefox"],
  [/\bEdgiOS\/(\d+)/, "Edge"],
  [/\bOPT\/(\d+)/, "Opera"],
];

function os_of(ua: string): string | null {
  if (/\b(iPhone|iPad|iPod)\b/.test(ua)) return "iOS";
  if (/\bAndroid\b/.test(ua)) return "Android";
  if (/\bCrOS\b/.test(ua)) return "ChromeOS";
  if (/\bWindows\b/.test(ua)) return "Windows";
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return "macOS";
  if (/\bLinux\b/.test(ua)) return "Linux";
  return null;
}

function minor(version: string): string {
  return version.split(/[._]/).slice(0, 2).join(".");
}

// `brands` (User-Agent Client Hints) are the only way to tell Brave: its UA is Chrome's.
export function parse_user_agent(ua: string, brands: string[] = []): Browser {
  const os = os_of(ua);

  if (os === "iOS") {
    const ios = /\bOS (\d+[_.]\d+)/.exec(ua);
    const safari = /\bVersion\/(\d+(?:\.\d+)?)/.exec(ua);
    const brand = IOS_BRANDS.find(([pattern]) => pattern.test(ua));
    const ios_version = ios ? minor(ios[1]) : null;
    const engine_version = safari ? minor(safari[1]) : ios_version === FROZEN_IOS ? null : ios_version;
    if (brand) return { name: brand[1], version: brand[0].exec(ua)![1], os, engine: Engine.WEBKIT, engine_version };
    return { name: "Safari", version: safari ? minor(safari[1]) : ios_version, os, engine: Engine.WEBKIT, engine_version };
  }

  const firefox = /\bFirefox\/(\d+)/.exec(ua);
  if (firefox && /\bGecko\//.test(ua)) {
    return { name: "Firefox", version: firefox[1], os, engine: Engine.GECKO, engine_version: firefox[1] };
  }

  const chrome = /\b(?:HeadlessChrome|Chrome|Chromium)\/(\d+)/.exec(ua);
  if (chrome) {
    const brand = CHROMIUM_BRANDS.find(([pattern]) => pattern.test(ua));
    if (brand) return { name: brand[1], version: minor(brand[0].exec(ua)![1]), os, engine: Engine.CHROMIUM, engine_version: chrome[1] };
    const name = brands.includes("Brave") ? "Brave" : "Chrome";
    return { name, version: chrome[1], os, engine: Engine.CHROMIUM, engine_version: chrome[1] };
  }

  const safari = /\bVersion\/(\d+(?:\.\d+)?).*\bSafari\//.exec(ua);
  if (safari && /\bAppleWebKit\//.test(ua)) {
    const version = minor(safari[1]);
    return { name: "Safari", version, os, engine: Engine.WEBKIT, engine_version: version };
  }

  return { name: null, version: null, os, engine: null, engine_version: null };
}

interface NavigatorBrands {
  userAgentData?: { brands: { brand: string }[] };
}

export function detect_browser(): Browser {
  const brands = (navigator as Navigator & NavigatorBrands).userAgentData?.brands ?? [];
  return parse_user_agent(
    navigator.userAgent,
    brands.map((item) => item.brand)
  );
}

export function browser_label(browser: Browser): string {
  const name = browser.name ? [browser.name, browser.version].filter(Boolean).join(" ") : "Unknown browser";
  return browser.os ? `${name} · ${browser.os}` : name;
}

export function compare_versions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
