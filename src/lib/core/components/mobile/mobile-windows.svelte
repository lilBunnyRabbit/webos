<script lang="ts">
  import kernel, { type MobileWindowsService, type NotificationsService, type WindowId } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { Cards as CardsIcon, X as XIcon } from "phosphor-svelte";
  import { Button, IconButton } from "../ui";
  import NotificationList from "../notifications/notification-list.svelte";
  import MobileWindow from "./mobile-window.svelte";
  import { view_transition } from "$lib/core/utils/view-transition";

  let { switcher, onpick }: { switcher: boolean; onpick: (id: WindowId) => void } = $props();

  const windows = $derived(kernel.service<MobileWindowsService>("windows"));
  const list = $derived(windows.list());
  const recent = $derived(windows.recent());
  const rank = $derived(new Map(recent.map((id, index) => [id, index])));
  const focused = $derived(windows.get_focused());
  /** The notification center sits above the cards (ADR-006 revision), only when there's something in it. */
  const center = $derived(switcher && kernel.service<NotificationsService>("notifications").all.length > 0);

  /** Cards are the live windows at this scale: no screenshots, the app keeps running inside. Smaller under notifications. */
  const scale = $derived(center ? 0.55 : 0.66);
  /** A card flicked up past this many px closes its app. */
  const CLOSE_DISTANCE = 96;

  let swipe = $state<{ id: WindowId; pointer: number; start_x: number; start_y: number; dy: number; vertical: boolean | null } | null>(null);

  function close(id: WindowId) {
    view_transition(() => windows.close(id));
  }

  function close_all() {
    view_transition(() => windows.close_all());
  }

  function on_pointer_down(event: PointerEvent, id: WindowId) {
    if (!event.isPrimary) return;
    swipe = { id, pointer: event.pointerId, start_x: event.clientX, start_y: event.clientY, dy: 0, vertical: null };
  }

  function on_pointer_move(event: PointerEvent) {
    if (!swipe || event.pointerId !== swipe.pointer) return;
    const dx = event.clientX - swipe.start_x;
    const dy = event.clientY - swipe.start_y;
    // The first clear direction decides: sideways is the browser scrolling the cards, upward is ours.
    if (swipe.vertical === null && Math.hypot(dx, dy) > 8) {
      swipe.vertical = Math.abs(dy) > Math.abs(dx);
      const target = event.currentTarget as HTMLElement;
      if (swipe.vertical && !target.hasPointerCapture(event.pointerId)) {
        try {
          target.setPointerCapture(event.pointerId);
        } catch {
          // A pointer that already ended can't be captured; the swipe still follows its moves.
        }
      }
    }
    if (swipe.vertical) swipe.dy = Math.min(0, dy);
  }

  function on_pointer_up(event: PointerEvent) {
    if (!swipe || event.pointerId !== swipe.pointer) return;
    const { id, dy, vertical } = swipe;
    swipe = null;
    if (vertical && dy < -CLOSE_DISTANCE) close(id);
    else if (vertical === null) onpick(id);
  }
</script>

<div
  {@attach (element) => {
    windows.set_container(element);
    return () => windows.set_container(null);
  }}
  class={cn("absolute inset-0 flex flex-col", switcher ? "bg-(--overlay) backdrop-blur-xl" : "pointer-events-none")}
  style:--card-scale={scale}
>
  {#if center}
    <NotificationList
      class="max-h-[32cqh] shrink-0 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
      item_class="bg-background-lighter shadow-raised"
    />
  {/if}

<div
  class={cn(
    "min-h-0 flex-1",
    switcher ? "flex snap-x snap-mandatory items-center gap-4 overflow-x-auto overscroll-x-contain px-[calc((1-var(--card-scale))*50cqw)] [scrollbar-width:none]" : "relative"
  )}
  aria-label={switcher ? "Running apps" : undefined}
>
  {#each list as id (id)}
    {@const instance = windows.get(id)}
    {@const on_screen = focused === id}
    {#if instance}
      <div
        class={cn(switcher ? "flex shrink-0 snap-center flex-col gap-2" : cn("absolute inset-0", on_screen ? "pointer-events-auto" : "hidden"))}
        style:order={switcher ? rank.get(id) : undefined}
      >
        {#if switcher}
          <div class="flex h-8 items-center gap-2 px-1 select-none">
            <instance.app.manifest.icon class="size-5 shrink-0" weight="duotone" />
            <span class="min-w-0 flex-1 truncate text-ui font-medium">{instance.app.manifest.name}</span>
            <IconButton label="Close {instance.app.manifest.name}" size="sm" onclick={() => close(id)}>
              <XIcon weight="bold" />
            </IconButton>
          </div>
        {/if}

        <div
          class={cn(
            switcher
              ? "relative h-[calc(100cqh*var(--card-scale))] w-[calc(100cqw*var(--card-scale))] overflow-hidden rounded-2xl shadow-window-focused ring-1 ring-foreground/12"
              : "h-full w-full animate-pop-in"
          )}
          style:view-transition-name="window-{id}"
          style:translate={swipe?.id === id ? `0 ${swipe.dy}px` : undefined}
          style:opacity={swipe?.id === id ? Math.max(0.3, 1 + swipe.dy / (CLOSE_DISTANCE * 3)) : undefined}
        >
          <div
            class={cn(switcher ? "absolute top-0 left-0 h-[100cqh] w-[100cqw] origin-top-left scale-(--card-scale)" : "h-full w-full")}
            inert={switcher}
          >
            <MobileWindow {id} />
          </div>

          {#if switcher}
            <!-- Tap opens, a flick up closes, sideways scrolls the row (native, hence pan-x). -->
            <button
              class="absolute inset-0 touch-pan-x"
              aria-label="Open {instance.app.manifest.name}"
              onpointerdown={(event) => on_pointer_down(event, id)}
              onpointermove={on_pointer_move}
              onpointerup={on_pointer_up}
              onpointercancel={() => (swipe = null)}
              onkeydown={(event) => {
                if (event.key === "Enter" || event.key === " ") onpick(id);
              }}
            ></button>
          {/if}
        </div>
      </div>
    {/if}
  {/each}

</div>

  {#if switcher}
    {#if list.length === 0}
      <div class="pointer-events-none absolute inset-0 grid place-items-center select-none">
        <div class="flex flex-col items-center gap-3 text-foreground/65">
          <CardsIcon class="size-10" weight="duotone" />
          <p class="text-sm font-medium">No running apps</p>
        </div>
      </div>
    {:else}
      <div class="flex shrink-0 justify-center pb-4">
        <Button onclick={close_all}>Close all</Button>
      </div>
    {/if}
  {/if}
</div>
