<script lang="ts">
  import kernel, { type AppsService, type DesktopItem, WidgetStyle } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import ShortcutIcon from "../files/shortcut-icon.svelte";
  import WidgetBody from "./widget-body.svelte";
  import { widget_surface } from "./widget-style";

  type Widget = Extract<DesktopItem, { kind: "widget" }>;

  let {
    item,
    x,
    y,
    selected,
    dimmed,
    onselect,
    onopen,
    onmenu,
    ondragstart,
    ondragend,
    resizing,
    onresizestart,
  }: {
    item: Widget;
    x: number;
    y: number;
    selected: boolean;
    dimmed: boolean;
    onselect: (event: MouseEvent) => void;
    onopen: (event: MouseEvent) => void;
    onmenu: (event: MouseEvent) => void;
    ondragstart: (event: DragEvent) => void;
    ondragend: () => void;
    resizing: boolean;
    onresizestart: (event: PointerEvent) => void;
  } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const manifest = $derived(apps.get(item.app_id));
  const resizable = $derived(manifest?.widget_size !== undefined);
  const clear = $derived(item.style === WidgetStyle.CLEAR);
</script>

<!-- The title strip is the widget's handle: select, drag, open and menu go through it; the body belongs to the app. -->
<div
  data-desktop-widget={item.name}
  class={cn(
    "group/widget relative m-1 flex min-h-0 min-w-0 flex-col self-stretch justify-self-stretch overflow-hidden rounded-xl transition-opacity duration-150",
    widget_surface(item.style),
    selected && "ring-primary/40 ring-2",
    dimmed && "opacity-40"
  )}
  style:grid-column="{x + 1} / span {item.size.w}"
  style:grid-row="{y + 1} / span {item.size.h}"
>
  <button
    data-desktop-name={item.name}
    aria-pressed={selected}
    aria-keyshortcuts={resizable ? "Shift+ArrowRight Shift+ArrowLeft Shift+ArrowDown Shift+ArrowUp" : undefined}
    draggable="true"
    class={cn(
      "flex h-6 shrink-0 cursor-grab items-center gap-1.5 border-b border-hairline px-2 text-left text-2xs font-medium text-foreground/65 select-none",
      "hover:bg-foreground/6 focus-visible:bg-foreground/8 focus-visible:outline-none active:cursor-grabbing",
      clear && "rounded-t-xl border-transparent bg-background-light/70 hover:bg-background-light/85 opacity-0 backdrop-blur-lg transition-opacity duration-150 group-focus-within/widget:opacity-100 group-hover/widget:opacity-100",
      selected && "bg-primary/14 text-foreground/85 opacity-100 hover:bg-primary/18"
    )}
    onclick={onselect}
    ondblclick={onopen}
    oncontextmenu={(event) => {
      event.preventDefault();
      event.currentTarget.focus();
      onmenu(event);
    }}
    {ondragstart}
    {ondragend}
  >
    <ShortcutIcon app_id={item.app_id} badge={false} class="size-3.5" />
    <span class="min-w-0 flex-1 truncate">{item.label}</span>
  </button>

  <div data-widget-body class="min-h-0 flex-1 overflow-hidden">
    <WidgetBody {item} />
  </div>

  {#if resizable}
    <!-- Pointer only: the keyboard resizes with Shift+arrows on the title strip, so the grip stays out of the tab order. -->
    <button
      type="button"
      tabindex="-1"
      aria-label="Resize {item.label}"
      title="Drag to resize · Shift+arrows"
      class={cn(
        "absolute right-0 bottom-0 grid size-6 cursor-nwse-resize place-items-end p-1 text-foreground/40 opacity-0 transition-opacity duration-150 hover:text-foreground/80",
        "group-focus-within/widget:opacity-100 group-hover/widget:opacity-100",
        (selected || resizing) && "opacity-100",
        clear && "bare-text",
        resizing && "text-primary hover:text-primary"
      )}
      style:touch-action="none"
      onpointerdown={onresizestart}
    >
      <svg viewBox="0 0 10 10" class="size-2.5" aria-hidden="true"><path d="M10 1.5V8a2 2 0 0 1-2 2H1.5Z" fill="currentColor" /></svg>
    </button>
  {/if}
</div>
