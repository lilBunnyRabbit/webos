/**
 * The exit button's box as the window element's `--immersive-inset-top` / `--immersive-inset-right` (ADR-101): its
 * offset (0.5rem) plus its size (2rem, 2.5rem on touch). Always set, so an app's `calc()` reads 0 when not immersive.
 */
export const immersive_insets = (on: boolean): string =>
  on
    ? "[--immersive-inset-top:2.5rem] [--immersive-inset-right:2.5rem] pointer-coarse:[--immersive-inset-top:3rem] pointer-coarse:[--immersive-inset-right:3rem]"
    : "[--immersive-inset-top:0px] [--immersive-inset-right:0px]";
