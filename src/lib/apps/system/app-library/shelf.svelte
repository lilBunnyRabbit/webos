<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import { set_drag_app } from "$lib/core/components/apps/drag";
  import { Button, IconButton } from "$lib/core/components/ui";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon, Trophy as TrophyIcon } from "phosphor-svelte";
  import IconTile from "./icon-tile.svelte";
  import { app_story, category_label } from "./library";
  import { ScrollRow } from "./scroll-row.svelte";
  import StoreButton from "./store-button.svelte";

  interface Props {
    id: string;
    label: string;
    description?: string;
    apps: AppListing[];
    onselect: (manifest: AppListing) => void;
    onall?: () => void;
  }

  let { id, label, description, apps, onselect, onall }: Props = $props();

  const row = new ScrollRow();
</script>

<section class="flex flex-col gap-3" aria-labelledby="shelf-{id}">
  <header class="flex items-end gap-2">
    <div class="min-w-0 flex-1">
      <h3 id="shelf-{id}" class="text-base leading-tight font-semibold">{label}</h3>
      {#if description}<p class="truncate text-2xs text-foreground/65">{description}</p>{/if}
    </div>
    {#if onall}<Button size="sm" variant="quiet" onclick={onall}>See all</Button>{/if}
    {#if row.scrolls}
      <div class="hidden gap-1 pointer-fine:flex">
        <IconButton label="Scroll {label} back" size="sm" variant="secondary" class="rounded-full" disabled={row.at_start} onclick={() => row.step(-1)}>
          <CaretLeftIcon weight="bold" />
        </IconButton>
        <IconButton label="Scroll {label} on" size="sm" variant="secondary" class="rounded-full" disabled={row.at_end} onclick={() => row.step(1)}>
          <CaretRightIcon weight="bold" />
        </IconButton>
      </div>
    {/if}
  </header>
  <!-- The padding and matching negative margins give the cards' rings, hover shadows and focus outlines room: a horizontal scroller clips both axes. -->
  <ul
    {@attach row.attach}
    class="-mx-4 -my-2 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 py-2 [scrollbar-width:none] @2xl:-mx-8 @2xl:scroll-px-8 @2xl:px-8"
  >
    {#each apps as manifest (manifest.id)}
      <li
        class="relative flex w-[min(17rem,80cqi)] shrink-0 snap-start flex-col gap-3 rounded-xl bg-background-light p-3.5 ring-1 ring-foreground/10 transition-shadow duration-150 hover:shadow-raised hover:ring-foreground/20 has-[.card-open:focus-visible]:outline-2 has-[.card-open:focus-visible]:outline-cottontail"
        draggable="true"
        ondragstart={(event) => set_drag_app(event, manifest.id)}
      >
        <div class="flex items-center gap-3">
          <IconTile {manifest} />
          <div class="min-w-0 flex-1">
            <button
              type="button"
              class="card-open block max-w-full truncate text-left text-ui font-semibold after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
              onclick={() => onselect(manifest)}>{manifest.name}</button
            >
            <p class="flex items-center gap-1 text-2xs text-foreground/65">
              <span class="truncate">{category_label(manifest)}</span>
              {#if manifest.achievement_count}
                <span class="flex shrink-0 items-center gap-0.5" title="{manifest.achievement_count} achievements"
                  ><span aria-hidden="true">·</span><TrophyIcon class="size-3" weight="fill" aria-hidden="true" /><span class="sr-only">Achievements:</span
                  >{manifest.achievement_count}</span
                >
              {/if}
            </p>
          </div>
        </div>
        <p class="line-clamp-2 min-h-[2lh] text-2xs text-pretty text-foreground/80">{app_story(manifest).solution}</p>
        <StoreButton {manifest} class="relative mt-auto" />
      </li>
    {/each}
  </ul>
</section>
