<script lang="ts" module>
  export interface Span {
    start: number;
    end: number;
  }
</script>

<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { peak_index, peaks_between } from "$kit/utils/audio/regions";
  import { pcm_length, type Pcm } from "$kit/utils/audio/wav";
  import {
    ArrowsOutLineHorizontal as FitIcon,
    CaretLeft as LeftIcon,
    CaretRight as RightIcon,
    MagnifyingGlassMinus as ZoomOutIcon,
    MagnifyingGlassPlus as ZoomInIcon,
    Selection as ZoomSelectionIcon,
  } from "phosphor-svelte";
  import { flushSync, untrack } from "svelte";
  import {
    dragged_time,
    edge_speed,
    follow,
    max_zoom,
    nudge_step,
    pinch_zoom,
    px_per_second,
    tick_label,
    tick_step,
    ticks,
    visible_span,
    zoom_at,
    zoom_to,
    ZOOM_STEP,
    type Pinch,
    type Viewport,
    type ZoomState,
  } from "./zoom";

  interface Props {
    pcm: Pcm;
    start: number;
    end: number;
    selection?: Span | null;
    playhead?: number | null;
    label?: string;
    class?: string;
  }

  let {
    pcm,
    start = $bindable(),
    end = $bindable(),
    selection = $bindable(null),
    playhead = null,
    label = "Sound",
    class: class_name,
  }: Props = $props();

  const MIN_SPAN = 0.05;
  const MIN_SELECTION = 0.001;
  const TAP_PX = 4;
  const EDGE_PX = 32;
  const TICK_PX = 72;
  const LONG_PRESS_MS = 400;
  const FOCUS_MARGIN = 56;

  const Marker = { START: "start", END: "end", FROM: "from", TO: "to" } as const;
  type Marker = (typeof Marker)[keyof typeof Marker];
  const NAMES: Record<Marker, string> = { start: "Trim start", end: "Trim end", from: "Selection start", to: "Selection end" };
  const SHORT: Record<Marker, string> = { start: "Start", end: "End", from: "From", to: "To" };

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const duration = $derived(pcm_length(pcm) / pcm.sample_rate || 0);
  const index = $derived(peak_index(pcm));

  let scroller = $state<HTMLElement | null>(null);
  let content = $state<HTMLElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let width = $state(0);
  let height = $state(0);
  let zoom = $state(1);
  let scroll = $state(0);
  let chosen = $state<Marker>(Marker.START);

  const limit = $derived(max_zoom(duration, width, pcm.sample_rate));
  const view = $derived<Viewport>({ zoom, scroll, width, duration });
  const visible = $derived(visible_span(view));
  const step = $derived(tick_step(px_per_second(view), TICK_PX));
  const marks = $derived(ticks(visible, step));
  const zoomed = $derived(zoom > 1);
  // The nudges always have a marker, so the toolbar never changes shape under a finger: the last one grabbed, else the trim start.
  const active = $derived(value_of(chosen) === null ? Marker.START : chosen);

  $effect(() => {
    void Object.values(settings.theme);
    if (!canvas || width === 0 || height === 0) return;
    const target = canvas;
    const { start: from, end: to } = visible;
    const frame = requestAnimationFrame(() => {
      const buckets = Math.max(1, Math.round(width));
      const bars = peaks_between(pcm, index, from * pcm.sample_rate, to * pcm.sample_rate, buckets);
      const ratio = devicePixelRatio;
      target.width = Math.round(width * ratio);
      target.height = Math.round(height * ratio);
      const context = target.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(target).getPropertyValue("--foreground").trim();
      context.globalAlpha = 0.7;
      const middle = height / 2;
      const bar = width / buckets;
      // Scaled to the loudest peak of the whole sound: a quiet recording (a phone video) still shows its shape, and scrolling doesn't rescale it.
      const gain = middle / Math.max(0.001, index.loudest);
      for (let i = 0; i < buckets; i++) {
        const top = middle - bars[i * 2 + 1] * gain;
        const bottom = middle - bars[i * 2] * gain;
        context.fillRect(i * bar, top, Math.max(1, bar), Math.max(1, bottom - top));
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    const time = playhead;
    if (time === null || time === undefined || !zoomed) return;
    untrack(() => reveal(time));
  });

  const percent = (seconds: number) => `${duration ? (seconds / duration) * 100 : 0}%`;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const seconds = (value: number) => `${value.toFixed(2)} s`;
  const exact = (value: number) => `${value.toFixed(3)} s`;

  function value_of(marker: Marker): number | null {
    if (marker === Marker.START) return start;
    if (marker === Marker.END) return end;
    if (!selection) return null;
    return marker === Marker.FROM ? selection.start : selection.end;
  }

  function place(marker: Marker, time: number) {
    if (marker === Marker.START) start = clamp(time, 0, end - MIN_SPAN);
    else if (marker === Marker.END) end = clamp(time, start + MIN_SPAN, duration);
    else if (selection && marker === Marker.FROM) selection = { start: clamp(time, start, selection.end - MIN_SELECTION), end: selection.end };
    else if (selection) selection = { start: selection.start, end: clamp(time, selection.start + MIN_SELECTION, end) };
    if ((marker === Marker.START || marker === Marker.END) && selection) selection = fit(selection);
  }

  const now = (): Viewport => ({ zoom, scroll: scroller?.scrollLeft ?? 0, width, duration });

  function apply(next: ZoomState) {
    // The content must be at its new width before the scroll offset that belongs to it is set.
    flushSync(() => (zoom = next.zoom));
    if (!scroller) return;
    scroller.scrollLeft = next.scroll;
    scroll = scroller.scrollLeft;
  }

  function reveal(time: number) {
    if (!scroller) return;
    const next = follow(now(), time);
    if (next === null) return;
    scroller.scrollLeft = next;
    scroll = scroller.scrollLeft;
  }

  const zoom_by = (factor: number) => apply(zoom_at(now(), zoom * factor, width / 2, limit));

  function nudge(marker: Marker, direction: number, big = false) {
    const value = value_of(marker);
    if (value === null) return;
    const next = value + nudge_step(visible.end - visible.start) * (big ? 10 : 1) * direction;
    place(marker, Math.round(next * pcm.sample_rate) / pcm.sample_rate);
    reveal(value_of(marker) ?? value);
  }

  // Non-passive so a pinch or Ctrl+wheel zooms the sound instead of the page, and a held drag keeps the browser from scrolling.
  function gestures(element: HTMLElement) {
    let pinch: Pinch | null = null;
    const spread = (event: TouchEvent) => {
      const left = element.getBoundingClientRect().left;
      const [a, b] = [event.touches[0], event.touches[1]];
      return { mid: (a.clientX + b.clientX) / 2 - left, distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
    };
    const on_touchstart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      cancel_drag();
      pinch = { zoom, scroll: element.scrollLeft, ...spread(event) };
    };
    const on_touchmove = (event: TouchEvent) => {
      if (drag && event.cancelable) return event.preventDefault();
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const { mid, distance } = spread(event);
      apply(pinch_zoom(pinch, mid, distance, width, duration, limit));
    };
    const on_touchend = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };
    const on_wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const anchor = event.clientX - element.getBoundingClientRect().left;
      apply(zoom_at(now(), zoom * Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0025)), anchor, limit));
    };
    element.addEventListener("touchstart", on_touchstart, { passive: true });
    element.addEventListener("touchmove", on_touchmove, { passive: false });
    element.addEventListener("touchend", on_touchend);
    element.addEventListener("touchcancel", on_touchend);
    element.addEventListener("wheel", on_wheel, { passive: false });
    return () => {
      element.removeEventListener("touchstart", on_touchstart);
      element.removeEventListener("touchmove", on_touchmove);
      element.removeEventListener("touchend", on_touchend);
      element.removeEventListener("touchcancel", on_touchend);
      element.removeEventListener("wheel", on_wheel);
    };
  }

  /** `select` draws a new selection from where it began; a marker drag moves that marker by the pointer's travel. */
  interface Drag {
    pointer_id: number;
    target: Marker | "select";
    anchor: number;
    origin: number;
    x: number;
    scroll: number;
    client_x: number;
    moved: boolean;
    before: Span | null;
  }
  let drag: Drag | null = null;
  let press: { pointer_id: number; x: number; element: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;
  let frame = 0;

  function time_at(client_x: number): number {
    const rect = content!.getBoundingClientRect();
    return clamp(((client_x - rect.left) / (rect.width || 1)) * duration, 0, duration);
  }

  function start_drag(element: HTMLElement, pointer_id: number, client_x: number, target: Drag["target"], moved: boolean) {
    element.setPointerCapture(pointer_id);
    const origin = target === "select" ? clamp(time_at(client_x), start, end) : (value_of(target) ?? 0);
    drag = { pointer_id, target, anchor: origin, origin, x: client_x, scroll: scroller?.scrollLeft ?? 0, client_x, moved, before: selection };
  }

  function select_down(event: PointerEvent) {
    if (drag || press || !content || (event.pointerType === "mouse" && event.button !== 0)) return;
    const element = event.currentTarget as HTMLElement;
    // Zoomed in on touch, a swipe scrolls the sound; holding still first starts a selection instead.
    if (event.pointerType === "touch" && zoomed && element.dataset.body !== undefined) {
      const { pointerId: pointer_id, clientX: x } = event;
      const timer = setTimeout(() => {
        if (press?.pointer_id !== pointer_id) return;
        press = null;
        start_drag(element, pointer_id, x, "select", true);
        chosen = Marker.TO;
        const anchor = drag!.anchor;
        selection = { start: anchor, end: Math.min(end, anchor + 2 / (px_per_second(view) || 1)) };
      }, LONG_PRESS_MS);
      press = { pointer_id, x, element, timer };
      return;
    }
    event.preventDefault();
    start_drag(element, event.pointerId, event.clientX, "select", false);
    // Esc clears from the keyboard; focusing after a touch would only draw the focus ring.
    if (event.pointerType === "mouse") element.focus();
  }

  function marker_down(event: PointerEvent, marker: Marker) {
    if (drag || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    event.preventDefault();
    chosen = marker;
    const element = event.currentTarget as HTMLElement;
    element.focus();
    start_drag(element, event.pointerId, event.clientX, marker, false);
  }

  function move(event: PointerEvent) {
    if (press?.pointer_id === event.pointerId && Math.abs(event.clientX - press.x) >= TAP_PX) clear_press();
    if (!drag || event.pointerId !== drag.pointer_id) return;
    drag.client_x = event.clientX;
    if (Math.abs(event.clientX - drag.x) >= TAP_PX) drag.moved = true;
    update();
    if (zoomed && drag.moved && !frame) frame = requestAnimationFrame(edge_scroll);
  }

  function update() {
    if (!drag || !content) return;
    if (drag.target !== "select") {
      const travel = drag.client_x - drag.x + ((scroller?.scrollLeft ?? 0) - drag.scroll);
      place(drag.target, dragged_time(drag.origin, travel, content.getBoundingClientRect().width, duration));
      return;
    }
    if (!drag.moved) return;
    const other = clamp(time_at(drag.client_x), start, end);
    selection = { start: Math.min(drag.anchor, other), end: Math.max(drag.anchor, other) };
    chosen = other < drag.anchor ? Marker.FROM : Marker.TO;
  }

  function edge_scroll() {
    frame = 0;
    if (!drag || !scroller) return;
    const rect = scroller.getBoundingClientRect();
    const speed = edge_speed(drag.client_x - rect.left, rect.width, EDGE_PX);
    if (!speed) return;
    scroller.scrollLeft += speed;
    scroll = scroller.scrollLeft;
    update();
    frame = requestAnimationFrame(edge_scroll);
  }

  function stop_edge_scroll() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function clear_press() {
    if (press) clearTimeout(press.timer);
    press = null;
  }

  function finish(event: PointerEvent) {
    if (drag?.pointer_id !== event.pointerId) return;
    if (drag.target === "select" && !drag.moved) selection = null;
    drag = null;
    stop_edge_scroll();
  }

  function cancel_drag() {
    clear_press();
    if (!drag) return;
    if (drag.target === "select") selection = drag.before;
    drag = null;
    stop_edge_scroll();
  }

  function released(event: PointerEvent) {
    if (press?.pointer_id !== event.pointerId) return;
    clear_press();
    selection = null;
  }

  function fit(span: Span): Span | null {
    const next = { start: clamp(span.start, start, end), end: clamp(span.end, start, end) };
    return next.end - next.start > 0 ? next : null;
  }

  function marker_key(event: KeyboardEvent, marker: Marker) {
    const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    nudge(marker, direction, event.shiftKey);
  }
</script>

<div class={cn("waveform grid gap-1.5", class_name)} role="group" aria-label={label}>
  <div class="flex flex-wrap items-center gap-1">
    <div class="mr-auto flex items-center gap-0.5">
      <IconButton label="Move {NAMES[active].toLowerCase()} earlier" size="sm" class="pointer-coarse:size-11" onclick={() => nudge(active, -1)}>
        <LeftIcon weight="bold" />
      </IconButton>
      <span class="min-w-22 text-center font-mono text-2xs whitespace-nowrap text-foreground/80 tabular-nums" aria-live="polite"
        >{SHORT[active]} {exact(value_of(active) ?? 0)}</span
      >
      <IconButton label="Move {NAMES[active].toLowerCase()} later" size="sm" class="pointer-coarse:size-11" onclick={() => nudge(active, 1)}>
        <RightIcon weight="bold" />
      </IconButton>
    </div>
    <div class="ml-auto flex items-center gap-1">
      <IconButton label="Zoom out" size="sm" class="pointer-coarse:size-11" disabled={!zoomed} onclick={() => zoom_by(1 / ZOOM_STEP)}>
        <ZoomOutIcon weight="bold" />
      </IconButton>
      <IconButton label="Zoom in" size="sm" class="pointer-coarse:size-11" disabled={zoom >= limit} onclick={() => zoom_by(ZOOM_STEP)}>
        <ZoomInIcon weight="bold" />
      </IconButton>
      <IconButton
        label="Zoom to selection"
        size="sm"
        class="pointer-coarse:size-11"
        disabled={!selection}
        onclick={() => selection && apply(zoom_to(selection, width, duration, limit, Math.min(FOCUS_MARGIN, width * 0.15)))}
      >
        <ZoomSelectionIcon weight="bold" />
      </IconButton>
      <IconButton label="Fit the whole sound" size="sm" class="pointer-coarse:size-11" disabled={!zoomed} onclick={() => apply({ zoom: 1, scroll: 0 })}>
        <FitIcon weight="bold" />
      </IconButton>
    </div>
  </div>

  <div
    bind:this={scroller}
    bind:clientWidth={width}
    class="scroller overflow-x-auto overflow-y-hidden rounded-lg bg-background-darker ring-1 ring-foreground/10 select-none"
    onscroll={() => (scroll = scroller?.scrollLeft ?? 0)}
    {@attach gestures}
  >
    <div bind:this={content} class="relative" style:width="{zoom * 100}%" style:--content="{width * zoom}px">
      {#snippet tab(marker: Marker, value: number)}
        <div
          class="tab absolute inset-y-0 cursor-ew-resize focus-visible:outline-none"
          data-marker={marker}
          data-active={marker === active ? "" : undefined}
          data-side={marker === Marker.START || marker === Marker.FROM ? "before" : "after"}
          style:--at="{duration ? (value / duration) * width * zoom : 0}px"
          role="slider"
          tabindex="0"
          aria-label={NAMES[marker]}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={value}
          aria-valuetext={exact(value)}
          onpointerdown={(event) => marker_down(event, marker)}
          onpointermove={move}
          onlostpointercapture={finish}
          onfocus={() => (chosen = marker)}
          onkeydown={(event) => marker_key(event, marker)}
        >
          <span class="grip"></span>
        </div>
      {/snippet}

      <div
        class="strip relative touch-none overflow-hidden border-b border-foreground/10"
        role="presentation"
        onpointerdown={select_down}
        onpointermove={move}
        onlostpointercapture={finish}
      >
        {#each marks as mark (mark)}
          <span class="pointer-events-none absolute bottom-0 h-1.5 w-px bg-foreground/30" style:left={percent(mark)}></span>
          <span
            class="pointer-events-none absolute top-0.5 pl-1 font-mono text-2xs leading-none whitespace-nowrap text-foreground/80 tabular-nums"
            style:left={percent(mark)}
            aria-hidden="true">{tick_label(mark, step, duration >= 60)}</span
          >
        {/each}
        {#if selection}
          {@render tab(Marker.FROM, selection.start)}
          {@render tab(Marker.TO, selection.end)}
        {/if}
      </div>

      <div class="relative h-24" bind:clientHeight={height}>
        <canvas bind:this={canvas} class="pointer-events-none sticky left-0 block h-full" style:width="{width}px" aria-hidden="true"></canvas>

        <div
          class={["absolute inset-0 cursor-text focus-visible:outline-2 focus-visible:outline-cottontail", zoomed ? "touch-pan-x touch-pan-y" : "touch-none"]}
          data-body
          role="slider"
          tabindex="0"
          aria-label="Selection"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={selection?.start ?? start}
          aria-valuetext={selection ? `${seconds(selection.start)} to ${seconds(selection.end)}` : "Nothing selected. Drag across the sound to select"}
          onpointerdown={select_down}
          onpointermove={move}
          onpointerup={released}
          onpointercancel={clear_press}
          onlostpointercapture={finish}
          oncontextmenu={(event) => (press || drag) && event.preventDefault()}
          onkeydown={(event) => {
            if (event.key === "Escape" && selection) {
              event.stopPropagation();
              selection = null;
            }
          }}
        ></div>

        <div class="trimmed pointer-events-none absolute inset-y-0 left-0" style:width={percent(start)}></div>
        <div class="trimmed pointer-events-none absolute inset-y-0 right-0" style:left={percent(end)}></div>

        {#if selection}
          <div class="selection pointer-events-none absolute inset-y-0" style:left={percent(selection.start)} style:width={percent(selection.end - selection.start)}></div>
        {/if}

        <div class="marker pointer-events-none absolute inset-y-0" style:left={percent(start)}></div>
        <div class="marker pointer-events-none absolute inset-y-0" style:left={percent(end)}></div>

        {#if playhead !== null && playhead !== undefined}
          <div class="playhead pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2" style:left={percent(playhead)}></div>
        {/if}
      </div>

      <div class="strip relative overflow-hidden border-t border-foreground/10">
        {@render tab(Marker.START, start)}
        {@render tab(Marker.END, end)}
      </div>
    </div>
  </div>
</div>

<style>
  .scroller {
    touch-action: pan-x pan-y;
    scrollbar-width: thin;
  }

  .strip {
    height: 28px;
  }

  .trimmed {
    background: color-mix(in oklch, var(--background-darkest) 65%, transparent);
  }

  .selection {
    background: color-mix(in oklch, var(--primary) 22%, transparent);
    box-shadow:
      inset 1px 0 0 var(--primary),
      inset -1px 0 0 var(--primary);
  }

  .marker {
    width: 2px;
    translate: -50% 0;
    background: var(--primary);
  }

  .playhead {
    background: var(--cottontail);
  }

  /* Tabs sit outside their line like brackets (start and From to the left, End and To to the right), so they never cover each other.
     At either end of the sound the hit area and the grip slide inside the content instead of leaving their line. */
  .tab {
    --hit: 28px;
    --grip: 12px;
    left: var(--left);
    width: var(--hit);
    touch-action: none;
  }

  .tab[data-side="before"] {
    --left: clamp(0px, var(--at) - var(--hit), var(--content) - var(--hit));
    --grip-left: clamp(0px, var(--at) - var(--grip), var(--content) - var(--grip));
  }

  .tab[data-side="after"] {
    --left: clamp(0px, var(--at), var(--content) - var(--hit));
    --grip-left: clamp(0px, var(--at), var(--content) - var(--grip));
  }

  .tab .grip {
    position: absolute;
    left: calc(var(--grip-left) - var(--left));
    width: var(--grip);
    height: 18px;
    background: var(--primary);
    box-shadow: 0 0 0 1px var(--background-darkest);
  }

  /* Each grip hangs off the wave's edge: the trim tabs from below it, the selection tabs from above it, clear of the ruler's labels. */
  .tab[data-marker="start"] .grip,
  .tab[data-marker="end"] .grip {
    top: 0;
  }

  .tab[data-marker="from"] .grip,
  .tab[data-marker="to"] .grip {
    bottom: 0;
    height: 14px;
    background: color-mix(in oklch, var(--primary) 22%, var(--background-darker));
    box-shadow: inset 0 0 0 1.5px var(--primary);
  }

  .tab[data-side="before"] .grip {
    border-radius: 4px 0 0 4px;
  }

  .tab[data-side="after"] .grip {
    border-radius: 0 4px 4px 0;
  }

  .tab[data-active] .grip {
    outline: 1px solid var(--primary);
    outline-offset: 1px;
  }

  .tab:focus-visible .grip {
    box-shadow: 0 0 0 2px var(--cottontail);
  }

  @media (pointer: coarse) {
    /* 44px of target plus the strip's 1px border. */
    .strip {
      height: 45px;
    }

    .tab {
      --hit: 44px;
      --grip: 16px;
    }

    .tab .grip,
    .tab[data-marker="from"] .grip,
    .tab[data-marker="to"] .grip {
      height: 26px;
    }
  }
</style>
