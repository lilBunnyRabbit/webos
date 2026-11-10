<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { AXIS_FILL, AXIS_STROKE } from "./colors";
  import type { Pending } from "./editor.svelte";
  import { nearest_axis, type AxisDirection } from "./projection";

  interface Props {
    directions: AxisDirection[];
    disabled: boolean;
    armed: boolean;
    pending: Pending | null;
    onpick: (direction: AxisDirection) => void;
  }

  let { directions, disabled, armed, pending, onpick }: Props = $props();

  const R_IN = 22;
  const R_OUT = 84;
  const LABEL_AT = 68;

  let ring = $state<HTMLDivElement>();
  let active = $state<AxisDirection | null>(null);
  let cancelled = false;

  const same = (a: { axis: string; sign: number } | null, b: { axis: string; sign: number } | null) =>
    !!a && !!b && a.axis === b.axis && a.sign === b.sign;

  const name = (direction: AxisDirection) => `${direction.sign > 0 ? "+" : "−"}${direction.axis.toUpperCase()}`;

  function pick_at(event: PointerEvent): AxisDirection | null {
    const box = ring!.getBoundingClientRect();
    const toward = { x: event.clientX - (box.left + box.width / 2), y: event.clientY - (box.top + box.height / 2) };
    if (Math.hypot(toward.x, toward.y) < Math.min(box.width, box.height) * 0.1) return null;
    return nearest_axis(directions, toward);
  }

  function on_pointerdown(event: PointerEvent) {
    event.preventDefault();
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    ring!.setPointerCapture(event.pointerId);
    cancelled = false;
    active = pick_at(event);
  }

  function on_pointermove(event: PointerEvent) {
    if (!ring?.hasPointerCapture(event.pointerId)) return;
    active = pick_at(event);
  }

  function on_lostpointercapture() {
    const picked = active;
    active = null;
    if (picked && !cancelled) onpick(picked);
  }
</script>

<div class="relative aspect-square min-h-0 w-full max-w-56 min-w-0 justify-self-center" role="group" aria-label="Axis directions">
  <div
    bind:this={ring}
    class={cn("absolute inset-0 touch-none select-none", disabled ? "opacity-38" : "cursor-pointer")}
    onpointerdown={on_pointerdown}
    onpointermove={on_pointermove}
    onpointercancel={() => (cancelled = true)}
    onlostpointercapture={on_lostpointercapture}
    aria-hidden="true"
  >
    <svg viewBox="-100 -100 200 200" class="size-full overflow-visible">
      <circle r="96" class={armed && !disabled ? "fill-primary/10 stroke-primary/40" : "fill-foreground/5 stroke-foreground/15"} stroke-width="1.5" />
      {#each directions as direction (`${direction.axis}${direction.sign}`)}
        {@const on = same(active, direction) || (!active && same(pending, direction))}
        <line
          x1={direction.at.x * R_IN}
          y1={direction.at.y * R_IN}
          x2={direction.at.x * R_OUT}
          y2={direction.at.y * R_OUT}
          class={AXIS_STROKE[direction.axis]}
          opacity={on ? 1 : direction.sign > 0 ? 0.8 : 0.45}
          stroke-width={on ? 8 : 4}
          stroke-linecap="round"
        />
        <text
          x={direction.at.x * LABEL_AT + direction.at.y * 13}
          y={direction.at.y * LABEL_AT - direction.at.x * 13}
          text-anchor="middle"
          dominant-baseline="central"
          font-size="13"
          class={cn("font-mono font-bold", AXIS_FILL[direction.axis])}
          opacity={on ? 1 : 0.85}
        >
          {name(direction)}
        </text>
      {/each}
      <circle r="4" class="fill-foreground/45" />
    </svg>
  </div>
  <div class="sr-only">
    {#each directions as direction (`${direction.axis}${direction.sign}`)}
      <button type="button" tabindex={-1} {disabled} onclick={() => onpick(direction)}>Along {name(direction)}</button>
    {/each}
  </div>
</div>
