<script lang="ts">
  import kernel, { type AppsService, type DesktopItem } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { Spinner } from "../ui";
  import ShortcutIcon from "../files/shortcut-icon.svelte";

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
  } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const manifest = $derived(apps.get(item.app_id));
  const widget_props = $derived.by(() => {
    if (!manifest?.props) return item.props ?? {};
    const result = manifest.props.safeParse(item.props ?? {});
    return result.success ? result.data : null;
  });
  const component = $derived(manifest?.widget && widget_props ? manifest.widget().then((module) => module.default) : null);
</script>

<!-- The title strip is the widget's handle: select, drag, open and menu go through it; the body belongs to the app. -->
<div
  class={cn(
    "m-1 flex min-h-0 min-w-0 flex-col self-stretch justify-self-stretch overflow-hidden rounded-xl bg-background-light shadow-raised ring-1 ring-foreground/10 transition-opacity duration-150",
    selected && "ring-primary/40 ring-2",
    dimmed && "opacity-40"
  )}
  style:grid-column="{x + 1} / span {item.size.w}"
  style:grid-row="{y + 1} / span {item.size.h}"
>
  <button
    data-desktop-name={item.name}
    aria-pressed={selected}
    draggable="true"
    class={cn(
      "flex h-6 shrink-0 cursor-grab items-center gap-1.5 border-b border-foreground/8 px-2 text-left text-2xs font-medium text-foreground/65 select-none",
      "hover:bg-foreground/6 focus-visible:bg-foreground/8 focus-visible:outline-none active:cursor-grabbing",
      selected && "bg-primary/14 text-foreground/85 hover:bg-primary/18"
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
    {#if component}
      {#await component}
        <div class="grid h-full place-items-center"><Spinner /></div>
      {:then Widget}
        <Widget props={widget_props ?? {}} size={item.size} name={item.name} />
      {:catch}
        <p class="p-3 text-ui text-error">Couldn't load this widget.</p>
      {/await}
    {:else}
      <p class="p-3 text-ui text-foreground/65">{manifest ? (widget_props ? `${manifest.name} has no widget.` : "This widget's file is broken.") : "The app for this widget isn't installed."}</p>
    {/if}
  </div>
</div>
