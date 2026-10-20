<script lang="ts">
  import kernel, { NotificationType, Platform, type DesktopItem, type DesktopService, type DialogsService, type MenuItem, type NotificationsService } from "$lib/core/api";
  import { Badge, Button, EmptyState, IconButton, Spinner, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, error_message } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import type { Bounds, Position } from "$lib/core/utils/type";
  import { image_files, has_files } from "$kit/utils/image";
  import {
    ArrowsLeftRight as ArrowsLeftRightIcon,
    Broom as BroomIcon,
    Camera as CameraIcon,
    CaretDown as CaretDownIcon,
    CaretRight as CaretRightIcon,
    Check as CheckIcon,
    DotsThree as DotsThreeIcon,
    LinkBreak as LinkBreakIcon,
    ListPlus as ListPlusIcon,
    Palette as PaletteIcon,
    PencilSimple as PencilSimpleIcon,
    QrCode as QrCodeIcon,
    ShoppingCart as ShoppingCartIcon,
    Sticker as StickerIcon,
    Storefront as StorefrontIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { view_transition } from "$lib/core/utils/view-transition";
  import { z } from "zod";
  import { COLOR_DOT, COLOR_NAME } from "./colors";
  import {
    DEFAULT_LIST_ID,
    empty_file,
    history_key,
    LIST_COLORS,
    LISTS_FILE,
    ListsFileSchema,
    new_id,
    next_color,
    stamp,
    type Item,
    type List,
    type ListColor,
  } from "./data";
  import EntryBar from "./entry-bar.svelte";
  import ItemEditor from "./item-editor.svelte";
  import ItemRow from "./item-row.svelte";
  import { add_entry } from "./items";
  import { live, merge_items, prune } from "./merge";
  import PairPanel from "./pair-panel.svelte";
  import type { Entry } from "./parse";
  import PhotoCrop from "./photo-crop.svelte";
  import PhotoReview from "./photo-review.svelte";
  import { read_method, read_with_ai, read_with_ocr, ReadMethod, type ReviewRow } from "./read-image";
  import { record_trip } from "./suggest";
  import { PairSession, PairState } from "./sync.svelte";

  const View = { LIST: "list", PAIR: "pair", CROP: "crop", REVIEW: "review", EDIT: "edit" } as const;
  type View = (typeof View)[keyof typeof View];

  interface Props {
    list?: string;
    photo?: boolean;
  }

  let { list: list_prop, photo: photo_prop }: Props = $props();

  const { app_id, window: win, window_id, storage } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const on_phone = kernel.platform === Platform.MOBILE;

  const file = storage.file(LISTS_FILE, empty_file(), ListsFileSchema);
  const current = storage.window("list", DEFAULT_LIST_ID, z.string());
  const store = storage.window("store", false, z.boolean());
  const cart_open = storage.window("cart_open", true, z.boolean());
  // Props come back with a restored window; without this a reload would switch lists and ask for a photo again.
  const launched = storage.window("launched", false, z.boolean());

  let view = $state<View>(View.LIST);
  let root = $state<HTMLElement | null>(null);
  let dragging_file = $state(false);

  const lists = $derived(file.value.lists);
  const list = $derived(lists.find((candidate) => candidate.id === current.value) ?? lists[0]);
  const items = $derived(list ? live(list.items) : []);
  const done = $derived(items.filter((item) => item.checked));
  const open_items = $derived(items.filter((item) => !item.checked));
  const open_keys = $derived(new Set(items.filter((item) => !item.checked).map((item) => history_key(item.text))));

  const pair = new PairSession({
    list: (id) => file.value.lists.find((candidate) => candidate.id === id),
    merge(list_id, incoming, meta) {
      let target = file.value.lists.find((candidate) => candidate.id === list_id);
      if (!target) {
        if (!meta) return;
        file.value.lists.push({ ...meta, items: [] });
        target = file.value.lists.at(-1)!;
      }
      target.items = merge_items($state.snapshot(target.items) as Item[], incoming);
      if (meta) current.value = list_id;
    },
  });
  const shared = $derived(pair.list_id === list?.id && (pair.state === PairState.LIVE || pair.state === PairState.OFFLINE));

  $effect(() => () => pair.dispose());

  let pruned = false;
  $effect(() => {
    if (!file.ready || pruned) return;
    pruned = true;
    untrack(() => {
      for (const each of file.value.lists) {
        const kept = prune(each.items);
        if (kept.length !== each.items.length) each.items = kept;
      }
    });
  });

  $effect(() => {
    if (!file.ready || launched.value) return;
    untrack(() => {
      launched.value = true;
      if (list_prop && file.value.lists.some((candidate) => candidate.id === list_prop)) current.value = list_prop;
      if (photo_prop) void photo();
    });
  });

  $effect(() => {
    if (pair.state !== PairState.LIVE || !pair.list_id) return;
    const target = file.value.lists.find((candidate) => candidate.id === pair.list_id);
    if (!target) return;
    const snapshot = $state.snapshot(target.items) as Item[];
    untrack(() => pair.push(snapshot));
  });

  $effect(() => {
    if (pair.state === PairState.LIVE && view === View.PAIR) untrack(() => (view = View.LIST));
  });

  $effect(() => {
    if (view === View.LIST) return;
    return win.on_back(() => {
      close_side_view();
      return true;
    });
  });

  $effect(() => {
    win.set_title(list && lists.length > 1 ? list.name : null);
  });

  // In the store the phone sits in a hand for minutes between taps; a dimmed screen would mean unlocking it each time.
  $effect(() => {
    if (!store.value || !win.is_visible) return;
    let lock: WakeLockSentinel | null = null;
    let live_effect = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (!live_effect) return void sentinel.release();
        lock = sentinel;
        sentinel.addEventListener("release", () => (lock = null));
      } catch {
        lock = null;
      }
    };
    document.addEventListener("visibilitychange", acquire);
    void acquire();
    return () => {
      live_effect = false;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  });

  function find(id: string): Item | undefined {
    return list?.items.find((item) => item.id === id);
  }

  function add(text: string) {
    if (list) add_entry(list, text);
  }

  function toggle(id: string) {
    const item = find(id);
    if (!item) return;
    view_transition(() => {
      item.checked = !item.checked;
      item.updated_at = stamp(item);
    });
  }

  function remove(item: Item) {
    item.deleted_at = Date.now();
    item.updated_at = stamp(item);
  }

  let editing_id = $state<string | null>(null);
  const editing = $derived(editing_id === null ? undefined : find(editing_id));

  function edit(id: string) {
    if (!find(id)) return;
    editing_id = id;
    view = View.EDIT;
  }

  function save_edit(entry: Entry) {
    const target = editing;
    close_side_view();
    if (!target) return;
    target.text = entry.text;
    target.qty = entry.qty;
    target.unit = entry.unit;
    target.updated_at = stamp(target);
  }

  function move(id: string, to: string) {
    const item = find(id);
    const target = lists.find((candidate) => candidate.id === to);
    if (!item || !target) return;
    target.items.push({ id: new_id(), text: item.text, qty: item.qty, unit: item.unit, checked: item.checked, updated_at: stamp() });
    remove(item);
  }

  function clear_done() {
    if (!list || done.length === 0) return;
    file.value.history = record_trip(file.value.history, done.map((item) => item.text));
    for (const item of done) remove(item);
  }

  async function item_menu(id: string, anchor: Position) {
    const item = find(id);
    if (!item) return;
    const others = lists.filter((candidate) => candidate.id !== list?.id);
    const entries: MenuItem[] = [{ id: "edit", label: "Edit…", icon: PencilSimpleIcon }];
    if (others.length > 0) {
      entries.push({
        label: "Move to",
        icon: ArrowsLeftRightIcon,
        items: others.map((other) => ({ id: `move:${other.id}`, label: other.name })),
      });
    }
    entries.push({ separator: true }, { id: "delete", label: "Delete", icon: TrashIcon, danger: true });
    const choice = await dialogs.menu(entries, { anchor });
    if (choice === "edit") edit(id);
    else if (choice === "delete") {
      const target = find(id);
      if (target) remove(target);
    } else if (choice?.startsWith("move:")) move(id, choice.slice(5));
  }

  const below = (event: MouseEvent): Position => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: rect.left, y: rect.bottom + 4 };
  };

  async function lists_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      [
        ...lists.map((candidate) => ({
          id: `open:${candidate.id}`,
          label: candidate.name,
          icon: candidate.id === list?.id ? CheckIcon : undefined,
        })),
        { separator: true },
        { id: "new", label: "New list…", icon: ListPlusIcon },
      ],
      { anchor: below(event) }
    );
    if (choice === "new") await new_list();
    else if (choice?.startsWith("open:")) current.value = choice.slice(5);
  }

  async function more_menu(event: MouseEvent) {
    if (!list) return;
    const entries: MenuItem[] = [
      {
        id: "share",
        label: pair.state === PairState.OFFLINE && shared ? "Pair again…" : "Share live…",
        icon: QrCodeIcon,
        disabled: pair.state === PairState.LIVE && shared,
      },
      { id: "photo", label: "Read a photo…", icon: CameraIcon },
      { separator: true },
      { id: "new", label: "New list…", icon: ListPlusIcon },
      { id: "rename", label: "Rename list…", icon: PencilSimpleIcon },
      {
        label: "Colour",
        icon: PaletteIcon,
        items: LIST_COLORS.map((color) => ({ id: `color:${color}`, label: COLOR_NAME[color], icon: color === list.color ? CheckIcon : undefined })),
      },
      widget_for(list.id)
        ? { id: "widget", label: on_phone ? "Remove from home screen" : "Remove from desktop", icon: StickerIcon }
        : { id: "widget", label: on_phone ? "Add to home screen" : "Add to desktop", icon: StickerIcon },
    ];
    if (done.length > 0) entries.push({ id: "clear", label: `Clear done (${done.length})`, icon: BroomIcon });
    if (shared) entries.push({ id: "unshare", label: "Stop sharing", icon: LinkBreakIcon });
    if (lists.length > 1) entries.push({ separator: true }, { id: "delete", label: "Delete list…", icon: TrashIcon, danger: true });

    const choice = await dialogs.menu(entries, { anchor: below(event) });
    if (choice === "share") view = View.PAIR;
    else if (choice === "photo") await photo();
    else if (choice === "new") await new_list();
    else if (choice === "rename") await rename_list();
    else if (choice === "widget") await toggle_widget(list);
    else if (choice === "clear") clear_done();
    else if (choice === "unshare") pair.stop();
    else if (choice === "delete") await delete_list();
    else if (choice?.startsWith("color:")) list.color = choice.slice(6) as ListColor;
  }

  async function new_list() {
    const name = await win.prompt("New list", { placeholder: "Pharmacy, Hardware store…", confirm_label: "Create" });
    if (!name?.trim()) return;
    const created: List = { id: new_id(), name: name.trim(), color: next_color(lists), items: [] };
    file.value.lists.push(created);
    current.value = created.id;
  }

  function widget_for(id: string) {
    return desktop
      .items()
      .find((item): item is Extract<DesktopItem, { kind: "widget" }> => item.kind === "widget" && item.app_id === app_id && item.props?.list === id);
  }

  async function toggle_widget(target: List) {
    const place = on_phone ? "home screen" : "desktop";
    const existing = widget_for(target.id);
    try {
      if (existing) {
        await desktop.remove_item(existing.name);
        notifications.notify(app_id, { title: `Removed from the ${place}`, message: target.name });
        return;
      }
      const name = await desktop.pin_widget(app_id, { label: target.name, props: { list: target.id } });
      if (!name) throw new Error(`The ${place} is full`);
      notifications.notify(app_id, { title: `List added to the ${place}`, message: `${target.name}: add items or read a photo right there.` });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: `Couldn't change the ${place}`, message: error_message(reason) });
    }
  }

  async function rename_list() {
    if (!list) return;
    const target = list;
    const name = await win.prompt("Rename list", { initial: target.name, confirm_label: "Rename" });
    if (!name?.trim()) return;
    target.name = name.trim();
    const widget = widget_for(target.id);
    const file_name = `${target.name.replace(/[/\\:]/g, " ").trim()}.widget`;
    // A taken name keeps the widget's old label; the list itself is renamed either way.
    if (widget && widget.name !== file_name) await desktop.rename_item(widget.name, file_name).catch(() => {});
  }

  async function delete_list() {
    if (!list || lists.length < 2) return;
    const target = list;
    const count = live(target.items).length;
    const confirmed = await win.confirm(`Delete “${target.name}”?`, {
      detail: count ? `Its ${count} ${count === 1 ? "item goes" : "items go"} with it. The purchase history stays.` : "The purchase history stays.",
      confirm_label: "Delete",
      danger: true,
    });
    if (!confirmed) return;
    if (pair.list_id === target.id) pair.stop();
    file.value.lists = file.value.lists.filter((candidate) => candidate.id !== target.id);
    const widget = widget_for(target.id);
    if (widget) await desktop.remove_item(widget.name).catch(() => {});
  }

  let review_rows = $state<ReviewRow[] | null>(null);
  let review_error = $state<string | null>(null);
  let review_method = $state<ReadMethod>(ReadMethod.OCR);
  let review_controller: AbortController | null = null;
  let photo_image = $state.raw<Blob | null>(null);

  async function photo() {
    const [image] = await pick_device_files({ accept: ["image/*"] });
    if (image) choose_part(image);
  }

  function choose_part(image: Blob) {
    review_controller?.abort();
    review_controller = null;
    photo_image = image;
    view = View.CROP;
  }

  async function read(image: Blob, crop: Bounds | null) {
    review_controller?.abort();
    const own = new AbortController();
    review_controller = own;
    review_rows = null;
    review_error = null;
    review_method = read_method();
    view = View.REVIEW;
    try {
      let lines: string[] | null = null;
      if (review_method === ReadMethod.AI) {
        try {
          lines = await read_with_ai(image, crop, own.signal);
        } catch (reason) {
          if (own.signal.aborted) return;
          console.warn("[ShoppingList] Gemini Nano couldn't read the photo, using the text reader", reason);
          review_method = ReadMethod.OCR;
        }
      }
      if (lines === null) {
        const job = read_with_ocr(image, crop, Object.keys(file.value.history));
        own.signal.addEventListener("abort", () => job.cancel(), { once: true });
        lines = await job.done;
        if (own.signal.aborted) return;
        if (lines === null) throw new Error(job.error ?? "Reading was cancelled");
      }
      if (own.signal.aborted) return;
      review_rows = lines.map((text) => ({ text, keep: true }));
    } catch (reason) {
      if (!own.signal.aborted) review_error = error_message(reason);
    }
  }

  function add_reviewed(lines: string[]) {
    for (const line of lines) add(line);
    close_side_view();
  }

  function close_side_view() {
    review_controller?.abort();
    review_controller = null;
    review_rows = null;
    review_error = null;
    photo_image = null;
    editing_id = null;
    view = View.LIST;
  }

  function busy_elsewhere() {
    return dialogs.system.length > 0 || dialogs.for_window(window_id).length > 0;
  }

  function on_paste(event: ClipboardEvent) {
    if (!win.is_focused || busy_elsewhere() || view === View.PAIR) return;
    const target = event.target;
    if (target instanceof Node && target !== document.body && !root?.contains(target)) return;
    const [image] = image_files(event.clipboardData);
    if (!image) return;
    event.preventDefault();
    choose_part(image);
  }

  function on_dragover(event: DragEvent) {
    if (!has_files(event) || busy_elsewhere()) return;
    event.preventDefault();
    dragging_file = true;
  }

  function on_drop(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging_file = false;
    if (busy_elsewhere()) return;
    const [image] = image_files(event.dataTransfer);
    if (image) choose_part(image);
  }
