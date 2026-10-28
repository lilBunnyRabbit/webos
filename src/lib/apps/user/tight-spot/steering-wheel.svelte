<script lang="ts">
  import { cn } from "$lib/core/utils";

  interface Props {
    value: number;
    onchange: (value: number) => void;
    oncentre: () => void;
    class?: string;
  }

  let { value, onchange, oncentre, class: class_name }: Props = $props();

  // A real wheel turns about one and a quarter times each way, so it takes a hand-over-hand drag to reach full lock.
  const TURN_DEGREES = 450;

  let wheel: HTMLDivElement | undefined = $state();
  let grab: { id: number; last: number; value: number } | null = null;

  function angle_of(event: PointerEvent): number {
    const box = wheel!.getBoundingClientRect();
    return (Math.atan2(event.clientY - (box.top + box.height / 2), event.clientX - (box.left + box.width / 2)) * 180) / Math.PI;
  }

  function on_pointerdown(event: PointerEvent) {
    if (!wheel || (event.target instanceof Element && event.target.closest("button"))) return;
    event.preventDefault();
    wheel.setPointerCapture(event.pointerId);
    grab = { id: event.pointerId, last: angle_of(event), value };
  }

  function on_pointermove(event: PointerEvent) {
    if (!grab || grab.id !== event.pointerId) return;
    const now = angle_of(event);
    let delta = now - grab.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    grab.last = now;
    grab.value = Math.max(-1, Math.min(1, grab.value + delta / TURN_DEGREES));
    onchange(grab.value);
  }

  function on_release(event: PointerEvent) {
    if (grab?.id === event.pointerId) grab = null;
  }

  function on_keydown(event: KeyboardEvent) {
    const step = event.key === "ArrowLeft" ? -0.1 : event.key === "ArrowRight" ? 0.1 : 0;
    if (!step) return;
    event.preventDefault();
    onchange(Math.max(-1, Math.min(1, value + step)));
  }
</script>

<div
  bind:this={wheel}
  role="slider"
  tabindex="0"
  aria-label="Steering wheel"
  aria-valuemin={-100}
  aria-valuemax={100}
  aria-valuenow={Math.round(value * 100)}
  aria-valuetext={Math.abs(value) < 0.02 ? "Straight" : `${Math.round(Math.abs(value) * 100)}% ${value < 0 ? "left" : "right"}`}
  class={cn("relative aspect-square touch-none rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-cottontail", class_name)}
  onpointerdown={on_pointerdown}
  onpointermove={on_pointermove}
  onlostpointercapture={on_release}
  onkeydown={on_keydown}
  oncontextmenu={(event) => event.preventDefault()}
>
  <svg viewBox="-50 -50 100 100" class="size-full" aria-hidden="true">
    <g style:transform="rotate({value * TURN_DEGREES}deg)">
      <circle r="44" fill="none" class="stroke-foreground/80" stroke-width="9" />
      <path d="M -40 6 L -13 9 M 40 6 L 13 9 M 0 15 L 0 40" class="stroke-foreground/80" stroke-width="7" stroke-linecap="round" />
      <path d="M -6 -48.5 A 48.5 48.5 0 0 1 6 -48.5" fill="none" class="stroke-primary" stroke-width="9" />
    </g>
  </svg>
  <button
    type="button"
    aria-label="Centre the wheel"
    title="Centre the wheel"
    class="absolute top-1/2 left-1/2 grid size-[34%] -translate-1/2 place-items-center rounded-full bg-foreground/12 text-2xs font-medium text-foreground/80 active:bg-foreground/20"
    onclick={oncentre}
  >
    {Math.round(value * TURN_DEGREES)}°
  </button>
</div>
