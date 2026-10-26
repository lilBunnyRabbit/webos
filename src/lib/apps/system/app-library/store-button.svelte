<script lang="ts">
  import kernel, { type AppListing, type AppsService, type StoreService } from "$lib/core/api";
  import { Mode } from "$lib/core/api/kernel/mode";
  import { RouteKind, route_url } from "$lib/core/api/services/router/route";
  import { Button, button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { waiting_download } from "./waiting";
  import { ArrowSquareOut as ArrowSquareOutIcon, ArrowsClockwise as ArrowsClockwiseIcon, DownloadSimple as DownloadSimpleIcon, Play as PlayIcon } from "phosphor-svelte";

  interface Props {
    manifest: AppListing;
    size?: "sm" | "md";
    /** Next to Install, Open runs the app without installing it (ADR-077). */
    with_open?: boolean;
    /** The view's one primary action (the app page); tiles, rows and hero cards sit many to a view. */
    primary?: boolean;
    class?: string;
  }

  let { manifest, size = "sm", with_open = false, primary = false, class: class_name }: Props = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const store = $derived(kernel.service<StoreService>("store"));
  // A solo tab opens no other app (ADR-047), so Open points to the full OS in a new tab.
  const solo = kernel.mode === Mode.SOLO;
  const installed = $derived(apps.is_installed(manifest.id));
  const progress = $derived(store.progress(manifest.id));
  const variant = $derived(primary ? "primary" : "secondary");
  const waiting = $derived(installed && store.online && !store.syncing && waiting_download(store, manifest.id));
</script>

<div class={cn("flex shrink-0 items-center gap-1.5", class_name)}>
  {#if solo}
    <a href={route_url({ kind: RouteKind.APP, id: manifest.id, props: undefined })} target="_blank" rel="noopener" class={button({ variant, size })}>
      Open in WebOS <ArrowSquareOutIcon weight="bold" />
    </a>
  {:else if progress !== null}
    {@const percent = Math.round(progress * 100)}
    <span
      role="progressbar"
      aria-label="Downloading {manifest.name}"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      class={cn(button({ size }), "pointer-events-none gap-1.5 font-mono tabular-nums")}
    >
      <svg viewBox="0 0 24 24" class="size-4 -rotate-90" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke-width="3" class="stroke-foreground/20" />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset={100 - percent}
          class="stroke-primary transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      {percent}%
    </span>
  {:else if !installed}
    <Button {variant} {size} onclick={() => apps.install(manifest.id)} aria-label="Install {manifest.name}">
      <DownloadSimpleIcon weight="bold" /> Install
    </Button>
    {#if with_open}
      <Button {size} onclick={() => apps.launch(manifest.id)} aria-label="Open {manifest.name} without installing"><PlayIcon weight="fill" /> Open</Button>
    {/if}
  {:else if waiting}
    <Button {variant} {size} onclick={() => void store.sync()} aria-label="Update {manifest.name}">
      <ArrowsClockwiseIcon weight="bold" /> Update
    </Button>
  {:else}
    <Button {size} onclick={() => apps.launch(manifest.id)} aria-label="Open {manifest.name}"><PlayIcon weight="fill" /> Open</Button>
  {/if}
</div>
