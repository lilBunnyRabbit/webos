<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import { set_drag_app } from "$lib/core/components/apps/drag";
  import { Button, IconButton } from "$lib/core/components/ui";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon } from "phosphor-svelte";
  import IconTile from "./icon-tile.svelte";
  import { app_story, category_label } from "./library";
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

  let row: HTMLUListElement | null = $state(null);

  function step(direction: 1 | -1) {
    if (!row) return;
    row.scrollBy({ left: direction * row.clientWidth * 0.9, behavior: "smooth" });
  }
</script>

<section class="flex flex-col gap-2" aria-labelledby="shelf-{id}">
  <header class="flex items-end gap-2">
    <div class="min-w-0 flex-1">
      <h3 id="shelf-{id}" class="text-sm font-semibold">{label}</h3>
      {#if description}<p class="truncate text-2xs text-foreground/80">{description}</p>{/if}
    </div>
    {#if onall}<Button size="sm" variant="quiet" onclick={onall}>See all</Button>{/if}
    <div class="hidden gap-0.5 pointer-fine:flex">
      <IconButton label="Scroll {label} back" size="sm" onclick={() => step(-1)}><CaretLeftIcon weight="bold" /></IconButton>
      <IconButton label="Scroll {label} on" size="sm" onclick={() => step(1)}><CaretRightIcon weight="bold" /></IconButton>
    </div>
  </header>
  <ul
    bind:this={row}
    class="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] @2xl:-mx-8 @2xl:scroll-px-8 @2xl:px-8"
  >
    {#each apps as manifest (manifest.id)}
      <li
        class="relative flex w-[min(18rem,78cqi)] shrink-0 snap-start flex-col gap-2 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8 transition-shadow duration-150 hover:ring-foreground/20 has-[.card-open:focus-visible]:outline-2 has-[.card-open:focus-visible]:outline-cottontail"
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
            <p class="truncate text-2xs text-foreground/80">{category_label(manifest)}</p>
          </div>
          <StoreButton {manifest} class="relative" />
        </div>
        <p class="line-clamp-2 text-2xs text-pretty text-foreground/80">{app_story(manifest).solution}</p>
      </li>
    {/each}
  </ul>
</section>
