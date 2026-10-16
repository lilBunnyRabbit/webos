<script lang="ts">
  import kernel, { type DialogsService, type ExtractService, type SettingsService, type WindowsService, WindowFlag, type WindowInstance, with_pin, without_pin } from "$lib/core/api";
  import { ArrowSquareIn as ArrowSquareInIcon, PictureInPicture as PictureInPictureIcon, PushPinSimple as PushPinSimpleIcon, PushPinSimpleSlash as PushPinSimpleSlashIcon, X as XIcon } from "phosphor-svelte";
  import { cn } from "$lib/core/utils";
  import { view_transition } from "$lib/core/utils/view-transition";
  import AppBadge from "../apps/app-badge.svelte";

  let { instance, vertical }: { instance: WindowInstance; vertical: boolean } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const is_focused = $derived(windows.is_focused(instance.id));
  const is_minimized = $derived(instance.flags.has(WindowFlag.MINIMIZED));
  const extract = $derived(kernel.services.has("extract") ? kernel.service<ExtractService>("extract") : null);
  const is_out = $derived(extract?.current === instance.id);
  const label = $derived(instance.title ? `${instance.title} — ${instance.app.manifest.name}` : instance.app.manifest.name);

  async function menu(event: MouseEvent) {
    event.preventDefault();
    const app_id = instance.app.id;
    const pinned = settings.taskbar.pinned.includes(app_id);
    const choice = await dialogs.menu(
      [
        pinned
          ? { id: "unpin", label: "Unpin from taskbar", icon: PushPinSimpleSlashIcon }
          : { id: "pin", label: "Pin to taskbar", icon: PushPinSimpleIcon },
        { separator: true },
        ...(is_out
          ? [{ id: "back", label: "Bring back", icon: ArrowSquareInIcon }]
          : extract?.supported
            ? [{ id: "pop", label: "Pop out", icon: PictureInPictureIcon, disabled: instance.dirty }]
            : []),
        { id: "close", label: "Close window", icon: XIcon },
      ],
      { anchor: { x: event.clientX, y: event.clientY } }
    );
    if (choice === "pin") settings.taskbar.pinned = with_pin(settings.taskbar.pinned, app_id);
    else if (choice === "unpin") settings.taskbar.pinned = without_pin(settings.taskbar.pinned, app_id);
    else if (choice === "back") void extract?.bring_back();
    else if (choice === "pop") void extract?.pop(instance.id);
    else if (choice === "close") void windows.close(instance.id);
  }
</script>

<button
  aria-label={label}
  aria-pressed={is_focused && !is_minimized}
  title={label}
  class={cn(
    "relative grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-150 hover:bg-foreground/10",
    is_focused && !is_minimized && "bg-foreground/10",
    is_minimized && "text-foreground/65"
  )}
  style:view-transition-name={is_minimized ? `window-${instance.id}` : undefined}
  oncontextmenu={menu}
  onclick={() => {
    // Minimizing flies the window into this button and restoring flies it back out: while minimized it carries the
    // window's view-transition name (ADR-014 revision).
    if (is_out) {
      windows.focus(instance.id);
      extract?.focus();
    } else if (is_minimized || is_focused) {
      view_transition(() => windows.toggle_minimize(instance.id));
    } else {
      windows.focus(instance.id);
    }
  }}
>
  <instance.app.manifest.icon class="size-5.5" weight={is_focused && !is_minimized ? "fill" : "duotone"} />
  <AppBadge app_id={instance.app.id} class="top-0.5 right-0.5 ring-background-light" />
  {#if is_out}
    <PictureInPictureIcon class="absolute bottom-0.5 left-0.5 size-3.5 text-primary" weight="fill" aria-label="Popped out" />
  {/if}
  <!-- Running indicator: a short bar for the focused window, a dot for the rest. -->
  <span
    class={cn(
      "absolute rounded-full transition-all duration-200",
      vertical ? "top-1/2 -left-0.5 w-0.5 -translate-y-1/2" : "-bottom-0.5 left-1/2 h-0.5 -translate-x-1/2",
      is_focused && !is_minimized
        ? cn("bg-primary", vertical ? "h-4" : "w-4")
        : cn("bg-foreground/45", vertical ? "h-1" : "w-1")
    )}
  ></span>
</button>
