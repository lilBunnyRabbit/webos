import type { Theme, ThemeBase, ThemeSurfaceToken } from "./type";

// Brand ladder: ±0.034 lightness per step around the seed, chroma scaled with lightness (brand palette values).
export const BRAND_DARK: Theme = {
  background_lightest: "oklch(0.357 0.0326 230.47)",
  background_lighter: "oklch(0.323 0.0295 230.47)",
  background_light: "oklch(0.289 0.0264 230.47)",
  background: "oklch(0.255 0.0233 230.47)",
  background_dark: "oklch(0.221 0.0202 230.47)",
  background_darker: "oklch(0.187 0.0171 230.47)",
  background_darkest: "oklch(0.153 0.014 230.47)",
  foreground: "oklch(0.745 0.0078 50.47)",
  primary: "oklch(0.745 0.0699 122.47)",
  secondary: "oklch(0.745 0.0466 302.47)",
  tertiary: "oklch(0.745 0.0233 176.47)",
  accent: "oklch(0.745 0.0932 50.47)",
  cottontail: "oklch(0.949 0.0939 122.47)",
  success: "oklch(0.745 0.1398 140)",
  warning: "oklch(0.745 0.1398 70)",
  error: "oklch(0.745 0.1398 30)",
  info: "oklch(0.745 0.1398 240)",
};

// Brand rule: light is product UI only, never for the app icon, favicon or splash.
export const BRAND_LIGHT: Theme = {
  background_lightest: "oklch(1 0 0)",
  background_lighter: "oklch(0.983 0.0086 86.47)",
  background_light: "oklch(0.966 0.0172 86.47)",
  background: "oklch(0.949 0.0259 86.47)",
  background_dark: "oklch(0.89 0.0562 86.47)",
  background_darker: "oklch(0.832 0.077 86.47)",
  background_darkest: "oklch(0.774 0.0725 86.47)",
  foreground: "oklch(0.3982 0.0233 266.47)",
  primary: "oklch(0.4743 0.0778 50.47)",
  secondary: "oklch(0.4743 0.0519 190)",
  tertiary: "oklch(0.4743 0.0259 302.47)",
  accent: "oklch(0.4743 0.1037 338.47)",
  cottontail: "oklch(0.5002 0.1314 50.47)",
  success: "oklch(0.4745 0.1538 140.32)",
  warning: "oklch(0.4761 0.1064 113.24)",
  error: "oklch(0.4743 0.1556 30)",
  info: "oklch(0.4829 0.1244 246.07)",
};

// Neubrutalist, from the While True style guide: the orange is the desktop, windows are white, text is #090919. Written out because
// derive_theme shades every surface from one base, which can't put white panels on an orange desktop.
export const WHILE_TRUE: Theme = {
  background_lightest: "oklch(1 0 0)",
  background_lighter: "oklch(1 0 0)",
  background_light: "oklch(0.995 0.004 66.05)",
  background: "oklch(0.985 0.012 66.05)",
  background_dark: "oklch(0.94 0.04 62)",
  background_darker: "oklch(0.86 0.1 58)",
  background_darkest: "oklch(0.787 0.1433 55.27)",
  foreground: "oklch(0.15 0.0339 281.52)",
  primary: "oklch(0.15 0.0339 281.52)",
  secondary: "oklch(0.6 0.17 48)",
  tertiary: "oklch(0.45 0.12 276)",
  accent: "oklch(0.55 0.16 276)",
  cottontail: "oklch(0.15 0.0339 281.52)",
  success: "oklch(0.4745 0.1538 140.32)",
  warning: "oklch(0.4761 0.1064 113.24)",
  error: "oklch(0.4743 0.1556 30)",
  info: "oklch(0.4829 0.1244 246.07)",
};

const SURFACE_STEPS: Record<ThemeSurfaceToken, number> = {
  background_lightest: 3,
  background_lighter: 2,
  background_light: 1,
  background_dark: -1,
  background_darker: -2,
  background_darkest: -3,
};

/**
 * The surface ladder for themes that only define `background` (five-colour presets, older saves). Brand palettes list
 * their exact shades instead. Steps follow the brand: 0.034 lightness each; "dark" is always lower lightness.
 * A step past black or white reflects back (abs) instead of clamping, so a pure-black or pure-white preset still gets
 * distinct shades rather than seven copies of the same colour.
 */
export function derive_surfaces(): Record<ThemeSurfaceToken, string> {
  return Object.fromEntries(
    Object.entries(SURFACE_STEPS).map(([token, step]) => [
      token,
      step < 0
        ? `oklch(from var(--background) abs(calc(l - ${-step * 0.034})) c h)`
        : `oklch(from var(--background) calc(1 - abs(calc(1 - l - ${step * 0.034}))) c h)`,
    ])
  ) as Record<ThemeSurfaceToken, string>;
}

// Mirrors the brand derivation (states at brand lightness, fixed hues) so presets never hand-pick extra colours.
export function derive_theme(base: ThemeBase): Theme {
  return {
    ...base,
    ...derive_surfaces(),
    tertiary: "color-mix(in oklch, var(--primary), var(--secondary))",
    cottontail: "oklch(from var(--primary) calc(l + 0.2) calc(c * 1.34) h)",
    success: "oklch(from var(--primary) l 0.14 140)",
    warning: "oklch(from var(--primary) l 0.14 70)",
    error: "oklch(from var(--primary) l 0.14 30)",
    info: "oklch(from var(--primary) l 0.14 240)",
  };
}

export const ThemeGroup = {
  WEBOS: "webos",
  PROJECTS: "projects",
} as const;
export type ThemeGroup = (typeof ThemeGroup)[keyof typeof ThemeGroup];

export interface ThemePreset {
  name: string;
  theme: Theme;
  group: ThemeGroup;
}

