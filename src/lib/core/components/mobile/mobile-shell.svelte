<script lang="ts">
  import kernel, { type MobileWindowsService, type WindowId } from "$lib/core/api";
  import LogoMark from "../brand/logo-mark.svelte";
  import ToastArea from "../notifications/toast-area.svelte";
  import AppDrawer from "./app-drawer.svelte";
  import MobileHome from "./mobile-home.svelte";
  import MobileWindows from "./mobile-windows.svelte";
  import NavBar from "./nav-bar.svelte";
  import { view_transition } from "./view-transition";

  const windows = $derived(kernel.service<MobileWindowsService>("windows"));
  const focused = $derived(windows.get_focused());
  const running = $derived(windows.list().length);

  /** Shell overlays, not window state: only this shell and its nav bar open or close them (ADR-016). */
  let layer = $state<"drawer" | "switcher" | null>(null);

  // An app coming on screen (launched from the drawer, a file opened, a card picked) closes whatever was over it.
  $effect(() => {
    if (focused) layer = null;
  });

  function back() {
    if (layer) view_transition(() => (layer = null));
    else if (focused) view_transition(() => windows.go_home());
  }

  function home() {
    view_transition(() => {
      layer = null;
      windows.go_home();
    });
  }

  function recents() {
    view_transition(() => (layer = layer === "switcher" ? null : "switcher"));
  }

  function pick(id: WindowId) {
    view_transition(() => {
      layer = null;
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
    <MobileHome ondrawer={() => view_transition(() => (layer = "drawer"))} />
    <MobileWindows switcher={layer === "switcher"} onpick={pick} />
    {#if layer === "drawer"}
      <AppDrawer onclose={() => (layer = null)} />
    {/if}
    <ToastArea class="absolute inset-x-0 top-0 z-20 items-center justify-start pt-[calc(env(safe-area-inset-top)+0.5rem)]" />
  </main>

  <NavBar {running} switcher={layer === "switcher"} onback={back} onhome={home} onrecents={recents} />
</div>

<style>
  /* Same surface as the desktop: a soft glow from the top, between shades of one surface. */
  .home-surface {
    background: radial-gradient(ellipse 90% 70% at 50% -10%, var(--background-dark), transparent 70%);
  }
</style>
