<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { nearest_direction, type Direction } from "./geometry";
  import { rotate } from "./rotation";

  interface Props {
    directions: Direction[];
    rotation: number;
    disabled: boolean;
    armed: boolean;
    onpick: (direction: Direction) => void;
  }

  let { directions, rotation, disabled, armed, onpick }: Props = $props();

  const R_IN = 34;
  const R_OUT = 86;
  const LABEL_AT = 70;

  const shown = $derived(directions.map((direction) => ({ direction, at: rotate(direction, rotation) })));
  const labelled = $derived(directions.length <= 8 ? shown : shown.filter(({ direction }) => Number(direction.id) % 45 === 0));

  let ring = $state<HTMLDivElement>();
  let active = $state<Direction | null>(null);
  let cancelled = false;

  function pick_at(event: PointerEvent): Direction | null {
    const box = ring!.getBoundingClientRect();
    const toward = { x: event.clientX - (box.left + box.width / 2), y: event.clientY - (box.top + box.height / 2) };
    if (Math.hypot(toward.x, toward.y) < Math.min(box.width, box.height) * 0.08) return null;
    return nearest_direction(directions, rotate(toward, -rotation));
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

<div class="relative min-h-0 min-w-0" role="group" aria-label="Directions">
  <div
    bind:this={ring}
    class={cn("absolute inset-0 touch-none select-none", disabled ? "opacity-50" : "cursor-pointer")}
    onpointerdown={on_pointerdown}
    onpointermove={on_pointermove}
    onpointercancel={() => (cancelled = true)}
    onlostpointercapture={on_lostpointercapture}
    aria-hidden="true"
  >
    <svg viewBox="-100 -100 200 200" class="size-full overflow-visible">
      <circle r="96" class={armed && !disabled ? "fill-primary/12 stroke-primary/40" : "fill-foreground/5 stroke-foreground/15"} stroke-width="1.5" />
      {#each shown as { direction, at } (direction.id)}
        {@const on = active?.id === direction.id}
        <line
          x1={at.x * R_IN}
          y1={at.y * R_IN}
          x2={at.x * R_OUT}
          y2={at.y * R_OUT}
          class={on ? "stroke-primary" : "stroke-foreground/45"}
          stroke-width={on ? 7 : 3}
          stroke-linecap="round"
        />
      {/each}
      {#each labelled as { direction, at } (direction.id)}
        {#if active?.id !== direction.id}
          <text x={at.x * LABEL_AT + at.y * 11} y={at.y * LABEL_AT - at.x * 11} text-anchor="middle" dominant-baseline="central" font-size="13" class="fill-foreground/65 font-mono">
            {direction.label}
          </text>
        {/if}
      {/each}
      <circle r="5" class="fill-foreground/45" />
      {#if active}
        <text y="-16" text-anchor="middle" dominant-baseline="central" font-size="18" class="fill-primary font-mono font-bold">{active.label}</text>
      {/if}
    </svg>
  </div>
  <div class="sr-only">
    {#each directions as direction (direction.id)}
      <button type="button" tabindex={-1} {disabled} onclick={() => onpick(direction)}>Walk {direction.label}</button>
    {/each}
  </div>
</div>
