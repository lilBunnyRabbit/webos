import { PATHS } from "../files/hierarchy";
import type { AppearanceFont, FontChoice, FontRole } from "./type";

/** Font files the OS owns: choosing one copies it here, so moving or deleting the original doesn't break it. */
export const FONT_DIRECTORY_NAME = "fonts";
export const FONT_DIRECTORY = `${PATHS.etc}/${FONT_DIRECTORY_NAME}`;

export const FONT_EXTENSIONS = [".ttc", ".ttf", ".otf", ".woff", ".woff2"] as const;
export const FONT_FILE_ACCEPT = [...FONT_EXTENSIONS, "font/collection", "font/ttf", "font/otf", "font/woff", "font/woff2"];

export interface BuiltinFace {
  /** Under `public/`, fetched relative to the base URL on first use. */
  path: string;
  /** A CSS `font-weight` descriptor: one weight, or a variable font's range. */
  weight: string;
  style: "normal" | "italic";
}

export interface BuiltinFont {
  name: string;
  faces: BuiltinFace[];
}

// Variable faces: the UI asks for 500 and 600 too, which a family of static 300, 400 and 700 faces can't draw.
export const BUILTIN_FONTS: Record<string, BuiltinFont> = {
  burrow: {
    name: "Burrow",
    faces: [
      { path: "fonts/burrow-vf.ttf", weight: "300 700", style: "normal" },
      { path: "fonts/burrow-italic-vf.ttf", weight: "300 700", style: "italic" },
    ],
  },
};

/** The first family of each default stack: kept behind a chosen font, so characters it lacks still show in it. */
export const DEFAULT_FONT_NAMES: Record<FontRole, string> = { sans: "Inter", mono: "Hack" };

export const DEFAULT_FONT: FontChoice = { kind: "default" };
export const DEFAULT_APPEARANCE_FONT: AppearanceFont = { sans: DEFAULT_FONT, mono: DEFAULT_FONT };

export function is_font_file_name(name: string): boolean {
  if (!name || name.length > 120 || /[/\\]/.test(name) || name.startsWith(".")) return false;
  const lower = name.toLowerCase();
  return FONT_EXTENSIONS.some((extension) => lower.endsWith(extension) && lower.length > extension.length);
}

export function font_label(choice: FontChoice, role: FontRole): string {
  if (choice.kind === "default") return DEFAULT_FONT_NAMES[role];
  if (choice.kind === "builtin") return BUILTIN_FONTS[choice.id]?.name ?? choice.id;
  return choice.name.replace(/\.[^.]+$/, "");
}

export const same_font = (a: FontChoice, b: FontChoice) =>
  a.kind === b.kind && (a.kind !== "builtin" || a.id === (b as typeof a).id) && (a.kind !== "file" || a.name === (b as typeof a).name);
