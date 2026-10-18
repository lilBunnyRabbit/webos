<script lang="ts">
  import kernel, { LinkOutcome, Platform, RouteKind, type AppsService, type RouterService, type WindowsService } from "$lib/core/api";
  import { button, Button, EmptyState } from "$lib/core/components/ui";
  import { ArrowClockwise as ArrowClockwiseIcon, ArrowSquareOut as ArrowSquareOutIcon, LinkBreak as LinkBreakIcon } from "phosphor-svelte";
  import { parse_hash, route_url } from "$lib/core/api/services/router/route";
  import LogoMark from "../brand/logo-mark.svelte";
  import ToastArea from "../notifications/toast-area.svelte";
  import DialogsHost from "../dialogs/dialogs-host.svelte";
  import SoloWindow from "./solo-window.svelte";

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const router = $derived(kernel.service<RouterService>("router"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const route = parse_hash(location.hash);
  const manifest = $derived(route ? apps.get(route.id) : undefined);
  const current = $derived(windows.list()[0] ?? null);
  const instance = $derived(current ? windows.get(current) : undefined);
  const broken = $derived(router.last_link !== null && router.last_link.outcome !== LinkOutcome.OPENED);

  const os_link = $derived(
    (current && router.link_for(current)) ??
      (route && !broken ? route_url({ kind: RouteKind.APP, id: route.id, props: route.props }) : `${location.origin}${location.pathname}`)
  );

  function reopen() {
    if (route) apps.launch(route.id, route.props);
  }
</script>

<div class="flex h-dvh w-full flex-col overflow-hidden bg-background-darkest pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
  <header class="flex shrink-0 items-center gap-2 border-b border-foreground/10 bg-background px-3 pt-[env(safe-area-inset-top)]">
    <div class="flex h-11 min-w-0 flex-1 items-center gap-2 pointer-coarse:h-13">
      {#if manifest}
        <manifest.icon class="size-4 shrink-0 text-foreground/80" weight="duotone" />
        <span class="truncate text-ui font-medium" title={instance?.title ? `${instance.title} — ${manifest.name}` : undefined}>
          {instance?.title ?? manifest.name}
        </span>
        {#if instance?.dirty}<span class="size-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Unsaved changes"></span>{/if}
      {/if}
    </div>
    <!-- A new tab, so this one keeps the app as it is now (ADR-047). -->
    <a href={os_link} target="_blank" rel="noopener" class={button({ variant: "primary", size: "sm", class: "shrink-0" })}>
      <LogoMark class="size-3.5" aria-hidden="true" />
      Open WebOS
      <ArrowSquareOutIcon weight="bold" />
    </a>
  </header>

  <main class="relative isolate min-h-0 flex-1">
    {#if current}
      {#key current}<SoloWindow id={current} />{/key}
    {:else if broken || !manifest}
      <EmptyState icon={LinkBreakIcon} tone="error" title="This link can't open" description="The app it points to doesn't exist, or its data doesn't fit." />
    {:else if router.last_link}
      <EmptyState icon={manifest.icon} title="{manifest.name} is closed">
        {#snippet actions()}
          <Button variant="primary" onclick={reopen}><ArrowClockwiseIcon weight="bold" /> Reopen</Button>
        {/snippet}
      </EmptyState>
    {/if}
    <ToastArea
      from={kernel.platform === Platform.MOBILE ? "top" : "right"}
      class="absolute inset-x-0 top-0 z-20 {kernel.platform === Platform.MOBILE ? 'items-center' : 'items-end'}"
    />
  </main>
</div>

<DialogsHost anchored={kernel.platform === Platform.MOBILE ? "sheet" : "dropdown"} />
