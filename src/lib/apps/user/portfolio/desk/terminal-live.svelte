<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { Snippet } from "svelte";
  import { TOUR, TOUR_PRINCIPLES } from "./script";
  import type { Entry, PortfolioSession } from "./session.svelte";
  import { outcome_of, Phase, type Now } from "./terminal-now";
  import TerminalSteps from "./terminal-steps.svelte";
  import { PRINCIPLES } from "../content/principles";

  interface Props {
    session: PortfolioSession;
    now: Now;
    latest: Entry | null;
    idle: Snippet;
  }

  let { session, now, latest, idle }: Props = $props();

  const touring = $derived(now.phase !== Phase.DONE);
  const result = $derived(latest?.input ? outcome_of(latest.input, latest.lines) : null);
  const first = $derived(latest?.lines.find((line) => line.text));
  const command = $derived(touring ? (now.phase === Phase.TYPING ? session.typed : now.command) : (latest?.input ?? ""));
  const label = $derived(
    now.phase === Phase.PAUSED ? `Paused at step ${Math.min(now.index + 1, TOUR.length)} of ${TOUR.length}` : touring ? `Step ${Math.min(now.index + 1, TOUR.length)} of ${TOUR.length}` : latest ? "Your turn" : ""
  );
  const tour_principles = PRINCIPLES.filter((principle) => TOUR_PRINCIPLES.includes(principle.id)).sort((a, b) => TOUR_PRINCIPLES.indexOf(a.id) - TOUR_PRINCIPLES.indexOf(b.id));
</script>

<section class="live flex flex-col gap-3 border-b border-foreground/8 px-4 pt-4 pb-4" aria-live="polite" aria-label="The tour">
  {#if label}<div class="flex min-w-0 items-center gap-3 font-sans text-xs text-foreground/65">
    <span class="shrink-0">{label}</span>
    {#if touring}<TerminalSteps {session} {now} class="min-w-0 flex-1" />{/if}
  </div>{/if}

  {#if touring || latest}
    <p class={cn("command flex min-w-0 items-baseline gap-2 font-mono", now.phase === Phase.TYPING ? "text-foreground" : "text-foreground/80")}>
      <span class="shrink-0 text-primary" aria-hidden="true">❯</span>
      <span class="min-w-0 break-words">{command}{#if now.phase === Phase.TYPING}<span class="caret" aria-hidden="true"></span>{/if}</span>
    </p>
    <div class="min-w-0">
      {#if touring}
        <p class={cn("title font-sans font-semibold transition-opacity duration-300", now.phase === Phase.SHOWING ? "text-foreground" : "text-foreground/45")}>
          {now.phase === Phase.TYPING ? `Opening ${now.title}` : now.title}
        </p>
        {#if now.principle}
          <ol class="flex flex-col gap-1 pt-2 font-sans text-ui">
            {#each tour_principles as principle, index (principle.id)}
              <li class={cn("flex items-baseline gap-2 transition-colors duration-300", index + 1 === now.principle.at ? "text-primary" : index + 1 < now.principle.at ? "text-foreground/80" : "text-foreground/45")}>
                <span class="text-[0.5rem]" aria-hidden="true">●</span>{principle.title}
              </li>
            {/each}
          </ol>
        {:else if now.detail}
          <p class={cn("pt-1 font-sans text-ui transition-opacity duration-300", now.phase === Phase.SHOWING ? "text-foreground/80" : "text-foreground/45")}>{now.detail}</p>
        {/if}
      {:else if latest}
        {#if result}<p class="title font-sans font-semibold text-foreground first-letter:uppercase">{result.label}</p>{/if}
        {#if first}<p class="line-clamp-2 pt-1 font-sans text-ui text-foreground/80">{first.text}{#if first.detail}{" "}<span class="text-foreground/65">{first.detail}</span>{/if}</p>{/if}
      {/if}
    </div>
  {:else}
    <p class="title font-sans font-semibold text-foreground">Your turn</p>
    {@render idle()}
  {/if}
</section>

<style>
  .live {
    flex: 1 1 auto;
    min-height: 17rem;
    container: live / inline-size;
  }

  /* Its lines start at a fixed height instead of centring: each step is a different height, and a centred block would
     shift with every one. */
  .live::before {
    content: "";
    flex: 0 1 28%;
  }

  .command {
    font-size: clamp(1rem, 6.5cqi, 1.375rem);
    line-height: 1.3;
  }

  .title {
    font-size: clamp(1.25rem, 8.5cqi, 1.75rem);
    line-height: 1.15;
    text-wrap: balance;
  }

  .caret {
    display: inline-block;
    width: 0.55em;
    height: 1.05em;
    margin-left: 2px;
    vertical-align: -0.15em;
    background: var(--primary);
    animation: blink 1s steps(1) infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .caret {
      animation: none;
    }
  }
</style>
