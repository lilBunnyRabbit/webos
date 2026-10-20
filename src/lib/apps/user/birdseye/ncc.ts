export interface Gray {
  width: number;
  height: number;
  data: Float32Array;
}

export interface Match {
  x: number;
  y: number;
  score: number;
}

export function gray(width: number, height: number, data = new Float32Array(width * height)): Gray {
  return { width, height, data };
}

export function to_gray(rgba: ArrayLike<number>, width: number, height: number): Gray {
  const out = gray(width, height);
  for (let i = 0, p = 0; i < out.data.length; i++, p += 4)
    out.data[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return out;
}

export function downsample(image: Gray): Gray {
  const width = Math.max(1, image.width >> 1);
  const height = Math.max(1, image.height >> 1);
  const out = gray(width, height);
  const source = image.data;
  const stride = image.width;
  for (let y = 0; y < height; y++) {
    const row = y * 2 * stride;
    const below = Math.min(y * 2 + 1, image.height - 1) * stride;
    for (let x = 0; x < width; x++) {
      const left = x * 2;
      const right = Math.min(left + 1, image.width - 1);
      out.data[y * width + x] =
        (source[row + left] + source[row + right] + source[below + left] + source[below + right]) / 4;
    }
  }
  return out;
}

export function sample_patch(
  image: Gray,
  cx: number,
  cy: number,
  width: number,
  height: number,
  out_width: number,
  out_height: number
): Gray {
  const out = gray(out_width, out_height);
  const step_x = width / out_width;
  const step_y = height / out_height;
  const left = cx - width / 2;
  const top = cy - height / 2;
  const max_x = image.width - 1;
  const max_y = image.height - 1;
  for (let y = 0; y < out_height; y++) {
    const sy = Math.min(max_y, Math.max(0, top + (y + 0.5) * step_y - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(max_y, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < out_width; x++) {
      const sx = Math.min(max_x, Math.max(0, left + (x + 0.5) * step_x - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(max_x, x0 + 1);
      const fx = sx - x0;
      const a = image.data[y0 * image.width + x0];
      const b = image.data[y0 * image.width + x1];
      const c = image.data[y1 * image.width + x0];
      const d = image.data[y1 * image.width + x1];
      out.data[y * out_width + x] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
  }
  return out;
}

// Mean removed up front, so the cross term of NCC is a plain dot product against the window.
export interface Template {
  width: number;
  height: number;
  zero_mean: Float32Array;
  norm: number;
}

export function prepare_template(image: Gray): Template {
  const n = image.data.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += image.data[i];
  const mean = sum / n;
  const zero_mean = new Float32Array(n);
  let squares = 0;
  for (let i = 0; i < n; i++) {
    const value = image.data[i] - mean;
    zero_mean[i] = value;
    squares += value * value;
  }
  return { width: image.width, height: image.height, zero_mean, norm: Math.sqrt(squares) };
}

export interface Integral {
  stride: number;
  sum: Float64Array;
  squares: Float64Array;
}

export function integral(image: Gray): Integral {
  const stride = image.width + 1;
  const sum = new Float64Array(stride * (image.height + 1));
  const squares = new Float64Array(stride * (image.height + 1));
  for (let y = 0; y < image.height; y++) {
    let row_sum = 0;
    let row_squares = 0;
    for (let x = 0; x < image.width; x++) {
      const value = image.data[y * image.width + x];
      row_sum += value;
      row_squares += value * value;
      const at = (y + 1) * stride + x + 1;
      sum[at] = sum[at - stride] + row_sum;
      squares[at] = squares[at - stride] + row_squares;
    }
  }
  return { stride, sum, squares };
}

function box_sum(table: Float64Array, stride: number, x: number, y: number, width: number, height: number): number {
  const top = y * stride;
  const bottom = (y + height) * stride;
  return table[bottom + x + width] - table[bottom + x] - table[top + x + width] + table[top + x];
}

export function ncc_at(image: Gray, table: Integral, template: Template, x: number, y: number): number {
  const { width, height, zero_mean, norm } = template;
  if (norm === 0) return 0;
  const n = width * height;
  const sum = box_sum(table.sum, table.stride, x, y, width, height);
  const variance = box_sum(table.squares, table.stride, x, y, width, height) - (sum * sum) / n;
  if (variance <= 1e-6) return 0;
  let cross = 0;
  const data = image.data;
  for (let row = 0; row < height; row++) {
    const offset = (y + row) * image.width + x;
    const t = row * width;
    for (let col = 0; col < width; col++) cross += data[offset + col] * zero_mean[t + col];
  }
  return cross / (Math.sqrt(variance) * norm);
}

export function parabolic_peak(before: number, at: number, after: number): number {
  const curve = before - 2 * at + after;
  if (curve >= 0) return 0;
  return Math.max(-0.5, Math.min(0.5, (before - after) / (2 * curve))) + 0;
}

export function best_match(
  image: Gray,
  table: Integral,
  template: Template,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Match | null {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(image.width - template.width, Math.ceil(x1));
  const bottom = Math.min(image.height - template.height, Math.ceil(y1));
  if (right < left || bottom < top) return null;
  const columns = right - left + 1;
  const scores = new Float32Array(columns * (bottom - top + 1));
  let best = -Infinity;
  let best_x = left;
  let best_y = top;
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const score = ncc_at(image, table, template, x, y);
      scores[(y - top) * columns + x - left] = score;
      if (score > best) {
        best = score;
        best_x = x;
        best_y = y;
      }
    }
  const score_at = (x: number, y: number) => scores[(y - top) * columns + x - left];
  const dx =
    best_x > left && best_x < right
      ? parabolic_peak(score_at(best_x - 1, best_y), best, score_at(best_x + 1, best_y))
      : 0;
  const dy =
    best_y > top && best_y < bottom
      ? parabolic_peak(score_at(best_x, best_y - 1), best, score_at(best_x, best_y + 1))
      : 0;
  return { x: best_x + dx, y: best_y + dy, score: best };
}
