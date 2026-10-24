<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { ArrowCounterClockwise as ReplayIcon } from "phosphor-svelte";
  import type { GraphicPlayer } from "./project-player.svelte";

  let { player, name }: { player: GraphicPlayer; name: string } = $props();

  const NUDGE_MS = 2200;
  const still = motion_reduced();
  const coarse = matchMedia("(pointer: coarse)");

  let nudge = $state(false);

  // A finger can't hover: when a play ends, the hint shows on its own for a moment, so a tap on the picture is findable.
  let was_running = false;
  $effect(() => {
    const running = player.running;
    if (still || !coarse.matches) return;
    const ended = was_running && !running;
    was_running = running;
    if (!ended) return;
    nudge = true;
    const timer = setTimeout(() => (nudge = false), NUDGE_MS);
    return () => clearTimeout(timer);
  });
</script>

<button class={cn("tap absolute inset-0 cursor-pointer focus-visible:outline-none", nudge && "nudge")} aria-label="Replay: {name}" onclick={() => player.play()}>
  <span class="hint pointer-events-none absolute inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-xs font-medium text-foreground">
    <ReplayIcon class="size-3.5" weight="bold" />Replay
  </span>
</button>

<style>
  .hint {
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    background: color-mix(in oklch, var(--portfolio-card) 88%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in oklch, var(--foreground) 14%, transparent),
      0 6px 16px -8px color-mix(in oklch, var(--background-darkest) 80%, transparent);
    backdrop-filter: blur(6px);
    opacity: 0;
    scale: 0.94;
    transition:
      opacity 180ms var(--ease-out),
      scale 180ms var(--ease-out);
  }

  .tap::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: color-mix(in oklch, var(--background-darkest) 22%, transparent);
    opacity: 0;
    transition: opacity 180ms var(--ease-out);
    pointer-events: none;
  }

  .tap:focus-visible .hint,
  .tap.nudge .hint {
    opacity: 1;
    scale: 1;
  }

  .tap:focus-visible::after {
    opacity: 1;
  }

  .tap:focus-visible {
    box-shadow: inset 0 0 0 2px var(--cottontail);
  }

  .tap:active .hint {
    scale: 0.96;
  }

  /* Hover only where it exists: a tap leaves :hover stuck on touch screens, which would pin the hint. */
  @media (hover: hover) {
    .tap:hover .hint {
      opacity: 1;
      scale: 1;
    }

    .tap:hover::after {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hint,
    .tap::after {
      transition: none;
    }
  }
</style>
