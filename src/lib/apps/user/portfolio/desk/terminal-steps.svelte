<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { COMMAND_OF, PHONE_PRINCIPLE_BEAT, TOUR, TOUR_PRINCIPLES, Win } from "./script";
  import type { PortfolioSession } from "./session.svelte";
  import { Phase, type Now } from "./terminal-now";

  interface Props {
    session: PortfolioSession;
    now: Now;
    labeled?: boolean;
    onpick?: (command: string) => void;
    class?: string;
  }

  let { session, now, labeled = false, onpick, class: class_name }: Props = $props();

  const live = $derived(now.phase === Phase.TYPING || now.phase === Phase.NEXT || now.phase === Phase.SHOWING);
  const hold = $derived(now.phase === Phase.SHOWING ? hold_of(now) : 0);
  function hold_of(step: Now): number {
    if (step.command === COMMAND_OF[Win.HOW] && session.stacked) return TOUR_PRINCIPLES.length * PHONE_PRINCIPLE_BEAT + 300;
    return session.hold_for(step.command) ?? TOUR[step.index]?.hold ?? 0;
  }

  const label = $derived(now.phase === Phase.DONE ? "Tour done" : `Tour, step ${Math.min(now.index + 1, TOUR.length)} of ${TOUR.length}`);

  function state_of(index: number): "done" | "filling" | "typing" | "todo" {
    if (live && index === now.index) return now.phase === Phase.SHOWING ? "filling" : "typing";
    return index < session.step || session.opened(TOUR[index].line) ? "done" : "todo";
  }
</script>

<ol class={cn("steps flex gap-1", class_name)} class:labeled aria-label={label} title={labeled ? undefined : label}>
  {#each TOUR as step, index (step.line)}
    {@const state = state_of(index)}
    {@const name = step.line.split(" ")[0]}
    <li class="min-w-0 flex-1" data-state={state} aria-current={state === "filling" || state === "typing" ? "step" : undefined}>
      {#if labeled && onpick}
        <button class="pick flex w-full min-w-0 flex-col gap-1 rounded-xs text-left" onclick={() => onpick(step.line)} title="Run {step.line}">
          <span class="track"><span class="fill" style:--hold="{hold}ms"></span></span>
          <span class="name truncate font-mono text-xs">{name}</span>
        </button>
      {:else}
        <span class="track"><span class="fill" style:--hold="{hold}ms"></span></span>
      {/if}
    </li>
  {/each}
</ol>

<style>
  .track {
    position: relative;
    display: block;
    height: 3px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in oklch, var(--foreground) 16%, transparent);
  }

  .fill {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--primary);
    transform-origin: left;
    transform: scaleX(0);
  }

  [data-state="done"] .fill {
    transform: none;
  }

  [data-state="typing"] .track {
    animation: waiting 1.2s ease-in-out infinite alternate;
  }

  [data-state="filling"] .fill {
    animation: fill var(--hold) linear forwards;
  }

  .name {
    color: color-mix(in oklch, var(--foreground) 55%, transparent);
    transition: color 300ms;
  }

  [data-state="done"] .name {
    color: var(--foreground);
  }

  [data-state="filling"] .name,
  [data-state="typing"] .name {
    color: var(--primary);
  }

  .pick {
    padding-block: 0.375rem;
  }

  .pick:hover .name {
    color: var(--primary);
  }

  .pick:focus-visible {
    outline: 2px solid var(--cottontail);
    outline-offset: 2px;
  }

  @media (pointer: coarse) {
    .pick {
      min-height: 2.5rem;
      justify-content: center;
    }
  }

  @keyframes fill {
    to {
      transform: none;
    }
  }

  @keyframes waiting {
    to {
      background: color-mix(in oklch, var(--primary) 45%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-state="typing"] .track,
    [data-state="filling"] .fill {
      animation: none;
    }

    [data-state="filling"] .fill {
      transform: none;
    }
  }
</style>
