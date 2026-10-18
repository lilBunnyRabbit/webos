<script lang="ts">
  import { Button, Input } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { Trash as TrashIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import type { GraphInput } from "./engine/graph-input";
  import type { Point } from "./engine/step";
  import { edge_path, RADIUS, SCALE } from "./views/graph-view.svelte";
  import Stage from "./views/stage.svelte";

  let { value, onchange, validate }: { value: unknown; onchange: (value: unknown) => void; validate: (value: unknown) => string | null } = $props();

  const { window: win } = get_app_context();
  let graph = $state<GraphInput>(untrack(() => structuredClone(value as GraphInput)));
  let selected = $state<{ kind: "node"; id: string } | { kind: "edge"; index: number } | null>(null);
  let error = $state<string | null>(null);

  const positions = $derived(new Map(graph.nodes.map((node) => [node.id, node])));
  const weighted = $derived(graph.edges.some((edge) => edge.w !== 1) || (value as GraphInput).edges.some((edge) => edge.w !== 1));
  const bounds = { x: -40, y: -40, width: 100 * SCALE + 80, height: 100 * SCALE + 80 };
  const selected_edge = $derived(selected?.kind === "edge" ? graph.edges[selected.index] : null);

  function commit(next: GraphInput) {
    graph = next;
    error = validate(next);
    if (!error) onchange(structuredClone($state.snapshot(next)));
  }

  function next_id(): string {
    const used = new Set(graph.nodes.map((node) => node.id));
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!used.has(letter)) return letter;
    for (let n = 1; ; n++) if (!used.has(`N${n}`)) return `N${n}`;
  }

  const clamp = (point: Point) => ({ x: Math.round(Math.min(100, Math.max(0, point.x / SCALE))), y: Math.round(Math.min(100, Math.max(0, point.y / SCALE))) });

  let drag: { id: string; from: Point; moved: boolean } | null = null;
  let down_at: Point | null = null;

  function node_down(event: PointerEvent, id: string) {
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag = { id, from: { x: event.clientX, y: event.clientY }, moved: false };
  }

  function node_move(event: PointerEvent, to_point: (event: PointerEvent) => Point) {
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.from.x, event.clientY - drag.from.y) > 4) drag.moved = true;
    if (!drag.moved) return;
    const at = clamp(to_point(event));
    const id = drag.id;
    graph = { ...graph, nodes: graph.nodes.map((node) => (node.id === id ? { ...node, ...at } : node)) };
  }

  function node_up(id: string) {
    const was = drag;
    drag = null;
    if (!was) return;
    if (was.moved) return commit(graph);
    if (selected?.kind === "node" && selected.id !== id) {
      const from = selected.id;
      const exists = graph.edges.findIndex((edge) => (edge.from === from && edge.to === id) || (!graph.directed && edge.from === id && edge.to === from));
      selected = null;
      if (exists >= 0) selected = { kind: "edge", index: exists };
      else {
        commit({ ...graph, edges: [...graph.edges, { from, to: id, w: 1 }] });
        selected = { kind: "edge", index: graph.edges.length - 1 };
      }
      return;
    }
    selected = selected?.kind === "node" && selected.id === id ? null : { kind: "node", id };
  }

  function background_down(event: PointerEvent) {
    down_at = { x: event.clientX, y: event.clientY };
  }

  function background_click(event: MouseEvent, to_point: (event: MouseEvent) => Point) {
    if (!down_at || Math.hypot(event.clientX - down_at.x, event.clientY - down_at.y) > 4) return;
    down_at = null;
    if (selected) {
      selected = null;
      return;
    }
    const id = next_id();
    commit({ ...graph, nodes: [...graph.nodes, { id, ...clamp(to_point(event)) }] });
    selected = { kind: "node", id };
  }

  function remove() {
    if (!selected) return;
    if (selected.kind === "node") {
      const id = selected.id;
      commit({
        ...graph,
        nodes: graph.nodes.filter((node) => node.id !== id),
        edges: graph.edges.filter((edge) => edge.from !== id && edge.to !== id),
        start: graph.start === id ? undefined : graph.start,
        goal: graph.goal === id ? undefined : graph.goal,
      });
    } else {
      const index = selected.index;
      commit({ ...graph, edges: graph.edges.filter((_, i) => i !== index) });
    }
    selected = null;
  }

  function set_weight(text: string) {
    if (selected?.kind !== "edge") return;
    const w = Number(text);
    if (!Number.isFinite(w)) return;
    const index = selected.index;
    commit({ ...graph, edges: graph.edges.map((edge, i) => (i === index ? { ...edge, w } : edge)) });
  }

  function set_role(role: "start" | "goal") {
    if (selected?.kind !== "node") return;
    commit({ ...graph, [role]: selected.id });
  }

  function onkeydown(event: KeyboardEvent) {
    if (!win.is_focused) return;
    if ((event.key === "Delete" || event.key === "Backspace") && selected && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      remove();
    }
  }
