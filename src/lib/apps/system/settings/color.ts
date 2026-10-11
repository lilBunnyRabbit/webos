/** Lets the browser do the colour maths: relative colour syntax converts, the computed style reports the result. */
function computed_color(value: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.append(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  return computed;
}

/** `<input type="color">` only speaks sRGB hex; out-of-gamut channels are clipped. */
export function to_hex(color: string): string {
  const channels = computed_color(`rgb(from ${color} r g b)`).match(/color\(srgb ([^ ]+) ([^ ]+) ([^ )]+)/);
  if (!channels) return "#000000";

  return `#${channels
    .slice(1)
    .map((channel) => Math.round(Math.min(1, Math.max(0, Number(channel))) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function to_oklch(hex: string): string {
  return computed_color(`oklch(from ${hex} l c h)`);
}
