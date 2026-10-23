<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { long_press } from "$lib/core/utils/long-press";
  import type { Position } from "$lib/core/utils/type";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, Check as CheckIcon, DotsThreeVertical as DotsThreeVerticalIcon, Trash as TrashIcon } from "phosphor-svelte";
  import type { Item, ListMeta } from "./data";
  import ListMark from "./list-mark.svelte";
  import { format_amount } from "./parse";

  interface Props {
    item: Item;
    store: boolean;
    /** Shown in front of the name when rows of several lists mix, like the cart in All. */
    from?: ListMeta;
    ontoggle: () => void;
    onremove: () => void;
    onedit: () => void;
    onmenu: (anchor: Position) => void;
  }

  let { item, store, from, ontoggle, onremove, onedit, onmenu }: Props = $props();

  const amount = $derived(format_amount(item));
  const START_PX = 10;

  let row = $state<HTMLElement | null>(null);
  let offset = $state(0);
  let dragging = $state(false);
  /** Past these a released swipe acts; short of them the row springs back. Delete asks for more, so a scroll that drifts left doesn't delete. */
  let reach = $state({ tick: 120, remove: 220 });
  let gesture: { id: number; x: number; y: number; width: number } | null = null;
  const armed = $derived(offset >= reach.tick || -offset >= reach.remove);
  let swallow_click = false;

  function menu(point: Position) {
    // The keyboard's menu key reports no position.
    if (point.x || point.y || !row) return onmenu(point);
    const rect = row.getBoundingClientRect();
    onmenu({ x: rect.left + 16, y: rect.bottom });
  }

  function more(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    onmenu({ x: rect.left, y: rect.bottom + 4 });
  }

  function on_pointer_down(event: PointerEvent) {
    if (event.button > 0 || !event.isPrimary || (event.target as Element).closest("[data-no-swipe]")) return;
    const width = row?.clientWidth ?? 300;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, width };
    reach = { tick: Math.min(120, width * 0.35), remove: width * 0.6 };
  }

  function on_pointer_move(event: PointerEvent) {
    const start = gesture;
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!dragging) {
      if (Math.abs(dy) > START_PX && Math.abs(dy) > Math.abs(dx)) {
        gesture = null;
        return;
      }
      if (Math.abs(dx) <= START_PX || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
      dragging = true;
      row?.setPointerCapture(event.pointerId);
    }
    const was_armed = armed;
    offset = Math.max(-start.width, Math.min(start.width, dx));
    if (!was_armed && armed) navigator.vibrate?.(8);
  }

  function on_pointer_up(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const was_dragging = dragging;
    const act = was_dragging && armed;
    const direction = Math.sign(offset);
    gesture = null;
    dragging = false;
    offset = 0;
    if (!was_dragging) return;
    swallow_click = true;
    if (!act) return;
    if (direction > 0) ontoggle();
    else onremove();
  }

  function on_pointer_cancel() {
    gesture = null;
    dragging = false;
    offset = 0;
  }

  /** In store mode a tap doesn't tick (misclicks); the row nudges right instead, showing the swipe that does. */
  function peek() {
    if (dragging || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    offset = 28;
    setTimeout(() => {
      if (!dragging) offset = 0;
    }, 160);
  }

  function on_click(event: MouseEvent) {
    if (!swallow_click) return;
    swallow_click = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
</script>

<li
  bind:this={row}
  {@attach store ? undefined : long_press({ on_menu: menu })}
  class="relative touch-pan-y overflow-hidden"
  style:view-transition-name="item-{item.id}"
  onpointerdown={on_pointer_down}
  onpointermove={on_pointer_move}
  onpointerup={on_pointer_up}
  onpointercancel={on_pointer_cancel}
  onclickcapture={on_click}
>
  {#if offset > 0}
    <div class={cn("absolute inset-0 flex items-center px-5 text-background transition-colors", armed ? "bg-success" : "bg-success/55")} aria-hidden="true">
      {#if item.checked}<ArrowCounterClockwiseIcon weight="bold" class="size-5" />{:else}<CheckIcon weight="bold" class="size-5" />{/if}
    </div>
  {:else if offset < 0}
    <div class={cn("absolute inset-0 flex items-center justify-end px-5 text-background transition-colors", armed ? "bg-error" : "bg-error/55")} aria-hidden="true">
      <TrashIcon weight="bold" class="size-5" />
    </div>
  {/if}
  <div
    class={cn("relative flex items-center bg-(--row-background)", !dragging && "transition-transform duration-200", item.checked && "text-foreground/55")}
    style:transform="translateX({offset}px)"
  >
    <button
      type="button"
      role="checkbox"
      aria-checked={item.checked}
      aria-label={item.text}
      data-no-swipe
      class="hidden shrink-0 place-items-center self-stretch pr-1 pl-3 outline-none focus-visible:bg-primary/12 pointer-fine:grid"
      onclick={ontoggle}
    >
      {@render circle()}
    </button>
    <button
      type="button"
      class={cn(
        "flex min-w-0 flex-1 items-center gap-3 pr-3 text-left outline-none select-none focus-visible:bg-primary/12 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset pointer-fine:pl-2 pointer-coarse:pl-3 [-webkit-touch-callout:none]",
        store ? "min-h-16 text-lg" : "min-h-12 text-base pointer-coarse:min-h-14"
      )}
      aria-label={store ? undefined : `Edit ${item.text}`}
      onclick={() => (store ? peek() : onedit())}
    >
      <span class="contents pointer-fine:hidden">{@render circle()}</span>
      {#if from}<ListMark list={from} size="sm" />{/if}
      <span class={cn("min-w-0 flex-1 break-words", item.checked ? "line-through decoration-foreground/40" : "font-medium text-foreground")}>{item.text}</span>
    </button>
    {#if amount}
      {@const pill = cn(
        "shrink-0 rounded-full px-2.5 py-0.5 font-mono font-semibold tabular-nums",
        store ? "mr-3 text-base" : "text-sm",
        item.checked ? "text-foreground/55" : "bg-primary/18 text-foreground"
      )}
      {#if store}
        <span class={pill}>{amount}</span>
      {:else}
        <button type="button" class="group grid min-h-10 shrink-0 place-items-center self-stretch px-1 pointer-coarse:pr-3" aria-label="Amount of “{item.text}”: {amount}" onclick={onedit}>
          <span class={cn(pill, !item.checked && "group-hover:bg-primary/28")}>{amount}</span>
        </button>
      {/if}
    {/if}
    {#if !store}
      <IconButton label="More for “{item.text}”" class="mr-1 ml-1 shrink-0 text-foreground/65 pointer-coarse:hidden" onclick={more}>
        <DotsThreeVerticalIcon weight="bold" />
      </IconButton>
    {/if}
  </div>
</li>

{#snippet circle()}
  <span
    class={cn(
      "grid shrink-0 place-items-center rounded-full transition-colors",
      store ? "size-8" : "size-6",
      item.checked ? "bg-primary text-background shadow-control [--edge-lit:oklch(from_var(--primary)_calc(l+0.1)_c_h)]" : "bg-field shadow-recessed ring-1 ring-transparent ring-inset"
    )}
  >
    {#if item.checked}<CheckIcon weight="bold" class={store ? "size-4.5" : "size-3.5"} />{/if}
  </span>
{/snippet}