function base(
  name: string,
  [background, foreground, primary, secondary, accent]: [string, string, string, string, string],
  group: ThemeGroup = ThemeGroup.WEBOS
): ThemePreset {
  return { name, theme: derive_theme({ background, foreground, primary, secondary, accent }), group };
}

export const THEME_PRESETS: ThemePreset[] = [
  { name: "Brand Dark", theme: BRAND_DARK, group: ThemeGroup.WEBOS },
  { name: "Brand Light", theme: BRAND_LIGHT, group: ThemeGroup.WEBOS },
  base("Light Pastel Blue", ["oklch(0.98 0.01 250)", "oklch(0.22 0.02 80)", "oklch(0.7 0.09 200)", "oklch(0.7 0.09 20)", "oklch(0.7 0.09 320)"]),
  base("Red & Black", ["oklch(0.45 0.22 29)", "oklch(0.15 0.01 0)", "oklch(0.85 0.02 29)", "oklch(0.7 0.13 80)", "oklch(0.7 0.13 340)"]),
  base("Dark Warm", ["oklch(0.15 0.03 40)", "oklch(0.85 0.02 120)", "oklch(0.65 0.1 60)", "oklch(0.65 0.1 240)", "oklch(0.65 0.1 180)"]),
  base("Dark Purple", ["oklch(0.35 0.04 300)", "oklch(0.9 0.015 60)", "oklch(0.8 0.08 270)", "oklch(0.8 0.08 90)", "oklch(0.8 0.08 180)"]),
  base("Mid-tone Green", ["oklch(0.5 0.06 120)", "oklch(0.95 0.01 300)", "oklch(0.7 0.12 30)", "oklch(0.7 0.12 210)", "oklch(0.7 0.12 330)"]),
  base("Dark Cool", ["oklch(0.22 0.025 270)", "oklch(0.8 0.02 180)", "oklch(0.6 0.09 350)", "oklch(0.6 0.09 170)", "oklch(0.6 0.09 90)"]),
  base("Warm Sunset", ["oklch(0.18 0.04 30)", "oklch(0.92 0.01 50)", "oklch(0.7 0.15 40)", "oklch(0.65 0.13 320)", "oklch(0.75 0.14 60)"]),
  base("Ocean Breeze", ["oklch(0.95 0.02 220)", "oklch(0.2 0.03 240)", "oklch(0.6 0.14 210)", "oklch(0.65 0.1 190)", "oklch(0.7 0.12 160)"]),
  base("Forest Night", ["oklch(0.2 0.04 160)", "oklch(0.88 0.015 140)", "oklch(0.65 0.13 145)", "oklch(0.7 0.1 110)", "oklch(0.75 0.11 80)"]),
  base("Lavender Dream", ["oklch(0.96 0.025 310)", "oklch(0.28 0.04 290)", "oklch(0.68 0.14 285)", "oklch(0.72 0.11 310)", "oklch(0.65 0.13 340)"]),
  base("Monochrome Dark", ["oklch(0.18 0.01 0)", "oklch(0.85 0.01 0)", "oklch(0.5 0.02 0)", "oklch(0.4 0.015 0)", "oklch(0.65 0.02 0)"]),
  base("Vibrant Coral", ["oklch(0.25 0.03 350)", "oklch(0.93 0.01 30)", "oklch(0.7 0.18 15)", "oklch(0.65 0.16 340)", "oklch(0.75 0.17 50)"]),
  base("Neon Black", ["oklch(0.0 0 0)", "oklch(1.0 0 0)", "oklch(0.75 0.3 145)", "oklch(0.75 0.3 330)", "oklch(0.75 0.3 60)"]),
  base("Electric White", ["oklch(1.0 0 0)", "oklch(0.0 0 0)", "oklch(0.55 0.35 265)", "oklch(0.6 0.32 340)", "oklch(0.65 0.33 100)"]),
  base("Deep Neon", ["oklch(0.05 0 0)", "oklch(0.98 0.01 0)", "oklch(0.8 0.28 195)", "oklch(0.8 0.28 310)", "oklch(0.8 0.28 45)"]),
  base("Cyberpunk", ["oklch(0.1 0.05 290)", "oklch(0.95 0.03 180)", "oklch(0.7 0.35 325)", "oklch(0.75 0.32 200)", "oklch(0.8 0.3 55)"]),
  base("Terminal Green", ["oklch(0.0 0 0)", "oklch(0.85 0.22 145)", "oklch(0.75 0.25 145)", "oklch(0.65 0.2 145)", "oklch(0.8 0.28 85)"]),
  base("High Visibility", ["oklch(0.98 0.005 80)", "oklch(0.15 0.01 280)", "oklch(0.45 0.35 260)", "oklch(0.5 0.3 30)", "oklch(0.4 0.32 340)"]),
  base("Black & White", ["oklch(0.0 0 0)", "oklch(1.0 0 0)", "oklch(0.6 0 0)", "oklch(0.4 0 0)", "oklch(0.8 0 0)"]),
  base("Speed Reader Light", ["oklch(0.976 0.022 80.58)", "oklch(0.586 0.0467 242.26)", "oklch(0.75 0.0905 55.2)", "oklch(0.836 0.1393 129.45)", "oklch(0.679 0.1263 20.92)"], ThemeGroup.PROJECTS),
  base("Speed Reader Dark", ["oklch(0.278 0.0269 229.12)", "oklch(0.775 0.0171 95.16)", "oklch(0.863 0.0575 65.19)", "oklch(0.907 0.0926 128.53)", "oklch(0.803 0.078 18.92)"], ThemeGroup.PROJECTS),
  { name: "While True", theme: WHILE_TRUE, group: ThemeGroup.PROJECTS },
];
