<script lang="ts">
  import kernel, { type AppId, type AppManifest, type AppsService, type DialogsService, type SettingsService, type WindowsService, with_pin, without_pin, WindowFlag } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { view_transition } from "$lib/core/utils/view-transition";
  import { ArrowSquareOut as ArrowSquareOutIcon, Plus as PlusIcon, PushPinSlash as PushPinSlashIcon } from "phosphor-svelte";
  import { flip } from "svelte/animate";
  import AppBadge from "../apps/app-badge.svelte";
  import AppProgress from "../apps/app-progress.svelte";
  import { has_drag_app, is_quick_launch_drag, read_drag_app, set_drag_app } from "../apps/drag";

  let { vertical }: { vertical: boolean } = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const windows = $derived(kernel.service<WindowsService>("windows"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const pinned = $derived(settings.taskbar.pinned.flatMap((id) => apps.get(id) ?? []));
  const running = $derived(new Set(windows.sorted_list().map(([, instance]) => instance.app.id)));

  let zone: HTMLElement | null = $state(null);
  /** An app drag is somewhere over the page: an empty zone opens up so there is something to drop on. */
  let incoming = $state(false);
  /** Our own icon being dragged: hidden but kept in the DOM (a removed drag source loses its drop), so the others close the gap. */
  let dragging = $state<AppId | null>(null);
  /** Where a drop would land, among the shown icons. */
  let gap = $state<number | null>(null);
  /** Where the own drag was last seen; leaving the taskbar there unpins (ADR-042). */
  let inside_taskbar = true;

  const shown = $derived(pinned.filter((manifest) => manifest.id !== dragging));
  const slots = $derived.by(() => {
    const list: ({ key: string; manifest: AppManifest } | { key: "gap"; manifest: null })[] = shown.map((manifest) => ({ key: manifest.id, manifest }));
    if (gap !== null) list.splice(Math.min(gap, list.length), 0, { key: "gap", manifest: null });
    const ghost = pinned.find((manifest) => manifest.id === dragging);
    if (ghost) list.push({ key: ghost.id, manifest: ghost });
    return list;
  });
  const visible = $derived(pinned.length > 0 || incoming);

  function windows_of(id: AppId) {
    return windows.sorted_list((a, b) => b[1].order - a[1].order).filter(([, instance]) => instance.app.id === id);
  }

  function open(manifest: AppManifest, fresh: boolean) {
    const [latest] = windows_of(manifest.id);
    if (fresh || !latest) {
      apps.launch(manifest.id);
      return;
    }
    const [id, instance] = latest;
    if (instance.flags.has(WindowFlag.MINIMIZED)) view_transition(() => windows.toggle_minimize(id));
    else windows.focus(id);
  }

  async function menu(manifest: AppManifest, event: MouseEvent) {
    event.preventDefault();
    const choice = await dialogs.menu(
      [
        { id: "open", label: "Open", icon: ArrowSquareOutIcon },
        { id: "new", label: "New window", icon: PlusIcon },
        { separator: true },
        { id: "unpin", label: "Unpin from taskbar", icon: PushPinSlashIcon },
      ],
      { anchor: { x: event.clientX, y: event.clientY } }
    );
    if (choice === "open") open(manifest, false);
    else if (choice === "new") apps.launch(manifest.id);
    else if (choice === "unpin") settings.taskbar.pinned = without_pin(settings.taskbar.pinned, manifest.id);
  }

  /** Counts the icons whose middle is before the pointer; shifted icons keep the answer stable while they move. */
  function index_at(event: DragEvent): number {
    const icons = [...(zone?.querySelectorAll<HTMLElement>("[data-quick-launch]") ?? [])];
    return icons.filter((icon) => {
      const rect = icon.getBoundingClientRect();
      return vertical ? rect.top + rect.height / 2 < event.clientY : rect.left + rect.width / 2 < event.clientX;
    }).length;
  }

  function on_over(event: DragEvent) {
    if (!has_drag_app(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = is_quick_launch_drag(event) ? "move" : "copy";
    gap = index_at(event);
  }

  function on_leave(event: DragEvent) {
    if (!zone?.contains(event.relatedTarget as Node | null)) gap = null;
  }

  function on_drop(event: DragEvent) {
    const id = read_drag_app(event);
    const at = gap;
    gap = null;
    if (!id || at === null) return;
    event.preventDefault();
    const list = settings.taskbar.pinned;
    // An already pinned app dragged in from the start menu is still in the row, so the index counts it.
    const from = dragging === id ? -1 : shown.findIndex((manifest) => manifest.id === id);
    apps.install(id);
    settings.taskbar.pinned = with_pin(list, id, from !== -1 && from < at ? at - 1 : at);
    dragging = null;
  }

  function on_start(manifest: AppManifest, index: number, event: DragEvent) {
    set_drag_app(event, manifest.id, { quick_launch: true });
    inside_taskbar = true;
    // Hiding the source inside dragstart cancels the drag in Chromium, so it waits a frame.
    requestAnimationFrame(() => {
      dragging = manifest.id;
      gap = index;
    });
  }

  function on_end(manifest: AppManifest) {
    if (dragging === manifest.id && !inside_taskbar) settings.taskbar.pinned = without_pin(settings.taskbar.pinned, manifest.id);
    dragging = null;
    gap = null;
  }

  $effect(() => {
    const enter = (event: DragEvent) => {
      if (has_drag_app(event)) incoming = true;
      if (dragging) inside_taskbar = Boolean(zone?.closest("nav")?.contains(event.target as Node));
    };
    const over = (event: DragEvent) => {
      if (dragging) inside_taskbar = Boolean(zone?.closest("nav")?.contains(event.target as Node));
    };
    const done = () => {
      incoming = false;
      gap = null;
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragover", over);
    document.addEventListener("dragend", done);
    document.addEventListener("drop", done);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragover", over);
      document.removeEventListener("dragend", done);
      document.removeEventListener("drop", done);
    };
  });
</script>

{#if visible}
  <div
    bind:this={zone}
    role="toolbar"
    aria-label="Quick launch"
    aria-orientation={vertical ? "vertical" : "horizontal"}
    tabindex="-1"
    class={cn("relative flex shrink-0 gap-1", vertical ? "flex-col" : "flex-row")}
    ondragover={on_over}
    ondragleave={on_leave}
    ondrop={on_drop}
  >
    {#each slots as slot, index (slot.key)}
      <div animate:flip={{ duration: 160 }} class={cn(slot.manifest?.id === dragging && "pointer-events-none absolute opacity-0")}>
        {#if slot.manifest}
          {@const manifest = slot.manifest}
          <button
            data-quick-launch={manifest.id === dragging ? undefined : ""}
            draggable="true"
            aria-label={manifest.name}
            title="{manifest.name} · Shift-click for a new window"
            class="relative grid size-(--taskbar-item) place-items-center rounded-xl transition-colors duration-150 hover:bg-foreground/10"
            onclick={(event) => open(manifest, event.shiftKey)}
            onauxclick={(event) => event.button === 1 && apps.launch(manifest.id)}
            oncontextmenu={(event) => menu(manifest, event)}
            ondragstart={(event) => on_start(manifest, Math.min(index, shown.length), event)}
            ondragend={() => on_end(manifest)}
          >
            <manifest.icon class="size-[calc(var(--taskbar-item)*0.55)]" weight="duotone" />
            <AppProgress app_id={manifest.id} />
            <AppBadge app_id={manifest.id} class="top-0.5 right-0.5 ring-background-light" />
            {#if running.has(manifest.id)}
              <span class={cn("absolute size-1 rounded-full bg-foreground/45", vertical ? "top-1/2 -left-0.5 -translate-y-1/2" : "-bottom-0.5 left-1/2 -translate-x-1/2")}></span>
            {/if}
          </button>
        {:else}
          <div aria-hidden="true" class="size-(--taskbar-item) rounded-xl bg-primary/12 ring-1 ring-primary/40 ring-inset"></div>
        {/if}
      </div>
    {/each}
    {#if incoming && slots.length === 0}
      <div aria-hidden="true" class="grid size-(--taskbar-item) place-items-center rounded-xl border border-dashed border-primary/50 text-primary">
        <PlusIcon class="size-4" weight="bold" />
      </div>
    {/if}
  </div>
  <div role="separator" class={cn("shrink-0 bg-foreground/12", vertical ? "mx-auto my-0.5 h-px w-[calc(var(--taskbar-item)*0.6)]" : "mx-0.5 h-[calc(var(--taskbar-item)*0.6)] w-px")}></div>
{/if}
