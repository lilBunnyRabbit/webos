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
    MagnifyingGlassMinus as ZoomOutIcon,
    MagnifyingGlassPlus as ZoomInIcon,
    Selection as ZoomSelectionIcon,
  } from "phosphor-svelte";
  import { flushSync, untrack } from "svelte";
  import {
    edge_speed,
    follow,
    max_zoom,
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
  const TAP_PX = 4;
  const EDGE_PX = 32;
  const TICK_PX = 72;

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

  const limit = $derived(max_zoom(duration, width, pcm.sample_rate));
  const view = $derived<Viewport>({ zoom, scroll, width, duration });
  const visible = $derived(visible_span(view));
  const step = $derived(tick_step(px_per_second(view), TICK_PX));
  const marks = $derived(ticks(visible, step));
  const zoomed = $derived(zoom > 1);

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

  // Non-passive so a pinch or Ctrl+wheel zooms the sound instead of the page.
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

  type DragKind = "start" | "end" | "select";
  interface Drag {
    pointer_id: number;
    kind: DragKind;
    anchor: number;
    x: number;
    client_x: number;
    moved: boolean;
    before: Span | null;
  }
  let drag: Drag | null = null;
  let tap: { pointer_id: number; x: number } | null = null;
  let frame = 0;

  function time_at(client_x: number): number {
    const rect = content!.getBoundingClientRect();
    return clamp(((client_x - rect.left) / (rect.width || 1)) * duration, 0, duration);
  }

  function begin(event: PointerEvent, kind: DragKind, anchor?: number) {
    if (drag || !content || (event.pointerType === "mouse" && event.button !== 0)) return;
    // Zoomed in on touch, a swipe across the sound scrolls it; only the handles drag.
    if (kind === "select" && anchor === undefined && event.pointerType === "touch" && zoomed) {
      tap = { pointer_id: event.pointerId, x: event.clientX };
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = {
      pointer_id: event.pointerId,
      kind,
      anchor: anchor ?? clamp(time_at(event.clientX), start, end),
      x: event.clientX,
      client_x: event.clientX,
      moved: anchor !== undefined,
      before: selection,
    };
    if (kind === "select") (event.currentTarget as HTMLElement).focus();
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer_id) return;
    drag.client_x = event.clientX;
    if (Math.abs(event.clientX - drag.x) >= TAP_PX) drag.moved = true;
    update();
    if (zoomed && drag.moved && !frame) frame = requestAnimationFrame(edge_scroll);
  }

  function update() {
    if (!drag) return;
    const time = time_at(drag.client_x);
    if (drag.kind === "start") start = clamp(time, 0, end - MIN_SPAN);
    else if (drag.kind === "end") end = clamp(time, start + MIN_SPAN, duration);
    else if (drag.moved) {
      const other = clamp(time, start, end);
      selection = { start: Math.min(drag.anchor, other), end: Math.max(drag.anchor, other) };
    }
    if (drag.kind !== "select" && selection) selection = fit(selection);
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

  function finish(event: PointerEvent) {
    if (drag?.pointer_id !== event.pointerId) return;
    if (drag.kind === "select" && !drag.moved) selection = null;
    drag = null;
    stop_edge_scroll();
  }

  function cancel_drag() {
    tap = null;
    if (!drag) return;
    if (drag.kind === "select") selection = drag.before;
    drag = null;
    stop_edge_scroll();
  }

  function tapped(event: PointerEvent) {
    if (tap?.pointer_id === event.pointerId && Math.abs(event.clientX - tap.x) < TAP_PX) selection = null;
    tap = null;
  }

  function fit(span: Span): Span | null {
    const next = { start: clamp(span.start, start, end), end: clamp(span.end, start, end) };
    return next.end - next.start > 0 ? next : null;
  }

  function nudge(event: KeyboardEvent, kind: "start" | "end") {
    const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const step = ((visible.end - visible.start) / 100) * (event.shiftKey ? 10 : 1) * direction;
    if (kind === "start") start = clamp(start + step, 0, end - MIN_SPAN);
    else end = clamp(end + step, start + MIN_SPAN, duration);
    if (selection) selection = fit(selection);
    reveal(kind === "start" ? start : end);
  }

  const seconds = (value: number) => `${value.toFixed(2)} s`;
</script>

<div class={cn("waveform grid gap-1.5", class_name)} role="group" aria-label={label}>
  <div class="flex items-center justify-end gap-1">
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
      onclick={() => selection && apply(zoom_to(selection, width, duration, limit))}
    >
      <ZoomSelectionIcon weight="bold" />
    </IconButton>
    <IconButton label="Fit the whole sound" size="sm" class="pointer-coarse:size-11" disabled={!zoomed} onclick={() => apply({ zoom: 1, scroll: 0 })}>
      <FitIcon weight="bold" />
    </IconButton>
  </div>

  <div
    bind:this={scroller}
    bind:clientWidth={width}
    class="scroller overflow-x-auto overflow-y-hidden rounded-lg bg-background-darker ring-1 ring-foreground/10 select-none"
    onscroll={() => (scroll = scroller?.scrollLeft ?? 0)}
    {@attach gestures}
  >
    <div bind:this={content} class="relative" style:width="{zoom * 100}%">
      <div class="relative h-5 overflow-hidden border-b border-foreground/10" aria-hidden="true">
        {#each marks as mark (mark)}
          <span class="absolute bottom-0 h-1.5 w-px bg-foreground/30" style:left={percent(mark)}></span>
          <span class="absolute top-1 pl-1 font-mono text-2xs leading-none whitespace-nowrap text-foreground/80 tabular-nums" style:left={percent(mark)}
            >{tick_label(mark, step, duration >= 60)}</span
          >
        {/each}
      </div>

      <div class="relative h-24" bind:clientHeight={height}>
        <canvas bind:this={canvas} class="pointer-events-none sticky left-0 block h-full" style:width="{width}px" aria-hidden="true"></canvas>

        <div
          class={["track absolute inset-0 cursor-text focus-visible:outline-2 focus-visible:outline-cottontail", zoomed ? "touch-pan-x touch-pan-y" : "touch-none"]}
          role="slider"
          tabindex="0"
          aria-label="Selection"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={selection?.start ?? start}
          aria-valuetext={selection ? `${seconds(selection.start)} to ${seconds(selection.end)}` : "Nothing selected. Drag across the sound to select"}
          onpointerdown={(event) => begin(event, "select")}
          onpointermove={move}
          onpointerup={tapped}
          onpointercancel={() => (tap = null)}
          onlostpointercapture={finish}
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
          {@const span = selection}
          <div class="selection pointer-events-none absolute inset-y-0" style:left={percent(span.start)} style:width={percent(span.end - span.start)}></div>
          {#each [span.start, span.end] as edge, side (side)}
            <div
              class="edge absolute inset-y-0 cursor-ew-resize"
              style:left={percent(edge)}
              aria-hidden="true"
              onpointerdown={(event) => begin(event, "select", side === 0 ? span.end : span.start)}
              onpointermove={move}
              onlostpointercapture={finish}
            ></div>
          {/each}
        {/if}

        {#if playhead !== null && playhead !== undefined}
          <div class="playhead pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2" style:left={percent(playhead)}></div>
        {/if}

        {#snippet handle(kind: "start" | "end", value: number)}
          <div
            class="handle absolute inset-y-0 grid cursor-ew-resize place-items-center focus-visible:outline-none"
            style:left={percent(value)}
            role="slider"
            tabindex="0"
            aria-label={kind === "start" ? "Trim start" : "Trim end"}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={value}
            aria-valuetext={seconds(value)}
            onpointerdown={(event) => begin(event, kind)}
            onpointermove={move}
            onlostpointercapture={finish}
            onkeydown={(event) => nudge(event, kind)}
          >
            <span class="bar"></span>
          </div>
        {/snippet}
        {@render handle("start", start)}
        {@render handle("end", end)}
      </div>
    </div>
  </div>
</div>

<style>
  .scroller {
    touch-action: pan-x pan-y;
    scrollbar-width: thin;
  }

  .handle,
  .edge {
    --hit: 28px;
    width: var(--hit);
    translate: -50% 0;
    touch-action: none;
  }

  .edge {
    --hit: 16px;
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

  .playhead {
    background: var(--cottontail);
  }

  .handle .bar {
    width: 4px;
    height: 100%;
    border-radius: 2px;
    background: var(--primary);
    box-shadow: 0 0 0 1px var(--background-darkest);
  }

  .handle .bar::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 10px;
    height: 24px;
    translate: -50% -50%;
    border-radius: 4px;
    background: var(--primary);
    box-shadow: 0 0 0 1px var(--background-darkest);
  }

  .handle:focus-visible .bar,
  .handle:focus-visible .bar::after {
    box-shadow: 0 0 0 2px var(--cottontail);
  }

  @media (pointer: coarse) {
    .handle,
    .edge {
      --hit: 44px;
    }

    .handle .bar::after {
      width: 14px;
      height: 32px;
    }
  }
</style>
