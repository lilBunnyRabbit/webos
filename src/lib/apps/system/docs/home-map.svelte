<script lang="ts">
  import kernel, { type AppsService } from "$lib/core/api";
  import { IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { fit_view, pinch_view, zoom_view, type Point, type View } from "$kit/utils/view";
  import { ArrowsOut as ArrowsOutIcon, Minus as MinusIcon, Plus as PlusIcon } from "phosphor-svelte";
  import type { Attachment } from "svelte/attachments";
  import type { Library } from "./library";
  import { live_services } from "./live";
  import { world_map, type MapNode } from "./map-layout";
  import { slugify } from "./outline";
  import { has_page, load_page, PAGE_IDS } from "./pages";
  import { opfs_area, parse_storage_map } from "./persistence";

  interface Props {
    library: Library | null;
    onopen: (id: string | null, hash?: string) => void;
  }

  let { library, onopen }: Props = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  void kernel.service<AppsService>("apps").catalogue();
  let stores = $state<{ label: string; detail: string; hash: string }[]>([]);

  load_page("system/persistence")
    .then(parse_storage_map)
    .then((map) => {
      const count = (test: (store: string, key: string) => boolean) => map.entries.filter((entry) => test(entry.store, entry.key)).length;
      const opfs = ["/etc", "/var/lib", "/home", "/tmp"].map((area) => ({
        label: area,
        detail: `OPFS · ${count((store, key) => store === "OPFS" && opfs_area(key) === area)} entries`,
        hash: "storage-map",
      }));
      const others = ["localStorage", "IndexedDB", "Cache Storage"].map((name) => ({
        label: name,
        detail: `${count((store) => store.startsWith(name)) + (name === "localStorage" ? map.app_keys.length : 0)} entries`,
        hash: "storage-map",
      }));
      stores = [...opfs, ...others];
    })
    .catch(() => (stores = []));

  const title_of = (id: string) => library?.pages.get(id)?.title ?? id.split("/").at(-1)!.replaceAll("-", " ");

  const map = $derived(
    world_map({
      services: live_services(),
      shell: PAGE_IDS.filter((id) => id.startsWith("system/shell/")).map((id) => [id, title_of(id)] as [string, string]),
      design: PAGE_IDS.filter((id) => id.startsWith("design/") && !id.endsWith("README")).map((id) => [id, title_of(id)] as [string, string]),
      system_apps: [...apps.list()]
        .map(([, manifest]) => manifest)
        .filter((manifest) => manifest.system)
        .slice().sort((a, b) => a.name.localeCompare(b.name))
        .map((manifest) => ({ id: manifest.id, name: manifest.name, slug: slugify(manifest.name) })),
      user_apps: [...apps.list()].filter(([, manifest]) => !manifest.system).length,
      stores,
      adrs: {
        total: library?.adrs.length ?? 0,
        latest: (library?.adrs ?? [])
          .slice().sort((a, b) => b.number - a.number)
          .slice(0, 3)
          .map((entry) => ({ id: entry.id, label: `${String(entry.number).padStart(3, "0")} ${entry.title}` })),
      },
    })
  );

  const node_at = $derived(new Map(map.nodes.map((node) => [node.key, node])));
  const cluster_at = $derived(new Map(map.clusters.map((cluster) => [`cluster:${cluster.key}`, cluster])));

  function center(key: string): Point | null {
    const box = node_at.get(key) ?? cluster_at.get(key);
    return box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : null;
  }

  let width = $state(0);
  let height = $state(0);
  let view = $state<View>({ scale: 1, offset_x: 0, offset_y: 0 });
  let fitted = $state(false);
  let surface: HTMLElement | null = $state(null);

  function fit() {
    if (width > 0 && height > 0) view = fit_view(map.width, map.height, width, height, 16);
  }

  // The whole map in a phone-sized view is unreadable, so a small view starts zoomed in on the kernel instead.
  function start() {
    const whole = fit_view(map.width, map.height, width, height, 16);
    const kernel_box = cluster_at.get("cluster:kernel");
    if (whole.scale >= 0.55 || !kernel_box) {
      view = whole;
      return;
    }
    const scale = 0.55;
    view = { scale, offset_x: width / 2 - (kernel_box.x + kernel_box.w / 2) * scale, offset_y: height / 2 - (kernel_box.y + kernel_box.h / 2) * scale };
  }

  $effect(() => {
    if (!fitted && width > 0 && height > 0) {
      start();
      fitted = true;
    }
  });

  function local(event: { clientX: number; clientY: number }): Point {
    const rect = surface!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function zoom_by(factor: number, at?: Point) {
    view = zoom_view(view, factor, at?.x ?? width / 2, at?.y ?? height / 2);
  }

  const pointers = new Map<number, Point>();
  type Gesture =
    | { kind: "press"; start: Point; view: View }
    | { kind: "pan"; start: Point; view: View }
    | { kind: "pinch"; mid: Point; distance: number; view: View };
  let gesture: Gesture | null = null;
  let panned = false;

  const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

  function capture(id: number) {
    try {
      if (!surface!.hasPointerCapture(id)) surface!.setPointerCapture(id);
    } catch {
      // A pointer that already ended can't be captured; the gesture goes on without it.
    }
  }

  function onpointerdown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, local(event));
    if (pointers.size === 1) {
      panned = false;
      gesture = { kind: "press", start: local(event), view };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { kind: "pinch", mid: midpoint(a, b), distance: distance(a, b), view };
      panned = true;
      for (const id of pointers.keys()) capture(id);
    }
  }

  function onpointermove(event: PointerEvent) {
    if (!pointers.has(event.pointerId) || !gesture) return;
    const point = local(event);
    pointers.set(event.pointerId, point);
    if (gesture.kind === "pinch" && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      view = pinch_view(gesture.view, gesture.mid, gesture.distance, midpoint(a, b), distance(a, b));
    } else if (gesture.kind === "press" && distance(point, gesture.start) > 4) {
      gesture = { ...gesture, kind: "pan" };
      panned = true;
      capture(event.pointerId);
    }
    if (gesture.kind === "pan") {
      view = { ...gesture.view, offset_x: gesture.view.offset_x + point.x - gesture.start.x, offset_y: gesture.view.offset_y + point.y - gesture.start.y };
    }
  }

  function release(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pointers.size === 0) gesture = null;
    else if (gesture?.kind === "pinch") {
      const [rest] = [...pointers.values()];
      gesture = { kind: "pan", start: rest, view };
    }
  }

  function onpointerup(event: PointerEvent) {
    if (!surface?.hasPointerCapture(event.pointerId)) release(event);
  }

  const wheel: Attachment<HTMLElement> = (element) => {
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) < 1) zoom_by(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), local(event));
      else view = { ...view, offset_x: view.offset_x - event.deltaX, offset_y: view.offset_y - event.deltaY };
    };
    element.addEventListener("wheel", handler, { passive: false });
    return () => element.removeEventListener("wheel", handler);
  };

  function activate(node: MapNode) {
    if (panned) return;
    if (has_page(node.page)) onopen(node.page, node.hash);
  }

  function onkeydown(event: KeyboardEvent) {
    const step = 60;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (event.target !== surface) return;
    if (event.key in moves) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      view = { ...view, offset_x: view.offset_x + dx, offset_y: view.offset_y + dy };
    } else if (event.key === "+" || event.key === "=") zoom_by(1.25);
    else if (event.key === "-") zoom_by(0.8);
    else if (event.key === "0") fit();
  }

  const TONES = {
    primary: "fill-primary/12 stroke-primary/50",
    secondary: "fill-secondary/12 stroke-secondary/50",
  };
