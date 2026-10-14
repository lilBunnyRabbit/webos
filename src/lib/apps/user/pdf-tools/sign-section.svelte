<script lang="ts">
  import kernel, { NotificationType, type AppsService, type NotificationsService } from "$lib/core/api";
  import { Button, IconButton, Segmented, Select, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, format_date } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    Check as CheckIcon,
    Devices as DevicesIcon,
    Eraser as EraserIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    PenNib as PenNibIcon,
    Trash as TrashIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack, type Snippet } from "svelte";
  import { z } from "zod";
  import DropZone from "./drop-zone.svelte";
  import { clamp_placement, type Placement } from "./geometry";
  import { parent_path, signed_name, signature_file_name } from "./naming";
  import { DATE_SCALE, Ink, ink_css, sign_pdf } from "./pdf";
  import { PDF_ACCEPT, device_source, error_message, save_signature, write_at } from "./pdf-files";
  import PdfPlaceholder from "./pdf-placeholder.svelte";
  import { PdfSlot } from "./pdf-slot.svelte";
  import { page_info, render_width, type PageInfo } from "./render";
  import SignaturePad from "./signature-pad.svelte";
  import SignaturePreview from "./signature-preview.svelte";
  import { watch_signatures } from "./signatures.svelte";
  import { build_signature, type Signature, type StrokePoint } from "./stroke";

  let {
    picker,
    initial_paths,
    signature_name = $bindable(null),
    active,
  }: { picker: Snippet; initial_paths: string[]; signature_name?: string | null; active: boolean } = $props();

  const { app_id, window: win, storage } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  interface PlacedStamp {
    id: string;
    page: number;
    placement: Placement;
    signature: Signature;
  }

  const DRAWN = "__drawn__";
  const INKS = [
    { value: Ink.BLACK, label: "Black" },
    { value: Ink.BLUE, label: "Dark blue" },
  ];
  const options = storage.persisted("sign", { ink: Ink.BLACK as Ink, date: false }, z.object({ ink: z.enum([Ink.BLACK, Ink.BLUE]), date: z.boolean() }));

  const slot = new PdfSlot();
  const loaded = $derived(slot.loaded);
  const list = watch_signatures();

  let page = $state(0);
  let info = $state<PageInfo | null>(null);
  let page_url = $state<string | null>(null);
  let rendering = $state(false);
  let area_width = $state(0);
  let stamps = $state<PlacedStamp[]>([]);
  let selected = $state<string | null>(null);
  let drawn = $state.raw<Signature | null>(null);
  let drawing = $state(false);
  let pad_strokes = $state.raw<StrokePoint[][]>([]);
  let saving = $state(false);
  let overlay = $state<HTMLElement | null>(null);

  const choice = $derived(signature_name ?? (drawn ? DRAWN : (list.items[0]?.name ?? null)));
  const signature = $derived(choice === DRAWN ? drawn : (list.items.find((item) => item.name === choice)?.signature ?? null));
  const choices = $derived([...(drawn ? [{ value: DRAWN, label: "Drawn here" }] : []), ...list.items.map((item) => ({ value: item.name, label: item.name.replace(/\.svg$/i, "") }))]);
  const page_stamps = $derived(stamps.filter((stamp) => stamp.page === page));
  const display_width = $derived(Math.max(200, Math.min(area_width - 32, 960)));
  const page_aspect = $derived(info ? info.width / info.height : 1 / 1.414);
  const date_text = $derived(format_date(new Date()));

  $effect(() => () => slot.close());

  const first = untrack(() => initial_paths[0]);
  if (first) void slot.open(first);

  $effect(() => {
    void loaded;
    untrack(() => {
      page = 0;
      stamps = [];
      selected = null;
    });
  });

  $effect(() => {
    const current = loaded;
    const index = page;
    const width = display_width;
    if (!current || !active || !win.is_visible || index >= current.count) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      rendering = true;
      try {
        const next_info = await page_info(current.document, index);
        const canvas = await render_width(current.document, index, width * Math.min(2, window.devicePixelRatio || 1));
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (cancelled || !blob) return;
        info = next_info;
        if (page_url) URL.revokeObjectURL(page_url);
        page_url = URL.createObjectURL(blob);
      } catch (error) {
        if (!cancelled) console.warn("[pdf-tools] Couldn't render the page", error);
      } finally {
        if (!cancelled) rendering = false;
      }
    }, untrack(() => page_url) ? 120 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  $effect(() => () => {
    if (page_url) URL.revokeObjectURL(page_url);
  });

  async function pick() {
    const path = await win.pick_file({ accept: PDF_ACCEPT, title: "Sign a PDF" });
    if (path) await slot.open(path);
  }

  async function pick_device() {
    const [file] = await pick_device_files({ accept: PDF_ACCEPT });
    if (file) await slot.open(device_source(file));
  }

  function default_width(sig: Signature): number {
    return Math.min(0.32, (0.09 * (sig.width / sig.height)) / page_aspect);
  }

  function place_at(x: number, y: number) {
    if (!signature) return;
    const width = default_width(signature);
    const height = (width / (signature.width / signature.height)) * page_aspect;
    const placement = clamp_placement({ x: x - width / 2, y: y - height / 2, width }, signature.width / signature.height, page_aspect);
    const stamp: PlacedStamp = { id: crypto.randomUUID(), page, placement, signature };
    stamps.push(stamp);
    selected = stamp.id;
  }

  function remove_selected() {
    stamps = stamps.filter((stamp) => stamp.id !== selected);
    selected = null;
  }

  interface Drag {
    id: string;
    mode: "move" | "resize";
    pointer: number;
    start_x: number;
    start_y: number;
    origin: Placement;
  }
  let drag: Drag | null = null;

  function fraction(event: PointerEvent): { x: number; y: number } {
    const rect = overlay!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }

  function on_overlay_down(event: PointerEvent) {
    if (event.button !== 0 || !overlay || !(event.target instanceof Element)) return;
    const stamp_element = event.target.closest<HTMLElement>("[data-stamp-id]");
    if (!stamp_element) {
      selected = null;
      const { x, y } = fraction(event);
      place_at(x, y);
      return;
    }
    if (event.target.closest("button")) return;
    const stamp = stamps.find((entry) => entry.id === stamp_element.dataset.stampId);
    if (!stamp) return;
    event.preventDefault();
    selected = stamp.id;
    stamp_element.focus();
    const { x, y } = fraction(event);
    drag = { id: stamp.id, mode: event.target.closest("[data-resize]") ? "resize" : "move", pointer: event.pointerId, start_x: x, start_y: y, origin: { ...stamp.placement } };
    overlay.setPointerCapture(event.pointerId);
  }

  function on_overlay_move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const stamp = stamps.find((entry) => entry.id === drag!.id);
    if (!stamp) return;
    const { x, y } = fraction(event);
    const aspect = stamp.signature.width / stamp.signature.height;
    const { origin } = drag;
    const next = drag.mode === "move" ? { ...origin, x: origin.x + x - drag.start_x, y: origin.y + y - drag.start_y } : { ...origin, width: Math.max(0.03, origin.width + x - drag.start_x) };
    stamp.placement = clamp_placement(next, aspect, page_aspect);
  }

  function on_overlay_up(event: PointerEvent) {
    if (drag && event.pointerId === drag.pointer) drag = null;
  }

  function on_stamp_key(event: KeyboardEvent, stamp: PlacedStamp) {
    const nudge = event.shiftKey ? 0.02 : 0.005;
    const delta = { ArrowLeft: [-nudge, 0], ArrowRight: [nudge, 0], ArrowUp: [0, -nudge], ArrowDown: [0, nudge] }[event.key];
    if (delta) {
      event.preventDefault();
      const { placement } = stamp;
      stamp.placement = clamp_placement({ ...placement, x: placement.x + delta[0], y: placement.y + delta[1] }, stamp.signature.width / stamp.signature.height, page_aspect);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove_selected();
    } else if (event.key === "+" || event.key === "-") {
      event.preventDefault();
      const width = stamp.placement.width * (event.key === "+" ? 1.1 : 1 / 1.1);
      stamp.placement = clamp_placement({ ...stamp.placement, width }, stamp.signature.width / stamp.signature.height, page_aspect);
    }
  }

  function use_drawn() {
    const result = build_signature(pad_strokes);
    if (!result) return;
    drawn = result;
    signature_name = DRAWN;
    drawing = false;
  }

  async function save_drawn() {
    const result = build_signature(pad_strokes);
    if (!result) return;
    const name = await win.prompt("Name this signature", { initial: "Signature", confirm_label: "Save", validate: (value) => (value.trim() ? null : "Give it a name") });
    if (name === null) return;
    try {
      const path = await save_signature(signature_file_name(name), result);
      signature_name = path.slice(path.lastIndexOf("/") + 1);
      drawn = null;
      drawing = false;
      pad_strokes = [];
    } catch (error) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save the signature", message: error_message(error) });
    }
  }

  async function save() {
    if (!loaded || !stamps.length || saving) return;
    const path = await win.pick_save({
      name: signed_name(loaded.source.name),
      accept: PDF_ACCEPT,
      start_path: loaded.source.path ? parent_path(loaded.source.path) : "/home",
      title: "Save signed PDF as",
    });
    if (!path) return;
    saving = true;
    try {
      const bytes = await sign_pdf(
        loaded.bytes,
        stamps.map((stamp) => ({ page: stamp.page, placement: stamp.placement, signature: stamp.signature, ink: options.value.ink, date: options.value.date ? date_text : null })),
        loaded.source.name
      );
      await write_at(path, bytes);
      notifications.notify(app_id, { title: "Signed copy saved", message: path, actions: [{ label: "Open", on_click: () => apps.open(path) }] });
    } catch (error) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save the signed PDF", message: error_message(error) });
    } finally {
      saving = false;
    }
  }

  function date_size(stamp: PlacedStamp): number {
    if (!info) return 10;
    const height_pt = stamp.placement.width * info.width * (stamp.signature.height / stamp.signature.width);
    const size_pt = Math.max(6, Math.min(14, height_pt * DATE_SCALE));
    return (size_pt / info.width) * display_width;
  }
