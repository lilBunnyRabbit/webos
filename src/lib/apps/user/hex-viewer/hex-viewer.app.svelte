<script lang="ts">
  import kernel, { type ClipboardService, type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { Button, EmptyState, IconButton, Input, Segmented, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { clamp, cn, error_message, format_bytes } from "$lib/core/utils";
  import {
    Binary as BinaryIcon,
    Copy as CopyIcon,
    Devices as DevicesIcon,
    FolderOpen as FolderOpenIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    TextT as TextTIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { tick, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { BYTES_PER_ROW, Endian, ascii_char, format_offset, hex_byte, hex_string, inspect, is_printable, offset_digits, parse_offset, row_count } from "./hex";
  import { clamp_top, reveal_row, row_window, rows_per_page, scroll_height, scroll_scale } from "./rows";
  import { report_error } from "$kit/utils/report-error";

  const ROW = 20;
  const OVERSCAN = 8;
  const CHUNK_PAD = 256 * BYTES_PER_ROW;
  const COPY_LIMIT = 4 * 1024 * 1024;
  const COLUMNS = Array.from({ length: BYTES_PER_ROW }, (_, index) => index);

  const { path, offset }: { path?: string; offset?: number } = $props();
  const { window: win, app_id } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));

  let file = $state.raw<File | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let chunk = $state.raw<{ file: File; start: number; bytes: Uint8Array } | null>(null);
  let inspected = $state.raw<Uint8Array>(new Uint8Array());

  let top = $state(0);
  let viewport_height = $state(0);
  let anchor = $state(0);
  let cursor = $state(0);
  let endian = $state<Endian>(Endian.LITTLE);
  let show_inspector = $state(true);
  let goto_text = $state("");
  let goto_invalid = $state(false);
  let copied = $state<string | null>(null);
  let dragging_file = $state(false);

  let root: HTMLDivElement | null = $state(null);
  let scroller: HTMLDivElement | null = $state(null);
  let goto_input: HTMLInputElement | null = $state(null);

  const size = $derived(file?.size ?? 0);
  const total = $derived(row_count(size));
  const digits = $derived(offset_digits(size));
  const rows_height = $derived(Math.max(0, viewport_height - ROW));
  const extent = $derived(scroll_height(total, ROW));
  const scale = $derived(scroll_scale(total, ROW, rows_height));
  const view = $derived(row_window(top, rows_height, total, ROW, OVERSCAN));
  const first = $derived(view.first);
  const end = $derived(view.end);
  const rows = $derived(Array.from({ length: Math.max(0, end - first) }, (_, index) => first + index));
  const sel_start = $derived(Math.min(anchor, cursor));
  const sel_end = $derived(Math.max(anchor, cursor));
  const sel_length = $derived(size ? sel_end - sel_start + 1 : 0);
  const inspection = $derived(inspect(inspected, endian));
  const endian_options = [
    { value: Endian.LITTLE, label: "LE" },
    { value: Endian.BIG, label: "BE" },
  ];

  let load_token = 0;
  let pending: { file: File; from: number; to: number } | null = null;
  let copied_timer: ReturnType<typeof setTimeout> | undefined;

  async function load(next: File, at = 0, token = ++load_token) {
    file = next;
    chunk = null;
    pending = null;
    error = null;
    anchor = cursor = clamp(at, 0, Math.max(0, next.size - 1));
    top = 0;
    await tick();
    if (token !== load_token) return;
    if (scroller) scroller.scrollTop = 0;
    if (at > 0) set_top((cursor / BYTES_PER_ROW) * ROW - ROW * 2);
    scroller?.focus({ preventScroll: true });
  }

  async function open_path(target: string, at = 0) {
    const token = ++load_token;
    loading = true;
    try {
      const found = await files.get_file(target);
      if (token !== load_token) return;
      if (found) await load(found, at, token);
      else {
        file = null;
        error = `File not found: ${target}`;
      }
    } catch (reason) {
      if (token !== load_token) return;
      file = null;
      error = error_message(reason);
    } finally {
      if (token === load_token) loading = false;
    }
  }

  async function pick() {
    const chosen = await win.pick_file({ title: "Open in Hex Viewer" });
    if (chosen) await open_path(chosen);
  }

  async function pick_device() {
    const [picked] = await pick_device_files();
    if (picked) void load(picked);
  }

  const initial = untrack(() => ({ path, offset }));
  if (initial.path) void open_path(initial.path, initial.offset ?? 0);

  $effect(() => win.set_title(file?.name ?? null));

  $effect(() => {
    const target = file;
    if (!target) return;
    const start = first * BYTES_PER_ROW;
    const stop = Math.min(target.size, end * BYTES_PER_ROW);
    if (chunk?.file === target && chunk.start <= start && chunk.start + chunk.bytes.length >= stop) return;
    if (pending?.file === target && pending.from <= start && pending.to >= stop) return;
    const range = { file: target, from: Math.max(0, start - CHUNK_PAD), to: Math.min(target.size, stop + CHUNK_PAD) };
    pending = range;
    target
      .slice(range.from, range.to)
      .arrayBuffer()
      .then((buffer) => {
        if (file === target) chunk = { file: target, start: range.from, bytes: new Uint8Array(buffer) };
      })
      .catch((reason) => console.warn("[HexViewer] read failed", reason))
      .finally(() => {
        if (pending === range) pending = null;
      });
  });

  $effect(() => {
    const target = file;
    const at = cursor;
    if (!target) return;
    let live = true;
    target
      .slice(at, at + 8)
      .arrayBuffer()
      .then((buffer) => {
        if (live) inspected = new Uint8Array(buffer);
      })
      .catch((reason) => console.warn("[HexViewer] read failed", reason));
    return () => (live = false);
  });

  $effect(() => {
    const ratio = scale;
    untrack(() => {
      if (scroller) scroller.scrollTop = top / ratio;
    });
  });

  $effect(() => () => clearTimeout(copied_timer));

  function byte_at(index: number): number | undefined {
    if (!chunk || index < chunk.start || index >= chunk.start + chunk.bytes.length) return undefined;
    return chunk.bytes[index - chunk.start];
  }

  function set_top(value: number) {
    top = clamp_top(value, total, ROW, rows_height);
    if (scroller) scroller.scrollTop = top / scale;
  }

  // Our own scrollTop writes come back as scroll events; only a position that disagrees with `top` is the user's.
  function on_scroll() {
    if (!scroller) return;
    if (Math.abs(scroller.scrollTop - top / scale) > 1) top = clamp_top(scroller.scrollTop * scale, total, ROW, rows_height);
  }

  // Past the scroll cap one scrollbar pixel is many rows, so the wheel drives `top` in content pixels instead.
  const fine_wheel: Attachment<HTMLDivElement> = (element) => {
    const on_wheel = (event: WheelEvent) => {
      if (scale <= 1 || event.ctrlKey) return;
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? ROW : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rows_height : 1;
      set_top(top + event.deltaY * unit);
      element.scrollLeft += event.deltaX * unit;
    };
    element.addEventListener("wheel", on_wheel, { passive: false });
    return () => element.removeEventListener("wheel", on_wheel);
  };

  function move_to(index: number, extend: boolean) {
    if (!size) return;
    cursor = clamp(index, 0, size - 1);
    if (!extend) anchor = cursor;
    set_top(reveal_row(top, Math.floor(cursor / BYTES_PER_ROW), ROW, rows_height));
  }

  function go_to() {
    const target = parse_offset(goto_text);
    goto_invalid = target === null || target >= size;
    if (target === null || goto_invalid) return;
    cursor = anchor = target;
    set_top(Math.floor(target / BYTES_PER_ROW) * ROW - rows_height / 3);
    scroller?.focus({ preventScroll: true });
  }

  async function copy(kind: "hex" | "text") {
    if (!file || !sel_length) return;
    try {
      if (sel_length > COPY_LIMIT) throw new Error(`Select at most ${format_bytes(COPY_LIMIT)} to copy.`);
      const bytes = new Uint8Array(await file.slice(sel_start, sel_end + 1).arrayBuffer());
      await clipboard.copy_text(kind === "hex" ? hex_string(bytes) : new TextDecoder().decode(bytes));
      copied = `Copied ${sel_length} B as ${kind}`;
      clearTimeout(copied_timer);
      copied_timer = setTimeout(() => (copied = null), 1500);
    } catch (reason) {
      report_error(app_id, "Couldn't copy the selection", reason);
    }
  }

  function on_keydown(event: KeyboardEvent) {
    if (!file || event.target instanceof HTMLInputElement) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === "c") {
      event.preventDefault();
      return void copy(event.shiftKey ? "text" : "hex");
    }
    if (mod && key === "a") {
      event.preventDefault();
      anchor = 0;
      cursor = Math.max(0, size - 1);
      return;
    }
    if (mod && key === "g") {
      event.preventDefault();
      return goto_input?.select();
    }
    const page = rows_per_page(rows_height, ROW) * BYTES_PER_ROW;
    const row_start = cursor - (cursor % BYTES_PER_ROW);
    const targets: Record<string, number> = {
      ArrowLeft: cursor - 1,
      ArrowRight: cursor + 1,
      ArrowUp: cursor - BYTES_PER_ROW,
      ArrowDown: cursor + BYTES_PER_ROW,
      PageUp: cursor - page,
      PageDown: cursor + page,
      Home: mod ? 0 : row_start,
      End: mod ? size - 1 : row_start + BYTES_PER_ROW - 1,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    move_to(target, event.shiftKey);
  }

  function byte_from(event: PointerEvent): number | null {
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-byte]");
    return element ? Number(element.dataset.byte) : null;
  }

  let selecting = false;

  function on_pointerdown(event: PointerEvent) {
    if (event.button !== 0) return;
    const index = byte_from(event);
    if (index === null) return;
    event.preventDefault();
    scroller?.focus({ preventScroll: true });
    cursor = index;
    if (!event.shiftKey) anchor = index;
    selecting = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function on_pointermove(event: PointerEvent) {
    if (!selecting) return;
    const index = byte_from(event);
    if (index !== null) cursor = index;
  }

  function on_drop(event: DragEvent) {
    event.preventDefault();
    dragging_file = false;
    const dropped = event.dataTransfer?.files[0];
    if (dropped) void load(dropped);
  }

  function on_dragover(event: DragEvent) {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    dragging_file = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!root?.contains(event.relatedTarget as Node | null)) dragging_file = false;
  }

  function cell_class(index: number, byte: number | undefined, ascii: boolean): string {
    const selected = sel_length > 1 && index >= sel_start && index <= sel_end;
    const dim = byte === undefined || (ascii ? !is_printable(byte) : byte === 0);
    return cn(
      "inline-block text-center",
      ascii ? "w-[1ch]" : "w-[2.5ch]",
      dim && "text-foreground/35",
      selected && "bg-primary/20 text-foreground",
      index === cursor && (ascii ? "outline-1 -outline-offset-1 outline-cottontail/60" : "outline-1 -outline-offset-1 outline-cottontail")
    );
  }
</script>

<div
  bind:this={root}
  role="presentation"
  tabindex="-1"
  class={cn("relative h-full outline-none", dragging_file && "ring-2 ring-primary ring-inset")}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  {#if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the file" description={error}>
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button><Button onclick={pick_device}><DevicesIcon weight="bold" /> From device…</Button>{/snippet}
    </EmptyState>
  {:else if !file}
    {#if !loading}
      <EmptyState icon={BinaryIcon} title="No file open" description="Open any file to see its bytes. Huge files are fine: only what's on screen is read. You can also drop one here.">
        {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button><Button onclick={pick_device}><DevicesIcon weight="bold" /> From device…</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class={cn("grid h-full", show_inspector ? "grid-rows-[auto_1fr_auto_auto]" : "grid-rows-[auto_1fr_auto]")}>
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
        <IconButton label="Open from device…" size="sm" onclick={pick_device}><DevicesIcon weight="bold" /></IconButton>
        <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{file.name}</span>
        <form
          class="contents"
          onsubmit={(event) => {
            event.preventDefault();
            go_to();
          }}
        >
          <Input
            size="sm"
            class="w-28 font-mono @lg:w-40"
            placeholder="Go to 0x1f or 31"
            aria-label="Go to offset"
            aria-invalid={goto_invalid || undefined}
            bind:element={goto_input}
            bind:value={goto_text}
            oninput={() => (goto_invalid = false)}
          />
        </form>
        <Separator vertical />
        <IconButton label="Copy as hex (Mod+C)" size="sm" onclick={() => copy("hex")}><CopyIcon weight="bold" /></IconButton>
        <IconButton label="Copy as text (Mod+Shift+C)" size="sm" onclick={() => copy("text")}><TextTIcon weight="bold" /></IconButton>
        <IconButton label="Byte inspector" size="sm" pressed={show_inspector} onclick={() => (show_inspector = !show_inspector)}><MagnifyingGlassIcon weight="bold" /></IconButton>
      </Toolbar>

      {#if size === 0}
        <EmptyState icon={BinaryIcon} title="Empty file" description="This file has no bytes to show." />
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div bind:this={scroller} bind:clientHeight={viewport_height}
          role="application"
          aria-label="Hex view. Arrow keys move, Shift extends the selection, Mod+C copies hex, Mod+Shift+C text, Mod+G goes to an offset."
          tabindex="0"
          class="min-h-0 overflow-auto bg-background font-mono text-xs outline-none select-none focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset"
          onkeydown={on_keydown}
          onscroll={on_scroll} {@attach fine_wheel}>
          <div class="sticky top-0 w-max min-w-full overflow-hidden" style:height="{viewport_height}px">
            <div class="flex items-center gap-4 border-b border-foreground/8 bg-background-light px-3 whitespace-nowrap text-foreground/65 *:shrink-0" style:height="{ROW}px">
              <span style:width="{digits}ch">Offset</span>
              <span>
                {#each COLUMNS as column (column)}<span class={cn("inline-block w-[2.5ch] text-center", column === 8 && "ml-[1ch]")}>{hex_byte(column)}</span>{/each}
              </span>
              <span>ASCII</span>
            </div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="relative overflow-hidden"
              style:height="{rows_height}px"
              onpointerdown={on_pointerdown}
              onpointermove={on_pointermove}
              onlostpointercapture={() => (selecting = false)}
            >
              <div class="absolute inset-x-0 top-0" style:transform="translateY({view.offset}px)">
                {#each rows as row (row)}
                  {@const start = row * BYTES_PER_ROW}
                  {@const count = Math.min(BYTES_PER_ROW, size - start)}
                  <div class={cn("flex items-center gap-4 px-3 whitespace-nowrap *:shrink-0", Math.floor(cursor / BYTES_PER_ROW) === row && "bg-foreground/6")} style:height="{ROW}px">
                    <span class="text-foreground/65 tabular-nums" style:width="{digits}ch">{format_offset(start, digits)}</span>
                    <span>
                      {#each COLUMNS.slice(0, count) as column (column)}
                        {@const index = start + column}
                        {@const byte = byte_at(index)}
                        <span data-byte={index} class={cn(cell_class(index, byte, false), column === 8 && "ml-[1ch]")}>{byte === undefined ? "··" : hex_byte(byte)}</span>
                      {/each}
                    </span>
                    <span class="whitespace-pre">
                      {#each COLUMNS.slice(0, count) as column (column)}
                        {@const index = start + column}
                        {@const byte = byte_at(index)}
                        <span data-byte={index} class={cell_class(index, byte, true)}>{byte === undefined ? " " : ascii_char(byte)}</span>
                      {/each}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
          <div style:height="{Math.max(0, extent + ROW - viewport_height)}px"></div>
        </div>
      {/if}

      {#if show_inspector}
        <div class="flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-foreground/8 bg-background-light px-3 py-2">
          <Segmented size="sm" label="Byte order" options={endian_options} bind:value={endian} />
          <dl class="grid min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-0.5 font-mono text-2xs">
            {#each inspection as item (item.label)}
              <div class="flex min-w-0 gap-2">
                <dt class="w-7 shrink-0 text-foreground/65">{item.label}</dt>
                <dd class="truncate tabular-nums" title={item.value}>{item.value}</dd>
              </div>
            {/each}
          </dl>
        </div>
      {/if}

      <StatusBar>
        <span>{format_bytes(size)}</span>
        <span>0x{format_offset(cursor, 1)} · {cursor}</span>
        {#if sel_length > 1}<span>{sel_length} B selected</span>{/if}
        {#if scale > 1}<span class="hidden @md:block" title="The scrollbar is scaled for a file this large; the wheel and keys still move row by row">scaled scroll</span>{/if}
        {#if copied}<span class="ml-auto">{copied}</span>{/if}
      </StatusBar>
    </div>
  {/if}

  {#if loading && !file}
    <div class="absolute inset-0 grid place-items-center bg-background"><Spinner label="Opening file" /></div>
  {/if}
</div>
