// Text colour and highlight are the user's content, so they're plain hex, not theme tokens: a document looks the same
// in every theme, in Word and on paper.
export const HEX = /^#[0-9a-f]{6}$/i;

export function is_hex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export const TEXT_SWATCHES = ["#c00000", "#e03131", "#e8590c", "#b07d00", "#2f9e44", "#0c8599", "#1971c2", "#5f3dc4", "#9c36b5", "#666666"] as const;

export const HIGHLIGHT_SWATCHES = ["#fff3a3", "#ffe0b2", "#ffd6e7", "#e5dbff", "#c5f2f7", "#c3f0c8", "#e9ecef"] as const;

export type ColourProperty = "color" | "background-color";

export function style_colour(style: string | undefined, property: ColourProperty): string | null {
  for (const declaration of style?.split(";") ?? []) {
    const at = declaration.indexOf(":");
    if (at < 0 || declaration.slice(0, at).trim().toLowerCase() !== property) continue;
    const value = declaration.slice(at + 1).trim();
    return is_hex(value) ? value.toLowerCase() : null;
  }
  return null;
}

export const word_hex = (hex: string) => hex.slice(1).toUpperCase();
