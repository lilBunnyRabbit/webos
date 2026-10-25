<script lang="ts" module>
  import {
    CheckCircle as CheckCircleIcon,
    Feather as FeatherIcon,
    FileText as FileTextIcon,
    Lightning as LightningIcon,
    Stack as StackIcon,
    Waveform as WaveformIcon,
  } from "phosphor-svelte";
  import type { IconComponent } from "$lib/core/components/ui";

  export const PRINCIPLE_ICONS: Record<string, IconComponent> = {
    decisions: FileTextIcon,
    team: StackIcon,
    lightest: FeatherIcon,
    correct: CheckCircleIcon,
    performance: LightningIcon,
    feel: WaveformIcon,
  };
</script>

<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { Principle } from "../content/types";
  import DraftMark from "../draft-mark.svelte";
  import { how_for } from "./evidence";
  import type { PortfolioSession } from "./session.svelte";

  interface Props {
    principles: Principle[];
    name: string;
    session: PortfolioSession;
    class?: string;
  }

  let { principles, name, session, class: class_name }: Props = $props();

  const id = $props.id();
  const uid = id.replace(/[^\w-]/g, "");
  const how = $derived(Object.fromEntries(principles.map((principle) => [principle.id, how_for(principle, name)])));

  let told = $state<string | null>(null);
  // The story stays in place while it folds away, so closing animates instead of emptying first.
  let kept = $state<string | null>(null);
  const telling = $derived(principles.find((principle) => principle.id === kept) ?? null);

  function tell(id: string) {
    told = told === id ? null : id;
    if (told) kept = told;
  }
</script>

<!-- The full titles live once, in How I build; here each principle is an icon chip with its title as its name. A lit
     principle only lights its chip; a pressed one opens its story under the row. -->
{#if principles.length > 0}
  <div class={cn("marks text-xs", class_name)}>
    <div class="row flex min-w-0 items-center gap-2">
      <span class="head shrink-0 text-foreground/65">Shows<span class="count">{` ${principles.length} ${principles.length === 1 ? "principle" : "principles"}`}</span></span>
      <ul class="flex shrink-0 items-center gap-0.5" aria-label="How I build, shown in {name}">
        {#each principles as principle (principle.id)}
          {@const Icon = PRINCIPLE_ICONS[principle.id]}
          {@const on = session.lit === principle.id || told === principle.id}
          <li>
            <button
              class={cn(
                "chip grid size-7 place-items-center rounded-full transition-colors duration-300 pointer-coarse:size-10",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cottontail",
                on ? "lit text-primary" : "text-foreground/80 hover:text-foreground"
              )}
              aria-label={principle.title}
              aria-expanded={how[principle.id] ? told === principle.id : undefined}
              aria-controls={how[principle.id] ? `${uid}-how` : undefined}
              title={principle.title}
              onclick={() => tell(principle.id)}
            >
              <span class={cn("ring grid size-6 place-items-center rounded-full ring-1 transition-colors duration-300", on ? "bg-primary/12 ring-primary/60" : "ring-foreground/15")}>
                <Icon class="size-3.5" weight={on ? "fill" : "regular"} />
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
    <div id="{uid}-how" class={cn("how", told && "open")} aria-live="polite" aria-hidden={!told}>
      <div class="fold">
        {#if telling && how[telling.id]}
          {@const told_how = how[telling.id]!}
          {#key telling.id}
            <p class="told border-l-2 border-primary/60 pl-2.5 font-sans text-ui text-pretty text-foreground/80">
              <span class="block font-medium text-primary">{telling.title}</span>
              {told_how.text}
              <DraftMark status={told_how.status} />
            </p>
          {/key}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .marks {
    container: marks / inline-size;
  }

  .row {
    min-height: 1.75rem;
  }

  /* A finger can't hover for a tooltip: the row says how many the chips stand for until one is named. */
  .count {
    display: none;
  }

  @media (pointer: coarse) {
    .count {
      display: inline;
    }
  }

  .how {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 300ms var(--portfolio-move, var(--ease-out));
  }

  .how.open {
    grid-template-rows: 1fr;
  }

  .fold {
    min-height: 0;
    overflow: hidden;
  }

  .told {
    margin-top: 0.375rem;
  }

  .chip.lit :global(svg) {
    animation: spark 700ms var(--ease-out) var(--wave, 0ms) backwards;
  }

  .chip,
  .chip .ring {
    transition-delay: var(--wave, 0ms);
  }

  @keyframes spark {
    35% {
      scale: 1.3;
    }
  }

  .open .told {
    animation: told-in 260ms var(--ease-out);
  }

  @keyframes told-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chip.lit :global(svg),
    .open .told {
      animation: none;
    }

    .how {
      transition: none;
    }
  }
</style>
