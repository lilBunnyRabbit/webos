<script lang="ts">
  import { app_icon } from "$lib/core/components/ui/app-icon";
  import { AppIcon } from "$lib/core/components/ui";
  import kernel, {
    type DialogsService,
    type ExtractService,
    type SettingsService,
    TaskbarPosition,
    type WindowId,
    type WindowsService,
    WindowFlag,
    type WindowInstance,
    with_pin,
    without_pin,
  } from "$lib/core/api";
  import { ArrowSquareIn as ArrowSquareInIcon, PictureInPicture as PictureInPictureIcon, PushPinSimple as PushPinSimpleIcon, PushPinSimpleSlash as PushPinSimpleSlashIcon, X as XIcon } from "phosphor-svelte";
  import { cn } from "$lib/core/utils";
  import type { Position } from "$lib/core/utils/type";
  import { flushSync } from "svelte";
  import { view_transition } from "$lib/core/utils/view-transition";
  import AppBadge from "../apps/app-badge.svelte";
  import { keep_offline_item, KEEP_OFFLINE_ID, toggle_keep_offline } from "../apps/offline-actions";

  let { group, vertical, position }: { group: WindowInstance[]; vertical: boolean; position: TaskbarPosition } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const extract = $derived(kernel.services.has("extract") ? kernel.service<ExtractService>("extract") : null);

  const app = $derived(group[0].app);
  const single = $derived(group.length === 1 ? group[0] : null);
  const minimized = (instance: WindowInstance) => instance.flags.has(WindowFlag.MINIMIZED);
  const window_label = (instance: WindowInstance) => instance.title ?? app.manifest.name;

  const active = $derived(group.some((instance) => windows.is_focused(instance.id) && !minimized(instance)));
  const all_minimized = $derived(group.every(minimized));
  const is_out = $derived(group.some((instance) => extract?.current === instance.id));
  const label = $derived(
    single ? (single.title ? `${single.title} — ${app.manifest.name}` : app.manifest.name) : `${app.manifest.name}, ${group.length} windows`
  );

  let button: HTMLButtonElement | null = $state(null);
  /** Set while this item's menu is open or a window flies into it, so an auto-hidden bar shows (`:has([data-reveal])`). */
  let revealing = $state(false);
  let menu_open = $state(false);
  /** The member that minimized last: two elements can't share a view-transition name, so only it flies into the button. */
  let last_minimized = $state<WindowId | null>(null);
  let seen_minimized: Set<WindowId> | null = null;
  let reveal_timer: ReturnType<typeof setTimeout> | undefined;

  const flies_in = $derived.by(() => {
    const candidates = group.filter(minimized);
    return candidates.find((instance) => instance.id === last_minimized) ?? [...candidates].sort((a, b) => b.order - a.order)[0] ?? null;
  });

  $effect(() => {
    const now = new Set(group.filter(minimized).map((instance) => instance.id));
    const fresh = seen_minimized && [...now].find((id) => !seen_minimized?.has(id));
    seen_minimized = now;
    if (!fresh) return;
    last_minimized = fresh;
    revealing = true;
    clearTimeout(reveal_timer);
    reveal_timer = setTimeout(() => (revealing = false), 400);
  });

  $effect(() => () => clearTimeout(reveal_timer));

  function anchor(): Position {
    const rect = button!.getBoundingClientRect();
    return {
      [TaskbarPosition.BOTTOM]: { x: rect.left, y: rect.top - 8 },
      [TaskbarPosition.TOP]: { x: rect.left, y: rect.bottom + 8 },
      [TaskbarPosition.LEFT]: { x: rect.right + 8, y: rect.top },
      [TaskbarPosition.RIGHT]: { x: rect.left - 8, y: rect.top },
    }[position];
  }

  async function open_menu(...args: Parameters<DialogsService["menu"]>) {
    menu_open = true;
    try {
      return await dialogs.menu(...args);
    } finally {
      menu_open = false;
    }
  }

  function activate(instance: WindowInstance) {
    // Minimizing flies the window into this button and restoring flies it back out: while minimized it carries the
    // window's view-transition name (ADR-014 revision).
    if (extract?.current === instance.id) {
      windows.focus(instance.id);
      extract.focus();
    } else if (minimized(instance) || windows.is_focused(instance.id)) {
      view_transition(() => windows.toggle_minimize(instance.id));
    } else {
      windows.focus(instance.id);
    }
  }

  async function pick() {
    const choice = await open_menu(
      group.map((instance) => ({
        id: instance.id,
        label: window_label(instance),
        icon: extract?.current === instance.id ? PictureInPictureIcon : app_icon(app.manifest.icon),
      })),
      { anchor: anchor() }
    );
    const instance = group.find((member) => member.id === choice);
    if (!instance) return;
    if (extract?.current === instance.id) {
      windows.focus(instance.id);
      extract.focus();
    } else if (minimized(instance)) {
      // The button carries only one member's name; the picked one is the one that flies out.
      last_minimized = instance.id;
      flushSync();
      view_transition(() => windows.toggle_minimize(instance.id));
    } else {
      windows.focus(instance.id);
    }
  }

  async function menu(event: MouseEvent) {
    event.preventDefault();
    const pinned = settings.taskbar.pinned.includes(app.id);
    const pin_item = pinned
      ? { id: "unpin", label: "Unpin from taskbar", icon: PushPinSimpleSlashIcon }
      : { id: "pin", label: "Pin to taskbar", icon: PushPinSimpleIcon };
    const out = single && extract?.current === single.id;
    const choice = await open_menu(
      single
        ? [
            pin_item,
            ...keep_offline_item(app.id),
            { separator: true },
            ...(out
              ? [{ id: "back", label: "Bring back", icon: ArrowSquareInIcon }]
              : extract?.supported
                ? [{ id: "pop", label: "Pop out", icon: PictureInPictureIcon, disabled: single.dirty }]
                : []),
            { id: "close", label: "Close window", icon: XIcon },
          ]
        : [pin_item, ...keep_offline_item(app.id), { separator: true }, { id: "close-all", label: "Close all", icon: XIcon }],
      { anchor: { x: event.clientX, y: event.clientY } }
    );
    if (choice === "pin") settings.taskbar.pinned = with_pin(settings.taskbar.pinned, app.id);
    else if (choice === "unpin") settings.taskbar.pinned = without_pin(settings.taskbar.pinned, app.id);
    else if (choice === KEEP_OFFLINE_ID) toggle_keep_offline(app.id);
    else if (choice === "back") void extract?.bring_back();
    else if (choice === "pop" && single) void extract?.pop(single.id);
    else if (choice === "close" && single) void windows.close(single.id);
    else if (choice === "close-all") for (const instance of group) void windows.close(instance.id);
  }
