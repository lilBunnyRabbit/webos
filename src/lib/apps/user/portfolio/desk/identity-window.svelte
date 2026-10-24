<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { Briefcase as BriefcaseIcon, MapPin as MapPinIcon } from "phosphor-svelte";
  import { shape_for } from "../particles/glyphs";
  import { PROFILE } from "../content/profile";
  import { Publication } from "../content/types";
  import DraftMark from "../draft-mark.svelte";
  import { experience_line } from "./identity";
  import ParticleFigure from "../particles/figure.svelte";
  import { PRINCIPLE_ICONS } from "./principle-marks.svelte";
  import type { PortfolioSession } from "./session.svelte";
  import Unbroken from "./unbroken.svelte";

  let { session, ready, hero }: { session: PortfolioSession; ready: boolean; hero: boolean } = $props();

  const years = experience_line(PROFILE.about_short.status === Publication.OK ? PROFILE.about_short.text : "");

  const still = motion_reduced();

  let name: HTMLElement | null = $state(null);
  let body: HTMLElement | null = $state(null);
  let canvas: HTMLCanvasElement | null = $state(null);

  // A principle pointed at in How I build previews its glyph; otherwise the lit one shows, else the logo.
  const glyph = $derived(session.peek ?? session.lit);
  const shape = $derived(shape_for(glyph));

  $effect(() => {
    if (!name || !session.stacked) return;
    const observer = new IntersectionObserver(([entry]) => (session.named = entry?.isIntersecting ?? true), { rootMargin: "-56px 0px 0px 0px" });
    observer.observe(name);
    return () => {
      observer.disconnect();
      session.named = true;
    };
  });
</script>

<div bind:this={body} class={cn("identity", hero && "hero", session.stacked && "stacked")}>
  {#if !still}<canvas bind:this={canvas} class="swarm" aria-hidden="true"></canvas>{/if}
  <div class="lead">
    <ParticleFigure {shape} {ready} surface={{ stage: body, canvas }} icon={glyph ? PRINCIPLE_ICONS[glyph] : null} class="figure" />
  </div>

  <div class="who flex min-w-0 flex-col">
    <h3 bind:this={name} class="name font-semibold text-foreground">{PROFILE.name}</h3>
    <p class="role mt-1 text-foreground/80"><Unbroken text={PROFILE.role} /></p>

    <ul class="facts mt-3 flex flex-wrap gap-1.5 text-xs font-medium text-foreground/85 [&_svg]:text-primary">
      {#if years}<li class="fact bg-foreground/6"><BriefcaseIcon class="size-3.5 shrink-0" weight="bold" />{years}</li>{/if}
      <li class="fact bg-foreground/6"><MapPinIcon class="size-3.5 shrink-0" weight="bold" />{PROFILE.location}</li>
    </ul>
    <p class="about mt-3 text-ui text-pretty text-foreground/80">
      {PROFILE.positioning.text}
      <DraftMark status={PROFILE.positioning.status} />
    </p>
  </div>
</div>

<style>
  .identity {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
    padding: 1rem 1.375rem 1.25rem;
  }

  /* The swarm flies across the whole body, but only the logo's slot is at full strength: dots behind the text stay
     faint, so the name and the facts read while it forms or changes shape. */
  .swarm {
    position: absolute;
    z-index: -1;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: 0;
    transition: opacity 420ms var(--ease-out);
    mask-image: radial-gradient(calc(var(--fw, 8rem) * 0.66) calc(var(--fh, 7rem) * 0.66) at var(--fx, 50%) var(--fy, 5rem), black 80%, rgb(0 0 0 / 0.22) 100%);
  }

  .swarm:global(.lit:not(.away)) {
    opacity: 1;
  }

  .identity.stacked {
    height: auto;
    gap: 0.75rem;
    padding: 0.75rem 1.125rem 1.125rem;
  }

  .who {
    flex-shrink: 0;
  }

  .lead {
    display: grid;
    flex: 1 1 10rem;
    min-height: 5rem;
    max-height: 18rem;
  }

  .stacked .lead {
    flex: none;
    height: min(13rem, 24svh);
  }

  .lead > :global(.figure) {
    min-height: 0;
  }

  .name {
    font-size: 1.625rem;
    line-height: 1.1;
    letter-spacing: -0.025em;
    text-wrap: balance;
  }

  .role {
    font-size: 0.875rem;
    line-height: 1.35;
    text-wrap: balance;
  }

  .fact {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.1875rem 0.625rem 0.1875rem 0.5rem;
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }

  @container win (height < 26rem) {
    .identity:not(.hero, .stacked) .about {
      display: none;
    }
  }

  /* A short column puts a small figure beside the name instead of above it, so the facts still fit. */
  @container win (height < 21rem) {
    .identity:not(.hero, .stacked) {
      display: grid;
      grid-template: "lead name" auto "role role" auto "facts facts" auto / 4.25rem minmax(0, 1fr);
      gap: 0 0.875rem;
      align-items: center;
      align-content: start;
      padding: 0.875rem 1.125rem 1rem;
    }

    .identity:not(.hero, .stacked) .who {
      display: contents;
    }

    .identity:not(.hero, .stacked) .lead {
      grid-area: lead;
      height: 4.25rem;
      min-height: 0;
    }

    .identity:not(.hero, .stacked) .name {
      grid-area: name;
      font-size: 1.375rem;
    }

    .identity:not(.hero, .stacked) .role {
      grid-area: role;
    }

    .identity:not(.hero, .stacked) .facts {
      grid-area: facts;
    }
  }

  @container win (width < 19rem) {
    .identity:not(.hero, .stacked) .name {
      font-size: 1.375rem;
    }
  }

  @container win (width >= 34rem) {
    .identity.hero {
      display: grid;
      grid-template: "lead who" minmax(0, 1fr) / minmax(0, 0.85fr) minmax(0, 1.15fr);
      align-items: center;
      gap: 2.25rem;
      padding: 1.75rem 2.25rem;
    }

    .hero .lead {
      grid-area: lead;
      align-self: stretch;
      max-height: none;
    }

    .hero .who {
      grid-area: who;
    }

    .hero .name {
      font-size: 2.25rem;
    }

    .hero .role {
      font-size: 1rem;
    }
  }

  /* A landscape phone puts the figure beside the name, so the name and the facts share the first screen. */
  @container portfolio (height < 30rem) {
    .identity.stacked {
      display: grid;
      grid-template-columns: 8rem minmax(0, 1fr);
      align-items: center;
      column-gap: 1.25rem;
    }

    .stacked .lead {
      height: 8rem;
    }
  }
</style>