</script>

<svelte:document {onkeydown} />

<div class="flex h-full min-h-0 flex-col gap-2">
  <div class="flex min-h-9 flex-wrap items-center gap-1.5 text-ui text-foreground/80">
    {#if selected?.kind === "node"}
      <span class="font-medium text-foreground">Node {selected.id}</span>
      {#if "start" in graph || graph.start !== undefined}
        <Button size="sm" variant={graph.start === selected.id ? "primary" : "secondary"} onclick={() => set_role("start")}>Start</Button>
      {/if}
      {#if "goal" in graph || graph.goal !== undefined}
        <Button size="sm" variant={graph.goal === selected.id ? "primary" : "secondary"} onclick={() => set_role("goal")}>Goal</Button>
      {/if}
      <span class="hidden @lg:inline">Tap another node to connect them.</span>
      <Button size="sm" variant="quiet" class="ml-auto" onclick={remove}><TrashIcon weight="bold" /> Delete</Button>
    {:else if selected_edge}
      <span class="font-medium text-foreground">Edge {selected_edge.from}{graph.directed ? "→" : "–"}{selected_edge.to}</span>
      <label class="flex items-center gap-1.5">
        Weight
        <Input size="sm" type="number" class="w-20 font-mono" value={selected_edge.w} onchange={(event) => set_weight(event.currentTarget.value)} />
      </label>
      <Button size="sm" variant="quiet" class="ml-auto" onclick={remove}><TrashIcon weight="bold" /> Delete</Button>
    {:else}
      <span>Tap empty space to add a node, tap two nodes to connect them, drag to move.</span>
    {/if}
  </div>
  {#if error}<p class="text-2xs text-error">{error}</p>{/if}
  <div class="min-h-0 flex-1 rounded-lg bg-background ring-1 ring-foreground/10">
    <Stage {bounds} label="Graph editor" class="h-full" pannable={(event) => !(event.target as Element).closest("[data-node]")}>
      {#snippet children(to_point)}
        <rect
          x="-5000"
          y="-5000"
          width="10000"
          height="10000"
          class="fill-transparent"
          role="presentation"
          onpointerdown={background_down}
          onclick={(event) => background_click(event, to_point)}
        />
        <rect x="0" y="0" width={100 * SCALE} height={100 * SCALE} rx="10" class="pointer-events-none fill-background-light/40 stroke-foreground/10" stroke-dasharray="6 6" />
        {#each graph.edges as edge, index (index)}
          {@const from = positions.get(edge.from)}
          {@const to = positions.get(edge.to)}
          {#if from && to}
            {@const path = edge_path(from, to, false, graph.directed)}
            {@const active = selected?.kind === "edge" && selected.index === index}
            <g role="button" tabindex="-1" aria-label="Edge {edge.from} to {edge.to}" data-node onclick={() => (selected = { kind: "edge", index })} onkeydown={() => {}}>
              <path d={path.d} fill="none" stroke-width="14" class="stroke-transparent" />
              <path d={path.d} fill="none" stroke-width={active ? 3 : 1.75} class={active ? "stroke-primary" : "stroke-foreground/45"} />
              {#if weighted || edge.w !== 1}
                <text x={path.label.x} y={path.label.y - 8} text-anchor="middle" class="fill-foreground/80 font-mono text-[11px]">{edge.w}</text>
              {/if}
            </g>
          {/if}
        {/each}
        {#each graph.nodes as node (node.id)}
          {@const active = selected?.kind === "node" && selected.id === node.id}
          <g
            transform="translate({node.x * SCALE} {node.y * SCALE})"
            role="button"
            tabindex="-1"
            aria-label="Node {node.id}"
            data-node
            class="cursor-grab"
            onpointerdown={(event) => node_down(event, node.id)}
            onpointermove={(event) => node_move(event, to_point)}
            onpointerup={() => node_up(node.id)}
          >
            <circle r={RADIUS + 6} class="fill-transparent" />
            <circle r={RADIUS} stroke-width={active ? 3 : 1.5} class={cn(active ? "fill-primary/15 stroke-primary" : "fill-background-light stroke-foreground/50")} />
            <text text-anchor="middle" dominant-baseline="middle" y="0.5" class="fill-foreground text-[13px] font-semibold">{node.id}</text>
            {#if graph.start === node.id || graph.goal === node.id}
              <text y={RADIUS + 12} text-anchor="middle" class="fill-primary text-[10px] font-semibold uppercase">{graph.start === node.id ? "start" : "goal"}</text>
            {/if}
          </g>
        {/each}
      {/snippet}
    </Stage>
  </div>
</div>