</script>

<svelte:document onpaste={on_paste} />

<div
  bind:this={root}
  role="presentation"
  class={cn("grid h-full grid-rows-[auto_1fr_auto] bg-background", dragging_file && "ring-2 ring-primary ring-inset")}
  ondragover={on_dragover}
  ondragleave={(event) => {
    if (!root?.contains(event.relatedTarget as Node | null)) dragging_file = false;
  }}
  ondrop={on_drop}
>
  <div>
    <Toolbar class="flex-nowrap">
      <Button variant="quiet" class="min-w-0 flex-1 justify-start gap-2 text-sm font-medium" aria-label="Lists, now “{list?.name ?? ''}”" onclick={lists_menu}>
        {#if list}<span class={cn("size-2.5 shrink-0 rounded-full", COLOR_DOT[list.color])}></span>{/if}
        <span class="truncate">{list?.name ?? "Shopping List"}</span>
        <CaretDownIcon weight="bold" class="shrink-0 text-foreground/65" />
      </Button>
      {#if shared}
        {#if pair.state === PairState.LIVE}
          <Badge tone="success">Live</Badge>
        {:else}
          <button type="button" class="shrink-0" onclick={() => (view = View.PAIR)} aria-label="Offline: pair again">
            <Badge>Offline</Badge>
          </button>
        {/if}
      {/if}
      <IconButton label="In-store mode" pressed={store.value} onclick={() => (store.value = !store.value)}>
        <StorefrontIcon weight="bold" />
      </IconButton>
      <IconButton label="List actions" onclick={more_menu}><DotsThreeIcon weight="bold" /></IconButton>
    </Toolbar>
    {#if view === View.LIST && items.length > 0}
      <div
        class="h-1 bg-foreground/8"
        role="progressbar"
        aria-label="In the cart"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={done.length}
      >
        <div class="h-full bg-primary transition-[width] duration-300" style:width="{(done.length / items.length) * 100}%"></div>
      </div>
    {/if}
  </div>

  <main class="min-h-0 overflow-auto">
    {#if !file.ready}
      <div class="grid h-full place-items-center"><Spinner label="Loading lists" /></div>
    {:else if view === View.EDIT && editing}
      {#key editing.id}
        <ItemEditor item={editing} onsave={save_edit} oncancel={close_side_view} />
      {/key}
    {:else if view === View.PAIR}
      <PairPanel session={pair} {list} onclose={() => (view = View.LIST)} />
    {:else if view === View.CROP && photo_image}
      <PhotoCrop image={photo_image} onread={(crop) => photo_image && void read(photo_image, crop)} oncancel={close_side_view} />
    {:else if view === View.REVIEW}
      <PhotoReview
        bind:rows={review_rows}
        method={review_method}
        error={review_error}
        list_name={list?.name ?? ""}
        onadd={add_reviewed}
        oncancel={close_side_view}
        onretry={() => void photo()}
      />
    {:else if items.length === 0}
      <EmptyState
        icon={ShoppingCartIcon}
        title="Nothing on the list"
        description="Type below, tap one you bought before, or read a list from a photo."
      >
        {#snippet actions()}
          <Button onclick={() => void photo()}><CameraIcon weight="bold" /> Read a photo…</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <div class="mx-auto flex max-w-xl flex-col gap-3 p-3">
        {#if open_items.length > 0}
          <ul class="flex flex-col divide-y divide-foreground/8 overflow-hidden rounded-xl bg-background-light shadow-raised ring-1 ring-foreground/8" aria-label="To buy">
            {#each open_items as item (item.id)}
              <ItemRow {item} store={store.value} ontoggle={() => toggle(item.id)} onmenu={(anchor) => void item_menu(item.id, anchor)} onamount={() => edit(item.id)} />
            {/each}
          </ul>
        {:else}
          <p class="flex items-center justify-center gap-2 py-6 text-sm text-foreground/65"><CheckIcon weight="bold" class="text-primary" /> Everything's in the cart</p>
        {/if}
        {#if done.length > 0}
          <section aria-label="In the cart">
            <button
              type="button"
              class="flex min-h-9 w-full items-center gap-1.5 rounded-md px-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase hover:text-foreground"
              aria-expanded={cart_open.value}
              onclick={() => (cart_open.value = !cart_open.value)}
            >
              <CaretRightIcon weight="bold" class={cn("size-3 transition-transform", cart_open.value && "rotate-90")} />
              In the cart · <span class="font-mono tabular-nums">{done.length}</span>
            </button>
            {#if cart_open.value}
              <ul class="flex flex-col divide-y divide-foreground/6">
                {#each done as item (item.id)}
                  <ItemRow {item} store={store.value} ontoggle={() => toggle(item.id)} onmenu={(anchor) => void item_menu(item.id, anchor)} onamount={() => edit(item.id)} />
                {/each}
              </ul>
            {/if}
          </section>
        {/if}
      </div>
    {/if}
  </main>

  {#if view === View.LIST && file.ready}
    <div>
      {#if done.length > 0}
        <div class="flex items-center justify-between gap-2 border-t border-foreground/8 bg-background-light px-3 pt-2">
          <p class="font-mono text-2xs text-foreground/65 tabular-nums" aria-live="polite">{done.length} of {items.length} in the cart</p>
          <Button size={store.value ? "lg" : "sm"} variant={store.value ? "primary" : "secondary"} onclick={clear_done}>
            <BroomIcon weight="bold" /> Clear done
          </Button>
        </div>
      {/if}
      <EntryBar history={file.value.history} exclude={open_keys} onadd={add} onphoto={() => void photo()} />
    </div>
  {/if}
</div>
