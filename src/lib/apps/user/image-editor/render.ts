import { draw_filtered } from "$kit/utils/filter";
import { OperationType, adjustment_steps, operation_size, type Adjustments, type Operation } from "./edit";

type Drawable = CanvasImageSource & { width: number; height: number };

function apply(source: Drawable, operation: Operation): OffscreenCanvas {
  const size = operation_size({ width: source.width, height: source.height }, operation);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  switch (operation.type) {
    case OperationType.CROP:
      context.drawImage(source, operation.x, operation.y, operation.width, operation.height, 0, 0, size.width, size.height);
      break;
    case OperationType.RESIZE:
      context.drawImage(source, 0, 0, size.width, size.height);
      break;
    case OperationType.ROTATE:
      context.translate(size.width / 2, size.height / 2);
      context.rotate((operation.degrees * Math.PI) / 180);
      context.drawImage(source, -source.width / 2, -source.height / 2);
      break;
    case OperationType.FLIP:
      if (operation.horizontal) context.setTransform(-1, 0, 0, 1, size.width, 0);
      else context.setTransform(1, 0, 0, -1, 0, size.height);
      context.drawImage(source, 0, 0);
      break;
  }
  return canvas;
}

export function render_operations(source: Drawable, operations: readonly Operation[]): Drawable {
  return operations.reduce<Drawable>(apply, source);
}

export function render_final(source: Drawable, operations: readonly Operation[], adjustments: Adjustments): OffscreenCanvas {
  const geometry = render_operations(source, operations);
  const canvas = new OffscreenCanvas(geometry.width, geometry.height);
  const context = canvas.getContext("2d")!;
  draw_filtered(context, adjustment_steps(adjustments), (target) => target.drawImage(geometry, 0, 0));
  return canvas;
}

