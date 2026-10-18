<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { pointers_at, type RingView } from "../engine/step";
  import { TONE_FILL } from "./tones";

  let { view }: { view: RingView } = $props();

  const R_OUT = 92;
  const R_IN = 58;
  const count = $derived(Math.max(1, view.cells.length));

  function point(radius: number, angle: number) {
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  }

  function segment(index: number) {
    const gap = 0.02;
    const start = (index / count) * Math.PI * 2 - Math.PI / 2 + gap;
    const end = ((index + 1) / count) * Math.PI * 2 - Math.PI / 2 - gap;
    const large = end - start > Math.PI ? 1 : 0;
    const [a, b, c, d] = [point(R_OUT, start), point(R_OUT, end), point(R_IN, end), point(R_IN, start)];
    const mid = (start + end) / 2;
    return {
      d: `M ${a.x} ${a.y} A ${R_OUT} ${R_OUT} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${R_IN} ${R_IN} 0 ${large} 0 ${d.x} ${d.y} Z`,
      label: point((R_OUT + R_IN) / 2, mid),
      index: point(R_IN - 10, mid),
      outside: point(R_OUT + 14, mid),
    };
  }

  const dense = $derived(view.cells.length > 16);
  const pointers = $derived([...pointers_at(view.pointers)].map(([index, list]) => ({ index, list })));
</script>

<svg viewBox={dense ? "-150 -140 300 280" : "-130 -125 260 250"} class="mx-auto h-full max-h-[26rem] w-full" role="img" aria-label={view.title ?? "Ring"}>
  {#each view.cells as cell, index (index)}
    {@const part = segment(index)}
    <path d={part.d} stroke-width="1.25" class={cn("transition-colors duration-150", cell.tone ? `${TONE_FILL[cell.tone]} stroke-background` : "fill-background-light stroke-foreground/25")} />
    {#if dense}
      {#if cell.text}
        <text
          x={part.outside.x}
          y={part.outside.y}
          text-anchor={part.outside.x > 4 ? "start" : part.outside.x < -4 ? "end" : "middle"}
          dominant-baseline="middle"
          class={cn("font-mono text-[10px]", cell.tone && cell.tone !== "muted" ? TONE_FILL[cell.tone] : "fill-foreground/80")}>{cell.text}</text
        >
      {/if}
    {:else}
      <text x={part.label.x} y={part.label.y} text-anchor="middle" dominant-baseline="middle" class={cn("font-mono text-[12px]", cell.tone && cell.tone !== "muted" ? "fill-background font-semibold" : "fill-foreground")}>{cell.text}</text>
    {/if}
    {#if count <= 16}
      <text x={part.index.x} y={part.index.y} text-anchor="middle" dominant-baseline="middle" class="fill-foreground/45 font-mono text-[9px]">{index}</text>
    {/if}
  {/each}
  {#each pointers as group (group.index)}
    {@const part = segment(group.index)}
    {#each group.list as pointer, n (pointer.label)}
      <text
        x={part.outside.x}
        y={part.outside.y + n * 12 - ((group.list.length - 1) * 12) / 2}
        text-anchor={part.outside.x > 4 ? "start" : part.outside.x < -4 ? "end" : "middle"}
        dominant-baseline="middle"
        class={cn("font-mono text-[11px] font-semibold", pointer.tone ? TONE_FILL[pointer.tone] : "fill-foreground")}>{pointer.label}</text
      >
    {/each}
  {/each}
</svg>
