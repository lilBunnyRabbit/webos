export const OnScreen = { AUTO: "auto", ALWAYS: "always", NEVER: "never" } as const;
export type OnScreen = (typeof OnScreen)[keyof typeof OnScreen];

export const ONSCREEN_MODES = [OnScreen.AUTO, OnScreen.ALWAYS, OnScreen.NEVER] as const;

export const ONSCREEN_OPTIONS = [
  { value: OnScreen.AUTO, label: "Auto" },
  { value: OnScreen.ALWAYS, label: "Always" },
  { value: OnScreen.NEVER, label: "Never" },
];

export function controls_shown(mode: OnScreen, coarse: boolean): boolean {
  return mode === OnScreen.ALWAYS || (mode === OnScreen.AUTO && coarse);
}
