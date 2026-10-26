<script lang="ts">
  import { button } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { motion_reduced } from "$lib/core/utils/motion";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowDown as ArrowDownIcon,
    ArrowUp as ArrowUpIcon,
    Briefcase as BriefcaseIcon,
    Compass as CompassIcon,
    EnvelopeSimple as EnvelopeSimpleIcon,
    Rabbit as RabbitIcon,
    SquaresFour as SquaresFourIcon,
  } from "phosphor-svelte";
  import { flushSync, onMount, tick, untrack } from "svelte";
  import { cubicOut, quintOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import { ALSO, MORE, PACKAGES } from "./content/projects";
  import { tile_count } from "./desk/project-more";
  import Backdrop from "./desk/backdrop.svelte";
  import ContactWindow from "./desk/contact-window.svelte";
  import IdentityFooter from "./desk/identity-footer.svelte";
  import IdentityWindow from "./desk/identity-window.svelte";
  import HowWindow from "./desk/how-window.svelte";
  import { clamp_to, compose, fits_rail, rail_width, type Rect } from "./desk/layout";
  import ProjectsWindow from "./desk/projects-window.svelte";
  import { PROJECTS_CAROUSEL_MS, PROJECTS_PLAY_MS } from "./desk/project-timing";
  import { bring_into, glide, land } from "./desk/reveal";
  import { COMMAND_OF, PROJECTS, PROJECTS_LINGER, Win, WINDOWS } from "./desk/script";
  import { PortfolioSession, TourState } from "./desk/session.svelte";
  import StageWindow from "./desk/stage-window.svelte";
  import Terminal from "./desk/terminal.svelte";
  import TimelineWindow from "./desk/timeline-window.svelte";
  import type { SectionId } from "./ids";

  let { section }: { section?: SectionId } = $props();

  // Element-scoped view transitions ship in current Chrome but not yet in TypeScript's DOM types.
  interface ScopedStage extends HTMLElement {
    startViewTransition?: (update: () => void) => ViewTransition;
  }

  // Matches the `.retiling` entrance delay in the styles below.
  const ENTER_AFTER_RETILE = 320;
  // Match the re-tile (460 ms) and a new window's entrance (420 ms) in the styles below.
  const GLIDE = 460;
  const ARRIVE = 420;
  // The re-tile morph, then the new window's entrance after it: the graphics start once both are done.
  const LANDING = 780;
  // A phone has no re-tile to wait for, only the window's rise.
  const STACKED_LANDING = 300;
  const PHONE_LINGER = 300;
  const PHONE_WORK_HOLD = 2200;
  const SMALLER = tile_count([...PACKAGES, ...MORE, ...ALSO]);
  const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);
  const LABELS: Record<string, string> = {
    [Win.IDENTITY]: "Who I am",
    [Win.HOW]: "How I build",
    [Win.TIMELINE]: "Work",
    [Win.PROJECTS]: "Projects",
    [Win.CONTACT]: "Contact",
  };
  const WINDOW_OF: Record<SectionId, string> = { who: Win.IDENTITY, work: Win.TIMELINE, projects: Win.PROJECTS, how: Win.HOW, contact: Win.CONTACT };
  const ICONS = { [Win.IDENTITY]: RabbitIcon, [Win.HOW]: CompassIcon, [Win.TIMELINE]: BriefcaseIcon, [Win.PROJECTS]: SquaresFourIcon, [Win.CONTACT]: EnvelopeSimpleIcon };

  const still = motion_reduced();
  const session = new PortfolioSession(still);
  // Before the first render: the terminal's wording reads it, and a plain field never re-renders it.
  session.coarse = matchMedia("(pointer: coarse)").matches;
  const { window: handle } = get_app_context();

  let root: HTMLElement | null = $state(null);
  let terminal: Terminal | null = $state(null);
  let pane: HTMLElement | null = $state(null);
  let stage: ScopedStage | null = $state(null);
  let root_width = $state(0);
  let root_height = $state(0);
  let stage_width = $state(0);
  let stage_height = $state(0);
  let started = false;

  const stacked = $derived(root_width > 0 && !fits_rail(root_width, root_height));
  const composition = $derived(compose(stage_width, stage_height, session.open));
  const floating_contact = $derived(!stacked && session.open.includes(Win.CONTACT));
  const shown = $derived(WINDOWS.filter((id) => session.open.includes(id) && (stacked || id !== Win.CONTACT)));
  const empty = $derived(shown.length === 0 && session.tour !== TourState.PLAYING);
  const subject = $derived(session.subject.trim());
  const label_of = (id: string) => (id === Win.CONTACT && subject ? `New message: ${subject}` : LABELS[id]);

  $effect(() => {
    session.stacked = stacked;
  });

  // The tour waits for the first measurement: a phone starts differently, and the width isn't known at mount.
  $effect(() => {
    if (root_width === 0 || started) return;
    started = true;
    untrack(() => (section ? open_at(WINDOW_OF[section]) : session.start()));
  });

  $effect(() => {
    if (!root) return;
    const node = root;
    node.addEventListener("keydown", keydown);
    return () => node.removeEventListener("keydown", keydown);
  });

  // A click on the page's background leaves focus on the body, outside this region: typing there still reaches the prompt.
  $effect(() => {
    const stray = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if ((active && active !== document.body) || !handle.is_focused) return;
      keydown(event);
    };
    document.addEventListener("keydown", stray);
    return () => document.removeEventListener("keydown", stray);
  });

  $effect(() => {
    if (!pane || !stacked) return;
    const node = pane;
    const pause = () => session.pause();
    const events = ["wheel", "touchstart", "pointerdown"] as const;
    for (const name of events) node.addEventListener(name, pause, { passive: true });
    return () => {
      for (const name of events) node.removeEventListener(name, pause);
    };
  });

  // On the desktop a lit principle brings each card or job that shows it whole into its window, in the pass and on a
  // click alike. On a phone nothing scrolls per beat: the page stays on Who I am, and the evidence below only lights.
  $effect(() => {
    const id = session.lit;
    void session.reveal;
    if (!id || !stage || stacked) return;
    const scope = stage;
    const frame = requestAnimationFrame(() => {
      // One card per window: with several lit, each scroll would undo the last one.
      const seen = new Set<Element | null>();
      for (const holder of scope.querySelectorAll<HTMLElement>("article:has(.chip.lit), li.job.lit")) {
        const body = holder.closest(".body");
        if (seen.has(body)) continue;
        seen.add(body);
        bring_into(holder);
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  onMount(() => {
    session.morph = morph;
    // A phone tour stays near twenty seconds: its cards go by one at a time, so it lingers less after them, and Work is
    // one short window it reads at a glance.
    session.hold_for = (line) => {
      if (line === COMMAND_OF[Win.PROJECTS]) return session.stacked ? STACKED_LANDING + PROJECTS_CAROUSEL_MS + PHONE_LINGER : LANDING + PROJECTS_PLAY_MS + PROJECTS_LINGER;
      if (line === COMMAND_OF[Win.TIMELINE] && session.stacked) return PHONE_WORK_HOLD;
      return undefined;
    };
    root?.focus({ preventScroll: true });
    return () => session.destroy();
  });

  let dialog: HTMLElement | null = $state(null);
  let return_to: HTMLElement | null = null;

  // A visitor who asks for Contact gets focus in it and back where they were after; the tour's Contact never takes it.
  $effect(() => {
    const node = dialog;
    if (!node) return;
    const entrance = untrack(() => session.take_entrance(Win.CONTACT));
    return_to = null;
    if (!entrance?.invited) return;
    const active = document.activeElement;
    return_to = active instanceof HTMLElement && active !== document.body ? active : null;
    (node.querySelector<HTMLInputElement>("input") ?? node).focus({ preventScroll: true });
  });

  // The swarm forms once the window has risen into place, so one thing moves at a time.
  let contact_ready = $state(still);
  $effect(() => {
    if (!floating_contact) contact_ready = still;
  });

  function close_contact() {
    const inside = dialog?.contains(document.activeElement);
    session.dismiss(Win.CONTACT);
    if (!inside) return;
    const back = return_to?.isConnected && !dialog?.contains(return_to) ? return_to : root;
    back?.focus({ preventScroll: true });
    return_to = null;
  }

  function pop(_: Element, { out }: { out: boolean }) {
    if (still) return { duration: 0 };
    return out
      ? { duration: 130, easing: cubicOut, css: (t: number) => `opacity: ${t}; scale: ${0.98 + 0.02 * t}` }
      : { delay: 90, duration: 380, easing: quintOut, css: (t: number) => `opacity: ${t}; scale: ${0.97 + 0.03 * t}; translate: 0 ${(1 - t) * 1.25}rem` };
  }

  function reveal_next(event: MouseEvent, id: string) {
    (event.currentTarget as HTMLElement).blur();
    stage?.querySelector<HTMLElement>(`:scope > [data-window="${id}"]`)?.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function open_at(id: string) {
    session.start_at(id);
    if (!stacked || id === Win.IDENTITY) return;
    // From layout, not the box on screen: the window is still rising into place, drawn lower than where it will rest.
    void tick().then(() => {
      const node = stage?.querySelector<HTMLElement>(`:scope > [data-window="${id}"]`);
      if (node) land(node);
    });
  }

  function top() {
    if (pane) glide(pane, 0);
  }

  // While a re-tile runs, the frames draw the edge and the shadow and the snapshots carry neither: a window that
  // changes size reads as one window, never as a smaller one inside an empty frame. A window whose width changes
  // reflows its content, so its new picture fades in over the old one. A new window waits for the others only when
  // they actually move.
  function morph(change: () => void, leaving: string[]): Promise<void> {
    const scope = stage;
    if (!scope) {
      change();
      return Promise.resolve();
    }
    // Safari has no element-scoped view transitions: the windows slide on CSS transitions instead, the way the shades do.
    if (!scope.startViewTransition) {
      if (still) {
        change();
        return Promise.resolve();
      }
      const windows = () => [...scope.querySelectorAll<HTMLElement>(":scope > .window")];
      const shades = () => [...(scope.previousElementSibling?.querySelectorAll<HTMLElement>(":scope > .shade") ?? [])];
      const before = new Set(windows());
      const shaded = new Set(shades());
      scope.classList.add("gliding");
      flushSync(change);
      const enter = before.size > 0 ? ENTER_AFTER_RETILE : 0;
      const arriving = windows().filter((node) => !before.has(node));
      for (const node of arriving) {
        node.style.setProperty("--enter", `${enter}ms`);
        // An attribute, not a class: Svelte rewrites the window's class list as its state changes.
        node.dataset.arriving = "";
      }
      for (const node of shades()) if (!shaded.has(node)) node.style.setProperty("--enter", `${enter}ms`);
      return new Promise<void>((resolve) => setTimeout(resolve, Math.max(GLIDE, enter + ARRIVE))).finally(() => {
        scope.classList.remove("gliding");
        for (const node of arriving) delete node.dataset.arriving;
      });
    }
    scope.classList.add("morphing");
    const windows = () => [...scope.querySelectorAll<HTMLElement>(":scope > .window")];
    const box = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      return `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;
    };
    // A named element that leaves aborts an element-scoped transition (Chrome: "Prepaint layout check failed"), so a
    // closing window goes unnamed and fades out with the stage's own snapshot instead.
    const leavers = windows().filter((node) => leaving.includes(node.dataset.window ?? ""));
    for (const node of leavers) node.style.viewTransitionName = "none";
    const shades = () => [...(scope.previousElementSibling?.querySelectorAll<HTMLElement>(":scope > .shade") ?? [])];
    const shaded = new Set(shades());
    const before = new Map(windows().map((node) => [node, { width: node.offsetWidth, box: box(node) }]));
    const transition = scope.startViewTransition(() => {
      flushSync(change);
      let moved = false;
      for (const node of windows()) {
        const was = before.get(node);
        if (!was) continue;
        if (was.width !== node.offsetWidth) node.dataset.reflow = "";
        if (was.box !== box(node)) moved = true;
      }
      scope.classList.toggle("retiling", moved);
      // What a new window plays inside itself starts with its entrance, not under the still invisible picture.
      for (const node of windows()) if (!before.has(node)) node.style.setProperty("--enter", moved ? `${ENTER_AFTER_RETILE}ms` : "0ms");
      for (const node of shades()) if (!shaded.has(node)) node.style.setProperty("--enter", moved ? `${ENTER_AFTER_RETILE}ms` : "0ms");
    });
    transition.ready.catch(() => {});
    return transition.finished
      .catch(() => {})
      .finally(() => {
        scope.classList.remove("morphing", "retiling");
        for (const node of windows()) delete node.dataset.reflow;
        for (const node of leavers) if (node.isConnected) node.style.viewTransitionName = `portfolio-${node.dataset.window}`;
      });
  }

  // The header's count is the way to the packages and smaller projects, which sit under the featured cards inside the window.
  function to_smaller() {
    const target = stage?.querySelector<HTMLElement>(`:scope > [data-window="${Win.PROJECTS}"] [data-smaller]`);
    const body = target?.closest<HTMLElement>(".body");
    if (!target || !body) return;
    body.scrollTo({ top: target.offsetTop - 12, behavior: motion_reduced() ? "instant" : "smooth" });
    target.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  }

  function rect_of(id: string): Rect {
    const slot = composition.slots[id];
    const moved = session.moved[id];
    return moved ? clamp_to({ ...slot, ...moved }, stage_width, stage_height) : slot;
  }

  function keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || MODIFIERS.has(event.key)) return;
    // Escape closes Contact from anywhere, the prompt included: a line being typed has already taken its Escape.
    if (event.key === "Escape" && floating_contact) {
      event.preventDefault();
      return close_contact();
    }
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return session.pause();
    if (event.key === "/") {
      event.preventDefault();
      return terminal?.focus_prompt("/");
    }
    if (event.key.length === 1 && event.key !== " ") {
      event.preventDefault();
      return terminal?.focus_prompt(event.key);
    }
    if (event.key === "Escape" && session.tour === TourState.PLAYING) {
      event.preventDefault();
      return terminal?.focus_prompt();
    }
    session.pause();
  }
</script>

{#snippet status()}
  <IdentityFooter {session} />
{/snippet}

{#snippet count()}
  <span class="flex min-w-0 items-center gap-1 pr-1 text-xs whitespace-nowrap text-foreground/65 tabular-nums">
    <span class="truncate">{PROJECTS.length} featured,</span>
    <button class="smaller -mx-1 inline-flex h-7 shrink-0 pointer-coarse:h-10 items-center gap-1 rounded-md px-1.5 text-foreground/80 transition-colors hover:bg-foreground/6 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-cottontail" onclick={to_smaller}>
      {SMALLER} more<ArrowDownIcon class="size-3" weight="bold" />
    </button>
  </span>
{/snippet}

<div
  bind:this={root}
  bind:clientWidth={root_width}
  bind:clientHeight={root_height}
  class="portfolio h-full min-h-0 text-foreground outline-none"
  class:stacked
  tabindex="-1"
  role="region"
  aria-label="Portfolio: a terminal on one side, windows on the other"
>
  <Backdrop />

  {#if stacked}
    <div class="terminal-pane min-h-0">
      <Terminal bind:this={terminal} {session} compact />
    </div>
  {:else}
    <div class="rail min-h-0" style:width="{rail_width(root_width)}px">
      <Terminal bind:this={terminal} {session} compact={false} />
    </div>
  {/if}

  <div class="stage-wrap relative min-h-0">
    <div bind:this={pane} class="stage-pane">
      {#if !stacked}
        <div class="shades" aria-hidden="true">
          {#each shown as id (id)}
            {#if !session.moved[id] && session.held !== id}
              {@const box = rect_of(id)}
              <span
                class={cn("shade", session.order.at(-1) === id ? "shadow-window-focused" : "shadow-window")}
                style:translate="{box.x}px {box.y}px"
                style:width="{box.width}px"
                style:height="{box.height}px"
                out:fade={{ duration: still ? 0 : 240 }}
              ></span>
            {/if}
          {/each}
        </div>
      {/if}
      <div bind:this={stage} class="stage portfolio-stage" bind:clientWidth={stage_width} bind:clientHeight={stage_height}>
        {#if empty}
          {@const free = composition.free}
          <div
            class={cn("empty flex flex-col items-center gap-3 px-6 text-center", stacked ? "justify-center py-10" : "justify-start")}
            style:translate={stacked ? undefined : `${free.x}px ${free.y}px`}
            style:width={stacked ? undefined : `${free.width}px`}
            style:height={stacked ? undefined : `${free.height}px`}
          >
            <p class="text-ui text-foreground/80">Nothing open. Pick a window, or type in the terminal.</p>
            <div class="flex flex-wrap justify-center gap-1.5">
              {#each WINDOWS as id (id)}
                {@const Icon = ICONS[id as keyof typeof ICONS]}
                <button class={button({ variant: "secondary", size: "md" })} onclick={() => (session.pause(), session.submit(COMMAND_OF[id]))}><Icon weight="bold" />{LABELS[id]}</button>
              {/each}
            </div>
          </div>
        {/if}

        {#each shown as id (id)}
          <StageWindow
            {id}
            {session}
            rect={stacked ? null : rect_of(id)}
            bounds={{ width: stage_width, height: stage_height }}
            label={label_of(id)}
            icon={ICONS[id as keyof typeof ICONS]}
            meta={id === Win.PROJECTS ? count : undefined}
            footer={id === Win.IDENTITY ? status : undefined}
          >
            {#snippet children(settled)}
              {#if id === Win.IDENTITY}
                <IdentityWindow {session} ready={settled} hero={!stacked && composition.hero} />
              {:else if id === Win.HOW}
                <HowWindow {session} />
              {:else if id === Win.TIMELINE}
                <TimelineWindow {session} {settled} compact={stacked} />
              {:else if id === Win.PROJECTS}
                <ProjectsWindow {session} {settled} />
              {:else}
                <ContactWindow {session} ready={settled} />
              {/if}
            {/snippet}
          </StageWindow>
          {#if id === Win.IDENTITY && stacked && still && shown.length > 1}
            {@const next = shown[1]}
            <button class={button({ variant: "quiet", size: "md", class: "below -my-1 h-10 self-center px-4 text-foreground/80" })} onclick={(event) => reveal_next(event, next)}>
              <ArrowDownIcon weight="bold" />{shown.slice(1).map((other) => LABELS[other]).join(", ")} below
            </button>
          {/if}
        {/each}

        {#if stacked && shown.length > 0}
          <footer class="tail flex flex-col items-center justify-start gap-1 pt-2">
            {#if session.tour !== TourState.PLAYING}
              <div class="flex flex-wrap justify-center gap-1">
                <button class={button({ variant: "quiet", size: "md", class: "h-10 text-foreground/80" })} onclick={top}><ArrowUpIcon weight="bold" />Back to top</button>
                <button class={button({ variant: "quiet", size: "md", class: "h-10 text-foreground/80" })} onclick={() => (top(), session.replay())}><ArrowCounterClockwiseIcon weight="bold" />Replay the tour</button>
              </div>
            {/if}
          </footer>
        {/if}
      </div>
    </div>
  </div>

  {#if floating_contact}
    <div class="contact-layer">
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="scrim" onclick={close_contact} transition:fade={{ duration: still ? 0 : 220 }}></div>
      <div bind:this={dialog} class="contact-dialog outline-none" role="dialog" aria-label={LABELS[Win.CONTACT]} tabindex="-1" in:pop={{ out: false }} out:pop={{ out: true }} onintroend={() => (contact_ready = true)}>
        <StageWindow id={Win.CONTACT} {session} rect={null} bounds={{ width: stage_width, height: stage_height }} label={label_of(Win.CONTACT)} icon={EnvelopeSimpleIcon} onclose={close_contact}>
          {#snippet children()}<ContactWindow {session} ready={contact_ready} />{/snippet}
        </StageWindow>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Light palettes get two near values per window instead of the dark ladder, whose deep shades turn loud in light. */
  .portfolio {
    /* Gentler than --ease-out, which spends most of a re-tile's travel in its first frames and reads as a jump. */
    --portfolio-move: cubic-bezier(0.3, 0.7, 0.2, 1);
    --portfolio-desk: light-dark(var(--background), var(--background-dark));
    --portfolio-window: light-dark(var(--background-lighter), var(--background));
    --portfolio-bar: var(--background-light);
    --portfolio-card: light-dark(var(--background-lighter), var(--background-light));
    --portfolio-inset: light-dark(var(--background), var(--background-darker));
    --portfolio-terminal: light-dark(var(--background-light), var(--background-darker));
    --portfolio-edge: color-mix(in oklch, var(--foreground) 8%, transparent);
    --portfolio-edge-focused: color-mix(in oklch, var(--foreground) 16%, transparent);
    container: portfolio / size;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    position: relative;
    background: var(--portfolio-desk);
    hyphens: manual;
  }

  .contact-layer {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    pointer-events: none;
  }

  .scrim {
    position: absolute;
    inset: 0;
    background: color-mix(in oklch, var(--background-darkest) 55%, transparent);
    pointer-events: auto;
  }

  .contact-dialog {
    position: relative;
    display: flex;
    width: min(50rem, 100%);
    max-height: 100%;
    pointer-events: auto;
  }

  .contact-dialog > :global(.window) {
    flex: 1;
    max-height: 100%;
  }

  .contact-dialog :global(.body) {
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .stage-pane {
    position: absolute;
    inset: 0;
  }

  .stage {
    position: absolute;
    inset: 0;
  }

  .stage.gliding > :global(.window) {
    transition:
      translate 460ms var(--portfolio-move),
      width 460ms var(--portfolio-move),
      height 460ms var(--portfolio-move);
  }

  /* `scale` and opacity only: the window's `translate` is its place on the stage. */
  .stage.gliding > :global(.window[data-arriving]) {
    animation: portfolio-glide-in 420ms var(--ease-out) var(--enter, 0ms) both;
  }

  @keyframes portfolio-glide-in {
    from {
      opacity: 0;
      scale: 0.97;
    }
  }

  /* Tiled shadows live outside the stage, so a re-tile's snapshots never carry or rasterize them: each slides with its
     window at the morph's own timing, and none falls across a gap onto a neighbour. */
  .shades {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .shade {
    position: absolute;
    top: 0;
    left: 0;
    border-radius: 0.75rem;
    transition:
      translate 460ms var(--portfolio-move),
      width 460ms var(--portfolio-move),
      height 460ms var(--portfolio-move),
      box-shadow 150ms;
    animation: portfolio-shade-in 420ms var(--ease-out) var(--enter, 0ms) both;
  }

  @keyframes portfolio-shade-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shade {
      transition: none;
      animation: none;
    }
  }

  .empty {
    position: absolute;
    top: 0;
    left: 0;
    padding-top: clamp(2rem, 18cqh, 10rem);
  }

  .portfolio:not(.stacked) {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .rail {
    position: relative;
    z-index: 1;
  }

  .portfolio.stacked {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .stacked .terminal-pane {
    position: relative;
    z-index: 2;
  }

  .stacked .stage-pane {
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .stacked .stage {
    position: static;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 0.875rem 0.875rem 2rem;
  }

  .stacked .stage :global(.window) {
    scroll-margin-top: 0.875rem;
  }

  /* Without the tour, the first screen says there is more: a quiet line in the page between Who I am and Work, never
     a pill over the text. */
  .below {
    border-radius: 999px;
  }

  /* The frame is the window while it moves: ring and shadow live on it, never in the snapshots inside. */
  .portfolio-stage:global(.morphing) :global(.window) {
    box-shadow: none;
    transition: none;
  }

  /*
   * The frame resizes; the pictures inside it never scale. A window that only moves or changes height shows its new
   * picture at once, clipped by the frame as it travels. A window whose width changes reflows: its new picture fades in
   * over the old one, so the frame never stands empty.
   */
  :global(.portfolio-stage::view-transition-group(.portfolio-window)) {
    animation-duration: 460ms;
    animation-timing-function: var(--portfolio-move);
    overflow: clip;
    border-radius: 0.75rem;
    background: linear-gradient(var(--portfolio-bar) 0 2.5rem, var(--portfolio-edge) 2.5rem calc(2.5rem + 1px), var(--portfolio-window) calc(2.5rem + 1px));
    box-shadow: 0 0 0 1px var(--portfolio-edge);
  }

  :global(.portfolio-stage::view-transition-image-pair(.portfolio-window)) {
    overflow: clip;
  }

  :global(.portfolio-stage::view-transition-old(.portfolio-window)),
  :global(.portfolio-stage::view-transition-new(.portfolio-window)) {
    width: auto;
    height: auto;
    object-fit: none;
    object-position: left top;
    inset: 0 auto auto 0;
  }

  :global(.portfolio-stage::view-transition-old(.portfolio-window)) {
    animation: none;
    opacity: 0;
  }

  :global(.portfolio-stage::view-transition-new(.portfolio-window)) {
    animation: none;
  }

  /* The new picture fades in over the old, which holds until it is nearly covered: the frame is never empty. */
  :global(.portfolio-stage::view-transition-old(.portfolio-reflow)) {
    opacity: 1;
    animation: portfolio-window-under 260ms linear both;
  }

  :global(.portfolio-stage::view-transition-new(.portfolio-reflow)) {
    animation: portfolio-window-fade 260ms var(--ease-out) both;
  }

  :global(.portfolio-stage::view-transition-group(.portfolio-focused)) {
    box-shadow: 0 0 0 1px var(--portfolio-edge-focused);
  }

  /* A window that enters or leaves has no frame to hold it: the snapshot itself carries the edge and fades with it. */
  :global(.portfolio-stage::view-transition-group(.portfolio-fresh)) {
    background: none;
    box-shadow: none;
    overflow: visible;
  }

  :global(.portfolio-stage::view-transition-image-pair(.portfolio-fresh)) {
    overflow: visible;
  }

  :global(.portfolio-stage::view-transition-new(.portfolio-fresh)),
  :global(.portfolio-stage::view-transition-old(.portfolio-fresh)) {
    opacity: 1;
    border-radius: 0.75rem;
    box-shadow: 0 0 0 1px var(--portfolio-edge);
  }

  :global(.portfolio-stage::view-transition-new(.portfolio-fresh.portfolio-focused)) {
    box-shadow: 0 0 0 1px var(--portfolio-edge-focused);
  }

  :global(.portfolio-stage::view-transition-new(.portfolio-fresh)) {
    animation: portfolio-window-in 420ms var(--ease-out) both;
  }

  /* Only when the others move does a new window wait, and only until they are nearly in place. */
  :global(.portfolio-stage.retiling::view-transition-new(.portfolio-fresh)) {
    animation-delay: 320ms;
  }

  :global(.portfolio-stage::view-transition-old(root)),
  :global(.portfolio-stage::view-transition-new(root)) {
    animation-duration: 240ms;
    animation-timing-function: var(--ease-out);
  }

  @keyframes -global-portfolio-window-under {
    80% {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  @keyframes -global-portfolio-window-fade {
    from {
      opacity: 0;
    }
  }

  @keyframes -global-portfolio-window-in {
    from {
      opacity: 0;
      scale: 0.97;
      translate: 0 0.5rem;
    }
  }

  @keyframes -global-portfolio-window-out {
    to {
      opacity: 0;
    }
  }
</style>
