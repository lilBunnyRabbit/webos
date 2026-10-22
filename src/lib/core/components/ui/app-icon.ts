import AppIcon from "./app-icon.svelte";
import type { IconComponent } from "./types";

// A getter, not a copy: the caller's props are reactive.
export function app_icon(src: string): IconComponent {
  return (anchor, props) =>
    AppIcon(anchor, {
      src,
      get class() {
        return props.class;
      },
    });
}
