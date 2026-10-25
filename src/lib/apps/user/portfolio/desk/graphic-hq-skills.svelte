<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { SKILLS, skill_at } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const at = $derived(skill_at(player.t));
</script>

<div class="hq-scene grid h-full place-items-center py-3 font-mono">
  <div class="hq-flow flex w-full items-start">
    <div class="hq-pane names">
      <p class="hq-caption">skills</p>
      <ul class="flex flex-col gap-0.5">
        {#each SKILLS as skill, index (skill.name)}
          <li class={cn("skill truncate", index === at && "now", index < at && "past")}>{skill.name}</li>
        {/each}
      </ul>
    </div>

    <span class="hq-wire"><span style:scale="{at >= 0 ? 1 : 0} 1"></span></span>

    <div class="hq-pane">
      <p class="hq-caption">what it does</p>
      {#if at >= 0}
        {#key at}
          <p class="does text-foreground">{SKILLS[at].does}</p>
        {/key}
      {/if}
    </div>
  </div>
</div>

<style>
  .names {
    flex: 0 1 9rem;
  }

  .skill {
    padding: 0.0625rem 0.3125rem;
    border-radius: var(--radius-sm);
    color: color-mix(in oklch, var(--foreground) 50%, transparent);
    transition: color 200ms, background-color 200ms;
  }

  .skill.past {
    color: color-mix(in oklch, var(--foreground) 75%, transparent);
  }

  .skill.now {
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 14%, transparent);
  }

  @container card (width < 28rem) {
    .names {
      flex-basis: 6.5rem;
    }
  }

  .does {
    text-wrap: pretty;
    animation: rise 300ms var(--ease-out);
  }

  @keyframes rise {
    from {
      opacity: 0;
      translate: 0 0.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skill {
      transition: none;
    }

    .does {
      animation: none;
    }
  }
</style>
