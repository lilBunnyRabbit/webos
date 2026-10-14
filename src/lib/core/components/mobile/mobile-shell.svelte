<script lang="ts">
  import kernel, {
    UiOverlay,
    type MobileWindowsService,
    type NotificationsService,
    type SettingsService,
    type UiService,
    type WindowId,
  } from "$lib/core/api";
  import LogoMark from "../brand/logo-mark.svelte";
  import ToastArea from "../notifications/toast-area.svelte";
  import DialogsHost from "../dialogs/dialogs-host.svelte";
  import AppDrawer from "./app-drawer.svelte";
  import MobileHome from "./mobile-home.svelte";
  import MobileWindows from "./mobile-windows.svelte";
  import NavBar from "./nav-bar.svelte";
  import Wallpaper from "../desktop/wallpaper.svelte";
  import { view_transition } from "$lib/core/utils/view-transition";

  const windows = $derived(kernel.service<MobileWindowsService>("windows"));
  const focused = $derived(windows.get_focused());
  const running = $derived(windows.list().length);

  /** The drawer (launcher) and switcher live in `ui`, so shortcuts can open them too (ADR-028). */
  const ui = $derived(kernel.service<UiService>("ui"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const layer = $derived(ui.overlay);
  /** The switcher hosts the notification center, so either overlay opens it (ADR-006 revision). */
  const switcher = $derived(layer === UiOverlay.SWITCHER || layer === UiOverlay.NOTIFICATIONS);
  const unread = $derived(kernel.service<NotificationsService>("notifications").unread_count > 0);

  // An app coming on screen (launched from the drawer, a file opened, a card picked) closes whatever was over it.
  $effect(() => {
    if (focused) ui.close();
  });

  function home() {
    view_transition(() => {
      ui.close();
      windows.go_home();
    });
  }

  function recents() {
    view_transition(() => (switcher ? ui.close() : ui.open(UiOverlay.SWITCHER)));
  }

  function pick(id: WindowId) {
    view_transition(() => {
      ui.close();
      windows.focus(id);
    });
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && layer && !event.defaultPrevented) ui.back();
  }}
/>

<div
  class="flex h-dvh w-full flex-col overflow-hidden bg-background-darkest pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] [touch-action:manipulation]"
>
  <!-- The stage is the size container cards and pages measure against (100cqw / 100cqh). -->
  <main class="relative isolate min-h-0 flex-1 [container-type:size]" data-wallpaper-image={settings.wallpaper.kind === "image" ? "" : undefined}>
    <Wallpaper />
    {#if settings.wallpaper.kind === "preset"}
    <LogoMark
      class="pointer-events-none absolute top-1/2 left-1/2 w-2/5 max-w-60 -translate-x-1/2 -translate-y-1/2 text-primary/10"
      aria-hidden="true"
    />
    {/if}
    <MobileHome ondrawer={() => view_transition(() => ui.open(UiOverlay.LAUNCHER))} />
    <MobileWindows {switcher} onpick={pick} />
    {#if layer === UiOverlay.LAUNCHER}
      <AppDrawer onclose={() => ui.close()} />
    {/if}
    <ToastArea from="top" class="absolute inset-x-0 top-0 z-20 items-center justify-start pt-[calc(env(safe-area-inset-top)+0.5rem)]" />
  </main>

  <NavBar {running} {unread} {switcher} onback={() => ui.back()} onhome={home} onrecents={recents} />
</div>

<DialogsHost anchored="sheet" />

