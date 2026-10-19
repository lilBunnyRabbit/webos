<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { PushPin as PushPinIcon } from "phosphor-svelte";
  import { SWATCH } from "./colors";
  import { display_name, initial, type Card } from "./data";

  let { card, onopen }: { card: Card; onopen: () => void } = $props();
</script>

<button
  type="button"
  class={cn(
    "flex aspect-[1.586] w-full min-w-0 flex-col justify-between rounded-xl p-3 text-left text-background transition-opacity hover:opacity-85 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    SWATCH[card.color]
  )}
  onclick={onopen}
>
  <span class="flex items-start justify-between gap-2">
    <span class="text-3xl leading-none font-semibold" aria-hidden="true">{initial(display_name(card))}</span>
    {#if card.pinned}<PushPinIcon class="size-4 shrink-0" weight="fill" aria-label="Pinned" />{/if}
  </span>
  <span class="flex min-w-0 flex-col">
    <span class="truncate text-sm font-semibold">{display_name(card)}</span>
    <span class="truncate font-mono text-2xs opacity-80 tabular-nums">{card.uses === 0 ? "Not used yet" : card.uses === 1 ? "Used once" : `Used ${card.uses}×`}</span>
  </span>
</button>
