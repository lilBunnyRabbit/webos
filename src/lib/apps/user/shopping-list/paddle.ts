import type { Bounds } from "$lib/core/utils/type";

/**
 * PP-OCRv5's detector (DB) post-processing: pixels above `threshold` in its probability map, joined into connected
 * regions, kept when their mean probability passes `box_threshold`, and grown by `unclip` (the model is trained on
 * shrunk text areas). Axis-aligned boxes in map pixels; a list written straight needs no rotated ones.
 */
export function text_boxes(probability: Float32Array, width: number, height: number, threshold = 0.3, box_threshold = 0.6, unclip = 1.5): Bounds[] {
  const seen = new Uint8Array(width * height);
  const boxes: Bounds[] = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || probability[start] <= threshold) continue;
    seen[start] = 1;
    stack.push(start);
    let left = width;
    let top = height;
    let right = 0;
    let bottom = 0;
    let count = 0;
    let sum = 0;
    while (stack.length > 0) {
      const at = stack.pop()!;
      const x = at % width;
      const y = (at - x) / width;
      count++;
      sum += probability[at];
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      const neighbours = [x > 0 ? at - 1 : -1, x < width - 1 ? at + 1 : -1, at - width, at + width];
      for (const next of neighbours) {
        if (next < 0 || next >= width * height || seen[next] || probability[next] <= threshold) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    const box_width = right - left + 1;
    const box_height = bottom - top + 1;
    if (Math.min(box_width, box_height) < 3 || sum / count < box_threshold) continue;
    const grow = (box_width * box_height * unclip) / (2 * (box_width + box_height));
    const x0 = Math.max(0, left - grow);
    const y0 = Math.max(0, top - grow);
    const x1 = Math.min(width, right + 1 + grow);
    const y1 = Math.min(height, bottom + 1 + grow);
    boxes.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  return boxes;
}

/** Greedy CTC decode of the recogniser's `[steps, classes]` scores. Class 0 is the blank; confidence is 0-1. */
export function ctc_decode(scores: Float32Array, steps: number, classes: number, characters: readonly string[]): { text: string; confidence: number } {
  let text = "";
  let previous = 0;
  let sum = 0;
  let count = 0;
  for (let step = 0; step < steps; step++) {
    let best = 0;
    let best_score = -Infinity;
    for (let index = 0; index < classes; index++) {
      const score = scores[step * classes + index];
      if (score > best_score) {
        best_score = score;
        best = index;
      }
    }
    if (best !== 0 && best !== previous) {
      text += characters[best] ?? "";
      sum += best_score;
      count++;
    }
    previous = best;
  }
  return { text, confidence: count ? sum / count : 0 };
}
