export const InstallPlatform = {
  PROMPT: "prompt",
  IOS: "ios",
  SAFARI_MAC: "safari-mac",
  OTHER: "other",
} as const;

export type InstallPlatform = (typeof InstallPlatform)[keyof typeof InstallPlatform];

export interface PlatformInput {
  user_agent: string;
  max_touch_points: number;
  has_prompt_api: boolean;
}

export function detect_platform({ user_agent, max_touch_points, has_prompt_api }: PlatformInput): InstallPlatform {
  // iPadOS reports itself as a Mac; touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(user_agent) || (/Macintosh/.test(user_agent) && max_touch_points > 1);
  if (ios) return InstallPlatform.IOS;
  if (has_prompt_api) return InstallPlatform.PROMPT;
  const safari = /Safari\//.test(user_agent) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(user_agent);
  if (safari && /Macintosh/.test(user_agent)) return InstallPlatform.SAFARI_MAC;
  return InstallPlatform.OTHER;
}

export const INSTALL_HINTS: Record<InstallPlatform, string> = {
  [InstallPlatform.PROMPT]: "Use Install app in the address bar or the browser menu.",
  [InstallPlatform.IOS]: "Tap Share, then Add to Home Screen.",
  [InstallPlatform.SAFARI_MAC]: "In Safari, choose File › Add to Dock.",
  [InstallPlatform.OTHER]: "Use your browser's Install app or Add to Home Screen menu item.",
};