</script>

<div class="relative h-full min-h-96 overflow-hidden bg-background-darker">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={surface}
    bind:clientWidth={width}
    bind:clientHeight={height}
    class="absolute inset-0 cursor-grab touch-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cottontail active:cursor-grabbing"
    role="application"
    aria-label="Map of WebOS. Drag or use the arrow keys to move, scroll, pinch or plus and minus to zoom, 0 to fit."
    tabindex="0"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={release}
    onlostpointercapture={release}
    {onkeydown}
    {@attach wheel}
  >
    <svg class="block size-full">
      <g transform="translate({view.offset_x} {view.offset_y}) scale({view.scale})">
        {#each map.clusters as cluster (cluster.key)}
          <g>
            <rect x={cluster.x} y={cluster.y} width={cluster.w} height={cluster.h} rx="18" class="fill-background stroke-foreground/10" stroke-width="1" />
            <text x={cluster.x + 20} y={cluster.y + 24} class="fill-foreground/65 text-[12px] font-semibold tracking-wide uppercase">{cluster.label}</text>
          </g>
        {/each}
        <g fill="none">
          {#each map.links as link, index (index)}
            {@const a = center(link.from)}
            {@const b = center(link.to)}
            {#if a && b}
              {#if link.label}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="stroke-primary/45" stroke-width="2" stroke-dasharray="6 6" />
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} text-anchor="middle" class="fill-primary font-mono text-[11px]">{link.label}</text>
              {:else}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="stroke-foreground/12" stroke-width="1" />
              {/if}
            {/if}
          {/each}
        </g>
        {#each map.nodes as node (node.key)}
          <g
            transform="translate({node.x} {node.y})"
            class={cn("cursor-pointer outline-none [&:focus-visible>rect]:stroke-cottontail [&:focus-visible>rect]:stroke-2 [&:hover>rect]:stroke-primary")}
            role="link"
            tabindex="0"
            aria-label="{node.label}{node.detail ? `, ${node.detail}` : ''}"
            onclick={() => activate(node)}
            onkeydown={(event) => event.key === "Enter" && activate(node)}
          >
            <rect width={node.w} height={node.h} rx="9" class={cn("transition-colors", node.tone ? TONES[node.tone] : "fill-background-light stroke-foreground/15")} stroke-width="1" />
            <text x="10" y={node.detail ? 17 : 25} class="fill-foreground text-[12px] font-semibold">{node.label.length > 19 ? `${node.label.slice(0, 18)}…` : node.label}</text>
            {#if node.detail}<text x="10" y="31" class="fill-foreground/65 font-mono text-[9px]">{node.detail.length > 24 ? `${node.detail.slice(0, 23)}…` : node.detail}</text>{/if}
          </g>
        {/each}
      </g>
    </svg>
  </div>
  <p class="pointer-events-none absolute top-3 left-3 rounded-md bg-background-light/85 px-2 py-1 text-2xs text-foreground/80 backdrop-blur-sm">
    Drag to move, pinch or scroll to zoom. Every box opens its page.
  </p>
  <div class="absolute right-3 bottom-3 flex gap-1 rounded-lg bg-background-light/90 p-1 shadow-popover backdrop-blur-sm">
    <IconButton label="Zoom out" size="sm" onclick={() => zoom_by(0.8)}><MinusIcon weight="bold" /></IconButton>
    <IconButton label="Zoom in" size="sm" onclick={() => zoom_by(1.25)}><PlusIcon weight="bold" /></IconButton>
    <IconButton label="Fit the map" size="sm" onclick={fit}><ArrowsOutIcon weight="bold" /></IconButton>
  </div>
</div>
