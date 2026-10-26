<script lang="ts">
  import LogoMark from "$lib/core/components/brand/logo-mark.svelte";
  import { Badge, Spinner } from "$lib/core/components/ui";
  import {
    Cpu as CpuIcon,
    Cube as CubeIcon,
    Gavel as GavelIcon,
    Graph as GraphIcon,
    MapTrifold as MapTrifoldIcon,
    Monitor as MonitorIcon,
    PaintBrush as PaintBrushIcon,
    SquaresFour as SquaresFourIcon,
  } from "phosphor-svelte";
  import type { Component } from "svelte";
  import { AdrStatus, STATUS_TONES } from "./adr-index";
  import { ADR_INDEX_ID, group_of, MAP_ID, ROADMAP_ID, type DocGroup } from "./catalog";
  import type { Library } from "./library";
  import { live_services } from "./live";
  import { load_page, PAGE_IDS } from "./pages";
  import RoadmapProgress from "./visuals/roadmap-progress.svelte";
  import ServiceGraph from "./visuals/service-graph.svelte";

  interface Props {
    library: Library | null;
    onopen: (id: string | null, hash?: string) => void;
  }

  let { library, onopen }: Props = $props();

  const services = $derived(live_services().length);
  const counts = PAGE_IDS.reduce<Partial<Record<DocGroup, number>>>((sum, id) => ({ ...sum, [group_of(id)]: (sum[group_of(id)] ?? 0) + 1 }), {});
  const implemented = $derived(library?.adrs.filter((entry) => entry.kind === AdrStatus.IMPLEMENTED).length ?? 0);
  const latest = $derived(library ? library.adrs.slice().sort((a, b) => b.number - a.number).slice(0, 4) : []);
  const roadmap = load_page(ROADMAP_ID);

  interface Entry {
    icon: Component;
    title: string;
    text: string;
    page: string;
    count?: number;
  }

  const ENTRIES: Entry[] = [
    { icon: GraphIcon, title: "Map", text: "The whole system on one zoomable canvas: services, shell, apps, storage.", page: MAP_ID },
    { icon: CpuIcon, title: "System", text: "How the OS fits together: the kernel, the app model, storage, theming.", page: "system/README", count: counts.system },
    { icon: CubeIcon, title: "Services", text: "The services the kernel starts, one page each, with the graph.", page: "system/kernel", count: counts.services },
    { icon: MonitorIcon, title: "Shell", text: "Desktop, taskbar and windows, the phone shell and solo links.", page: "system/shell/desktop", count: counts.shell },
    { icon: GavelIcon, title: "Decisions", text: "Every architecture decision: when, why, and what changed after.", page: ADR_INDEX_ID, count: counts.adrs },
    { icon: PaintBrushIcon, title: "Design", text: "Tokens, the UI kit, app patterns and how the shell looks.", page: "design/README", count: counts.design },
    { icon: SquaresFourIcon, title: "Apps", text: "Every app in this build, and how the tricky ones work inside.", page: "apps/README", count: counts.apps },
    { icon: MapTrifoldIcon, title: "Roadmap", text: "What's built and what's next.", page: ROADMAP_ID },
  ];

</script>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-6 @lg:px-8">
  <header class="flex items-center gap-3">
    <LogoMark class="h-9 w-auto shrink-0 text-primary" />
    <div class="min-w-0">
      <h1 class="text-xl leading-tight font-semibold">WebOS docs</h1>
      <p class="text-ui text-foreground/65">The repo's own documentation, with its tables and the running system drawn as maps.</p>
    </div>
  </header>

  <div class="grid grid-cols-2 gap-2 @xl:grid-cols-4">
    {#each [{ label: "services running", value: services, page: "system/kernel" }, { label: "decisions", value: library?.adrs.length ?? "…", page: ADR_INDEX_ID, note: library ? `${implemented} implemented` : "" }, { label: "pages", value: PAGE_IDS.length, page: "system/README" }, { label: "app internals", value: (counts.apps ?? 1) - 1, page: "apps/README" }] as stat (stat.label)}
      <button class="flex flex-col items-start rounded-xl bg-background-light px-3.5 py-3 text-left ring-1 ring-foreground/8 transition-colors hover:bg-foreground/6" onclick={() => onopen(stat.page)}>
        <span class="font-mono text-2xl font-semibold tabular-nums">{stat.value}</span>
        <span class="text-2xs text-foreground/80">{stat.label}{stat.note ? ` · ${stat.note}` : ""}</span>
      </button>
    {/each}
  </div>

  <ul class="grid gap-2 @lg:grid-cols-2 @3xl:grid-cols-3">
    {#each ENTRIES as entry (entry.page)}
      {@const Icon = entry.icon}
      <li>
        <button class="flex h-full w-full items-start gap-3 rounded-xl bg-background-light p-3.5 text-left ring-1 ring-foreground/8 transition-colors hover:bg-foreground/6" onclick={() => onopen(entry.page)}>
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"><Icon class="size-5" weight="duotone" /></span>
          <span class="flex min-w-0 flex-col gap-0.5">
            <span class="flex items-baseline gap-2 text-sm font-semibold">{entry.title}{#if entry.count !== undefined}<span class="font-mono text-2xs font-normal text-foreground/65 tabular-nums">{entry.count}</span>{/if}</span>
            <span class="text-ui text-foreground/80">{entry.text}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>

  <section class="flex flex-col gap-2">
    <h2 class="text-sm font-semibold">How the services depend on each other</h2>
    <ServiceGraph onopen={(page) => onopen(page)} />
  </section>

  <div class="grid gap-4 @3xl:grid-cols-2">
    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold">Latest decisions</h2>
      {#if library}
        <ul class="flex flex-col overflow-hidden rounded-xl bg-background-light ring-1 ring-foreground/8">
          {#each latest as entry (entry.number)}
            <li class="border-b border-foreground/6 last:border-b-0">
              <button class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-foreground/5" onclick={() => onopen(entry.id)}>
                <span class="font-mono text-2xs font-semibold text-primary tabular-nums">{String(entry.number).padStart(3, "0")}</span>
                <span class="min-w-0 flex-1 truncate text-ui">{entry.title}</span>
                <Badge tone={STATUS_TONES[entry.kind]}>{entry.status}</Badge>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="grid place-items-center py-6"><Spinner label="Reading the decisions" /></div>
      {/if}
    </section>
    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold">Roadmap</h2>
      {#await roadmap then markdown}
        <button class="text-left" onclick={() => onopen(ROADMAP_ID)}><RoadmapProgress {markdown} compact /></button>
      {/await}
    </section>
  </div>
</div>
