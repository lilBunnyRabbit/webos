<script lang="ts">
  import kernel, { Platform } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { untrack } from "svelte";
  import { ALSO, IN_PROGRESS, MORE } from "../content/projects";
  import type { Project } from "../content/types";
  import DraftMark from "../draft-mark.svelte";
  import { principles_for_project, PROJECTS, PROVING } from "./evidence";
  import PrincipleMarks from "./principle-marks.svelte";
  import ProjectCard from "./project-card.svelte";
  import ProjectLinks from "./project-links.svelte";
  import { more_row, MoreLayout, now_of, type MoreRow } from "./project-more";
  import { card_hold, SLIDE_MS } from "./project-timing";
  import { bring_into, reveal } from "./reveal";
  import { COMMAND_OF, Win } from "./script";
  import { TourState, type PortfolioSession } from "./session.svelte";
  import SmallArt from "./small-art.svelte";
  import { Badge } from "$lib/core/components/ui";

  let { session, settled }: { session: PortfolioSession; settled: boolean } = $props();

  interface Tile {
    key: string;
    owner: string;
    first: boolean;
    name: string;
    mono: boolean;
    row: MoreRow;
    line?: string;
    links: MoreRow["links"];
  }

  const uid = $props.id();
  const still = motion_reduced();
  const desktop = kernel.platform === Platform.DESKTOP;
  const cards: Record<string, HTMLElement> = $state({});
  const proven = Object.fromEntries(PROVING.map((project) => [project.id, principles_for_project(project.id)]));
  // Cards light one after another in reading order, never all at once: a beat that lights four cards reads as a sweep.
  const WAVE = 90;
  const more = MORE.map((project) => more_row(project, desktop));
  const also = ALSO.map((project) => more_row(project, desktop));
  // Each package gets its own tile, and the three close the shelf together instead of splitting it.
  const smaller: Tile[] = [...more, ...also]
    .sort((a, b) => Number(a.layout === MoreLayout.GROUPED) - Number(b.layout === MoreLayout.GROUPED))
    .flatMap<Tile>((row) =>
      row.layout === MoreLayout.GROUPED
        ? row.groups.map((group, i) => ({ key: group.name, owner: row.id, first: i === 0, name: group.name, mono: true, row, line: group.line, links: group.links }))
        : [{ key: row.id, owner: row.id, first: true, name: row.name, mono: false, row, line: row.line, links: row.links }]
    );

  let rail: HTMLElement | null = $state(null);
  let current = $state(0);
  let flashed = $state<string | null>(null);
  let narrow = $state(false);
  let away = $state(true);

  const lit_projects = $derived(PROVING.filter((project) => proven[project.id].some((principle) => principle.id === session.lit)).map((project) => project.id));
  // Its own count only: `pulses` is replaced whole on every pulse, and any window's would re-bring the last project.
  const pulsed = $derived(session.pulses.projects ?? 0);
  const lit_project = $derived(lit_projects[0] ?? null);

  function carousel(): boolean {
    return !!rail && getComputedStyle(rail).overflowX !== "visible";
  }

  function slide(index: number, instant = still) {
    const item = rail?.children[index] as HTMLElement | undefined;
    if (!rail || !item) return;
    rail.scrollTo({ left: item.offsetLeft - parseFloat(getComputedStyle(rail).scrollPaddingLeft || "0"), behavior: instant ? "instant" : "smooth" });
  }

  // Inside the phone carousel a card is brought in sideways only: scrollIntoView would also yank the page vertically.
  // A stacked page without the carousel (a wide phone, a short desktop) glides to a card asked for by name, after the
  // window's own glide to its title bar.
  function bring(id: string, asked = false) {
    const card = cards[id];
    if (!card) return;
    const index = PROJECTS.findIndex((project) => project.id === id);
    const sideways = index >= 0 && carousel();
    if (sideways) slide(index);
    if (!session.stacked) bring_into(card);
    else if (asked && !sideways) requestAnimationFrame(() => requestAnimationFrame(() => reveal(card.closest<HTMLElement>(".item") ?? card)));
  }

  function track() {
    if (!rail) return;
    const items = [...rail.querySelectorAll<HTMLElement>(":scope > .item")];
    const left = rail.scrollLeft + parseFloat(getComputedStyle(rail).scrollPaddingLeft || "0");
    const distance = (index: number) => Math.abs(items[index].offsetLeft - left);
    current = items.reduce((best, _, index) => (distance(index) < distance(best) ? index : best), 0);
  }

  $effect(() => {
    if (!rail) return;
    const node = rail;
    const sizes = new ResizeObserver(() => {
      narrow = carousel();
      track();
    });
    sizes.observe(node);
    // The carousel goes back to its first card only once it is out of sight, never while someone could watch it jump.
    const seen = new IntersectionObserver(([entry]) => (away = !entry?.isIntersecting));
    seen.observe(node);
    return () => {
      sizes.disconnect();
      seen.disconnect();
    };
  });

  let rewind = false;
  $effect(() => {
    if (!away || !rewind) return;
    rewind = false;
    if (carousel()) slide(0, true);
  });

  $effect(() => {
    const project = session.project;
    void pulsed;
    if (!project || !settled) return;
    untrack(() => bring(project, true));
    flashed = project;
    const timer = setTimeout(() => (flashed = null), 1400);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    void session.reveal;
    const project = untrack(() => lit_project);
    if (project && !untrack(() => session.cycling)) untrack(() => bring(project));
  });

  // The tour's projects beat on a single column walks through the featured cards, each graphic playing as its card arrives,
  // and leaves the rail on the first card once the tour has scrolled away from it.
  $effect(() => {
    if (session.beat !== COMMAND_OF[Win.PROJECTS] || !session.stacked || !settled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = (ms: number) => new Promise((resolve) => (timer = setTimeout(resolve, ms)));
    untrack(async () => {
      for (const [index, project] of PROJECTS.entries()) {
        if (!alive) return;
        if (index > 0) {
          if (carousel()) slide(index);
          await wait(SLIDE_MS);
        }
        await wait(card_hold(project.id));
      }
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      if (untrack(() => session.tour) !== TourState.PLAYING) return;
      rewind = true;
      if (untrack(() => away) && carousel()) {
        rewind = false;
        slide(0, true);
      }
    };
  });
</script>

{#snippet tile(item: Tile)}
  {@const marks = item.mono ? [] : (proven[item.owner] ?? [])}
  <li
    class={cn("tile flex min-w-0 flex-col rounded-lg bg-(--portfolio-card) ring-1 transition-[box-shadow] duration-300", lit_projects.includes(item.owner) || flashed === item.owner ? "ring-primary/55" : "ring-foreground/8")}
    {@attach (node) => {
      if (item.first) cards[item.owner] = node;
    }}
  >
    <span class="art-cover m-1 mb-0 h-20 rounded-md bg-(--portfolio-inset) ring-1 ring-foreground/8 ring-inset"><SmallArt id={item.key} name={item.name} /></span>
    <div class="flex flex-col gap-1 px-2.5 pt-2">
      <p class={cn("text-ui leading-5 font-semibold text-pretty text-foreground", item.mono && "font-mono [overflow-wrap:anywhere]")}>{item.name} <DraftMark status={item.row.status} /></p>
      {#if item.line}<p class="text-xs text-pretty text-foreground/75">{item.line}</p>{/if}
      {#if marks.length > 0}<PrincipleMarks principles={marks} name={item.name} {session} />{/if}
    </div>
    <div class="mt-auto flex flex-wrap items-center gap-1 px-1.5 pt-1 pb-1.5">
      <ProjectLinks links={item.links} name={item.name} icons class="flex-nowrap" />
      {#if item.row.badge}<Badge class="mr-1 ml-auto">{item.row.badge}</Badge>{/if}
    </div>
  </li>
{/snippet}

{#snippet building(project: Project)}
  {@const now = now_of(project)}
  <li bind:this={cards[project.id]} class={cn("building flex min-w-0 flex-col gap-1.5 rounded-lg p-3.5 transition-[box-shadow] duration-300", flashed === project.id && "flash")}>
    <div class="flex flex-col items-start gap-1">
      <h4 class="text-[0.9375rem] leading-tight font-semibold text-foreground">{project.name} <DraftMark status={project.status} /></h4>
      <span class="inline-flex items-center gap-1.5 text-xs text-foreground/65"><span class="live size-1.5 rounded-full bg-primary" aria-hidden="true"></span>{project.kicker}</span>
    </div>
    <p class="text-ui text-pretty text-foreground/80">{project.tagline}</p>
    {#if now}<p class="text-xs text-pretty text-foreground/65"><span class="font-medium text-foreground/80">Now:</span> {now}</p>{/if}
    {#if project.links.length > 0}<ProjectLinks links={project.links} name={project.name} class="mt-auto pt-1" />{/if}
  </li>
{/snippet}

<div class="flex flex-col gap-6 px-3.5 pt-3 pb-4">
  <div class="rail-box flex flex-col gap-2">
    <div bind:this={rail} class={cn("cards", session.stacked ? "stacked" : "tiled")} style:--count={PROJECTS.length} onscroll={track}>
      {#each PROJECTS as project, index (project.id)}
        <div class="item min-w-0">
          <ProjectCard
            bind:node={cards[project.id]}
            {project}
            {index}
            {settled}
            {session}
            alone={narrow}
            lit={lit_projects.includes(project.id) || flashed === project.id}
            wave={Math.max(0, lit_projects.indexOf(project.id)) * WAVE}
            marks={proven[project.id]}
          />
        </div>
      {/each}
    </div>
    <div class="pager items-center justify-center" role="group" aria-label="Featured projects">
      {#each PROJECTS as project, index (project.id)}
        <button
          class="grid size-10 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-cottontail"
          aria-label="{project.name}, {index + 1} of {PROJECTS.length}"
          aria-current={current === index}
          onclick={() => slide(index)}
        >
          <span class={cn("h-1.5 rounded-full transition-[width,background-color] duration-200", current === index ? "w-5 bg-primary" : "w-1.5 bg-foreground/30")}></span>
        </button>
      {/each}
    </div>
  </div>

  <section class="flex flex-col gap-2.5" aria-labelledby="{uid}-building">
    <h3 id="{uid}-building" class="px-0.5 text-ui font-semibold text-foreground">In progress</h3>
    <ul class="buildings">
      {#each IN_PROGRESS as project (project.id)}{@render building(project)}{/each}
    </ul>
  </section>

  <section class="flex flex-col gap-2.5" aria-labelledby="{uid}-smaller" data-smaller>
    <h3 id="{uid}-smaller" class="px-0.5 text-ui font-semibold text-foreground outline-none" tabindex="-1">Smaller things</h3>
    <ul class="smalls">
      {#each smaller as item (item.key)}{@render tile(item)}{/each}
    </ul>
  </section>
</div>

<style>
  .rail-box {
    container: rail / inline-size;
  }

  .cards {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
  }

  .item :global(:is(.box, .card)) {
    height: auto;
  }

  .item,
  .smalls > :global(li),
  .buildings > :global(li) {
    scroll-margin-top: 0.875rem;
  }

  .pager {
    display: none;
  }

  /* Bento: one column still keeps a rhythm of sizes (WebOS leads, a second tall tile halfway); the grid itself starts
     only where a small tile is wide enough for its graphic. */
  .cards > .item:nth-child(1) {
    --tile: 11rem;
    --tile-name: 1.375rem;
  }

  .cards.tiled > .item:not(:nth-child(1)) {
    --tile: 6.5rem;
  }

  .cards.tiled > .item:nth-child(4) {
    --tile: 9.5rem;
  }

  /* A phone pages through the cards as a carousel. Its rail is as tall as the tallest card from the start, so nothing
     under it moves as the cards go by; a shorter card stretches with it, its graphic taking the extra height. */
  @container win (width < 34rem) {
    .cards.stacked {
      grid-template-columns: repeat(var(--count), 86%) calc(14% - 1rem);
      grid-auto-flow: column;
      align-items: stretch;
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      scroll-snap-type: x mandatory;
      scroll-padding-inline: 1rem;
      scrollbar-width: none;
      gap: 1rem;
      margin-inline: -0.875rem;
      padding: 0.25rem 1rem 0.5rem;
    }

    /* Room after the last card, so it snaps to the same place as the others instead of pulling the one before it in. */
    .cards.stacked::after {
      content: "";
    }

    .stacked .item {
      scroll-snap-align: start;
    }

    .stacked .item :global(:is(.box, .card)) {
      height: 100%;
    }

    .stacked ~ .pager {
      display: flex;
      margin-top: -0.5rem;
    }
  }

  @container win (width >= 30rem) {
    .cards.tiled {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: stretch;
    }

    .cards.tiled > .item {
      --tile: 7rem;
    }

    .cards.tiled > .item:is(:nth-child(1), :nth-child(8)) {
      grid-column: span 2;
      --tile: 10rem;
    }
  }

  @container win (width >= 34rem) {
    .cards.stacked {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: stretch;
    }

    .cards.stacked > .item {
      --tile: 7rem;
    }

    .cards.stacked > .item:is(:nth-child(1), :nth-child(8)) {
      grid-column: span 2;
      --tile: 10rem;
    }
  }

  @container win (width >= 40rem) {
    .cards:is(.tiled, .stacked) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .cards:is(.tiled, .stacked) > .item:is(:nth-child(1), :nth-child(8)) {
      grid-column: span 3;
    }
  }

  .cards:is(.tiled, .stacked) > .item :global(:is(.box, .card)) {
    height: 100%;
  }

  .buildings {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.625rem;
  }

  /* Not shipped yet: a dashed edge and a slow dot, never the solid ring the finished cards wear. */
  .building {
    background: color-mix(in oklch, var(--portfolio-card) 60%, transparent);
    border: 1px dashed color-mix(in oklch, var(--foreground) 22%, transparent);
  }

  .building.flash {
    box-shadow: 0 0 0 2px color-mix(in oklch, var(--primary) 55%, transparent);
  }

  .live {
    animation: live 2.4s ease-in-out infinite;
  }

  @keyframes live {
    50% {
      opacity: 0.35;
    }
  }

  .smalls {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.625rem;
  }

  .art-cover {
    display: grid;
  }

  @media (prefers-reduced-motion: reduce) {
    .live {
      animation: none;
    }
  }
</style>
