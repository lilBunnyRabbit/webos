<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { ArrowUpRight as ArrowUpRightIcon } from "phosphor-svelte";
  import type { Attachment } from "svelte/attachments";
  import PrincipleMarks from "./principle-marks.svelte";
  import type { PortfolioSession } from "./session.svelte";
  import Unbroken from "./unbroken.svelte";
  import { newest_first, start_year, WORK_AXIS, WORK_UNITS, type UnitEntry, type WorkUnit } from "./work-units";

  interface Props {
    session: PortfolioSession;
    compact: boolean;
    still: boolean;
    lit: string | null;
    flashed: string | null;
    mark: (job: string) => Attachment<HTMLElement>;
  }

  let { session, compact, still, lit, flashed, mark }: Props = $props();

  const placed = $derived.by(() => {
    const spans = WORK_AXIS.flatMap(({ id, years }) => {
      const entry = WORK_UNITS.find((unit) => unit.job.id === id);
      if (!entry || years.length === 0) return [];
      const units = newest_first(entry.units);
      // A job whose units carry their own years marks those on the axis instead of even steps, so each year sits beside the work it began.
      const dated = units.some((unit) => start_year(unit.years) !== null);
      const marks = units.map((unit, k) => {
        const year = start_year(unit.years);
        return year !== null && units.slice(0, k).every((before) => start_year(before.years) !== year) ? year : null;
      });
      return [{ entry, units, dated, marks, years: [...years].reverse() }];
    });
    return spans.reverse();
  });
</script>

