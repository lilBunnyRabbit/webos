export interface CropBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Trims rows and columns from every side while all their pixels have alpha at or below `alpha_percent` (0-100). A fully
 * transparent image keeps its full bounds.
 */
export function find_crop_bounds({ data, width, height }: ImageData, alpha_percent: number): CropBounds {
  const limit = (Math.min(100, Math.max(0, alpha_percent)) * 255) / 100;
  const is_visible = (x: number, y: number) => data[(y * width + x) * 4 + 3] > limit;

  let top = 0;
  find_top: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (is_visible(x, y)) {
        top = y;
        break find_top;
      }
    }
  }

  let right = width;
  find_right: for (let x = width - 1; x >= 0; x--) {
    for (let y = top; y < height; y++) {
      if (is_visible(x, y)) {
        right = x + 1;
        break find_right;
      }
    }
  }

  let bottom = height;
  find_bottom: for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < right; x++) {
      if (is_visible(x, y)) {
        bottom = y + 1;
        break find_bottom;
      }
    }
  }

  let left = 0;
  find_left: for (let x = 0; x < width; x++) {
    for (let y = top; y < bottom; y++) {
      if (is_visible(x, y)) {
        left = x;
        break find_left;
      }
    }
  }

  return { top, right, bottom, left };
}

export function crop(source: CanvasImageSource, { top, right, bottom, left }: CropBounds): OffscreenCanvas {
  const width = right - left;
  const height = bottom - top;
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")!.drawImage(source, left, top, width, height, 0, 0, width, height);
  return canvas;
}
