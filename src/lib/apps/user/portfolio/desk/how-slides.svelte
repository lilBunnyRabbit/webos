<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { Pause as PauseIcon, Play as PlayIcon } from "phosphor-svelte";
  import { PRINCIPLES, PRINCIPLES_INTRO } from "../content/principles";
  import DraftMark from "../draft-mark.svelte";
  import HowGlyph from "./how-glyph.svelte";
  import { Axis, move_of, step_index, swipe_of } from "./how-nav";
  import { HowShown } from "./how-shown.svelte";
  import { PHONE_PRINCIPLE_BEAT, PRINCIPLE_BEAT } from "./script";
  import type { PortfolioSession } from "./session.svelte";
  import Unbroken from "./unbroken.svelte";

  let { session }: { session: PortfolioSession } = $props();

  const uid = $props.id();
  // svelte-ignore state_referenced_locally
  const view = new HowShown(session);
  const shown = $derived(view.principle);
  const at = $derived(view.index);
  const beat = $derived(session.stacked ? PHONE_PRINCIPLE_BEAT : PRINCIPLE_BEAT);
  // `how` skips its pass under reduced motion, so there is nothing to play.
  const playable = !motion_reduced();

  const RING = 2 * Math.PI * 13;
  const total = PRINCIPLES.length;
  const pad = (n: number) => String(n).padStart(2, "0");

  function play() {
    if (session.cycling && session.lit) {
      view.light(session.lit);
      return;
    }
    session.pause();
    session.submit("how");
  }

  function go(move: number) {
    view.light(PRINCIPLES[step_index(at, move, total)].id);
  }

  function turn(event: KeyboardEvent) {
    const move = move_of(event.key, Axis.X);
    if (!move) return;
    event.preventDefault();
    event.stopPropagation();
    go(move);
  }

  let start: { x: number; y: number } | null = null;

  function down(event: PointerEvent) {
    start = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY };
  }

  function up(event: PointerEvent) {
    if (!start) return;
    const move = swipe_of(event.clientX - start.x, event.clientY - start.y);
    start = null;
    if (move) go(move);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class={cn("slides", session.stacked && "flow")} role="group" aria-label="Principles" onkeydown={turn}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div id="{uid}-slide" class="stage" aria-live="polite" onpointerdown={down} onpointerup={up} onpointercancel={() => (start = null)}>
    {#if shown}
      {#key shown.id}
        <article class="slide">
          <HowGlyph principle={shown.id} lit columns={21} class="watermark text-primary" />
          <p class="num clear tabular-nums">{pad(at + 1)}<span>/{pad(total)}</span></p>
          <h3 class="title clear font-semibold text-balance text-foreground">{shown.title}</h3>
          <span class="rule" aria-hidden="true"></span>
          <p class="text-ui text-pretty text-foreground/80"><Unbroken text={shown.line} /> <DraftMark status={shown.status} /></p>
          <p class="proof text-xs text-pretty text-foreground/65">{shown.proof}</p>
        </article>
      {/key}
    {:else}
      <article class="slide cover">
        <p class="num">How I build</p>
        <h3 class="title font-semibold text-balance text-foreground">{total} principles, one at a time</h3>
        <span class="rule" aria-hidden="true"></span>
        <p class="text-ui text-pretty text-foreground/80">{PRINCIPLES_INTRO.text} <DraftMark status={PRINCIPLES_INTRO.status} /></p>
      </article>
    {/if}
  </div>

  <div class="controls flex shrink-0 items-center gap-2">
    {#if playable}
      <button
        class="ring-button"
        aria-label={session.cycling ? "Stop on this one" : `Play all ${total}`}
        title={session.cycling ? "Stop on this one" : `Play all ${total}`}
        onclick={play}
      >
        {@render ring()}
        {#if session.cycling}<PauseIcon class="size-3" weight="fill" />{:else}<PlayIcon class="size-3" weight="fill" />{/if}
      </button>
    {:else}
      <span class="ring-button" aria-hidden="true">{@render ring()}</span>
    {/if}
    <div class="numbers flex min-w-0 flex-1 items-center gap-1">
      {#each PRINCIPLES as principle, i (principle.id)}
        <button
          class={cn("number tabular-nums", i === at && "here")}
          aria-label={principle.title}
          title={principle.title}
          aria-pressed={session.lit === principle.id}
          aria-controls="{uid}-slide"
          onclick={() => view.toggle(principle.id)}
          {...view.peek(principle.id)}
        >
          {pad(i + 1)}
        </button>
      {/each}
    </div>
  </div>
</div>

{#snippet ring()}
  {#key `${at}:${session.cycling}`}
    <svg class={cn("dial", session.cycling && "timed")} viewBox="0 0 32 32" aria-hidden="true" style:--beat="{beat}ms" style:--c="{RING}px" style:--from={Math.max(0, at) / total} style:--to={(at + 1) / total}>
      <circle class="track" cx="16" cy="16" r="13" />
      <circle class="arc" cx="16" cy="16" r="13" />
    </svg>
  {/key}
{/snippet}

<style>
  .slides {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
  }

  .slides.flow {
    flex: none;
  }

  .stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
  }

  .flow .stage {
    overflow: visible;
  }

  .slide {
    position: relative;
    display: flex;
    min-height: 100%;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1rem 0.5rem 0.75rem;
  }

  .slide.cover {
    justify-content: center;
  }


  .slide > :not(:global(.watermark)) {
    position: relative;
    animation: rise 460ms var(--ease-out) backwards;
  }

  .slide > :nth-child(3) {
    animation-delay: 90ms;
  }

  .slide > .rule {
    animation: draw 520ms var(--ease-out) 240ms backwards;
  }

  .slide > :nth-child(5) {
    animation-delay: 380ms;
  }

  .slide > :nth-child(6) {
    animation-delay: 640ms;
  }

  .cover > :nth-child(2) {
    animation-delay: 90ms;
  }

  .cover > :nth-child(4) {
    animation-delay: 380ms;
  }

  .slide {
    --mark: 6.5rem;
  }

  .slide > .clear {
    padding-right: calc(var(--mark) + 0.75rem);
  }

  .slide :global(.watermark) {
    position: absolute;
    top: 0;
    right: 0;
    width: var(--mark);
    height: var(--mark);
    opacity: 0.2;
    pointer-events: none;
  }

  .num span {
    color: color-mix(in oklch, var(--foreground) 45%, transparent);
  }

  .num {
    font-family: var(--font-mono);
    font-size: var(--text-ui);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--primary);
  }

  .title {
    font-size: var(--text-xl);
    line-height: 1.2;
    letter-spacing: -0.01em;
  }

  .rule {
    display: block;
    width: 2.5rem;
    height: 2px;
    border-radius: 1px;
    background: var(--primary);
    transform-origin: left;
  }

  .proof {
    max-width: 34rem;
    padding-left: 0.625rem;
    border-left: 2px solid color-mix(in oklch, var(--primary) 50%, transparent);
  }

  @keyframes rise {
    from {
      opacity: 0;
      translate: 0 0.5rem;
    }
  }

  @keyframes draw {
    from {
      scale: 0 1;
    }
  }

  .controls {
    padding-top: 0.5rem;
    border-top: 1px solid var(--portfolio-edge);
  }

  .ring-button {
    position: relative;
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    flex: none;
    place-items: center;
    border-radius: 999px;
    color: var(--primary);
  }

  button.ring-button:hover {
    background: color-mix(in oklch, var(--primary) 10%, transparent);
  }

  .dial {
    position: absolute;
    inset: 0.125rem;
    rotate: -90deg;
    fill: none;
    stroke-width: 2;
  }

  .dial .track {
    stroke: color-mix(in oklch, var(--foreground) 14%, transparent);
  }

  .dial .arc {
    stroke: var(--primary);
    stroke-linecap: round;
    stroke-dasharray: var(--c);
    stroke-dashoffset: calc(var(--c) * (1 - var(--to)));
    transition: stroke-dashoffset 400ms var(--ease-out);
  }

  .dial.timed .arc {
    animation: ring-fill var(--beat) linear backwards;
  }

  @keyframes ring-fill {
    from {
      stroke-dashoffset: calc(var(--c) * (1 - var(--from)));
    }
  }

  .number {
    display: grid;
    flex: 1 1 0;
    min-width: 0;
    max-width: 3.5rem;
    height: 2.25rem;
    place-items: center;
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: var(--text-ui);
    letter-spacing: 0.06em;
    color: color-mix(in oklch, var(--foreground) 55%, transparent);
    transition: color 200ms, background-color 200ms;
  }

  .number:hover {
    background: color-mix(in oklch, var(--foreground) 5%, transparent);
    color: var(--foreground);
  }

  .number.here {
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 14%, transparent);
  }

  .number:focus-visible,
  .ring-button:focus-visible {
    outline: 2px solid var(--cottontail);
    outline-offset: -2px;
  }

  @media (pointer: coarse) {
    .number,
    .ring-button {
      height: 2.75rem;
    }

    .ring-button {
      width: 2.75rem;
    }
  }

  @container win (width >= 26rem) {
    .title {
      font-size: var(--text-2xl);
    }

    .slide {
      --mark: 8rem;
    }
  }

  @container win (height < 19rem) {
    .slide > .clear {
      padding-right: 0;
    }

    .slide {
      gap: 0.25rem;
      padding-block: 0.25rem;
    }

    .title {
      font-size: var(--text-base);
    }

    .slide :global(.watermark) {
      display: none;
    }

    .number,
    .ring-button {
      height: 1.75rem;
    }

    .ring-button {
      width: 1.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .slide > *,
    .slide > .rule,
    .dial.timed .arc {
      animation: none;
    }

    .dial .arc,
    .number {
      transition: none;
    }
  }
</style>
