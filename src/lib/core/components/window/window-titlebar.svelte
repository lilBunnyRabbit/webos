<script lang="ts">
  import {
    CornersIn as CornersInIcon,
    CornersOut as CornersOutIcon,
    Browser as BrowserIcon,
    Link as LinkIcon,
    Minus as MinusIcon,
    PictureInPicture as PictureInPictureIcon,
    Plus as PlusIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import kernel, { type DialogsService, type ExtractService, RouteKind, type RouterService, type WindowsService, WindowFlag, type WindowId } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { IconButton } from "../ui";
  import { view_transition } from "$lib/core/utils/view-transition";

  let { zoom = $bindable(), window_id, focused }: { zoom: number; window_id: WindowId; focused: boolean } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const router = $derived(kernel.service<RouterService>("router"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const instance = $derived(windows.get(window_id)!);
  const shareable = $derived(router.link_for(window_id) !== null);
  const is_maximized = $derived(instance.flags.has(WindowFlag.MAXIMIZED));
  const extract = $derived(kernel.services.has("extract") ? kernel.service<ExtractService>("extract") : null);

  const ZOOM_STEP = 0.1;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2;

  const percent = $derived(Math.round(zoom * 100));

  async function share(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const kind = await dialogs.menu(
      [
        { id: RouteKind.APP, label: "Copy link", icon: LinkIcon },
        { id: RouteKind.SOLO, label: "Copy solo link", icon: BrowserIcon },
      ],
      { anchor: { x: rect.left, y: rect.bottom + 4 } }
    );
    if (kind === RouteKind.APP || kind === RouteKind.SOLO) await router.copy_link(window_id, kind);
  }
</script>

<div class={cn("flex min-w-0 items-center gap-2 transition-opacity duration-150", !focused && "opacity-80")}>
  <instance.app.manifest.icon class="size-4 shrink-0 text-foreground/80" weight="duotone" />
  <span class="truncate text-ui font-medium" title={instance.title ? `${instance.title} — ${instance.app.manifest.name}` : undefined}>{instance.title ?? instance.app.manifest.name}</span>
  {#if instance.dirty}<span class="size-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Unsaved changes"></span>{/if}
</div>

<div class="flex shrink-0 items-center gap-0.5">
  <!-- Zoom is per window and secondary: hidden until the titlebar is hovered or focused, unless it's not at 100%. -->
  <div
    class={cn(
      "mr-1 flex items-center rounded-md transition-opacity duration-150",
      zoom === 1 && "opacity-0 group-hover/titlebar:opacity-100 focus-within:opacity-100"
    )}
  >
    <IconButton data-window-button label="Zoom out" size="sm" class="w-6" disabled={zoom <= ZOOM_MIN} onclick={() => (zoom = Math.max(ZOOM_MIN, Math.round((zoom - ZOOM_STEP) * 10) / 10))}>
      <MinusIcon weight="bold" />
    </IconButton>
    <button
      data-window-button
      aria-label="Reset zoom, now {percent}%"
      title="Reset zoom"
      class="h-7 min-w-10 rounded-md px-1 font-mono text-2xs text-foreground/80 tabular-nums transition-colors hover:bg-foreground/8 hover:text-foreground"
      onclick={() => (zoom = 1)}
    >
      {percent}%
    </button>
    <IconButton data-window-button label="Zoom in" size="sm" class="w-6" disabled={zoom >= ZOOM_MAX} onclick={() => (zoom = Math.min(ZOOM_MAX, Math.round((zoom + ZOOM_STEP) * 10) / 10))}>
      <PlusIcon weight="bold" />
    </IconButton>
  </div>

  {#if shareable}
    <IconButton data-window-button label="Copy link" size="sm" aria-haspopup="menu" onclick={(event: MouseEvent) => void share(event)}>
      <LinkIcon weight="bold" />
    </IconButton>
  {/if}
  {#if extract?.supported}
    <IconButton
      data-window-button
      label={instance.dirty ? "Save first to pop out" : "Pop out"}
      size="sm"
      disabled={instance.dirty}
      onclick={() => void extract.pop(window_id)}
    >
      <PictureInPictureIcon weight="bold" />
    </IconButton>
  {/if}
  <IconButton data-window-button label="Minimize" size="sm" onclick={() => view_transition(() => windows.toggle_minimize(window_id))}>
    <MinusIcon weight="bold" />
  </IconButton>
  <IconButton data-window-button label={is_maximized ? "Restore" : "Maximize"} size="sm" onclick={() => view_transition(() => windows.toggle_maximize(window_id))}>
    {#if is_maximized}<CornersInIcon weight="bold" />{:else}<CornersOutIcon weight="bold" />{/if}
  </IconButton>
  <IconButton data-window-button label="Close" size="sm" class="hover:bg-error hover:text-background active:bg-error/85" onclick={() => {
      // A clean maximized window closes inside a view transition so the dock morphs back; a dirty one asks first.
      if (is_maximized && !instance.dirty) view_transition(() => void windows.close(window_id));
      else void windows.close(window_id);
    }}>
    <XIcon weight="bold" />
  </IconButton>
</div>
