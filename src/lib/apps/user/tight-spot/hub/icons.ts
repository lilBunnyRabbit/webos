import type { IconComponentProps } from "phosphor-svelte";
import { mount, unmount, type Component } from "svelte";

/** A Phosphor icon as an image the canvas can draw. It decodes asynchronously, so `onload` asks for a redraw. */
export function icon_image(icon: Component<IconComponentProps>, colour: string, onload: () => void): HTMLImageElement {
  const host = document.createElement("div");
  const instance = mount(icon, { target: host, props: { color: colour, size: 96, weight: "fill" } });
  const markup = host.innerHTML;
  void unmount(instance);
  const image = new Image();
  image.onload = onload;
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  return image;
}