</script>

<DropZone label="Drop a PDF to sign it" class="grid h-full grid-rows-[auto_1fr_auto]" ondrop={(sources) => void slot.open(sources[0])}>
  <Toolbar>
    {@render picker()}
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Open from device…" size="sm" onclick={pick_device}><DevicesIcon weight="bold" /></IconButton>
    <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{loaded?.source.name ?? ""}</span>
    {#if loaded}
      <IconButton label="Previous page" size="sm" disabled={page === 0} onclick={() => (page = Math.max(0, page - 1))}><CaretLeftIcon weight="bold" /></IconButton>
      <span class="font-mono text-2xs text-foreground/80 tabular-nums">{page + 1} / {loaded.count}</span>
      <IconButton label="Next page" size="sm" disabled={page >= loaded.count - 1} onclick={() => (page = Math.min(loaded.count - 1, page + 1))}><CaretRightIcon weight="bold" /></IconButton>
      <Button variant="primary" size="sm" disabled={!stamps.length || saving} onclick={save}><FloppyDiskIcon weight="bold" /> Save copy…</Button>
    {/if}
  </Toolbar>

  {#if !loaded}
    <div class="min-h-0 overflow-auto">
      <PdfPlaceholder
        {slot}
        icon={PenNibIcon}
        title="No PDF open"
        description="Place a signature you drew on any page, then save a signed copy."
        onopen={pick}
        ondevice={pick_device}
      />
    </div>
  {:else}
    <div class="flex min-h-0 flex-col @3xl:flex-row">
      <div class="min-h-0 flex-1 overflow-auto bg-background-darker" bind:clientWidth={area_width}>
        <div class="mx-auto my-4 w-fit">
          <div class="relative shadow-raised" style:width="{display_width}px" style:aspect-ratio={page_aspect}>
            {#if page_url}
              <img src={page_url} alt="Page {page + 1}" draggable="false" class="block size-full select-none" />
            {:else}
              <div class="grid size-full place-items-center bg-foreground/5"><Spinner label="Rendering the page" /></div>
            {/if}
            <div
              bind:this={overlay}
              role="application"
              aria-label="Page {page + 1}. Click to place the signature; arrows move the selected one, + and - resize it, Delete removes it."
              class={cn("absolute inset-0 touch-none", signature ? "cursor-copy" : "cursor-default")}
              onpointerdown={on_overlay_down}
              onpointermove={on_overlay_move}
              onpointerup={on_overlay_up}
              onlostpointercapture={on_overlay_up}
            >
              {#each page_stamps as stamp (stamp.id)}
                {@const is_selected = stamp.id === selected}
                <div
                  data-stamp-id={stamp.id}
                  role="button"
                  tabindex="0"
                  aria-label="Signature on page {page + 1}"
                  aria-pressed={is_selected}
                  class={cn("absolute cursor-move rounded-xs outline-none", is_selected ? "ring-2 ring-primary/70" : "hover:ring-1 hover:ring-primary/50", "focus-visible:ring-2 focus-visible:ring-cottontail")}
                  style:left="{stamp.placement.x * 100}%"
                  style:top="{stamp.placement.y * 100}%"
                  style:width="{stamp.placement.width * 100}%"
                  style:aspect-ratio="{stamp.signature.width} / {stamp.signature.height}"
                  onkeydown={(event) => on_stamp_key(event, stamp)}
                  onfocus={() => (selected = stamp.id)}
                >
                  <SignaturePreview signature={stamp.signature} color={ink_css(options.value.ink)} class="size-full" />
                  {#if options.value.date}
                    <span class="absolute top-full left-0 font-[Helvetica,Arial,sans-serif] leading-none whitespace-nowrap" style:color={ink_css(options.value.ink)} style:font-size="{date_size(stamp)}px" style:margin-top="{date_size(stamp) * 0.2}px">{date_text}</span>
                  {/if}
                  {#if is_selected}
                    <button
                      class="absolute -top-3 -right-3 grid size-6 place-items-center rounded-full bg-background-light text-foreground shadow-raised hover:bg-background-lighter pointer-coarse:size-8"
                      aria-label="Remove this signature"
                      onclick={remove_selected}><XIcon weight="bold" class="size-3" /></button
                    >
                    <span data-resize class="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-full bg-primary ring-2 ring-background-light pointer-coarse:size-6" aria-hidden="true"></span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <aside class="flex shrink-0 flex-col gap-3 border-t border-foreground/8 bg-background-light p-3 @3xl:w-72 @3xl:border-t-0 @3xl:border-l">
        {#if drawing}
          <div class="flex flex-col gap-2">
            <p class="text-ui font-medium">Draw your signature</p>
            <SignaturePad bind:strokes={pad_strokes} class="rounded-lg bg-background-darker" />
            <div class="flex flex-wrap items-center gap-1.5">
              <IconButton label="Undo stroke" size="sm" disabled={!pad_strokes.length} onclick={() => (pad_strokes = pad_strokes.slice(0, -1))}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
              <IconButton label="Clear" size="sm" disabled={!pad_strokes.length} onclick={() => (pad_strokes = [])}><EraserIcon weight="bold" /></IconButton>
              <span class="flex-1"></span>
              <Button size="sm" onclick={() => (drawing = false)}>Cancel</Button>
              <Button size="sm" disabled={!pad_strokes.length} onclick={save_drawn}>Save…</Button>
              <Button variant="primary" size="sm" disabled={!pad_strokes.length} onclick={use_drawn}><CheckIcon weight="bold" /> Use</Button>
            </div>
          </div>
        {:else}
          <div class="flex flex-wrap items-center gap-2 @3xl:flex-col @3xl:items-stretch">
            <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Signature</span>
            <div class="flex min-w-0 flex-1 items-center gap-1.5">
              {#if choices.length}
                <Select size="sm" aria-label="Signature" class="min-w-0 flex-1" options={choices} value={choice ?? ""} onchange={(event) => (signature_name = event.currentTarget.value)} />
              {:else}
                <span class="flex-1 text-ui text-foreground/65">None saved yet</span>
              {/if}
              <Button size="sm" onclick={() => (drawing = true)}><PenNibIcon weight="bold" /> Draw…</Button>
            </div>
            {#if signature}
              <div class="hidden h-16 place-items-center rounded-md bg-background-darker p-2 @3xl:grid">
                <SignaturePreview {signature} class="max-h-full max-w-full" />
              </div>
            {/if}
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 @3xl:flex-col @3xl:items-stretch">
            <div class="flex items-center gap-2">
              <span class="text-ui">Ink</span>
              {#each INKS as ink (ink.value)}
                <span class="size-3 rounded-full ring-1 ring-foreground/30" style:background={ink_css(ink.value)} aria-hidden="true"></span>
              {/each}
              <Segmented size="sm" label="Ink" options={INKS} bind:value={options.value.ink} />
            </div>
            <label class="flex items-center gap-2 text-ui">
              <Switch bind:checked={options.value.date} /> Add today's date
            </label>
            {#if selected}
              <Button size="sm" onclick={remove_selected}><TrashIcon weight="bold" /> Remove selected</Button>
            {/if}
          </div>
          <p class="text-2xs text-foreground/65">
            Click the page to place the signature, drag to move it, drag the dot to resize. This stamps a picture of your signature; it isn't a
            cryptographic digital signature.
          </p>
        {/if}
      </aside>
    </div>
  {/if}

  <StatusBar>
    {#if loaded}
      <span>{stamps.length} {stamps.length === 1 ? "signature" : "signatures"} placed</span>
      {#if rendering}<span>rendering…</span>{/if}
      <span class="ml-auto hidden @md:block">saves as a new file</span>
    {:else}
      <span>No PDF</span>
    {/if}
  </StatusBar>
</DropZone>
