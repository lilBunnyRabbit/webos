<script lang="ts">
  import kernel, {
    LinkOutcome,
    Platform,
    RouteKind,
    WindowFlag,
    type AppsService,
    type RouterService,
    type VersionService,
    type WindowsService,
  } from "$lib/core/api";
  import { UpdateStage } from "$lib/core/api/services/version/type";
  import { button, Button, EmptyState, IconButton } from "$lib/core/components/ui";
  import { untrack } from "svelte";
  import { ArrowCircleUp as ArrowCircleUpIcon, ArrowClockwise as ArrowClockwiseIcon, ArrowSquareOut as ArrowSquareOutIcon, LinkBreak as LinkBreakIcon, Question as QuestionIcon } from "phosphor-svelte";
  import { parse_hash, route_url } from "$lib/core/api/services/router/route";
  import LogoMark from "../brand/logo-mark.svelte";
  import ToastArea from "../notifications/toast-area.svelte";
  import DialogsHost from "../dialogs/dialogs-host.svelte";
  import SoloWindow from "./solo-window.svelte";

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const router = $derived(kernel.service<RouterService>("router"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const version = $derived(kernel.service<VersionService>("version"));

  const route = parse_hash(location.hash);
  const current = $derived(windows.list()[0] ?? null);
  const instance = $derived(current ? windows.get(current) : undefined);
  // The opened window's app, not the link's id: a link to a replaced id opens another app (ADR-071).
  const manifest = $derived(instance?.app.manifest ?? (route ? apps.get(route.id) : undefined));
  const broken = $derived(router.last_link !== null && router.last_link.outcome !== LinkOutcome.OPENED);

  const os_link = $derived(
    (current && router.link_for(current)) ??
      (route && !broken ? route_url({ kind: RouteKind.APP, id: route.id, props: route.props }) : `${location.origin}${import.meta.env.BASE_URL}`)
  );

  // Solo never polls, and a link to an app or prop added after this build was cached looks broken here: ask once.
  $effect(() => {
    if (!current && (broken || (!manifest && router.last_link))) untrack(() => void version.check());
  });

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
    {#if current && instance}
      <IconButton label="Guide" size="sm" class="pointer-coarse:size-11" pressed={instance.flags.has(WindowFlag.GUIDE)} onclick={() => windows.toggle_guide(current)}>
        <QuestionIcon weight="bold" />
      </IconButton>
    {/if}
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
    {:else if (broken || (!manifest && router.last_link)) && version.update_available}
      <EmptyState
        icon={ArrowCircleUpIcon}
        title="This link needs a newer WebOS"
        description="WebOS v{version.update_available.version} is out{version.info ? `, and this copy is v${version.info.version}` : ''}. Update to open the link."
      >
        {#snippet actions()}
          <Button
            variant="primary"
            class="pointer-coarse:h-11"
            disabled={version.update_stage !== UpdateStage.IDLE}
            onclick={() => void version.apply_update()}
          >
            <ArrowCircleUpIcon weight="bold" />
            {version.update_stage === UpdateStage.IDLE ? "Update and reload" : "Updating…"}
          </Button>
        {/snippet}
      </EmptyState>
    {:else if broken || (!manifest && router.last_link)}
      <EmptyState icon={LinkBreakIcon} tone="error" title="This link can't open" description={version.is_checking ? "Checking for a newer version of WebOS…" : "The app it points to doesn't exist, or its data doesn't fit."} />
    {:else if router.last_link && manifest}
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
