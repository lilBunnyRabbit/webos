<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { SESSION_READS, SESSION_WRITES, session_frame } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const frame = $derived(session_frame(player.t));
</script>

<div class="hq-scene grid h-full place-items-center py-3 font-mono">
  <div class="hq-flow flex w-full items-start">
    <div class="hq-pane">
      <p class="hq-caption">reads first</p>
      <ul class="flex flex-col gap-0.5">
        {#each SESSION_READS as read, index (read)}
          <li class={cn("item truncate", index <= frame.reads && "in")}><span class="text-tertiary">›</span> {read}</li>
        {/each}
      </ul>
    </div>

    <span class="hq-wire"><span style:scale="{frame.reads >= SESSION_READS.length - 1 ? 1 : 0} 1"></span></span>

    <div class="hq-pane work hq-wide">
      <p class="hq-caption">session</p>
      <p class="truncate text-foreground">offline sync</p>
      <span class="bar"><span style:scale="{frame.work} 1"></span></span>
    </div>

    <span class="hq-wire hq-wide"><span style:scale="{frame.work >= 1 ? 1 : 0} 1"></span></span>

    <div class="hq-pane">
      <p class="hq-caption">writes back</p>
      <ul class="flex flex-col gap-0.5">
        {#each SESSION_WRITES as write, index (write)}
          <li class={cn("item truncate", index <= frame.writes && "in")}><span class="text-primary">+</span> {write}</li>
        {/each}
      </ul>
    </div>
  </div>
</div>

<style>
  .work {
    flex: 0 1 8rem;
  }

  .bar {
    position: relative;
    display: block;
    height: 0.375rem;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in oklch, var(--foreground) 10%, transparent);
  }

  .bar > span {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--primary);
    transform-origin: left;
  }

  .item {
    color: var(--foreground);
    opacity: 0.25;
    transition: opacity 250ms;
  }

  .item.in {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .item {
      transition: none;
    }
  }
</style>
