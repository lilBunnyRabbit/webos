<svelte:options namespace="svg" />

<script lang="ts">
  interface Props {
    x: number;
    y: number;
    width: number;
    height: number;
    tone?: "primary" | "muted";
    sun?: boolean;
  }

  let { x, y, width, height, tone = "primary", sun = true }: Props = $props();

  const inner = $derived({ x: x + 3, y: y + 3, width: width - 6, height: height - 6 });
  const hills = $derived.by(() => {
    const { x, y, width: w, height: h } = inner;
    return [
      [x, y + h],
      [x, y + h * 0.82],
      [x + w * 0.3, y + h * 0.42],
      [x + w * 0.5, y + h * 0.66],
      [x + w * 0.68, y + h * 0.5],
      [x + w, y + h * 0.8],
      [x + w, y + h],
    ]
      .map(([px, py]) => `${px},${py}`)
      .join(" ");
  });
</script>

<rect {x} {y} {width} {height} rx="3" class="fill-background-light stroke-foreground/20" />
{#if sun}
  <circle cx={inner.x + inner.width * 0.76} cy={inner.y + inner.height * 0.28} r={Math.min(inner.width, inner.height) * 0.12} class="fill-foreground/35" />
{/if}
<polygon points={hills} class={tone === "primary" ? "fill-primary" : "fill-primary/45"} />
