<script lang="ts">
  import kernel, { UiOverlay, type DialogsService, type MobileWindowsService, type UiService, type WindowId } from "$lib/core/api";
  import LogoMark from "../brand/logo-mark.svelte";
  import ToastArea from "../notifications/toast-area.svelte";
  import DialogsHost from "../dialogs/dialogs-host.svelte";
  import AppDrawer from "./app-drawer.svelte";
  import MobileHome from "./mobile-home.svelte";
  import MobileWindows from "./mobile-windows.svelte";
  import NavBar from "./nav-bar.svelte";
  import { view_transition } from "./view-transition";

  const windows = $derived(kernel.service<MobileWindowsService>("windows"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const focused = $derived(windows.get_focused());
  const running = $derived(windows.list().length);

  /** The drawer (launcher) and switcher live in `ui`, so shortcuts can open them too (ADR-028). */
  const ui = $derived(kernel.service<UiService>("ui"));
  const layer = $derived(ui.overlay);

  // An app coming on screen (launched from the drawer, a file opened, a card picked) closes whatever was over it.
  $effect(() => {
    if (focused) ui.close();
  });

  /** Shell layer, then the app's own navigation, then its top sheet, then home (ADR-016 apps pass). */
  function back() {
    if (layer) return view_transition(() => ui.close());
    if (!focused) return;
    if (windows.back(focused)) return;

    const sheet = dialogs.for_window(focused).at(-1);
    if (sheet?.dismissible) return sheet.resolve(null);
    if (sheet) return;

    view_transition(() => windows.go_home());
  }

  function home() {
    view_transition(() => {
      ui.close();
      windows.go_home();
    });
  }

  function recents() {
    view_transition(() => ui.toggle(UiOverlay.SWITCHER));
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
    if (event.key === "Escape" && layer && !event.defaultPrevented) back();
  }}
/>

<div
  class="flex h-dvh w-full flex-col overflow-hidden bg-background-darkest pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] [touch-action:manipulation]"
>
  <!-- The stage is the size container cards and pages measure against (100cqw / 100cqh). -->
  <main class="home-surface relative min-h-0 flex-1 [container-type:size]">
    <LogoMark
      class="pointer-events-none absolute top-1/2 left-1/2 w-2/5 max-w-60 -translate-x-1/2 -translate-y-1/2 text-primary/10"
      aria-hidden="true"
    />
    <MobileHome ondrawer={() => view_transition(() => ui.open(UiOverlay.LAUNCHER))} />
    <MobileWindows switcher={layer === UiOverlay.SWITCHER} onpick={pick} />
    {#if layer === UiOverlay.LAUNCHER}
      <AppDrawer onclose={() => ui.close()} />
    {/if}
    <ToastArea class="absolute inset-x-0 top-0 z-20 items-center justify-start pt-[calc(env(safe-area-inset-top)+0.5rem)]" />
  </main>

  <NavBar {running} switcher={layer === UiOverlay.SWITCHER} onback={back} onhome={home} onrecents={recents} />
</div>

<DialogsHost anchored="sheet" />

<style>
  /* Same surface as the desktop: a soft glow from the top, between shades of one surface. */
  .home-surface {
    background: radial-gradient(ellipse 90% 70% at 50% -10%, var(--background-dark), transparent 70%);
  }
</style>
