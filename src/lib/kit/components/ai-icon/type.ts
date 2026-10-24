import type { Component } from "svelte";
import type { SVGAttributes } from "svelte/elements";

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  weight?: string;
}

export interface AiIconProps extends IconProps {
  glyph: Component<IconProps>;
}
