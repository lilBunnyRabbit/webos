/**
 * Lets the browser do the colour maths: relative colour syntax converts, the computed style reports the result. All
 * probes go in before any is read, so a batch costs one style recalc.
 */
function computed_colors(values: string[]): string[] {
  const probes = values.map((value) => {
    const probe = document.createElement("span");
    probe.style.color = value;
    return probe;
  });
  document.body.append(...probes);
  const computed = probes.map((probe) => getComputedStyle(probe).color);
  for (const probe of probes) probe.remove();
  return computed;
}

/** `<input type="color">` only speaks sRGB hex; out-of-gamut channels are clipped. */
export function to_hex(colors: string[]): string[] {
  return computed_colors(colors.map((color) => `rgb(from ${color} r g b)`)).map((computed) => {
    const channels = computed.match(/color\(srgb ([^ ]+) ([^ ]+) ([^ )]+)/);
    if (!channels) return "#000000";
    return `#${channels
      .slice(1)
      .map((channel) =>
        Math.round(Math.min(1, Math.max(0, Number(channel))) * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")}`;
  });
}

export function to_oklch(hex: string): string {
  return computed_colors([`oklch(from ${hex} l c h)`])[0];
}
