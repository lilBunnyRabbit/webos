<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { untrack } from "svelte";
  import { Info as InfoIcon } from "phosphor-svelte";
  import { Badge } from "$lib/core/components/ui";
  import type { Principle, Project } from "../content/types";
  import DraftMark from "../draft-mark.svelte";
  import PrincipleMarks from "./principle-marks.svelte";
  import ProjectLinks from "./project-links.svelte";
  import { GraphicPlayer } from "./project-player.svelte";
  import { DURATIONS, STAGGER } from "./project-timing";
  import ProjectReplay from "./project-replay.svelte";
  import ProjectVisual from "./project-visual.svelte";
  import type { PortfolioSession } from "./session.svelte";
  import Unbroken from "./unbroken.svelte";

  interface Props {
    project: Project;
    index: number;
    settled: boolean;
    lit: boolean;
    marks: Principle[];
    session: PortfolioSession;
    /** One card at a time (the phone's carousel): each plays when it comes in, not after its place in a grid. */
    alone: boolean;
    /** Its place in the lit sweep, in ms: lit cards light in reading order. */
    wave?: number;
    node?: HTMLElement;
  }

  let { project, index, settled, lit, marks, session, alone, wave = 0, node = $bindable() }: Props = $props();

  const uid = $props.id();
  const player = new GraphicPlayer(untrack(() => DURATIONS[project.id] ?? 1), motion_reduced());

  let stage: HTMLElement | null = $state(null);
  let visible = $state(false);

  $effect(() => {
    if (!stage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        player.set_visible(entry.isIntersecting);
      },
      { threshold: 0.6 }
    );
    observer.observe(stage);
    return () => {
      observer.disconnect();
      player.destroy();
    };
  });

  $effect(() => {
    if (!settled || !visible || player.plays > 0) return;
    const timer = setTimeout(() => player.play(), alone ? 0 : index * STAGGER);
    return () => clearTimeout(timer);
  });
</script>

<div class="box h-full min-w-0">
  <article
    bind:this={node}
    aria-labelledby="{uid}-name"
    style:--wave="{lit ? wave : 0}ms"
    class={cn("card h-full min-w-0 rounded-xl bg-(--portfolio-card) ring-1 transition-[box-shadow] duration-300", lit ? "shadow-popover ring-primary/55" : "shadow-raised ring-foreground/8 hover:ring-foreground/16")}
  >
    <div bind:this={stage} class="stage relative m-1.5 mb-0 overflow-hidden rounded-lg bg-(--portfolio-inset) ring-1 ring-foreground/8 ring-inset">
      <ProjectVisual id={project.id} {player} />
      <ProjectReplay {player} name={project.name} />
    </div>

    <div class="copy flex min-w-0 flex-col gap-1.5 px-3.5 pt-2.5">
      <div class="flex min-w-0 flex-col items-start gap-0.5">
        <h3 id="{uid}-name" class="name flex items-center gap-2 leading-tight font-semibold text-foreground">{project.name} <DraftMark status={project.status} /></h3>
        {#if project.kicker}
          <p class={cn("min-w-0 text-xs font-medium text-primary [overflow-wrap:anywhere]", project.kicker.startsWith("@") && "font-mono")}>{project.kicker}</p>
        {/if}
      </div>
      <p class="tagline text-ui text-pretty text-foreground/85"><Unbroken text={project.tagline} /></p>
      {#if project.note}<p class="flex items-center gap-1.5 text-xs text-foreground/60"><InfoIcon class="size-3.5 shrink-0" weight="bold" />{project.note}</p>{/if}
    </div>

    {#if marks.length > 0}<PrincipleMarks principles={marks} name={project.name} {session} class="proves px-3.5" />{/if}

    <div class="links flex items-center justify-between gap-2 px-3.5 pt-2 pb-2.5">
      <ProjectLinks links={project.links} name={project.name} />
      {#if project.badge}<Badge class="ml-auto">{project.badge}</Badge>{/if}
    </div>
  </article>
</div>

<style>
  .box {
    container: card / inline-size;
    --stage: var(--portfolio-inset);
  }

  /* The window sets each tile's graphic height (`--tile`) and name size (`--tile-name`): that is the bento's rhythm. */
  .card {
    transition-delay: var(--wave, 0ms);
    display: grid;
    grid-template: "stage" var(--tile, 7.5rem) "copy" auto "proves" auto "links" 1fr / minmax(0, 1fr);
    align-content: start;
  }

  .name {
    font-size: var(--tile-name, 1.0625rem);
  }


  .stage {
    grid-area: stage;
  }

  .copy {
    grid-area: copy;
  }

  .card > :global(.proves) {
    grid-area: proves;
    padding-top: 0.5rem;
  }

  .card > :global(.links) {
    grid-area: links;
    align-self: end;
  }

  @container card (width < 15rem) {
    .stage {
      margin: 0.25rem 0.25rem 0;
    }

    .copy,
    .card > :global(:is(.proves, .links)) {
      padding-inline: 0.75rem;
    }

    .tagline {
      font-size: 0.75rem;
      line-height: 1.125rem;
    }
  }
</style>
