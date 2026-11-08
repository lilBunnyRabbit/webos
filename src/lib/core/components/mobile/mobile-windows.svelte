<script lang="ts">
  import kernel, {
    UiOverlay,
    type AppsService,
    type BackgroundService,
    type DialogsService,
    type MobileWindowsService,
    type NotificationsService,
    type TasksService,
    type UiService,
    type WindowId,
  } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import {
    ArrowsClockwise as UpdateIcon,
    ArrowsOutSimple as ArrowsOutSimpleIcon,
    BellSimple as BellIcon,
    CaretLeft as CaretLeftIcon,
    Cards as CardsIcon,
    DownloadSimple as InstallIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { Button, IconButton } from "../ui";
  import NotificationList from "../notifications/notification-list.svelte";
  import MobileWindow from "./mobile-window.svelte";
  import { view_transition } from "$lib/core/utils/view-transition";
  import { untrack } from "svelte";
  import { long_press } from "$lib/core/utils/long-press";
  import type { Position } from "$lib/core/utils/type";
  import { can_update } from "../apps/app-actions";
  import AppExperimental from "../apps/app-experimental.svelte";

  let { switcher, onpick }: { switcher: boolean; onpick: (id: WindowId) => void } = $props();

  const windows = $derived(kernel.service<MobileWindowsService>("windows"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const list = $derived(windows.list());
  const recent = $derived(windows.recent());
  const rank = $derived(new Map(recent.map((id, index) => [id, index])));
  const focused = $derived(windows.get_focused());
  const ui = $derived(kernel.service<UiService>("ui"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  /** Anything for the notification center: notifications, background tasks, apps running in the background. */
  const pending = $derived(
    notifications.all.length > 0 || kernel.service<BackgroundService>("background").list().length > 0 || kernel.service<TasksService>("tasks").active_count > 0
  );
  /** The `notifications` overlay shows the full list in place of the cards; the switcher keeps it behind a chip. */
  const listing = $derived(switcher && ui.overlay === UiOverlay.NOTIFICATIONS);

  // The switcher is the notification center (ADR-006 revision): open counts as looked at, even with the list behind its
  // chip, so the toasts would only repeat it.
  $effect(() => {
    if (!switcher || (notifications.unread_count === 0 && notifications.toasts.length === 0)) return;
    untrack(() => {
      notifications.mark_all_read();
      for (const toast of notifications.toasts) notifications.hide_toast(toast.id);
    });
  });

  /** Cards are the live windows at this scale: no screenshots, the app keeps running inside. */
  const SCALE = 0.66;
  /** A card flicked up past this many px closes its app. */
  const CLOSE_DISTANCE = 96;

  let swipe = $state<{ id: WindowId; pointer: number; start_x: number; start_y: number; dy: number; vertical: boolean | null } | null>(null);

  // A dirty window asks first (ADR-029): bring it on screen for its sheet, and keep the prompt out of a view
  // transition, whose callback must not wait on the user.
  function close(id: WindowId) {
    if (windows.get(id)?.dirty) {
      onpick(id);
      void windows.close(id);
      return;
    }
    view_transition(() => void windows.force_close(id));
  }

  function close_all() {
    const dirty = windows.list().filter((id) => windows.get(id)?.dirty);
    if (dirty.length > 0) {
      onpick(dirty[0]);
      void windows.close_all();
      return;
    }
    view_transition(() => void windows.close_all());
  }

  // The release that opened it must not also open the app.
  async function card_menu(id: WindowId, point: Position) {
    swipe = null;
    const name = windows.get(id)?.app.manifest.name ?? "app";
    const choice = await dialogs.menu(
      [
        { id: "immersive", label: "Full screen", icon: ArrowsOutSimpleIcon },
        { separator: true },
        { id: "close", label: `Close ${name}`, icon: XIcon },
      ],
      { anchor: point }
    );
    if (choice === "immersive") {
      onpick(id);
      windows.set_immersive(id, true);
    } else if (choice === "close") close(id);
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
  style:--card-scale={SCALE}
>
  {#if listing}
    <div class="flex min-h-0 flex-1 flex-col px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-3">
      <div class="flex h-10 shrink-0 items-center">
        <Button size="sm" variant="quiet" class="-ml-2" onclick={() => view_transition(() => ui.open(UiOverlay.SWITCHER))}>
          <CaretLeftIcon weight="bold" />Apps
        </Button>
      </div>
      <NotificationList tasks class="min-h-0 flex-1" item_class="bg-background-lighter shadow-raised" />
    </div>
  {:else if switcher && (list.length > 0 || pending)}
    <div class="flex h-10 shrink-0 items-center justify-between gap-2 px-4 mt-[calc(env(safe-area-inset-top)+0.75rem)]">
      {#if pending}
        <Button
          size="sm"
          class="rounded-full"
          aria-label={notifications.all.length === 1 ? "1 notification" : `${notifications.all.length} notifications`}
          onclick={() => view_transition(() => ui.open(UiOverlay.NOTIFICATIONS))}
        >
          <BellIcon weight="bold" />
          {#if notifications.all.length > 0}{notifications.all.length}{/if}
        </Button>
      {:else}
        <span></span>
      {/if}
      {#if list.length > 0}<Button size="sm" variant="quiet" class="-mr-2" onclick={close_all}>Close all</Button>{/if}
    </div>
  {/if}

<div
  class={cn(
    "min-h-0 flex-1",
    switcher ? "flex snap-x snap-mandatory items-center gap-4 overflow-x-auto overscroll-x-contain px-[calc((1-var(--card-scale))*50cqw)] [scrollbar-width:none]" : "relative",
    listing && "hidden"
  )}
  aria-label={switcher ? "Running apps" : undefined}
>
  {#each list as id (id)}
    {@const instance = windows.get(id)}
    {@const on_screen = focused === id}
    {#if instance}
      <div
        class={cn(switcher ? "flex w-[calc(100cqw*var(--card-scale))] shrink-0 snap-center flex-col gap-1.5" : cn("absolute inset-0", on_screen ? "pointer-events-auto" : "hidden"))}
        style:order={switcher ? rank.get(id) : undefined}
      >
        {#if switcher}
          <div class="flex h-11 items-center gap-2 pl-1 select-none">
            <instance.app.manifest.icon class="size-5 shrink-0" weight="duotone" />
            <span class="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              <span class="max-w-full truncate text-ui font-medium">{instance.title ?? instance.app.manifest.name}</span>
              <AppExperimental app_id={instance.app.id} />
            </span>
            {#if instance.dirty}<span class="size-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Unsaved changes"></span>{/if}
            {#if can_update(instance.app.id)}
              <IconButton label="Update {instance.app.manifest.name}" size="sm" pressed onclick={() => void apps.restart(instance.app.id)}>
                <UpdateIcon weight="bold" />
              </IconButton>
            {/if}
            {#if !apps.is_installed(instance.app.id)}
              <IconButton label="Install {instance.app.manifest.name}" size="sm" pressed onclick={() => apps.install(instance.app.id)}>
                <InstallIcon weight="bold" />
              </IconButton>
            {/if}
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
            <!-- Tap opens, a flick up closes, a long press opens its menu, sideways scrolls the row (native, hence pan-x). -->
            <button
              {@attach long_press({ on_menu: (point) => void card_menu(id, point) })}
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
    {#if list.length === 0 && !listing}
      <div class="pointer-events-none absolute inset-0 grid place-items-center select-none">
        <div class="flex flex-col items-center gap-3 text-foreground/65">
          <CardsIcon class="size-10" weight="duotone" />
          <p class="text-sm font-medium">No running apps</p>
        </div>
      </div>
    {/if}
  {/if}
</div>