</script>

<button
  bind:this={button}
  aria-label={label}
  aria-pressed={single ? active : undefined}
  aria-haspopup={single ? undefined : "menu"}
  aria-expanded={single ? undefined : menu_open}
  title={label}
  data-reveal={revealing || menu_open || undefined}
  class={cn(
    "relative grid size-(--taskbar-item) shrink-0 place-items-center rounded-xl transition-[background-color,box-shadow] duration-150 hover:bg-foreground/10 active:shadow-pressed",
    (active || menu_open) && "bg-foreground/10 shadow-pressed",
    all_minimized && "text-foreground/65"
  )}
  style:view-transition-name={flies_in ? `window-${flies_in.id}` : undefined}
  oncontextmenu={menu}
  onclick={() => (single ? activate(single) : pick())}
>
  <AppIcon src={app.manifest.icon} class="size-[calc(var(--taskbar-item)*0.55)]" />
  <AppBadge app_id={app.id} class="top-0.5 right-0.5 ring-background-light" />
  {#if is_out}
    <PictureInPictureIcon class="absolute bottom-0.5 left-0.5 size-3.5 text-primary" weight="fill" aria-label="Popped out" />
  {/if}
  {#if !single}
    <span
      class="pointer-events-none absolute right-0 bottom-0 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-foreground px-0.5 text-[9px] leading-3.5 font-semibold text-background tabular-nums ring-2 ring-background-light"
      aria-hidden="true">{group.length}</span
    >
  {/if}
  <!-- Running indicator: a short bar for the focused window, a dot for the rest. -->
  <span
    class={cn(
      "absolute rounded-full transition-all duration-200",
      vertical ? "top-1/2 -left-0.5 w-0.5 -translate-y-1/2" : "-bottom-0.5 left-1/2 h-0.5 -translate-x-1/2",
      active ? cn("bg-primary", vertical ? "h-4" : "w-4") : cn("bg-foreground/45", vertical ? "h-1" : "w-1")
    )}
  ></span>
</button>
