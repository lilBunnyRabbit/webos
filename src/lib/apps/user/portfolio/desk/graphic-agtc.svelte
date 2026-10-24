<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { GraphicPlayer } from "./project-player.svelte";
  import { SESSIONS, SessionStatus, status_at } from "./project-scenes";

  let { player }: { player: GraphicPlayer } = $props();

  const DOT: Record<SessionStatus, string> = {
    [SessionStatus.IDLE]: "bg-foreground/30",
    [SessionStatus.BUSY]: "bg-accent busy",
    [SessionStatus.INPUT]: "bg-primary",
    [SessionStatus.DONE]: "bg-secondary",
  };

  const t = $derived(player.t);
</script>

<ul class="sessions flex h-full flex-col justify-center gap-1 px-3.5 py-3 font-mono text-xs">
  {#each SESSIONS as session (session.name)}
    {@const status = status_at(session.steps, t)}
    <li class="flex h-7 items-center gap-2.5 rounded-md px-2 transition-colors duration-300" class:ask={status === SessionStatus.INPUT}>
      <span class={cn("size-2 shrink-0 rounded-full transition-colors duration-300", DOT[status])}></span>
      <span class="min-w-0 flex-1 truncate text-foreground">{session.name}</span>
      <span class={cn("shrink-0 transition-colors duration-300", status === SessionStatus.INPUT ? "text-primary" : "text-foreground/65")}>{status}</span>
    </li>
  {/each}
</ul>

<style>
  @container card (width < 12rem) {
    .sessions {
      padding-inline: 0.5rem;
    }

    .sessions > li {
      gap: 0.375rem;
      padding-inline: 0.375rem;
    }
  }

  .ask {
    background: color-mix(in oklch, var(--primary) 10%, transparent);
  }

  .busy {
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.4;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .busy {
      animation: none;
    }
  }
</style>
