import type { VariantProps } from "tailwind-variants";
import { tv as merge_tv } from "$lib/core/utils";

/**
 * Class recipes for the UI kit (docs/design/components.md). Components use them; anything that must look like a button
 * without being one (a link, a label) can use them directly.
 */
export const button = merge_tv({
  base: [
    "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium",
    "transition-[background-color,opacity,color] duration-150",
    "disabled:pointer-events-none disabled:opacity-38 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  variants: {
    variant: {
      primary: "bg-primary text-background hover:opacity-85 active:opacity-70",
      secondary: "bg-foreground/8 text-foreground hover:bg-foreground/12 active:bg-foreground/16",
      quiet: "text-foreground/80 hover:bg-foreground/8 hover:text-foreground active:bg-foreground/12",
      danger: "bg-error text-background hover:opacity-85 active:opacity-70",
    },
    // Touch screens get finger-sized targets; the look stays the same (docs/design/components.md).
    size: {
      sm: "h-7 rounded-md px-2.5 text-ui pointer-coarse:h-9 [&_svg]:size-3.5",
      md: "h-8 rounded-md px-3 text-ui pointer-coarse:h-10 [&_svg]:size-4",
      lg: "h-10 rounded-lg px-4 text-sm [&_svg]:size-4.5",
    },
    icon: {
      true: "px-0",
    },
  },
  compoundVariants: [
    { icon: true, size: "sm", class: "w-7 pointer-coarse:w-9" },
    { icon: true, size: "md", class: "w-8 pointer-coarse:w-10" },
    { icon: true, size: "lg", class: "w-10" },
  ],
  defaultVariants: { variant: "secondary", size: "md", icon: false },
});
export type ButtonVariants = VariantProps<typeof button>;

/** Recessed field: sits one shade darker than the surface instead of drawing a border. */
export const field = merge_tv({
  base: [
    "w-full min-w-0 rounded-md text-ui text-foreground",
    // Recessed in dark palettes, raised paper in light ones: a darker tan field on cream reads as a button.
    "bg-[light-dark(var(--background-lightest),var(--background-darker))]",
    "ring-1 ring-inset ring-foreground/30 transition-[box-shadow,background-color] duration-150",
    "placeholder:text-foreground/65 hover:ring-foreground/45",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cottontail",
    "disabled:opacity-38",
  ],
  variants: {
    size: {
      sm: "h-7 px-2 pointer-coarse:h-9",
      md: "h-8 px-2.5 pointer-coarse:h-10",
      lg: "h-10 rounded-lg px-3 text-sm",
    },
  },
  defaultVariants: { size: "md" },
});
export type FieldVariants = VariantProps<typeof field>;

export const badge = merge_tv({
  base: "inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-2xs font-medium [&_svg]:size-3",
  variants: {
    tone: {
      neutral: "bg-foreground/8 text-foreground/80",
      primary: "bg-primary/15 text-primary",
      success: "bg-success/15 text-success",
      warning: "bg-warning/15 text-warning",
      error: "bg-error/15 text-error",
      info: "bg-info/15 text-info",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export type BadgeVariants = VariantProps<typeof badge>;
