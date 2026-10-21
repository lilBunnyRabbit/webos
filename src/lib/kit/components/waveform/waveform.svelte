<script lang="ts" module>
  export interface Span {
    start: number;
    end: number;
  }
</script>

<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { peaks } from "$kit/utils/audio/regions";
  import { pcm_length, type Pcm } from "$kit/utils/audio/wav";

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

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const duration = $derived(pcm_length(pcm) / pcm.sample_rate || 0);

  let root = $state<HTMLElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let width = $state(0);
  let height = $state(0);

  $effect(() => {
    void Object.values(settings.theme);
    if (!canvas || width === 0 || height === 0) return;
    const target = canvas;
    const buckets = Math.max(1, Math.round(width));
    const bars = peaks(pcm, buckets);
    const frame = requestAnimationFrame(() => {
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
      const step = width / buckets;
      // Scaled to the loudest peak, so a quiet recording (a phone video) still shows its shape.
      const gain = middle / Math.max(0.001, ...bars.map(Math.abs));
      for (let i = 0; i < buckets; i++) {
        const top = middle - bars[i * 2 + 1] * gain;
        const bottom = middle - bars[i * 2] * gain;
        context.fillRect(i * step, top, Math.max(1, step), Math.max(1, bottom - top));
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  const percent = (seconds: number) => `${duration ? (seconds / duration) * 100 : 0}%`;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  type DragKind = "start" | "end" | "select";
  interface Drag {
    pointer_id: number;
    kind: DragKind;
    anchor: number;
    x: number;
    moved: boolean;
  }
  let drag: Drag | null = null;

  function time_at(event: PointerEvent): number {
    const rect = root!.getBoundingClientRect();
    return clamp(((event.clientX - rect.left) / (rect.width || 1)) * duration, 0, duration);
  }

  function begin(event: PointerEvent, kind: DragKind) {
    if (drag || !root || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const anchor = clamp(time_at(event), start, end);
    drag = { pointer_id: event.pointerId, kind, anchor, x: event.clientX, moved: false };
    if (kind === "select") (event.currentTarget as HTMLElement).focus();
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer_id) return;
    const time = time_at(event);
    if (Math.abs(event.clientX - drag.x) >= TAP_PX) drag.moved = true;
    if (drag.kind === "start") start = clamp(time, 0, end - MIN_SPAN);
    else if (drag.kind === "end") end = clamp(time, start + MIN_SPAN, duration);
    else if (drag.moved) {
      const other = clamp(time, start, end);
      selection = { start: Math.min(drag.anchor, other), end: Math.max(drag.anchor, other) };
    }
    if (drag.kind !== "select" && selection) selection = fit(selection);
  }

  function finish(event: PointerEvent) {
    if (drag?.pointer_id !== event.pointerId) return;
    if (drag.kind === "select" && !drag.moved) selection = null;
    drag = null;
  }

  function fit(span: Span): Span | null {
    const next = { start: clamp(span.start, start, end), end: clamp(span.end, start, end) };
    return next.end - next.start > 0 ? next : null;
  }

  function nudge(event: KeyboardEvent, kind: "start" | "end") {
    const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const step = (duration / 100) * (event.shiftKey ? 10 : 1) * direction;
    if (kind === "start") start = clamp(start + step, 0, end - MIN_SPAN);
    else end = clamp(end + step, start + MIN_SPAN, duration);
    if (selection) selection = fit(selection);
  }

  const seconds = (value: number) => `${value.toFixed(2)} s`;
</script>

<div
  bind:this={root}
  bind:clientWidth={width}
  bind:clientHeight={height}
  class={cn("waveform relative h-24 overflow-hidden rounded-lg bg-background-darker ring-1 ring-foreground/10 select-none", class_name)}
  role="group"
  aria-label={label}
>
  <canvas bind:this={canvas} class="pointer-events-none absolute inset-0 size-full" aria-hidden="true"></canvas>

  <div
    class="track absolute inset-0 cursor-text focus-visible:outline-2 focus-visible:outline-cottontail"
    role="slider"
    tabindex="0"
    aria-label="Selection"
    aria-valuemin={0}
    aria-valuemax={duration}
    aria-valuenow={selection?.start ?? start}
    aria-valuetext={selection ? `${seconds(selection.start)} to ${seconds(selection.end)}` : "Nothing selected. Drag across the sound to select"}
    onpointerdown={(event) => begin(event, "select")}
    onpointermove={move}
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
    <div
      class="selection pointer-events-none absolute inset-y-0"
      style:left={percent(selection.start)}
      style:width={percent(selection.end - selection.start)}
    ></div>
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

<style>
  .track,
  .handle {
    touch-action: none;
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

  .handle {
    --hit: 28px;
    width: var(--hit);
    translate: -50% 0;
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
    .handle {
      --hit: 44px;
    }

    .handle .bar::after {
      width: 14px;
      height: 32px;
    }
  }
</style>
