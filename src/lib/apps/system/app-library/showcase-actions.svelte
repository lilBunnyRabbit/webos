<script lang="ts">
  import kernel, { NotificationType, type AppManifest, type AppsService, type ClipboardService, type NotificationsService } from "$lib/core/api";
  import { Mode } from "$lib/core/api/kernel/mode";
  import { RouteKind, route_url } from "$lib/core/api/services/router/route";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, IconButton, button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ArrowSquareOut as ArrowSquareOutIcon, DownloadSimple as DownloadSimpleIcon, LinkSimple as LinkSimpleIcon, Play as PlayIcon } from "phosphor-svelte";

  interface Props {
    manifest: AppManifest;
    size?: "sm" | "md";
    class?: string;
  }

  let { manifest, size = "md", class: class_name }: Props = $props();

  const { app_id } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const installed = $derived(apps.is_installed(manifest.id));
  // A solo tab opens no other app (ADR-047), so Open points to the full OS in a new tab, like the solo bar's Open WebOS.
  const solo = kernel.mode === Mode.SOLO;

  async function copy_link() {
    const link = route_url({ kind: RouteKind.SOLO, id: manifest.id, props: undefined });
    try {
      await clipboard.copy_text(link);
      notifications.notify(app_id, { type: NotificationType.INFO, title: `Solo link to ${manifest.name} copied`, message: link });
    } catch {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't copy the link" });
    }
  }
</script>

<div class={cn("flex flex-wrap items-center gap-1.5", class_name)}>
  {#if solo}
    <a
      href={route_url({ kind: RouteKind.APP, id: manifest.id, props: undefined })}
      target="_blank"
      rel="noopener"
      class={button({ variant: "primary", size })}
    >
      Open in WebOS <ArrowSquareOutIcon weight="bold" />
    </a>
  {:else if installed}
    <Button variant="primary" {size} onclick={() => apps.launch(manifest.id)}><PlayIcon weight="fill" /> Open</Button>
  {:else}
    <Button variant="primary" {size} onclick={() => apps.install(manifest.id)}><DownloadSimpleIcon weight="bold" /> Install</Button>
    <Button {size} onclick={() => apps.launch(manifest.id)}><PlayIcon weight="fill" /> Open</Button>
  {/if}
  {#if size === "sm"}
    <IconButton label="Copy solo link" {size} onclick={copy_link}><LinkSimpleIcon weight="bold" /></IconButton>
  {:else}
    <Button {size} onclick={copy_link}><LinkSimpleIcon weight="bold" /> Copy solo link</Button>
  {/if}
</div>
