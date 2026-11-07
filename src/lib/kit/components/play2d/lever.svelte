<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { clamp_notch } from "$kit/games/play2d/lever";

  interface Props {
    notch: number;
    labels: readonly string[];
    names: readonly string[];
    /** The resting notch: above it the thumb takes the primary colour, below it warning. */
    neutral: number;
    ends?: { top: string; bottom: string };
    label?: string;
    onchange: (notch: number) => void;
    springs?: boolean;
    onletgo?: () => void;
    class?: string;
  }

  let { notch, labels, names, neutral, ends, label = "Throttle lever", onchange, springs = false, onletgo, class: class_name }: Props = $props();

  const top = $derived(labels.length - 1);

  let track: HTMLDivElement | undefined = $state();
  let grab: number | null = null;

  function notch_at(event: PointerEvent): number {
    const box = track!.getBoundingClientRect();
    const share = (1 - (event.clientY - box.top) / box.height - 0.16) / 0.68;
    return clamp_notch(share * top, labels.length);
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
    onchange(clamp_notch(notch + step, labels.length));
  }
</script>

<div
  class={cn("lv-lever grid touch-none grid-cols-[auto_auto] items-stretch gap-1.5 select-none", class_name)}
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-orientation="vertical"
  aria-valuemin={0}
  aria-valuemax={top}
  aria-valuenow={notch}
  aria-valuetext={names[notch]}
  onkeydown={on_keydown}
  onpointerdown={on_pointerdown}
  onpointermove={on_pointermove}
  onlostpointercapture={on_release}
  oncontextmenu={(event) => event.preventDefault()}
>
  <div class="relative w-8 font-mono text-2xs leading-none text-foreground/65" aria-hidden="true">
    {#each labels as text, i (i)}
      <span
        class={cn("absolute right-0 translate-y-1/2", i === notch && "font-semibold text-foreground", i === neutral && i !== notch && "text-foreground/80")}
        style:bottom="calc({(i / top) * 100}% * 0.68 + 16%)">{text}</span
      >
    {/each}
  </div>
  <div bind:this={track} class="lv-track relative w-12 rounded-lg">
    {#if ends}
      <span class="absolute inset-x-0 top-1 text-center text-2xs font-medium text-foreground/65" aria-hidden="true">{ends.top}</span>
      <span class="absolute inset-x-0 bottom-1 text-center text-2xs font-medium text-foreground/65" aria-hidden="true">{ends.bottom}</span>
    {/if}
    {#each labels as _, i (i)}
      <span class="lv-tick absolute inset-x-3 h-px" style:bottom="calc({(i / top) * 100}% * 0.68 + 16%)" aria-hidden="true"></span>
    {/each}
    <span
      class={cn("lv-thumb absolute inset-x-1 h-5 -translate-y-1/2 rounded-md transition-[top] duration-75", notch > neutral ? "lv-up" : notch < neutral && "lv-down")}
      style:top="calc(100% - ({(notch / top) * 100}% * 0.68 + 16%))"
      aria-hidden="true"
    ></span>
  </div>
</div>

<style>
  .lv-track {
    background-color: color-mix(in oklch, var(--foreground) 10%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 14%, transparent);
  }

  .lv-tick {
    background-color: color-mix(in oklch, var(--foreground) 35%, transparent);
  }

  .lv-thumb {
    background-color: var(--foreground);
    box-shadow: var(--shadow-popover);
  }

  .lv-thumb.lv-up {
    background-color: var(--primary);
  }

  .lv-thumb.lv-down {
    background-color: var(--warning);
  }

  .lv-lever:focus-visible {
    outline: 2px solid var(--cottontail);
    outline-offset: 2px;
    border-radius: var(--radius-lg);
  }
</style>
