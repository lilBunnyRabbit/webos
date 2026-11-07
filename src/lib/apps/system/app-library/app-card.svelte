<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import { set_drag_app } from "$lib/core/components/apps/drag";
  import ExperimentalBadge from "$lib/core/components/apps/experimental-badge.svelte";
  import { cn } from "$lib/core/utils";
  import { Trophy as TrophyIcon } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import IconTile from "./icon-tile.svelte";
  import { app_story, category_label } from "./library";
  import StoreButton from "./store-button.svelte";

  interface Props {
    manifest: AppListing;
    onselect: (manifest: AppListing) => void;
    badge?: Snippet;
    lines?: 2 | 3;
    class?: string;
  }

  let { manifest, onselect, badge, lines = 2, class: class_name }: Props = $props();
</script>

<li
  class={cn(
    "relative flex flex-col gap-3 rounded-xl bg-background-light p-3.5 ring-1 ring-foreground/10 transition-shadow duration-150 hover:shadow-raised hover:ring-foreground/20 has-[.card-open:focus-visible]:outline-2 has-[.card-open:focus-visible]:outline-cottontail",
    class_name
  )}
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
    {#if badge || manifest.experimental}
      <span class="flex shrink-0 flex-col items-end gap-1 self-start">
        {@render badge?.()}
        {#if manifest.experimental}<ExperimentalBadge />{/if}
      </span>
    {/if}
  </div>
  <p class={cn("text-2xs text-pretty text-foreground/80", lines === 3 ? "line-clamp-3" : "line-clamp-2 min-h-[2lh]")}>{app_story(manifest).solution}</p>
  <p class="-mt-2 line-clamp-2 min-h-[1lh] text-2xs text-pretty text-foreground/65">{#if manifest.example}Try: {manifest.example}{/if}</p>
  <StoreButton {manifest} class="relative mt-auto" />
</li>
