<script lang="ts">
  import { Input } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    BookOpen as BookOpenIcon,
    CaretRight as CaretRightIcon,
    Cube as CubeIcon,
    Cpu as CpuIcon,
    Gavel as GavelIcon,
    Graph as GraphIcon,
    House as HouseIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    MapTrifold as MapTrifoldIcon,
    Monitor as MonitorIcon,
    PaintBrush as PaintBrushIcon,
    SquaresFour as SquaresFourIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import type { Component } from "svelte";
  import { adr_number, GROUP_LABELS, GROUP_ORDER, MAP_ID, ROADMAP_ID, type DocGroup } from "./catalog";
  import { search_library, type PageInfo } from "./library";

  interface Props {
    pages: PageInfo[];
    current: string | null | undefined;
    onopen: (id: string | null, hash?: string) => void;
  }

  let { pages, current, onopen }: Props = $props();

  const ICONS: Record<DocGroup, Component> = {
    system: CpuIcon,
    services: CubeIcon,
    shell: MonitorIcon,
    adrs: GavelIcon,
    design: PaintBrushIcon,
    apps: SquaresFourIcon,
    roadmap: MapTrifoldIcon,
  };

  let query = $state("");
  let collapsed = $state<Partial<Record<DocGroup, boolean>>>({ adrs: true });
  const results = $derived(search_library(pages, query));
  const searching = $derived(query.trim() !== "");
  const current_group = $derived(pages.find((page) => page.id === current)?.group);

  const groups = $derived(
    GROUP_ORDER.map((group) => ({
      group,
      pages: pages
        .filter((page) => page.group === group)
        .sort((a, b) => {
          const readme = Number(b.id.endsWith("README")) - Number(a.id.endsWith("README"));
          if (readme !== 0) return readme;
          if (group === "adrs") return (adr_number(b.id) ?? 0) - (adr_number(a.id) ?? 0);
          return a.title.localeCompare(b.title);
        }),
    })).filter((entry) => entry.pages.length > 0)
  );

  let list: HTMLElement | null = $state(null);

  $effect(() => {
    void current;
    void current_group;
    list?.querySelector("[aria-current=page]")?.scrollIntoView({ block: "nearest" });
  });

  function label(page: PageInfo): string {
    return page.title.replace(/^ADR-\d+:\s*/, "");
  }

  function is_open(group: DocGroup): boolean {
    return group === current_group || !collapsed[group];
  }

  function toggle(group: DocGroup) {
    collapsed[group] = is_open(group);
  }
</script>

<nav class="flex h-full min-h-0 flex-col gap-1 p-2" aria-label="Docs">
  <Input bind:value={query} type="text" placeholder="Search" aria-label="Search the docs" size="sm" class="mb-1 shrink-0">
    {#snippet leading()}<MagnifyingGlassIcon class="size-3.5 text-foreground/65" />{/snippet}
    {#snippet trailing()}
      {#if searching}
        <button class="grid size-5 place-items-center rounded-sm text-foreground/65 hover:text-foreground" aria-label="Clear search" onclick={() => (query = "")}>
          <XIcon class="size-3" weight="bold" />
        </button>
      {/if}
    {/snippet}
  </Input>

  <div bind:this={list} class="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
    {#if searching}
      {#if results.length === 0}
        <p class="px-2.5 py-3 text-ui text-foreground/65">Nothing matches "{query.trim()}".</p>
      {:else}
        <ul class="flex flex-col gap-0.5">
          {#each results as hit (hit.id + (hit.heading?.slug ?? ""))}
            <li>
              <button
                class="flex w-full flex-col items-start rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-foreground/6 pointer-coarse:py-2.5"
                onclick={() => onopen(hit.id, hit.heading?.slug)}
              >
                <span class="text-ui font-medium">{hit.heading?.text ?? hit.title}</span>
                <span class="text-2xs text-foreground/80">{hit.place}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <button
        aria-current={current === null ? "page" : undefined}
        class={cn(
          "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-ui font-medium transition-colors pointer-coarse:h-10",
          current === null ? "bg-foreground/10" : "text-foreground/80 hover:bg-foreground/6 hover:text-foreground"
        )}
        onclick={() => onopen(null)}
      >
        <HouseIcon class={cn("size-4", current === null && "text-primary")} weight={current === null ? "fill" : "regular"} /> Home
      </button>
      <button
        aria-current={current === MAP_ID ? "page" : undefined}
        class={cn(
          "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-ui font-medium transition-colors pointer-coarse:h-10",
          current === MAP_ID ? "bg-foreground/10" : "text-foreground/80 hover:bg-foreground/6 hover:text-foreground"
        )}
        onclick={() => onopen(MAP_ID)}
      >
        <GraphIcon class={cn("size-4", current === MAP_ID && "text-primary")} weight={current === MAP_ID ? "fill" : "regular"} /> Map
      </button>

      {#each groups as { group, pages: items } (group)}
        {@const Icon = ICONS[group]}
        {#if group === "roadmap"}
          <button
            aria-current={current === ROADMAP_ID ? "page" : undefined}
            class={cn(
              "mt-1 flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-ui font-medium transition-colors pointer-coarse:h-10",
              current === ROADMAP_ID ? "bg-foreground/10" : "text-foreground/80 hover:bg-foreground/6 hover:text-foreground"
            )}
            onclick={() => onopen(ROADMAP_ID)}
          >
            <Icon class={cn("size-4", current === ROADMAP_ID && "text-primary")} weight={current === ROADMAP_ID ? "fill" : "regular"} /> Roadmap
          </button>
        {:else}
          {@const open = is_open(group)}
          <button
            class="mt-1 flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-ui font-medium text-foreground/80 transition-colors hover:bg-foreground/6 hover:text-foreground pointer-coarse:h-10"
            aria-expanded={open}
            onclick={() => toggle(group)}
          >
            <Icon class={cn("size-4", group === current_group && "text-primary")} />
            {GROUP_LABELS[group]}
            <span class="ml-auto font-mono text-2xs text-foreground/65 tabular-nums">{items.length}</span>
            <CaretRightIcon class={cn("size-3 text-foreground/65 transition-transform", open && "rotate-90")} weight="bold" />
          </button>
          {#if open}
            <ul class="ml-[1.125rem] flex flex-col border-l border-foreground/10 py-0.5 pl-1.5">
              {#each items as page (page.id)}
                {@const number = adr_number(page.id)}
                {@const active = current === page.id}
                <li>
                  <button
                    aria-current={active ? "page" : undefined}
                    class={cn(
                      "flex min-h-7 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-ui transition-colors pointer-coarse:min-h-10",
                      active ? "bg-primary/12 font-medium text-foreground" : "text-foreground/80 hover:bg-foreground/6 hover:text-foreground"
                    )}
                    onclick={() => onopen(page.id)}
                  >
                    {#if number !== null}<span class="w-7 shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{String(number).padStart(3, "0")}</span>{/if}
                    {#if page.id.endsWith("README")}<BookOpenIcon class="size-3.5 shrink-0 text-foreground/65" />{/if}
                    <span class="min-w-0 truncate">{page.id.endsWith("README") ? "Overview" : label(page)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      {/each}
    {/if}
  </div>
</nav>
