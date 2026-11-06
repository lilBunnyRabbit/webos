<svelte:options namespace="svg" />

<script lang="ts">
  interface Props {
    x: number;
    y: number;
    width: number;
    height: number;
    lines?: number;
    label?: string;
    accent?: boolean;
  }

  let { x, y, width, height, lines = 4, label, accent = false }: Props = $props();

  const fold = $derived(Math.min(width, height) * 0.22);
  const outline = $derived(`M${x + 3} ${y}H${x + width - fold}L${x + width} ${y + fold}V${y + height - 3}a3 3 0 0 1 -3 3H${x + 3}a3 3 0 0 1 -3 -3V${y + 3}a3 3 0 0 1 3 -3Z`);
  const pad = $derived(Math.max(4, width * 0.16));
  const rows = $derived(
    Array.from({ length: lines }, (_, index) => ({
      y: y + pad + (label ? height * 0.34 : 0) + index * 5,
      width: (width - pad * 2) * (index === lines - 1 ? 0.6 : 1),
    })).filter((row) => row.y + 2 < y + height - 3)
  );
</script>

<path d={outline} class="fill-background-light stroke-foreground/20" />
<path d="M{x + width - fold} {y}V{y + fold}H{x + width}" class="fill-none stroke-foreground/20" />
{#if label}
  <text
    x={x + width / 2}
    y={y + pad + height * 0.14}
    text-anchor="middle"
    dominant-baseline="middle"
    font-size={Math.min(14, width * 0.32)}
    class={accent ? "fill-primary font-mono font-semibold" : "fill-foreground/80 font-mono font-semibold"}>{label}</text
  >
{/if}
{#each rows as row, index (index)}
  <rect x={x + pad} y={row.y} width={row.width} height="2" rx="1" class={accent && index === 0 && !label ? "fill-primary" : "fill-foreground/25"} />
{/each}
