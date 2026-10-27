<script lang="ts">
  import kernel, { type AppListing, type AppsService, type StoreService } from "$lib/core/api";
  import { Mode } from "$lib/core/api/kernel/mode";
  import { RouteKind, route_url } from "$lib/core/api/services/router/route";
  import { Button, IconButton, button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { waiting_download } from "./waiting";
  import { ArrowSquareOut as ArrowSquareOutIcon, ArrowsClockwise as ArrowsClockwiseIcon, DownloadSimple as DownloadSimpleIcon, Play as PlayIcon } from "phosphor-svelte";

  interface Props {
    manifest: AppListing;
    size?: "sm" | "md";
    /** Install with its label (the app page); tiles, rows and cards show the icon alone. */
    labelled?: boolean;
    /** Keep the icon's slot when there's no Install or Update, so Open lines up down a list. */
    reserve?: boolean;
    /** The view's one primary action (the app page); tiles, rows and hero cards sit many to a view. */
    primary?: boolean;
    class?: string;
  }

  let { manifest, size = "sm", labelled = false, reserve = false, primary = false, class: class_name }: Props = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const store = $derived(kernel.service<StoreService>("store"));
  // A solo tab opens no other app (ADR-047), so Open points to the full OS in a new tab.
  const solo = kernel.mode === Mode.SOLO;
  const installed = $derived(apps.is_installed(manifest.id));
  const progress = $derived(store.progress(manifest.id));
  const variant = $derived(primary ? "primary" : "secondary");
  // Pills, unlike the cards' and tiles' corners; Open carries the accent so it never melts into the card behind it.
  const open_class = $derived(cn("rounded-full font-semibold", !primary && "bg-primary/15 text-primary hover:bg-primary/22 active:bg-primary/28"));
  const waiting = $derived(installed && store.online && !store.syncing && waiting_download(store, manifest.id));
</script>

<div class={cn("flex shrink-0 items-center gap-1.5", class_name)}>
  {#if solo}
    <a href={route_url({ kind: RouteKind.APP, id: manifest.id, props: undefined })} target="_blank" rel="noopener" class={button({ variant, size, class: open_class })}>
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
      class={cn(button({ size }), "pointer-events-none gap-1.5 rounded-full font-mono tabular-nums")}
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
  {:else}
    <!-- Open works without installing (ADR-077); Install only keeps the app in your apps and offline, so it never stands alone. -->
    <Button {variant} {size} class={open_class} onclick={() => apps.launch(manifest.id, undefined, { offer_install: false })} aria-label="Open {manifest.name}">
      <PlayIcon weight="fill" /> Open
    </Button>
    {#if !installed}
      {#if labelled}
        <Button {size} class="rounded-full" onclick={() => apps.install(manifest.id)} aria-label="Install {manifest.name}"><DownloadSimpleIcon weight="bold" /> Install</Button>
      {:else}
        <IconButton variant="secondary" {size} class="rounded-full" label="Install {manifest.name}" onclick={() => apps.install(manifest.id)}>
          <DownloadSimpleIcon weight="bold" />
        </IconButton>
      {/if}
    {:else if waiting}
      <IconButton variant="secondary" {size} class="rounded-full" label="Update {manifest.name}" onclick={() => void store.sync()}>
        <ArrowsClockwiseIcon weight="bold" />
      </IconButton>
    {:else if reserve}
      <span aria-hidden="true" class="w-7 shrink-0 pointer-coarse:w-9"></span>
    {/if}
  {/if}
</div>
