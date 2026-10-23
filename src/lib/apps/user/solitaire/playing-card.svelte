<script lang="ts" module>
  import { Club as ClubIcon, Diamond as DiamondIcon, Heart as HeartIcon, Spade as SpadeIcon } from "phosphor-svelte";
  import { Suit } from "./klondike";

  export const SUIT_ICONS = {
    [Suit.SPADES]: SpadeIcon,
    [Suit.HEARTS]: HeartIcon,
    [Suit.DIAMONDS]: DiamondIcon,
    [Suit.CLUBS]: ClubIcon,
  };
</script>

<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { is_red, RANK_LABELS, rank_of, suit_of, type Card } from "./klondike";

  let { card, up, class: class_name }: { card: Card; up: boolean; class?: string } = $props();

  const Icon = $derived(SUIT_ICONS[suit_of(card)]);
</script>

{#if up}
  <div
    class={cn(
      "face relative size-full overflow-hidden rounded-[calc(var(--w)*0.09)] border border-foreground/20 bg-background-lighter shadow-raised",
      is_red(card) ? "text-error" : "text-foreground",
      class_name
    )}
  >
    <span class="corner absolute flex items-center font-semibold tabular-nums">
      {RANK_LABELS[rank_of(card)]}<Icon weight="fill" class="corner-suit shrink-0" />
    </span>
    <Icon weight="fill" class="pip absolute" />
  </div>
{:else}
  <div class={cn("back size-full rounded-[calc(var(--w)*0.09)] border border-foreground/20", class_name)}></div>
{/if}

<style>
  .corner {
    top: calc(var(--w) * 0.05);
    left: calc(var(--w) * 0.08);
    gap: calc(var(--w) * 0.02);
    font-size: calc(var(--w) * 0.24);
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .corner :global(.corner-suit) {
    width: calc(var(--w) * 0.2);
    height: calc(var(--w) * 0.2);
  }

  .face :global(.pip) {
    right: calc(var(--w) * 0.1);
    bottom: calc(var(--w) * 0.1);
    width: calc(var(--w) * 0.48);
    height: calc(var(--w) * 0.48);
    opacity: 0.9;
  }

  .back {
    background-color: var(--primary);
    background-image:
      repeating-linear-gradient(45deg, color-mix(in oklab, var(--background) 22%, transparent) 0 2px, transparent 2px 7px),
      repeating-linear-gradient(-45deg, color-mix(in oklab, var(--background) 22%, transparent) 0 2px, transparent 2px 7px);
    box-shadow:
      inset 0 0 0 calc(var(--w) * 0.05) var(--primary),
      var(--shadow-raised);
  }
</style>
