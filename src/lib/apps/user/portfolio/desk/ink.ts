import { wcag_ratio, type Rgb } from "../contrast";

const AA = 4.5;

/** The kit's primary button sets `text-background`; a light pastel primary can't carry it, so the other end of the theme does. */
export function ink_for(primary: Rgb, background: Rgb, foreground: Rgb): "text-background" | "text-foreground" {
  const on_background = wcag_ratio(primary, background);
  return on_background >= AA || on_background >= wcag_ratio(primary, foreground) ? "text-background" : "text-foreground";
}
