<script lang="ts">
  import kernel from "$lib/core/api";
  import { Badge } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { is_swapped, service_graph } from "../graph";
  import { live_services, service_page } from "../live";
  import { has_page } from "../pages";

  interface Props {
    onopen: (id: string) => void;
    compact?: boolean;
  }

  let { onopen, compact = false }: Props = $props();

  const NODE_W = 128;
  const NODE_H = 36;
  const GAP_X = 52;
  const GAP_Y = 12;
  const PAD = 8;

  const graph = $derived(service_graph(live_services()));
  const width = $derived(graph.layers * (NODE_W + GAP_X) - GAP_X + PAD * 2);
  const height = $derived(graph.rows * (NODE_H + GAP_Y) - GAP_Y + PAD * 2);
  const swapped = $derived(graph.nodes.filter(is_swapped));

  let hovered = $state<string | null>(null);
  const linked = $derived.by(() => {
    if (!hovered) return null;
    const node = graph.nodes.find((item) => item.key === hovered);
    return new Set([hovered, ...(node?.dependencies ?? []), ...(node?.dependents ?? [])]);
  });

  const x = (layer: number) => PAD + layer * (NODE_W + GAP_X);
  const y = (row: number) => PAD + row * (NODE_H + GAP_Y);
  const position = $derived(new Map(graph.nodes.map((node) => [node.key, { x: x(node.layer), y: y(node.row) }])));

  function edge_path(from: string, to: string): string {
    const a = position.get(from)!;
    const b = position.get(to)!;
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const bend = Math.max(24, (x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
  }

  function open(key: string) {
    if (has_page(service_page(key))) onopen(service_page(key));
  }
</script>

<figure class="flex flex-col gap-3">
  {#if !compact}
    <figcaption class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-ui text-foreground/80">
      <span>
        <span class="font-mono tabular-nums">{graph.nodes.length}</span> services running on this device, read from the live kernel. Each one starts
        after everything to its left.
      </span>
      <span class="flex flex-wrap items-center gap-1.5">
        <Badge tone="info">{kernel.platform}</Badge>
        <Badge tone="info">{kernel.mode}</Badge>
      </span>
    </figcaption>
  {/if}
  <div class="overflow-x-auto rounded-xl bg-background-light p-2 ring-1 ring-foreground/8">
    <svg
      viewBox="0 0 {width} {height}"
      style:min-width="{Math.min(width, 600)}px"
      class="block h-auto w-full"
      role="group"
      aria-label="Service dependency graph"
    >
      <g fill="none" stroke-width="1.25">
        {#each graph.edges as edge (edge.from + edge.to)}
          {@const lit = linked !== null && edge.from === hovered ? "out" : linked !== null && edge.to === hovered ? "in" : null}
          <path
            d={edge_path(edge.from, edge.to)}
            class={cn(
              "transition-[stroke,opacity] duration-150",
              lit ? "stroke-primary" : "stroke-foreground/20",
              linked !== null && !lit && "opacity-30"
            )}
          />
        {/each}
      </g>
      {#each graph.nodes as node (node.key)}
        {@const at = position.get(node.key)!}
        {@const documented = has_page(service_page(node.key))}
        {@const dim = linked !== null && !linked.has(node.key)}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <g
          transform="translate({at.x} {at.y})"
          class={cn("transition-opacity duration-150 outline-none", documented && "cursor-pointer", dim && "opacity-35")}
          role={documented ? "link" : undefined}
          tabindex={documented ? 0 : undefined}
          aria-label={documented ? `${node.key}: ${node.name}, starts ${node.order}` : undefined}
          onpointerenter={() => (hovered = node.key)}
          onpointerleave={() => (hovered = null)}
          onfocus={() => (hovered = node.key)}
          onblur={() => (hovered = null)}
          onclick={() => open(node.key)}
          onkeydown={(event) => event.key === "Enter" && open(node.key)}
        >
          <rect
            width={NODE_W}
            height={NODE_H}
            rx="8"
            class={cn(
              "fill-background stroke-1",
              hovered === node.key ? "stroke-primary" : is_swapped(node) ? "stroke-secondary/70" : "stroke-foreground/15",
              "[g:focus-visible>&]:stroke-cottontail [g:focus-visible>&]:stroke-2"
            )}
          />
          <text x="10" y="15" class="fill-foreground text-[11px] font-semibold">{node.key}</text>
          <text x="10" y="28" class="fill-foreground/65 font-mono text-[8.5px]">{node.name}</text>
          <text x={NODE_W - 8} y="15" text-anchor="end" class="fill-foreground/50 font-mono text-[9px] tabular-nums">{node.order}</text>
        </g>
      {/each}
    </svg>
  </div>
  {#if !compact && swapped.length > 0}
    <p class="text-2xs text-foreground/80">
      Swapped on this device:
      {#each swapped as node, index (node.key)}{index > 0 ? ", " : ""}<span class="font-mono">{node.key}</span> runs
        <span class="font-mono">{node.name}</span>{/each}. Outlined in secondary above.
    </p>
  {/if}
</figure>
