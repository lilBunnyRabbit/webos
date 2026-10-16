export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64] as const;
export const MIN_ZOOM = ZOOM_LEVELS[0];
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

export function step_zoom(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_LEVELS.find((level) => level > zoom + 1e-6) ?? MAX_ZOOM;
  return [...ZOOM_LEVELS].reverse().find((level) => level < zoom - 1e-6) ?? MIN_ZOOM;
}

// Whole zooms keep every sprite pixel the same number of screen pixels wide.
export function fit_zoom(width: number, height: number, view_width: number, view_height: number): number {
  const fit = Math.min(view_width / width, view_height / height);
  if (fit >= 1) return Math.min(MAX_ZOOM, Math.floor(fit));
  return [...ZOOM_LEVELS].reverse().find((level) => level <= fit) ?? MIN_ZOOM;
}

export class Viewport {
  zoom = $state(8);
  x = $state(0);
  y = $state(0);
  width = $state(0);
  height = $state(0);
  /** True until the user zooms or pans, so a resized window refits instead of leaving the sprite off-centre. */
  fitted = $state(true);

  fit(sprite_width: number, sprite_height: number): void {
    if (!this.width || !this.height) return;
    this.zoom = fit_zoom(sprite_width, sprite_height, Math.max(16, this.width - 32), Math.max(16, this.height - 32));
    this.x = Math.round((this.width - sprite_width * this.zoom) / 2);
    this.y = Math.round((this.height - sprite_height * this.zoom) / 2);
    this.fitted = true;
  }

  zoom_to(zoom: number, px = this.width / 2, py = this.height / 2): void {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    const ratio = next / this.zoom;
    this.x = Math.round(px - (px - this.x) * ratio);
    this.y = Math.round(py - (py - this.y) * ratio);
    this.zoom = next;
    this.fitted = false;
  }

  step(direction: 1 | -1, px?: number, py?: number): void {
    this.zoom_to(step_zoom(this.zoom, direction), px, py);
  }

  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.fitted = false;
  }

  to_sprite(px: number, py: number): { x: number; y: number } {
    return { x: Math.floor((px - this.x) / this.zoom), y: Math.floor((py - this.y) / this.zoom) };
  }
}
