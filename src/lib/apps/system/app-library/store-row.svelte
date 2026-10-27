<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import { set_drag_app } from "$lib/core/components/apps/drag";
  import type { Snippet } from "svelte";
  import IconTile from "./icon-tile.svelte";
  import { category_label } from "./library";
  import StoreButton from "./store-button.svelte";

  interface Props {
    manifest: AppListing;
    onselect: (manifest: AppListing) => void;
    detail?: Snippet;
    actions?: Snippet;
    /** Keep the Install / Update slot on rows without one; a list where no row ever shows it can drop it. */
    reserve?: boolean;
  }

  let { manifest, onselect, detail, actions, reserve = true }: Props = $props();
</script>

<li
  class="group relative flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-foreground/6 has-[.row-open:focus-visible]:outline-2 has-[.row-open:focus-visible]:outline-cottontail"
  draggable="true"
  ondragstart={(event) => set_drag_app(event, manifest.id)}
>
  <IconTile {manifest} />
  <div class="min-w-0 flex-1">
    <button type="button" class="row-open block max-w-full truncate text-left text-ui font-semibold after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none" onclick={() => onselect(manifest)}>
      {manifest.name}
    </button>
    <div class="line-clamp-2 text-2xs text-pretty text-foreground/80">
      {#if detail}{@render detail()}{:else}{category_label(manifest)}{#if manifest.description}<span class="hidden @md:inline">{` · ${manifest.description}`}</span>{/if}{/if}
    </div>
  </div>
  <div class="relative flex shrink-0 items-center gap-1">
    <StoreButton {manifest} {reserve} />
    {@render actions?.()}
  </div>
</li>
