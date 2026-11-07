<script lang="ts">
  import { cn } from "$lib/core/utils";

  interface Props {
    /** −1 forward to 1 back, or null when no finger holds it. */
    value: number | null;
    /** Pilot mode: dragging down pulls the nose up, as on a stick. */
    pilot: boolean;
    onchange: (value: number | null) => void;
    onengage: () => boolean;
    class?: string;
  }

  let { value, pilot, onchange, onengage, class: class_name }: Props = $props();

  let pad: HTMLDivElement | undefined = $state();
  let grab: { id: number; y: number } | null = null;

  function value_at(event: PointerEvent): number {
    const box = pad!.getBoundingClientRect();
    const share = (grab!.y - event.clientY) / (box.height * 0.42);
    return Math.max(-1, Math.min(1, pilot ? -share : share));
  }

  function on_pointerdown(event: PointerEvent) {
    if (!pad || !onengage()) return;
    event.preventDefault();
    pad.setPointerCapture(event.pointerId);
    grab = { id: event.pointerId, y: event.clientY };
    onchange(0);
  }

  function on_pointermove(event: PointerEvent) {
    if (!grab || grab.id !== event.pointerId) return;
    onchange(value_at(event));
  }

  function on_release(event: PointerEvent) {
    if (!grab || grab.id !== event.pointerId) return;
    grab = null;
    onchange(null);
  }

  const shown = $derived(value ?? 0);
  const top = $derived(50 + (pilot ? shown : -shown) * 42);
</script>

<div
  bind:this={pad}
  class={cn("af-pad relative touch-none rounded-xl select-none", class_name)}
  role="slider"
  tabindex="-1"
  aria-label="Pitch"
  aria-orientation="vertical"
  aria-valuemin={-1}
  aria-valuemax={1}
  aria-valuenow={Math.round(shown * 100) / 100}
  onpointerdown={on_pointerdown}
  onpointermove={on_pointermove}
  onlostpointercapture={on_release}
  oncontextmenu={(event) => event.preventDefault()}
>
  <span class="absolute inset-x-0 top-1.5 text-center text-2xs font-medium text-foreground/65" aria-hidden="true">{pilot ? "Push" : "Nose up"}</span>
  <span class="absolute inset-x-0 bottom-1.5 text-center text-2xs font-medium text-foreground/65" aria-hidden="true">{pilot ? "Pull" : "Nose down"}</span>
  <span class="af-centre absolute inset-x-4 top-1/2 h-px" aria-hidden="true"></span>
  <span class={cn("af-knob absolute left-1/2 size-11 -translate-1/2 rounded-full", value !== null && "af-held")} style:top="{top}%" aria-hidden="true"></span>
</div>

<style>
  .af-pad {
    background-color: color-mix(in oklch, var(--foreground) 10%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 14%, transparent);
  }

  .af-centre {
    background-color: color-mix(in oklch, var(--foreground) 35%, transparent);
  }

  .af-knob {
    background-color: var(--foreground);
    box-shadow: var(--shadow-popover);
    transition: top 120ms ease-out;
  }

  .af-knob.af-held {
    background-color: var(--primary);
    transition: none;
  }
</style>
