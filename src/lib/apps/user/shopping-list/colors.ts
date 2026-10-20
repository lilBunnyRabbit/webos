import type { Component } from "svelte";
import {
  Baby,
  Basket,
  Book,
  Bread,
  Broom,
  Carrot,
  Coffee,
  Gift,
  House,
  Leaf,
  PawPrint,
  Pill,
  ShoppingCart,
  TShirt,
  Wine,
  Wrench,
} from "phosphor-svelte";
import { LIST_COLORS, type ListColor, type ListIcon } from "./data";

// Full class names: Tailwind only compiles classes it finds written out.
export const COLOR_DOT: Record<ListColor, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  tertiary: "bg-tertiary",
  accent: "bg-accent",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
};

/** Named after the hue: the token names (primary, accent…) say nothing about how a theme paints them. */
const HUE_NAMES: [number, string][] = [
  [15, "Red"],
  [40, "Orange"],
  [62, "Amber"],
  [75, "Yellow"],
  [165, "Green"],
  [195, "Teal"],
  [255, "Blue"],
  [290, "Purple"],
  [345, "Pink"],
  [360, "Red"],
];

function rgb_of(css: string): [number, number, number] | null {
  const context = new OffscreenCanvas(1, 1).getContext("2d");
  if (!context) return null;
  context.fillStyle = css;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

function describe(css: string): { name: string; lightness: number } {
  const rgb = rgb_of(css);
  if (!rgb) return { name: "Colour", lightness: 0.5 };
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  if (chroma < 0.08) return { name: "Grey", lightness };
  const [r, g, b] = rgb;
  const hue = (max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4) * 60;
  const degrees = (hue + 360) % 360;
  const name = HUE_NAMES.find(([limit]) => degrees < limit)?.[1] ?? "Red";
  return { name: (name === "Orange" || name === "Amber") && lightness < 0.35 ? "Brown" : name, lightness };
}

/** What each list colour looks like in the current theme; two that look alike become "Light …" and "Dark …". */
export function color_names(): Record<ListColor, string> {
  // Tokens can be `color-mix(…var(--primary)…)`: an element resolves them, a canvas can't.
  const probe = document.createElement("span");
  probe.hidden = true;
  document.body.append(probe);
  const resolve = (color: ListColor) => {
    probe.style.color = `var(--${color})`;
    return getComputedStyle(probe).color;
  };
  const seen = Object.fromEntries(LIST_COLORS.map((color) => [color, describe(resolve(color))])) as Record<ListColor, { name: string; lightness: number }>;
  probe.remove();
  const names = {} as Record<ListColor, string>;
  for (const color of LIST_COLORS) {
    const twins = LIST_COLORS.filter((other) => seen[other].name === seen[color].name);
    if (twins.length < 2) names[color] = seen[color].name;
    else {
      const lighter = twins.every((other) => other === color || seen[other].lightness <= seen[color].lightness);
      const darker = twins.every((other) => other === color || seen[other].lightness >= seen[color].lightness);
      const name = seen[color].name.toLowerCase();
      names[color] = lighter ? `Light ${name}` : darker ? `Dark ${name}` : seen[color].name;
    }
  }
  return names;
}

export const COLOR_TEXT: Record<ListColor, string> = {
  primary: "text-primary",
  secondary: "text-secondary",
  tertiary: "text-tertiary",
  accent: "text-accent",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
};

/** A tinted tile behind the list's icon. */
export const COLOR_TILE: Record<ListColor, string> = {
  primary: "bg-primary/15 text-primary",
  secondary: "bg-secondary/15 text-secondary",
  tertiary: "bg-tertiary/15 text-tertiary",
  accent: "bg-accent/15 text-accent",
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
};

export const ICON: Record<ListIcon, Component> = {
  cart: ShoppingCart,
  basket: Basket,
  carrot: Carrot,
  bread: Bread,
  coffee: Coffee,
  wine: Wine,
  house: House,
  broom: Broom,
  wrench: Wrench,
  pill: Pill,
  baby: Baby,
  paw: PawPrint,
  leaf: Leaf,
  shirt: TShirt,
  gift: Gift,
  book: Book,
};

export const ICON_NAME: Record<ListIcon, string> = {
  cart: "Cart",
  basket: "Basket",
  carrot: "Vegetables",
  bread: "Bakery",
  coffee: "Coffee",
  wine: "Drinks",
  house: "Home",
  broom: "Cleaning",
  wrench: "Hardware",
  pill: "Pharmacy",
  baby: "Baby",
  paw: "Pets",
  leaf: "Garden",
  shirt: "Clothes",
  gift: "Gifts",
  book: "Books",
};
