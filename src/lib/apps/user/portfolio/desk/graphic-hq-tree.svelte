<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { step_at, TREE, TREE_STEP } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const at = $derived(step_at(player.t, TREE_STEP.at, TREE_STEP.every, TREE.length));
</script>

<div class="hq-scene grid h-full place-items-center py-3 font-mono">
  <div class="hq-flow flex w-full items-start">
    <div class="hq-pane parts">
      <p class="hq-caption">~/dev/hq</p>
      <ul class="flex flex-col gap-0.5">
        {#each TREE as entry, index (entry.part)}
          <li class={cn("part truncate", index < at && "past", index === at && "now")}>{entry.part}</li>
        {/each}
      </ul>
    </div>

    <span class="hq-wire"><span style:scale="{at >= 0 ? 1 : 0} 1"></span></span>

    <div class="hq-pane">
      <p class="hq-caption">holds</p>
      {#if at >= 0}
        {#key at}
          <div class="detail flex flex-col gap-1.5">
            <p class="text-pretty text-foreground">{TREE[at].holds}</p>
            <p class="sample truncate">{TREE[at].sample}</p>
          </div>
        {/key}
      {/if}
    </div>
  </div>
</div>

<style>
  .parts {
    flex: 0 1 8.5rem;
  }

  .part {
    padding: 0.0625rem 0.3125rem;
    border-radius: var(--radius-sm);
    color: color-mix(in oklch, var(--foreground) 50%, transparent);
    transition: color 200ms, background-color 200ms;
  }

  .part.past {
    color: var(--tertiary);
  }

  .part.now {
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 14%, transparent);
  }

  .sample {
    align-self: flex-start;
    max-width: 100%;
    padding: 0.0625rem 0.375rem;
    border-radius: var(--radius-sm);
    color: color-mix(in oklch, var(--foreground) 70%, transparent);
    background: color-mix(in oklch, var(--foreground) 6%, transparent);
  }

  .detail {
    animation: rise 300ms var(--ease-out);
  }

  @keyframes rise {
    from {
      opacity: 0;
      translate: 0 0.25rem;
    }
  }

  @container card (width < 28rem) {
    .parts {
      flex-basis: 6.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .part {
      transition: none;
    }

    .detail {
      animation: none;
    }
  }
</style>
