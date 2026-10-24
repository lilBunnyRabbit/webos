import type { Component } from "svelte";
import AiIcon from "./ai-icon.svelte";
import type { AiIconProps, IconProps } from "./type";

export type { IconProps } from "./type";

export function ai_icon(glyph: Component<IconProps>): Component<IconProps> {
  return (anchor, props) => AiIcon(anchor, with_glyph(props, glyph));
}

// A proxy, not a spread: the props object is reactive (the taskbar switches `weight`), a copy would freeze it.
function with_glyph(props: IconProps, glyph: Component<IconProps>): AiIconProps {
  return new Proxy(props as AiIconProps, {
    get: (target, key) => (key === "glyph" ? glyph : Reflect.get(target, key)),
    has: (target, key) => key === "glyph" || Reflect.has(target, key),
    ownKeys: (target) => [...Reflect.ownKeys(target), "glyph"],
    getOwnPropertyDescriptor: (target, key) =>
      key === "glyph" ? { value: glyph, enumerable: true, configurable: true } : Reflect.getOwnPropertyDescriptor(target, key),
  });
}
