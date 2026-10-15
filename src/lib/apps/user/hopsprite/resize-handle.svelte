<script lang="ts">
  interface Props {
    axis: "row" | "column";
    label: string;
    size: number;
    min: number;
    max: number;
    rest?: number;
    collapsed: boolean;
    grows_backward?: boolean;
    onpreview: (size: number, collapsed: boolean) => void;
    oncommit: (size: number, collapsed: boolean) => void;
  }

  let { axis, label, size, min, max, rest, collapsed, grows_backward = true, onpreview, oncommit }: Props = $props();

  const KEY_STEP = 16;

  let drag: { id: number; start: number; from: number } | null = null;
  let pending: { size: number; collapsed: boolean } | null = null;
  let frame = 0;
  let active = $state(false);

  const folded = $derived(rest ?? min);
  const shown = $derived(collapsed ? folded : size);

  function coordinate(event: PointerEvent): number {
    return axis === "row" ? event.clientY : event.clientX;
  }

  function clamp(value: number): number {
    return Math.round(Math.min(max, Math.max(min, value)));
  }

  function resolve(raw: number): { size: number; collapsed: boolean } {
    if (raw < (min + folded) / 2) return { size, collapsed: true };
    return { size: clamp(raw), collapsed: false };
  }

  function schedule(next: { size: number; collapsed: boolean }) {
    pending = next;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (pending) onpreview(pending.collapsed ? folded : pending.size, pending.collapsed);
    });
  }

  function on_pointerdown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget instanceof Element && event.currentTarget.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, start: coordinate(event), from: shown };
    pending = null;
    active = true;
  }

  function on_pointermove(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    const delta = coordinate(event) - drag.start;
    schedule(resolve(drag.from + (grows_backward ? -delta : delta)));
  }

  function on_end() {
    if (!drag) return;
    drag = null;
    active = false;
    cancelAnimationFrame(frame);
    frame = 0;
    if (pending) oncommit(pending.size, pending.collapsed);
    pending = null;
  }

  function on_keydown(event: KeyboardEvent) {
    const back = axis === "row" ? "ArrowUp" : "ArrowLeft";
    const forward = axis === "row" ? "ArrowDown" : "ArrowRight";
    let next: number | null = null;
    if (event.key === back || event.key === forward) {
      const towards_start = event.key === back;
      next = shown + (towards_start === grows_backward ? KEY_STEP : -KEY_STEP);
    } else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      return oncommit(size, !collapsed);
    }
    if (next === null) return;
    event.preventDefault();
    oncommit(clamp(next), false);
  }

  $effect(() => () => cancelAnimationFrame(frame));
</script>

<!-- A focusable separator is the ARIA window-splitter pattern. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class={["handle", axis, active && "active"]}
  role="separator"
  tabindex="0"
  aria-label={label}
  aria-orientation={axis === "row" ? "horizontal" : "vertical"}
  aria-valuenow={shown}
  aria-valuemin={folded}
  aria-valuemax={max}
  title="{label}: drag to resize, double-click to {collapsed ? 'expand' : 'collapse'}"
  onpointerdown={on_pointerdown}
  onpointermove={on_pointermove}
  onlostpointercapture={on_end}
  ondblclick={() => oncommit(size, !collapsed)}
  onkeydown={on_keydown}
></div>

<style>
  .handle {
    position: relative;
    z-index: 2;
    touch-action: none;
    background: color-mix(in oklch, var(--foreground) 8%, transparent);
    outline: none;
  }

  .handle::before {
    content: "";
    position: absolute;
  }

  .handle::after {
    content: "";
    position: absolute;
    border-radius: 999px;
    background: var(--primary);
    opacity: 0;
    transition: opacity 150ms var(--ease-out);
  }

  .row {
    height: 1px;
    cursor: row-resize;
  }

  .row::before {
    inset: -6px 0;
  }

  .row::after {
    inset: -1px 0;
  }

  .column {
    width: 1px;
    cursor: col-resize;
  }

  .column::before {
    inset: 0 -6px;
  }

  .column::after {
    inset: 0 -1px;
  }

  .handle:hover::after,
  .handle.active::after {
    opacity: 0.6;
  }

  .handle:focus-visible::after {
    opacity: 1;
    background: var(--cottontail);
  }

  @media (pointer: coarse) {
    .row::before {
      inset: -12px 0;
    }

    .column::before {
      inset: 0 -12px;
    }
  }
</style>
