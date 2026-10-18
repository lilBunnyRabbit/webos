<script lang="ts" module>
  export const SCALE = 5;
  export const RADIUS = 15;

  export function edge_path(from: { x: number; y: number }, to: { x: number; y: number }, curved: boolean, directed: boolean) {
    const [x1, y1, x2, y2] = [from.x * SCALE, from.y * SCALE, to.x * SCALE, to.y * SCALE];
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
    const bend = curved ? 18 : 0;
    const [mx, my] = [(x1 + x2) / 2 - uy * bend, (y1 + y2) / 2 + ux * bend];
    const tail = directed ? RADIUS + 4 : RADIUS;
    const [sx, sy] = [x1 + ux * RADIUS, y1 + uy * RADIUS];
    const [ex, ey] = [x2 - ux * tail, y2 - uy * tail];
    return { d: curved ? `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}` : `M ${sx} ${sy} L ${ex} ${ey}`, label: { x: curved ? (sx + 2 * mx + ex) / 4 : mx, y: curved ? (sy + 2 * my + ey) / 4 : my } };
  }
</script>

<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphView } from "../engine/step";
  import Stage from "./stage.svelte";
  import { TONE_FILL, TONE_STROKE } from "./tones";

  let { view }: { view: GraphView } = $props();

  const positions = $derived(new Map(view.nodes.map((node) => [node.id, node])));
  const pairs = $derived(new Set(view.edges.map((edge) => `${edge.from}>${edge.to}`)));
  const bounds = $derived.by(() => {
    const xs = view.nodes.map((node) => node.x * SCALE);
    const ys = view.nodes.map((node) => node.y * SCALE);
    const pad = RADIUS + 24;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return { x, y, width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad + 10 - y };
  });
  const marker = `arrow-${Math.random().toString(36).slice(2, 8)}`;
</script>

<Stage {bounds} label={view.title ?? "Graph"} class="h-full">
  {#snippet children()}
    <defs>
      <marker id={marker} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" style:fill="context-stroke" />
      </marker>
    </defs>
    {#each view.edges as edge (`${edge.from}>${edge.to}`)}
      {@const from = positions.get(edge.from)}
      {@const to = positions.get(edge.to)}
      {#if from && to}
        {@const curved = view.directed && pairs.has(`${edge.to}>${edge.from}`)}
        {@const path = edge_path(from, to, curved, view.directed)}
        <path
          d={path.d}
          fill="none"
          stroke-width={edge.tone ? 3 : 1.75}
          marker-end={view.directed ? `url(#${marker})` : undefined}
          class={cn("transition-colors duration-150", edge.tone ? TONE_STROKE[edge.tone] : "stroke-foreground/35")}
        />
        {#if edge.label}
          <g transform="translate({path.label.x} {path.label.y})">
            <rect x={-(edge.label.length * 3.6 + 5)} y="-8" width={edge.label.length * 7.2 + 10} height="16" rx="4" class="fill-background stroke-foreground/15" />
            <text text-anchor="middle" dominant-baseline="middle" y="0.5" class={cn("font-mono text-[11px]", edge.tone ? "fill-foreground font-semibold" : "fill-foreground/80")}>{edge.label}</text>
          </g>
        {/if}
      {/if}
    {/each}
    {#each view.nodes as node (node.id)}
      <g transform="translate({node.x * SCALE} {node.y * SCALE})">
        <circle r={RADIUS} stroke-width={node.tone ? 2.5 : 1.25} class={cn("transition-colors duration-150", node.tone ? `${TONE_FILL[node.tone]} ${TONE_STROKE[node.tone]}` : "fill-background-light stroke-foreground/45")} />
        <text text-anchor="middle" dominant-baseline="middle" y="0.5" class={cn("text-[13px] font-semibold", node.tone && node.tone !== "muted" ? "fill-background" : "fill-foreground")}>{node.id}</text>
        {#if node.badge}
          <text y={RADIUS + 12} text-anchor="middle" class="fill-foreground/80 font-mono text-[11px]">{node.badge}</text>
        {/if}
      </g>
    {/each}
  {/snippet}
</Stage>
