<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import { Button, IconButton } from "$lib/core/components/ui";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon } from "phosphor-svelte";
  import { CATEGORY_ICONS } from "./category-icons";
  import type { HeroCard, Shelf as ShelfData } from "./discover";
  import IconTile from "./icon-tile.svelte";
  import { LIBRARY_CATEGORIES, LibraryCategory } from "./library";
  import ShelfView from "./shelf.svelte";
  import StoreButton from "./store-button.svelte";

  interface Props {
    hero: HeroCard[];
    shelves: ShelfData[];
    counts: Record<LibraryCategory, number>;
    total: number;
    onselect: (manifest: AppListing) => void;
    oncategory: (category: Exclude<LibraryCategory, "all">) => void;
    onshelf: (shelf: ShelfData) => void;
  }

  let { hero, shelves, counts, total, onselect, oncategory, onshelf }: Props = $props();

  let carousel: HTMLUListElement | null = $state(null);

  function step(direction: 1 | -1) {
    if (!carousel) return;
    carousel.scrollBy({ left: direction * carousel.clientWidth * 0.9, behavior: "smooth" });
  }
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-8 px-4 pt-5 pb-8 @2xl:px-8 @2xl:pt-7">
  <header class="flex items-end gap-2">
    <div class="min-w-0 flex-1">
      <h2 class="text-lg font-semibold">Discover</h2>
      <p class="text-ui text-pretty text-foreground/80">{total} apps that run right in your browser, each one starting from a small everyday problem.</p>
    </div>
    {#if hero.length > 1}
      <div class="hidden gap-0.5 pointer-fine:flex">
        <IconButton label="Previous featured app" size="sm" onclick={() => step(-1)}><CaretLeftIcon weight="bold" /></IconButton>
        <IconButton label="Next featured app" size="sm" onclick={() => step(1)}><CaretRightIcon weight="bold" /></IconButton>
      </div>
    {/if}
  </header>

  {#if hero.length}
    <ul
      bind:this={carousel}
      aria-label="Featured"
      class="-mx-4 -mt-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] @2xl:-mx-8 @2xl:scroll-px-8 @2xl:px-8"
    >
      {#each hero as card (card.manifest.id)}
        <li
          class="relative isolate flex min-h-52 w-[min(36rem,86cqi)] shrink-0 snap-start overflow-hidden rounded-2xl bg-background-light p-5 ring-1 ring-primary/25 has-[.hero-open:focus-visible]:outline-2 has-[.hero-open:focus-visible]:outline-cottontail @2xl:p-6"
        >
          <card.manifest.icon class="pointer-events-none absolute -right-6 -bottom-8 -z-10 size-48 opacity-8" weight="duotone" aria-hidden="true" />
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <p class="text-2xs font-medium tracking-wide text-primary uppercase">{card.overline}</p>
            <div class="flex items-center gap-3">
              <IconTile manifest={card.manifest} size="lg" />
              <h3 class="min-w-0 text-xl leading-tight font-semibold">
                <button
                  type="button"
                  class="hero-open text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
                  onclick={() => onselect(card.manifest)}>{card.manifest.name}</button
                >
              </h3>
            </div>
            <p class="max-w-md text-sm text-pretty">{card.tagline}</p>
            <StoreButton manifest={card.manifest} size="md" with_open class="relative mt-auto pt-2" />
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#each shelves as shelf (shelf.id)}
    <ShelfView id={shelf.id} label={shelf.label} description={shelf.description} apps={shelf.apps} {onselect} onall={() => onshelf(shelf)} />
  {/each}

  <section class="flex flex-col gap-2" aria-labelledby="discover-categories">
    <h3 id="discover-categories" class="text-sm font-semibold">Categories</h3>
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-2">
      {#each LIBRARY_CATEGORIES.filter(({ id }) => id !== LibraryCategory.ALL) as item (item.id)}
        {@const Icon = CATEGORY_ICONS[item.id]}
        <li>
          <Button variant="secondary" class="h-auto w-full justify-start gap-3 rounded-xl py-3 pointer-coarse:h-auto" onclick={() => oncategory(item.id as Exclude<LibraryCategory, "all">)}>
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"><Icon class="size-4.5" weight="duotone" /></span>
            <span class="min-w-0 flex-1 truncate text-left">{item.label}</span>
            <span class="font-mono text-2xs text-foreground/65">{counts[item.id]}</span>
          </Button>
        </li>
      {/each}
    </ul>
  </section>
</div>
