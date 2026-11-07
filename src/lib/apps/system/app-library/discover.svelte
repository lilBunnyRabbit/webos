<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import { Button, IconButton, Input } from "$lib/core/components/ui";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon, MagnifyingGlass as MagnifyingGlassIcon } from "phosphor-svelte";
  import { CATEGORY_ICONS } from "./category-icons";
  import type { HeroCard, Shelf as ShelfData } from "./discover";
  import { ASK_EXAMPLES } from "./featured";
  import ExperimentalBadge from "$lib/core/components/apps/experimental-badge.svelte";
  import IconTile from "./icon-tile.svelte";
  import { LIBRARY_CATEGORIES, LibraryCategory } from "./library";
  import { ScrollRow } from "./scroll-row.svelte";
  import ShelfView from "./shelf.svelte";
  import StoreButton from "./store-button.svelte";

  type TileCategory = Exclude<LibraryCategory, "all">;

  interface Props {
    hero: HeroCard[];
    start: AppListing[];
    shelves: ShelfData[];
    counts: Record<LibraryCategory, number>;
    examples: Record<TileCategory, string[]>;
    total: number;
    onselect: (manifest: AppListing) => void;
    oncategory: (category: TileCategory) => void;
    onshelf: (shelf: ShelfData) => void;
    onask: (text: string) => void;
  }

  let { hero, start, shelves, counts, examples, total, onselect, oncategory, onshelf, onask }: Props = $props();

  const carousel = new ScrollRow();
  let ask = $state("");

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (ask.trim()) onask(ask.trim());
  }
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-9 px-4 pt-5 pb-10 @2xl:px-8 @2xl:pt-7">
  <header class="flex flex-col gap-1">
    <h2 class="text-2xl leading-tight font-semibold">Discover</h2>
    <p class="max-w-2xl text-ui text-pretty text-foreground/80">
      A desktop in your browser: notes, files, tools and games, all saved on this device. {total} apps, each one starting from a small everyday problem.
    </p>
  </header>

  {#if start.length}
    <ShelfView id="start" label="Start here" description="Everyday apps to try first" apps={start} {onselect} />
  {/if}

  <section aria-labelledby="discover-ask" class="flex flex-col gap-3 rounded-2xl bg-background-light p-4 ring-1 ring-foreground/10 @2xl:p-5">
    <div>
      <h3 id="discover-ask" class="text-base leading-tight font-semibold">Not sure? Ask</h3>
      <p class="text-2xs text-pretty text-foreground/65">Say what you want to do in your own words, and the apps that fit show up.</p>
    </div>
    <form class="flex max-w-2xl gap-2" role="search" onsubmit={submit}>
      <Input bind:value={ask} class="min-w-0 flex-1" placeholder="What do you want to do?" aria-label="What do you want to do?" enterkeyhint="search">
        {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
      </Input>
      <Button type="submit" variant="primary" disabled={!ask.trim()}>Ask</Button>
    </form>
    <div role="group" aria-label="Examples" class="flex flex-wrap gap-1.5">
      {#each ASK_EXAMPLES as example (example)}
        <Button size="sm" variant="quiet" class="rounded-full ring-1 ring-foreground/10 ring-inset" onclick={() => onask(example)}>{example}</Button>
      {/each}
    </div>
  </section>

  {#if hero.length}
    <section class="flex flex-col gap-3" aria-labelledby="discover-featured">
      <header class="flex items-end gap-2">
        <h3 id="discover-featured" class="min-w-0 flex-1 text-base leading-tight font-semibold">Featured</h3>
        {#if carousel.scrolls}
          <div class="hidden gap-1 pointer-fine:flex">
            <IconButton label="Previous featured app" size="sm" variant="secondary" class="rounded-full" disabled={carousel.at_start} onclick={() => carousel.step(-1)}>
              <CaretLeftIcon weight="bold" />
            </IconButton>
            <IconButton label="Next featured app" size="sm" variant="secondary" class="rounded-full" disabled={carousel.at_end} onclick={() => carousel.step(1)}>
              <CaretRightIcon weight="bold" />
            </IconButton>
          </div>
        {/if}
      </header>
      <ul
        {@attach carousel.attach}
        aria-label="Featured"
        class="-mx-4 -my-2 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 py-2 [scrollbar-width:none] @2xl:-mx-8 @2xl:scroll-px-8 @2xl:px-8"
      >
        {#each hero as card (card.manifest.id)}
          <li
            class="relative isolate flex min-h-52 w-[min(36rem,86cqi)] shrink-0 snap-start pointer-coarse:snap-always overflow-hidden rounded-2xl bg-linear-to-br from-background-lighter to-background-light p-5 shadow-raised ring-1 ring-primary/25 transition-shadow duration-150 hover:ring-primary/45 has-[.hero-open:focus-visible]:outline-2 has-[.hero-open:focus-visible]:outline-cottontail @2xl:p-6"
          >
            <card.manifest.icon class="pointer-events-none absolute -right-6 -bottom-8 -z-10 size-48 text-primary opacity-10" weight="duotone" aria-hidden="true" />
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <p class="text-2xs font-medium tracking-wide text-primary uppercase">{card.overline}</p>
              <div class="flex items-center gap-3">
                <IconTile manifest={card.manifest} size="lg" />
                <h4 class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xl leading-tight font-semibold">
                  <button
                    type="button"
                    class="hero-open text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
                    onclick={() => onselect(card.manifest)}>{card.manifest.name}</button
                  >
                  {#if card.manifest.experimental}<ExperimentalBadge />{/if}
                </h4>
              </div>
              <p class="max-w-md text-sm text-pretty text-foreground/80">{card.tagline}</p>
              <StoreButton manifest={card.manifest} size="md" class="relative mt-auto pt-2" />
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#each shelves as shelf (shelf.id)}
    <ShelfView id={shelf.id} label={shelf.label} description={shelf.description} apps={shelf.apps} {onselect} onall={() => onshelf(shelf)} />
  {/each}

  <section class="flex flex-col gap-3" aria-labelledby="discover-categories">
    <h3 id="discover-categories" class="text-base leading-tight font-semibold">Categories</h3>
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-2">
      {#each LIBRARY_CATEGORIES.filter(({ id }) => id !== LibraryCategory.ALL) as item (item.id)}
        {@const Icon = CATEGORY_ICONS[item.id]}
        {@const names = examples[item.id as TileCategory]}
        <li>
          <Button variant="secondary" class="h-auto w-full justify-start gap-3 rounded-xl py-3 pointer-coarse:h-auto" onclick={() => oncategory(item.id as TileCategory)}>
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"><Icon class="size-4.5" weight="duotone" /></span>
            <span class="flex min-w-0 flex-1 flex-col text-left">
              <span class="truncate">{item.label}</span>
              {#if names.length}
                <span class="line-clamp-2 text-2xs font-normal text-pretty whitespace-normal text-foreground/65">{names.join(", ")}{counts[item.id] > names.length ? "…" : ""}</span>
              {/if}
            </span>
            <span class="font-mono text-2xs text-foreground/65">{counts[item.id]}</span>
          </Button>
        </li>
      {/each}
    </ul>
  </section>
</div>
