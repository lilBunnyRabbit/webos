<script lang="ts">
  import kernel, {
    UiOverlay,
    type DialogsService,
    type MobileWindowsService,
    type NotificationsService,
    type SettingsService,
    type UiService,
    type WindowId,
  } from "$lib/core/api";
  import LogoMark from "../brand/logo-mark.svelte";
  import ToastArea from "../notifications/toast-area.svelte";
  import DialogsHost from "../dialogs/dialogs-host.svelte";
  import MobileHome from "./mobile-home.svelte";
  import MobileWindows from "./mobile-windows.svelte";
  import NavBar from "./nav-bar.svelte";
  import Wallpaper from "../desktop/wallpaper.svelte";
  import { view_transition } from "$lib/core/utils/view-transition";
  import { untrack } from "svelte";

  const windows = $derived(kernel.service<MobileWindowsService>("windows"));
  const focused = $derived(windows.get_focused());
  const running = $derived(windows.list().length);

  /** The full app list (launcher) and switcher live in `ui`, so shortcuts can open them too (ADR-028). */
  const ui = $derived(kernel.service<UiService>("ui"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const layer = $derived(ui.overlay);
  /** The switcher hosts the notification center, so either overlay opens it (ADR-006 revision). */
  const switcher = $derived(layer === UiOverlay.SWITCHER || layer === UiOverlay.NOTIFICATIONS);
  const unread = $derived(kernel.service<NotificationsService>("notifications").unread_count > 0);

  // An app coming on screen (launched from the list, a file opened, a card picked) closes whatever was over it.
  $effect(() => {
    if (focused) ui.close();
  });

  // The full app list is part of the home, under the windows: a shortcut or command opening it over an app goes home.
  $effect(() => {
    if (layer === UiOverlay.LAUNCHER) untrack(() => windows.go_home());
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
    // A menu above a layer is a modal <dialog>: its Escape closes only itself.
    if (event.key === "Escape" && layer && !event.defaultPrevented && dialogs.system.length === 0) ui.back();
  }}
/>

<div
  class="flex h-dvh w-full flex-col overflow-hidden bg-background-darkest pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] [touch-action:manipulation]"
>
  <!-- The stage is the size container cards and pages measure against (100cqw / 100cqh). -->
  <main class="relative isolate min-h-0 flex-1 [container-type:size]" data-wallpaper-image={settings.wallpaper.kind === "image" ? "" : undefined}>
    <Wallpaper />
    {#if settings.wallpaper.kind !== "image"}
    <LogoMark
      class="pointer-events-none absolute top-1/2 left-1/2 w-2/5 max-w-60 -translate-x-1/2 -translate-y-1/2 text-primary/10"
      aria-hidden="true"
    />
    {/if}
    <MobileHome />
    <MobileWindows {switcher} onpick={pick} />
    <ToastArea from="top" class="absolute inset-x-0 top-0 z-20 items-center justify-start pt-[calc(env(safe-area-inset-top)+0.5rem)]" />
  </main>

  <NavBar {running} {unread} {switcher} onback={() => ui.back()} onhome={home} onrecents={recents} />
</div>

<DialogsHost anchored="sheet" />

