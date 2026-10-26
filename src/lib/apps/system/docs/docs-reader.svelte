<script lang="ts">
  import { EmptyState, Spinner } from "$lib/core/components/ui";
  import { error_message } from "$lib/core/utils";
  import { FileX as FileXIcon, Sparkle as SparkleIcon } from "phosphor-svelte";
  import { tick, untrack } from "svelte";
  import { adr_header } from "./adr-index";
  import { ADR_INDEX_ID, GROUP_LABELS, group_of, ROADMAP_ID } from "./catalog";
  import DocsProse from "./docs-prose.svelte";
  import type { Library } from "./library";
  import { render_markdown } from "./markdown";
  import { outline, type Heading } from "./outline";
  import { load_page, PAGE_SET } from "./pages";
  import AdrTimeline from "./visuals/adr-timeline.svelte";
  import AppAtlas from "./visuals/app-atlas.svelte";
  import RoadmapProgress from "./visuals/roadmap-progress.svelte";
  import ServiceGraph from "./visuals/service-graph.svelte";
  import ServiceNeighbours from "./visuals/service-neighbours.svelte";
  import StorageMap from "./visuals/storage-map.svelte";

  interface Props {
    id: string;
    hash: string;
    /** Changes on every navigation, so the same anchor twice still scrolls. */
    nav: number;
    library: Library | null;
    onopen: (id: string | null, hash?: string) => void;
    onoutline: (headings: Heading[], title: string) => void;
    onactive: (slug: string | null) => void;
  }

  let { id, hash, nav, library, onopen, onoutline, onactive }: Props = $props();

  interface Rendered {
    id: string;
    title: string;
    markdown: string;
    html: string;
    headings: Heading[];
  }

  let rendered = $state<Rendered | null>(null);
  let failed = $state<{ id: string; message: string } | null>(null);
  let root: HTMLElement | null = $state(null);

  $effect(() => {
    const target = id;
    let live = true;
    failed = null;
    load_page(target)
      .then((markdown) => {
        if (!live) return;
        const { title, headings } = outline(markdown, target);
        rendered = { id: target, title, markdown, headings, html: render_markdown(markdown, target, PAGE_SET) };
        untrack(() => onoutline(headings, title));
      })
      .catch((error) => {
        if (live) failed = { id: target, message: error_message(error) };
      });
    return () => {
      live = false;
    };
  });

  const ready = $derived(rendered !== null && rendered.id === id ? rendered : null);
  const service = $derived(id.startsWith("system/services/") ? id.slice("system/services/".length) : null);
  const header = $derived(ready && group_of(id) === "adrs" ? adr_header(ready.markdown) : null);
  const revisions = $derived(library?.adrs.find((entry) => entry.id === id)?.revisions ?? 0);

  $effect(() => {
    void nav;
    if (!ready || !root) return;
    const target = hash;
    void tick().then(() => {
      const element = target ? root?.querySelector(`[id="${CSS.escape(target)}"]`) : null;
      if (element) element.scrollIntoView({ block: "start" });
      else root?.scrollIntoView({ block: "start" });
    });
  });

  $effect(() => {
    if (!ready || !root) return;
    const headings = [...root.querySelectorAll<HTMLElement>(".prose :is(h2, h3)[id]")];
    if (headings.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = headings.find((heading) => visible.has(heading.id));
        if (first) onactive(first.id);
      },
      { rootMargin: "0px 0px -70% 0px" }
    );
    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  });

  function onlink(event: MouseEvent) {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    if (anchor.dataset.doc) {
      event.preventDefault();
      onopen(anchor.dataset.doc, anchor.dataset.hash || undefined);
    } else if (anchor.dataset.hash !== undefined) {
      event.preventDefault();
      onopen(id, anchor.dataset.hash);
    }
  }
</script>

<div bind:this={root} class="mx-auto flex w-full max-w-3xl scroll-mt-4 flex-col gap-5 px-5 py-6 @lg:px-8">
  {#if failed && failed.id === id}
    <EmptyState icon={FileXIcon} tone="error" title="This page didn't load" description="Try opening it again from the sidebar." details={failed.message} />
  {:else if !ready}
    <div class="grid place-items-center py-16"><Spinner label="Loading the page" /></div>
  {:else}
    <header class="flex flex-col gap-1">
      <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{GROUP_LABELS[group_of(id)]}</p>
      <h1 class="text-xl leading-tight font-semibold text-balance">{ready.title}</h1>
      {#if header && revisions > 0}
        <p class="text-2xs text-foreground/80"><span class="font-mono tabular-nums">{revisions}</span> revision {revisions === 1 ? "note" : "notes"} below</p>
      {/if}
    </header>

    {#snippet live(label: string)}
      <p class="-mb-3 flex items-center gap-1.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">
        <SparkleIcon class="size-3.5 text-primary" weight="fill" />{label}
      </p>
    {/snippet}

    {#if id === "system/kernel"}
      {@render live("Live from this device's kernel")}
      <ServiceGraph onopen={(page) => onopen(page)} />
    {:else if service}
      {@render live("Live from this device's kernel")}
      <ServiceNeighbours {service} onopen={(page) => onopen(page)} />
    {:else if id === ADR_INDEX_ID}
      {@render live("Drawn from the index below")}
      {#if library}<AdrTimeline {library} onopen={(page) => onopen(page)} />{:else}<div class="grid place-items-center py-6"><Spinner label="Reading every decision" /></div>{/if}
    {:else if id === "apps/README"}
      {@render live("Live from this build's app registry")}
      <AppAtlas {onopen} />
    {:else if id === "system/persistence"}
      {@render live("Drawn from the tables below")}
      <StorageMap onopen={(page) => onopen(page)} />
    {:else if id === ROADMAP_ID}
      {@render live("Drawn from the list below")}
      <RoadmapProgress markdown={ready.markdown} />
    {/if}

    <DocsProse html={ready.html} {onlink} />
  {/if}
</div>
