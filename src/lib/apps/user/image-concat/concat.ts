export const Direction = { COLUMN: "column", ROW: "row" } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const Align = { START: "start", CENTER: "center", END: "end" } as const;
export type Align = (typeof Align)[keyof typeof Align];

export interface ConcatSettings {
  /** Pixels between images. */
  gap: number;
  /** Cross-axis placement of images smaller than the widest (column) or tallest (row). Ignored with `fit`. */
  align: Align;
  /** `#rrggbb`. */
  background: string;
  /** Background opacity, 0-100. 0 leaves the background transparent. */
  alpha: number;
  /** Scale every image to the widest (column) or tallest (row) one, keeping aspect ratio. */
  fit: boolean;
  /** `column` stacks top to bottom, `row` left to right. */
  direction: Direction;
}

type Drawable = CanvasImageSource & { width: number; height: number };

interface Size {
  width: number;
  height: number;
}

function alpha_hex(alpha: number): string {
  return Math.round(255 * (Math.min(100, Math.max(0, alpha)) / 100))
    .toString(16)
    .padStart(2, "0");
}

function layout(images: Drawable[], { gap, fit, direction }: ConcatSettings): { canvas: Size; sizes: Size[] } {
  const column = direction === Direction.COLUMN;
  const cross = Math.max(...images.map((image) => (column ? image.width : image.height)));
  const sizes = images.map((image) => {
    if (!fit) return { width: image.width, height: image.height };
    return column
      ? { width: cross, height: cross * (image.height / image.width) }
      : { width: cross * (image.width / image.height), height: cross };
  });
  const main = sizes.reduce((total, size) => total + (column ? size.height : size.width), 0) + (images.length - 1) * gap;
  return { canvas: column ? { width: cross, height: main } : { width: main, height: cross }, sizes };
}

/** Joins images along one axis. `null` when there is nothing to draw. */
export function concat_images(images: Drawable[], settings: ConcatSettings): OffscreenCanvas | null {
  if (!images.length) return null;

  const { canvas: size, sizes } = layout(images, settings);
  const canvas = new OffscreenCanvas(Math.max(1, Math.floor(size.width)), Math.max(1, Math.floor(size.height)));
  const context = canvas.getContext("2d")!;

  if (settings.alpha > 0) {
    context.fillStyle = `${settings.background}${alpha_hex(settings.alpha)}`;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const column = settings.direction === Direction.COLUMN;
  let offset = 0;
  images.forEach((image, index) => {
    const { width, height } = sizes[index];
    const free = column ? canvas.width - width : canvas.height - height;
    const shift = settings.fit || settings.align === Align.START ? 0 : settings.align === Align.CENTER ? free / 2 : free;
    if (column) context.drawImage(image, shift, offset, width, height);
    else context.drawImage(image, offset, shift, width, height);
    offset += (column ? height : width) + settings.gap;
  });

  return canvas;
}
