<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { DETENT_NAMES, DETENTS, NEUTRAL } from "./core/lever";

  interface Props {
    notch: number;
    onchange: (notch: number) => void;
    /** Hold to thrust: letting go puts the lever back in neutral. */
    springs?: boolean;
    onletgo?: () => void;
    class?: string;
  }

  let { notch, onchange, springs = false, onletgo, class: class_name }: Props = $props();

  const LABELS = ["Full", "Half", "Slow", "N", "Slow", "Half", "Full"];
  const top = DETENTS.length - 1;

  let track: HTMLDivElement | undefined = $state();
  let grab: number | null = null;

  function notch_at(event: PointerEvent): number {
    const box = track!.getBoundingClientRect();
    const share = (1 - (event.clientY - box.top) / box.height - 0.16) / 0.68;
    return Math.max(0, Math.min(top, Math.round(share * top)));
  }

  function on_pointerdown(event: PointerEvent) {
    if (!track) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    grab = event.pointerId;
    onchange(notch_at(event));
  }

  function on_pointermove(event: PointerEvent) {
    if (grab !== event.pointerId) return;
    const next = notch_at(event);
    if (next !== notch) onchange(next);
  }

  function on_release(event: PointerEvent) {
    if (grab !== event.pointerId) return;
    grab = null;
    if (springs) onletgo?.();
  }

  function on_keydown(event: KeyboardEvent) {
    const step = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    onchange(Math.max(0, Math.min(top, notch + step)));
  }
</script>

<div
  class={cn("hb-lever grid touch-none grid-cols-[auto_auto] items-stretch gap-1.5 select-none", class_name)}
  role="slider"
  tabindex="0"
  aria-label="Throttle lever"
  aria-orientation="vertical"
  aria-valuemin={0}
  aria-valuemax={top}
  aria-valuenow={notch}
  aria-valuetext={DETENT_NAMES[notch]}
  onkeydown={on_keydown}
  onpointerdown={on_pointerdown}
  onpointermove={on_pointermove}
  onlostpointercapture={on_release}
  oncontextmenu={(event) => event.preventDefault()}
>
  <div class="relative w-8 font-mono text-2xs leading-none text-foreground/65" aria-hidden="true">
    {#each LABELS as label, i (i)}
      <span
        class={cn("absolute right-0 translate-y-1/2", i === notch && "font-semibold text-foreground", i === NEUTRAL && i !== notch && "text-foreground/80")}
        style:bottom="calc({(i / top) * 100}% * 0.68 + 16%)">{label}</span
      >
    {/each}
  </div>
  <div bind:this={track} class="hb-track relative w-12 rounded-lg">
    <span class="absolute inset-x-0 top-1 text-center text-2xs font-medium text-foreground/65" aria-hidden="true">Ahead</span>
    <span class="absolute inset-x-0 bottom-1 text-center text-2xs font-medium text-foreground/65" aria-hidden="true">Astern</span>
    {#each DETENTS as _, i (i)}
      <span class="hb-tick absolute inset-x-3 h-px" style:bottom="calc({(i / top) * 100}% * 0.68 + 16%)" aria-hidden="true"></span>
    {/each}
    <span
      class={cn("hb-thumb absolute inset-x-1 h-5 -translate-y-1/2 rounded-md transition-[top] duration-75", notch > NEUTRAL ? "hb-ahead" : notch < NEUTRAL && "hb-astern")}
      style:top="calc(100% - ({(notch / top) * 100}% * 0.68 + 16%))"
      aria-hidden="true"
    ></span>
  </div>
</div>

<style>
  .hb-track {
    background-color: color-mix(in oklch, var(--foreground) 10%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 14%, transparent);
  }

  .hb-tick {
    background-color: color-mix(in oklch, var(--foreground) 35%, transparent);
  }

  .hb-thumb {
    background-color: var(--foreground);
    box-shadow: var(--shadow-popover);
  }

  .hb-thumb.hb-ahead {
    background-color: var(--primary);
  }

  .hb-thumb.hb-astern {
    background-color: var(--warning);
  }

  .hb-lever:focus-visible {
    outline: 2px solid var(--cottontail);
    outline-offset: 2px;
    border-radius: var(--radius-lg);
  }
</style>
