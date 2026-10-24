export type Rgb = readonly [number, number, number];

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export function relative_luminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function wcag_ratio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relative_luminance(a), relative_luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
