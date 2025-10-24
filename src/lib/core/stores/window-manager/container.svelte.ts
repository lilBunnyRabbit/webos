import type { Bounds } from "./window-manager.type";

let bounds = $state.raw<Bounds>({
  x: 0,
  y: 0,
  width: window.innerWidth,
  height: window.innerHeight,
});

export function getBounds() {
  return bounds;
}

export function setBounds(newBounds: Bounds) {
  bounds = newBounds;
}