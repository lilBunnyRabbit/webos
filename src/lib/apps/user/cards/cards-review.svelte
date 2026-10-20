<script lang="ts">
  import { Button, Checkbox, IconButton, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { X as XIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { SWATCH } from "./colors";
  import { display_name } from "./data";
  import { FORMATS } from "./formats";
  import type { CardsReview } from "./share";

  interface Props {
    review: CardsReview;
    /** Indexes into `review.added` and `review.changed`. */
    onapply: (added: number[], changed: number[]) => void;
    onclose: () => void;
  }

  let { review, onapply, onclose }: Props = $props();

  let added = $state(untrack(() => review.added.map(() => true)));
  let changed = $state(untrack(() => review.changed.map(() => true)));
  const count = $derived(added.filter(Boolean).length + changed.filter(Boolean).length);

  const picked = (flags: boolean[]) => flags.flatMap((on, index) => (on ? [index] : []));

  function differences(index: number): string {
    const { card, draft } = review.changed[index];
    const parts: string[] = [];
    if (card.name !== draft.name) parts.push(`name ${display_name(card)} → ${display_name(draft)}`);
    if (card.notes !== draft.notes) parts.push(draft.notes ? `notes → ${draft.notes}` : "notes removed");
    return parts.join(" · ");
  }
</script>

<section aria-label="Cards from the other device" class="absolute inset-0 z-20 flex animate-pop-in flex-col bg-background">
  <Toolbar>
    <IconButton size="sm" label="Close" onclick={onclose}><XIcon weight="bold" /></IconButton>
    <span class="min-w-0 flex-1 truncate text-ui font-medium">From the other device</span>
  </Toolbar>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-md flex-col gap-4 p-4">
      {#if review.added.length === 0 && review.changed.length === 0}
        <p class="py-8 text-center text-sm text-foreground/65">You already have every card in those codes.</p>
      {/if}
      {#if review.added.length > 0}
        <div class="flex flex-col">
          <p class="px-1 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">New · {review.added.length}</p>
          {#each review.added as draft, index (index)}
            <label class="flex min-h-11 items-center gap-3 rounded-lg px-1 hover:bg-foreground/4">
              <Checkbox bind:checked={added[index]} class="size-5" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{display_name(draft)}</span>
                <span class="block truncate font-mono text-2xs text-foreground/65">{FORMATS[draft.format].label} · {draft.code}</span>
              </span>
            </label>
          {/each}
        </div>
      {/if}
      {#if review.changed.length > 0}
        <div class="flex flex-col">
          <p class="px-1 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Changed · {review.changed.length}</p>
          {#each review.changed as change, index (index)}
            <label class="flex min-h-11 items-center gap-3 rounded-lg px-1 hover:bg-foreground/4">
              <Checkbox bind:checked={changed[index]} class="size-5" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{display_name(change.card)}</span>
                <span class="flex flex-wrap items-center gap-1.5 text-ui text-foreground/65">
                  {#if change.card.color !== change.draft.color}
                    colour <span class={cn("size-3 rounded-full", SWATCH[change.card.color])}></span> → <span class={cn("size-3 rounded-full", SWATCH[change.draft.color])}></span>
                  {/if}
                  {differences(index)}
                </span>
              </span>
            </label>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  <div class="flex shrink-0 items-center justify-end gap-2 border-t border-foreground/8 bg-background-light p-3">
    <Button variant="quiet" onclick={onclose}>Cancel</Button>
    <Button variant="primary" disabled={count === 0} onclick={() => onapply(picked(added), picked(changed))}>Apply {count}</Button>
  </div>
</section>
