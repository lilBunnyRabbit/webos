<script lang="ts" module>
  export interface Spoke {
    id: string;
    /** Unit vector on screen, y down. */
    at: { x: number; y: number };
    label: string;
    /** Read out by the screen reader's button, like "Walk north" or "Along +X". */
    name: string;
    labelled?: boolean;
    stroke?: string;
    fill?: string;
  }
</script>

<script lang="ts">
  import { cn } from "$lib/core/utils";

  interface Props {
    spokes: Spoke[];
    disabled: boolean;
    armed: boolean;
    selected?: string | null;
    label?: string;
    class?: string;
    onpick: (id: string) => void;
  }

  let { spokes, disabled, armed, selected = null, label = "Directions", class: class_name, onpick }: Props = $props();

  const R_IN = 34;
  const R_OUT = 86;
  const LABEL_AT = 70;

  let ring = $state<HTMLDivElement>();
  let active = $state<Spoke | null>(null);
  let cancelled = false;

  function pick_at(event: PointerEvent): Spoke | null {
    const box = ring!.getBoundingClientRect();
    const toward = { x: event.clientX - (box.left + box.width / 2), y: event.clientY - (box.top + box.height / 2) };
    if (Math.hypot(toward.x, toward.y) < Math.min(box.width, box.height) * 0.08) return null;
    let best: Spoke | null = null;
    let best_dot = -Infinity;
    for (const spoke of spokes) {
      const dot = toward.x * spoke.at.x + toward.y * spoke.at.y;
      if (dot > best_dot) [best, best_dot] = [spoke, dot];
    }
    return best;
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
    if (picked && !cancelled) onpick(picked.id);
  }
</script>

<div class={cn("relative min-h-0 min-w-0", class_name)} role="group" aria-label={label}>
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
      {#each spokes as spoke (spoke.id)}
        {@const on = active ? active.id === spoke.id : selected === spoke.id}
        <line
          x1={spoke.at.x * R_IN}
          y1={spoke.at.y * R_IN}
          x2={spoke.at.x * R_OUT}
          y2={spoke.at.y * R_OUT}
          class={spoke.stroke ?? (on ? "stroke-primary" : "stroke-foreground/45")}
          opacity={spoke.stroke && !on ? 0.8 : 1}
          stroke-width={on ? 7 : 3}
          stroke-linecap="round"
        />
      {/each}
      {#each spokes as spoke (spoke.id)}
        {#if spoke.labelled !== false && active?.id !== spoke.id}
          <text
            x={spoke.at.x * LABEL_AT + spoke.at.y * 11}
            y={spoke.at.y * LABEL_AT - spoke.at.x * 11}
            text-anchor="middle"
            dominant-baseline="central"
            font-size="13"
            class={cn("font-mono", spoke.fill ? ["font-bold", spoke.fill] : "fill-foreground/65")}
          >
            {spoke.label}
          </text>
        {/if}
      {/each}
      <circle r="5" class="fill-foreground/45" />
      {#if active}
        <text y="-16" text-anchor="middle" dominant-baseline="central" font-size="18" class={cn("font-mono font-bold", active.fill ?? "fill-primary")}>{active.label}</text>
      {/if}
    </svg>
  </div>
  <div class="sr-only">
    {#each spokes as spoke (spoke.id)}
      <button type="button" tabindex={-1} {disabled} onclick={() => onpick(spoke.id)}>{spoke.name}</button>
    {/each}
  </div>
</div>
