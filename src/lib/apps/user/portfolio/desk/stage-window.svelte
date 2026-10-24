<script lang="ts">
  import { IconButton, type IconComponent } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { X as XIcon } from "phosphor-svelte";
  import { flushSync, onMount, untrack, type Snippet } from "svelte";
  import { clamp_to, type Rect } from "./layout";
  import { reveal } from "./reveal";
  import type { PortfolioSession } from "./session.svelte";

  interface Props {
    id: string;
    session: PortfolioSession;
    rect: Rect | null;
    bounds: { width: number; height: number };
    label: string;
    icon: IconComponent;
    meta?: Snippet;
    onclose?: () => void;
    footer?: Snippet;
    /** Whether the frame has its final box and the layout has stopped moving: content that measures or plays waits for this. */
    children: Snippet<[boolean]>;
  }

  let { id, session, rect, bounds, label, icon: Icon, meta, onclose, children, footer }: Props = $props();

  const uid = $props.id();
  const DRAG_THRESHOLD = 4;

  let node: HTMLElement | null = $state(null);
  let flash: HTMLElement | null = $state(null);
  let landed = $state(false);
  // Entering and leaving morph as one faded layer; resizes keep a solid frame behind the snapshots.
  let fresh = $state(true);
  let drag = $state<{ dx: number; dy: number } | null>(null);

  const focused = $derived(session.stacked || session.order.at(-1) === id);
  const z = $derived((session.order.indexOf(id) + 1) * 2);
  const shown = $derived(rect && drag ? clamp_to({ ...rect, x: rect.x + drag.dx, y: rect.y + drag.dy }, bounds.width, bounds.height) : rect);

  // On the desktop the box is final from the first frame, but graphics and the particle sampler wait for the morph to end:
  // starting them under a running view transition stalls the frame that animates the re-tile.
  onMount(() => {
    // Contact as a dialog leaves its entrance to the app, which reads from it whether the visitor asked for it.
    const entrance = onclose ? undefined : session.take_entrance(id);
    if (!session.stacked) {
      let alive = true;
      session.landing.then(() => {
        if (!alive) return;
        fresh = false;
        landed = true;
      });
      return () => (alive = false);
    }
    fresh = false;
    if (!node || !entrance || entrance.still || motion_reduced()) {
      if (entrance?.scroll && node) reveal(node);
      landed = true;
      return;
    }
    // The page glides to the new window while it rises into place, both at once: the one before it moves up and out as
    // this one comes in, so the pane is never empty and never cuts. Two frames let the room under it grow first.
    const target = node;
    const frame = target.animate([{ opacity: 0, transform: "translateY(1.5rem)" }, { opacity: 1, transform: "none" }], {
      duration: 440,
      delay: entrance.delay + 32,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "backwards",
    });
    let jump = 0;
    if (entrance.scroll) jump = requestAnimationFrame(() => (jump = requestAnimationFrame(() => reveal(target))));
    frame.finished.then(
      () => (landed = true),
      () => (landed = true)
    );
    return () => {
      cancelAnimationFrame(jump);
      frame.cancel();
    };
  });

  let seen = untrack(() => session.pulses[id] ?? 0);
  $effect(() => {
    const count = session.pulses[id] ?? 0;
    if (count === seen) return;
    seen = count;
    if (session.stacked && node) reveal(node);
    if (!motion_reduced()) flash?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: "ease-out" });
  });

  function close() {
    if (onclose) return onclose();
    // The close button leaves with the window; without this, typing to take over stops reaching the app.
    node?.closest<HTMLElement>("[tabindex='-1']")?.focus({ preventScroll: true });
    if (!session.stacked || !node || motion_reduced()) {
      fresh = true;
      flushSync();
      return session.dismiss(id);
    }
    node.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.96 }], { duration: 100, easing: "ease-in", fill: "forwards" }).finished.then(
      () => session.close(id),
      () => session.close(id)
    );
  }

  function grab(event: PointerEvent) {
    if (!rect || session.stacked || event.button !== 0 || (event.target as Element).closest("button, a, input")) return;
    const bar = event.currentTarget as HTMLElement;
    const start = { x: event.clientX, y: event.clientY };
    let frame = 0;
    bar.setPointerCapture(event.pointerId);
    // A click without travel is a focus, not a move: nothing pauses the tour or unpins the tile until the pointer goes 4px.
    const move = (next: PointerEvent) => {
      const dx = next.clientX - start.x;
      const dy = next.clientY - start.y;
      if (!drag && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!drag) {
        session.pause();
        session.held = id;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => (drag = { dx, dy }));
    };
    const end = () => {
      cancelAnimationFrame(frame);
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("lostpointercapture", end);
      if (drag && shown) session.move(id, { x: shown.x, y: shown.y });
      if (session.held === id) session.held = null;
      drag = null;
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("lostpointercapture", end);
  }
</script>

<section
  bind:this={node}
  data-window={id}
  aria-labelledby="{uid}-title"
  class={cn(
    "window flex min-w-0 flex-col overflow-hidden rounded-xl bg-(--portfolio-window) ring-1",
    focused ? "ring-foreground/16" : "ring-foreground/8",
    (!shown || drag || session.moved[id]) && (focused ? "shadow-window-focused" : "shadow-window"),
    shown && "floating",
    shown && focused && "on",
    fresh && "fresh"
  )}
  style:translate={shown ? `${shown.x}px ${shown.y}px` : undefined}
  style:width={shown ? `${shown.width}px` : undefined}
  style:height={shown ? `${shown.height}px` : undefined}
  style:z-index={shown ? z : undefined}
  style:view-transition-name={shown ? `portfolio-${id}` : undefined}
  onpointerdowncapture={() => session.focus(id)}
  onfocusin={() => session.focus(id)}
>
  <div
    onpointerdown={grab}
    role="presentation"
    class={cn(
      "titlebar flex h-10 shrink-0 items-center justify-between gap-2 border-b border-foreground/8 bg-(--portfolio-bar) pr-1.5 pl-3 select-none pointer-coarse:h-12 pointer-coarse:pr-1",
      shown && "touch-none",
      drag && "cursor-grabbing"
    )}
  >
    <div class={cn("title flex min-w-0 items-center gap-2 transition-opacity duration-150", !focused && "opacity-80")}>
      <Icon class="size-4 shrink-0 text-foreground/80" weight="duotone" />
      <h2 id="{uid}-title" class="min-w-0 truncate text-ui font-medium text-foreground">{label}</h2>
    </div>
    {#if meta}
      <div class="ml-auto flex min-w-0 items-center">{@render meta()}</div>
    {/if}
    <!-- One scrolling page has nothing to close: a stray tap there would only lose a section. -->
    {#if !session.stacked}
      <IconButton label="Close {label}" size="sm" class="shrink-0 hover:bg-error hover:text-background active:bg-error/85 pointer-coarse:size-10" onclick={close}><XIcon weight="bold" /></IconButton>
    {/if}
  </div>
  <div class="body min-h-0 flex-1">
    {@render children(landed)}
  </div>
  {#if footer}{@render footer()}{/if}
  <span bind:this={flash} class="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 ring-2 ring-primary ring-inset" aria-hidden="true"></span>
</section>

<style>
  @property --fade-top {
    syntax: "<length>";
    inherits: false;
    initial-value: 0px;
  }

  @property --fade-bottom {
    syntax: "<length>";
    inherits: false;
    initial-value: 0px;
  }

  .window {
    position: relative;
    container: frame / inline-size;
  }

  .floating {
    position: absolute;
    top: 0;
    left: 0;
    contain: layout style;
    view-transition-class: portfolio-window;
  }

  .floating.fresh {
    view-transition-class: portfolio-window portfolio-fresh;
  }

  .floating:global([data-reflow]) {
    view-transition-class: portfolio-window portfolio-reflow;
  }

  .floating.on {
    view-transition-class: portfolio-window portfolio-focused;
  }

  .floating.fresh.on {
    view-transition-class: portfolio-window portfolio-fresh portfolio-focused;
  }

  .floating.on:global([data-reflow]) {
    view-transition-class: portfolio-window portfolio-reflow portfolio-focused;
  }

  .body {
    container: win / inline-size;
  }

  /* A body taller than its tile fades at the edge that has more, so a cut-off card reads as "scroll", not as the end. */
  .floating .body {
    container-type: size;
    overflow-y: auto;
    scroll-padding-block: 1.5rem 2.75rem;
    overscroll-behavior: contain;
  }

  /* Without scroll-driven animations (Firefox) the keyframes would sit on their last frame and fade the top for good. */
  @supports (animation-timeline: scroll()) {
    .floating .body {
      mask-image: linear-gradient(to bottom, transparent, black var(--fade-top), black calc(100% - var(--fade-bottom)), transparent);
      animation: scroll-fade linear both;
      animation-timeline: scroll(self);
    }
  }

  @keyframes scroll-fade {
    0% {
      --fade-top: 0px;
      --fade-bottom: 2.5rem;
    }
    8%,
    92% {
      --fade-top: 1.5rem;
      --fade-bottom: 2.5rem;
    }
    100% {
      --fade-top: 1.5rem;
      --fade-bottom: 0px;
    }
  }
</style>
