import { WidgetStyle } from "$lib/core/api";

/** The frame's surface for a widget style, shared by the desktop grid and the phone home. */
export function widget_surface(style: WidgetStyle): string {
  switch (style) {
    case WidgetStyle.GLASS:
      return "bg-background-light/50 ring-1 ring-foreground/8 backdrop-blur-lg";
    case WidgetStyle.CLEAR:
      return "";
    default:
      return "bg-background-light shadow-raised ring-1 ring-hairline";
  }
}
