export type Rgba = readonly [number, number, number, number];

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function channel_tolerance(percent: number): number {
  return Math.round((Math.min(100, Math.max(0, percent)) / 100) * 255);
}

// Scanline, not per-pixel recursion: the stack stays small on large canvases.
export function flood_fill(pixels: Pixels, x: number, y: number, color: Rgba, tolerance = 0): number {
  const { data, width, height } = pixels;
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;

  const start = (y * width + x) * 4;
  const target: Rgba = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  const limit = channel_tolerance(tolerance);
  const visited = new Uint8Array(width * height);

  const matches = (index: number) => {
    if (visited[index]) return false;
    const offset = index * 4;
    return (
      Math.abs(data[offset] - target[0]) <= limit &&
      Math.abs(data[offset + 1] - target[1]) <= limit &&
      Math.abs(data[offset + 2] - target[2]) <= limit &&
      Math.abs(data[offset + 3] - target[3]) <= limit
    );
  };

  let painted = 0;
  const stack: number[] = [x, y];

  while (stack.length) {
    const seed_y = stack.pop()!;
    const seed_x = stack.pop()!;
    const row = seed_y * width;
    if (!matches(row + seed_x)) continue;

    let left = seed_x;
    while (left > 0 && matches(row + left - 1)) left--;
    let right = seed_x;
    while (right < width - 1 && matches(row + right + 1)) right++;

    for (let column = left; column <= right; column++) {
      const index = row + column;
      visited[index] = 1;
      data.set(color, index * 4);
      painted++;
    }

    for (const next_y of [seed_y - 1, seed_y + 1]) {
      if (next_y < 0 || next_y >= height) continue;
      const next_row = next_y * width;
      let in_run = false;
      for (let column = left; column <= right; column++) {
        const open = matches(next_row + column);
        if (open && !in_run) stack.push(column, next_y);
        in_run = open;
      }
    }
  }

  return painted;
}
