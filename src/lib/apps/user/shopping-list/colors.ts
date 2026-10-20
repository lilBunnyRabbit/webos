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
import type { ListColor, ListIcon } from "./data";

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

export const COLOR_NAME: Record<ListColor, string> = {
  primary: "Primary",
  secondary: "Secondary",
  tertiary: "Tertiary",
  accent: "Accent",
  info: "Blue",
  success: "Green",
  warning: "Amber",
};

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