{#snippet company(entry: UnitEntry)}
  <h3 class={cn("company leading-tight font-semibold tracking-[-0.01em] text-foreground transition-colors duration-300", compact ? "text-[1.0625rem]" : "text-lg")}>
    {#if entry.site}
      <a class="hit relative inline-flex items-center gap-1 hover:underline" href={entry.site} target="_blank" rel="noopener noreferrer">
        {entry.job.company}<ArrowUpRightIcon class="size-3.5 text-primary" weight="bold" />
      </a>
    {:else}
      {entry.job.company}
    {/if}
  </h3>
{/snippet}

{#snippet unit_name(unit: WorkUnit)}
  <h4 class="name flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-ui leading-tight font-semibold text-foreground">
    {#if unit.link && unit.link.label === unit.name}
      <a class="hit relative inline-flex items-center gap-0.5 hover:text-primary hover:underline" href={unit.link.url} target="_blank" rel="noopener noreferrer">
        {unit.name}<ArrowUpRightIcon class="size-3 text-primary" weight="bold" />
      </a>
    {:else}
      {unit.name}
      {#if unit.years}<span class="text-xs font-normal text-foreground/55 tabular-nums">{unit.years}</span>{/if}
      {#if unit.link}
        <a class="hit relative inline-flex items-center gap-0.5 text-xs font-normal whitespace-nowrap text-primary hover:underline" href={unit.link.url} target="_blank" rel="noopener noreferrer">
          {unit.link.label}<ArrowUpRightIcon class="size-3" weight="bold" />
        </a>
      {/if}
    {/if}
  </h4>
{/snippet}

<ol class={cn("axis", compact ? "as-compact" : "as-full", still && "still")}>
  {#each placed as { entry, units, dated, marks, years }, i (entry.job.id)}
    {@const { job, line, proven } = entry}
    {@const on = lit === job.id || flashed === job.id}
    <li {@attach mark(job.id)} class={cn("job", on && "on")} style:--i={i} style:--weight={years.length}>
      <span class="span" aria-hidden="true"></span>
      {#each dated ? [] : years as year, k (year)}
        <span class="tick text-[0.6875rem] text-foreground/55 tabular-nums" style:--at="{(k / years.length) * 100}%" aria-hidden="true">{year}</span>
      {/each}
      <span class="node" aria-hidden="true"></span>
      <div class="rise flex flex-col gap-2.5">
        <header class="head">
          {@render company(entry)}
          <span class="years text-ui font-medium text-foreground/80 tabular-nums transition-colors duration-300">{entry.years}</span>
          <p class="role text-xs text-foreground/65">{job.title} · {job.place}</p>
        </header>

        <p class="max-w-[60ch] text-ui leading-snug text-pretty text-foreground/80"><Unbroken text={line} /></p>

        <ul class="units" aria-label="Work at {job.company}">
          {#each units as unit, k (unit.name)}
            <li class="unit">
              {#if marks[k] !== null}
                <span class="tick at-unit text-[0.6875rem] text-foreground/55 tabular-nums" aria-hidden="true">{marks[k]}</span>
              {/if}
              {@render unit_name(unit)}
              <p class="text-ui leading-snug text-pretty text-foreground/70"><Unbroken text={unit.line} /></p>
            </li>
          {/each}
        </ul>

        <PrincipleMarks principles={proven} name={job.company} {session} />
      </div>
    </li>
  {/each}
</ol>

<style>
  .axis {
    --label: 2.25rem;
    --node: 0.75rem;
    --node-top: 0.4375rem;
    --x: calc(var(--label) + 0.625rem);
    display: flex;
    flex-direction: column;
  }

  .as-full {
    padding: 1.125rem 1.25rem 1.5rem 1rem;
  }

  .as-compact {
    padding: 1rem 1rem 1.5rem 0.75rem;
  }

  .job {
    position: relative;
    padding: 0 0 2.25rem calc(var(--x) + var(--node) / 2 + 1.625rem);
  }

  .job:last-child {
    padding-bottom: 0.75rem;
  }

  /* A job's years are its own stretch of the axis: ticks sit at even steps of it, so a year never lands inside the other job's block. */
  .span {
    position: absolute;
    top: calc(var(--node-top) + var(--node) / 2);
    bottom: calc(1px - var(--node-top) - var(--node) / 2);
    left: calc(var(--x) - 1.5px + var(--node) / 2);
    width: 3px;
    border-radius: 2px;
    background: color-mix(in oklch, var(--primary) 40%, transparent);
    transform-origin: top;
    transition: background-color 300ms;
    animation: draw 700ms var(--ease-out) both;
    animation-delay: calc(var(--enter, 0ms) + 120ms + var(--i) * 260ms);
  }

  .job:last-child .span {
    bottom: 0;
  }

  .tick {
    position: absolute;
    top: calc(var(--node-top) + var(--node) / 2 + var(--at));
    left: 0;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: calc(var(--x) + var(--node) / 2);
    line-height: 1;
    translate: 0 -50%;
    animation: fade 300ms var(--ease-out) both;
    animation-delay: calc(var(--enter, 0ms) + 300ms + var(--i) * 260ms);
  }

  .at-unit {
    top: calc(0.5rem + 0.625rem);
    left: calc(-1 * (var(--x) + var(--node) / 2 + 1.625rem));
    translate: 0 -50%;
  }

  .tick::after {
    content: "";
    flex: 1;
    height: 1px;
    margin-right: 0.125rem;
    background: color-mix(in oklch, var(--foreground) 22%, transparent);
  }

  .node {
    position: absolute;
    top: var(--node-top);
    left: var(--x);
    width: var(--node);
    height: var(--node);
    border-radius: 9999px;
    background: var(--primary);
    box-shadow: 0 0 0 4px var(--portfolio-window);
    transition:
      box-shadow 300ms,
      scale 300ms var(--ease-out);
    animation: node-in 380ms var(--ease-out) both;
    animation-delay: calc(var(--enter, 0ms) + var(--i) * 160ms);
  }

  .on .node {
    scale: 1.25;
    box-shadow:
      0 0 0 4px var(--portfolio-window),
      0 0 0 7px color-mix(in oklch, var(--primary) 22%, transparent);
  }

  .on .span {
    background: var(--primary);
  }

  .on .tick {
    color: var(--primary);
  }

  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.125rem 0.75rem;
    align-items: baseline;
  }

  .role {
    grid-column: 1 / -1;
  }

  .units {
    display: flex;
    flex-direction: column;
  }

  .unit {
    position: relative;
    display: grid;
    gap: 0.125rem;
    padding: 0.5rem 0;
    border-top: 1px solid color-mix(in oklch, var(--foreground) 8%, transparent);
  }

  .unit:last-child {
    border-bottom: 1px solid color-mix(in oklch, var(--foreground) 8%, transparent);
  }

  @container win (width >= 26rem) {
    .unit {
      grid-template-columns: 8.5rem minmax(0, 1fr);
      column-gap: 1rem;
    }

    .name {
      align-self: start;
    }
  }

  /* Room left over goes to each job by its years, so the axis tends to scale as the window grows. Stacked and phone bodies aren't size containers, so a height query never matches there and they keep the plain flow. */
  @container win (height >= 30rem) {
    .axis {
      min-height: 100cqh;
    }

    .job {
      display: flex;
      flex-direction: column;
      flex-grow: var(--weight);
    }

    .rise {
      flex: 1;
    }

    .units {
      flex: 1;
      justify-content: space-between;
    }
  }

  /* A finger gets a 40px target without the row growing and pushing the line away from its name. */
  @media (pointer: coarse) {
    .hit::after {
      content: "";
      position: absolute;
      inset: -0.75rem -0.25rem;
    }
  }

  .on :is(.company, .years) {
    color: var(--primary);
  }

  .rise {
    animation: rise 420ms var(--ease-out) both;
    animation-delay: calc(var(--enter, 0ms) + 30ms + var(--i) * 160ms);
  }

  .still :is(.node, .span, .tick, .rise) {
    animation: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .node,
    .span,
    .company,
    .years {
      transition: none;
    }
  }

  @keyframes draw {
    from {
      scale: 1 0;
    }
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  @keyframes node-in {
    from {
      scale: 0;
      opacity: 0;
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      translate: 0 0.375rem;
    }
  }
</style>
