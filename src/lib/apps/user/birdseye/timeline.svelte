<script lang="ts">
  import { clamp } from "$lib/core/utils";
  import { format_time } from "$kit/utils/video/plan";
  import { FrameStatus, strip_gradient, type Run } from "./path";

  interface Props {
    duration: number;
    time: number;
    runs: Run[];
    step: number;
    disabled?: boolean;
    onseek: (time: number) => void;
  }

  const { duration, time, runs, step, disabled = false, onseek }: Props = $props();

  const COLORS = { [FrameStatus.GOOD]: "var(--success)", [FrameStatus.WEAK]: "var(--warning)", [FrameStatus.SHAPE]: "var(--info)", [FrameStatus.LOST]: "var(--error)" };
  const EMPTY = "color-mix(in oklch, var(--foreground) 12%, transparent)";

  let track = $state<HTMLDivElement>();
  let dragging = $state(false);

  const background = $derived(strip_gradient(runs, duration, COLORS, EMPTY));
  const percent = $derived(`${duration > 0 ? (clamp(time, 0, duration) / duration) * 100 : 0}%`);

  function time_at(event: PointerEvent): number {
    const rect = track!.getBoundingClientRect();
    return clamp((event.clientX - rect.left) / rect.width, 0, 1) * duration;
  }

  function start(event: PointerEvent) {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    dragging = true;
    track!.setPointerCapture(event.pointerId);
    onseek(time_at(event));
  }

  function move(event: PointerEvent) {
    if (dragging) onseek(time_at(event));
  }

  function on_keydown(event: KeyboardEvent) {
    const delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
    if (!delta || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    onseek(clamp(time + delta * (event.shiftKey ? 1 : step), 0, duration));
  }
</script>

<div
  bind:this={track}
  class={["relative h-9 touch-none select-none pointer-coarse:h-11", disabled ? "opacity-38" : "cursor-pointer"]}
  role="slider"
  tabindex={disabled ? -1 : 0}
  aria-label="Time"
  aria-valuemin={0}
  aria-valuemax={Math.round(duration * 100) / 100}
  aria-valuenow={Math.round(time * 100) / 100}
  aria-valuetext={format_time(time)}
  aria-disabled={disabled}
  onpointerdown={start}
  onpointermove={move}
  onlostpointercapture={() => (dragging = false)}
  onkeydown={on_keydown}
>
  <div class="strip absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full" style:background></div>
  <div class="pointer-events-none absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style:left={percent}></div>
</div>

<style>
  [role="slider"]:focus-visible {
    outline: 2px solid var(--cottontail);
    outline-offset: 2px;
    border-radius: 0.25rem;
  }
</style>
