<script lang="ts">
  import kernel, { Platform, type DesktopItem, type DesktopService, type DialogsService, type MenuItem, type NotificationsService } from "$lib/core/api";
  import { Button, EmptyState, Grabber, IconButton, Spinner, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { get_app_context } from "$lib/core/contexts/app";
  import { paste_files } from "$kit/utils/paste";
  import { cn, error_message } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import type { Position } from "$lib/core/utils/type";
  import type { Quad } from "$kit/utils/perspective";
  import { image_files, has_files } from "$kit/utils/image";
  import {
    ArrowsLeftRight as ArrowsLeftRightIcon,
    Broom as BroomIcon,
    Camera as CameraIcon,
    CaretDown as CaretDownIcon,
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    Check as CheckIcon,
    DotsThree as DotsThreeIcon,
    GearSix as GearSixIcon,
    ListPlus as ListPlusIcon,
    PencilSimple as PencilSimpleIcon,
    QrCode as QrCodeIcon,
    Scan as ScanIcon,
    Stack as StackIcon,
    ShoppingCart as ShoppingCartIcon,
    SortAscending as SortAscendingIcon,
    Sticker as StickerIcon,
    Storefront as StorefrontIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { view_transition } from "$lib/core/utils/view-transition";
  import { z } from "zod";
  import {
    empty_file,
    history_key,
    LISTS_FILE,
    ListsFileSchema,
    new_id,
    next_color,
    stamp,
    type Item,
    type List,
    type ListMeta,
  } from "./data";
  import EntryBar from "./entry-bar.svelte";
  import ItemEditor from "./item-editor.svelte";
  import ItemRow from "./item-row.svelte";
  import ListMark from "./list-mark.svelte";
  import ListSettings from "./list-settings.svelte";
  import ListsOverview from "./lists-overview.svelte";
  import { add_entry } from "./items";
  import { live, prune } from "./merge";
  import ReceivePanel from "./receive-panel.svelte";
  import { apply_changes, review_share, type ListReview, type Share } from "./share";
  import SharePanel from "./share-panel.svelte";
  import ShareReview from "./share-review.svelte";
  import type { Entry } from "./parse";
  import PhotoCrop from "./photo-crop.svelte";
  import PhotoReview from "./photo-review.svelte";
  import { read_method, read_with_ai, read_with_ocr, ReadMethod, type ReviewRow } from "./read-image";
  import { ItemSort, sort_items, SORT_LABELS } from "./sort";
  import { record_trip } from "./suggest";
  import { report_error } from "$kit/utils/report-error";

  const View = { LIST: "list", SHARE: "share", RECEIVE: "receive", INCOMING: "incoming", CROP: "crop", REVIEW: "review", EDIT: "edit", SETTINGS: "settings" } as const;
  /** Window storage `list` holds a list id, or one of these. */
  const HOME = "@home";
  const ALL = "@all";
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
  const current = storage.window("list", HOME, z.string());
  /** Where an item typed in All goes. */
  const add_to = storage.window<string | null>("add_to", null, z.string().nullable());
  const store = storage.window("store", false, z.boolean());
  const cart_open = storage.window("cart_open", true, z.boolean());
  const sort = storage.window<ItemSort>("sort", ItemSort.OLDEST, z.enum(ItemSort));
  // Props come back with a restored window; without this a reload would switch lists and ask for a photo again.
  const launched = storage.window("launched", false, z.boolean());

  let view = $state<View>(View.LIST);
  let root = $state<HTMLElement | null>(null);
  let dragging_file = $state(false);

  const lists = $derived(file.value.lists);
  const list = $derived(lists.find((candidate) => candidate.id === current.value));
  const all = $derived(current.value === ALL);
  const home = $derived(!list && !all);
  const scope = $derived(list ? [list] : all ? lists : []);
  const items = $derived(sort_items(scope.flatMap((each) => live(each.items)), sort.value));
  const done = $derived(items.filter((item) => item.checked));
  const open_items = $derived(items.filter((item) => !item.checked));
  const groups = $derived(lists.map((each) => ({ list: each, open: sort_items(live(each.items).filter((item) => !item.checked), sort.value) })).filter((group) => group.open.length > 0));
  const target = $derived(list ?? lists.find((candidate) => candidate.id === add_to.value) ?? lists[0]);
  const open_keys = $derived(new Set(target ? live(target.items).filter((item) => !item.checked).map((item) => history_key(item.text)) : []));

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
    if (view === View.LIST) return;
    return win.on_back(() => {
      close_side_view();
      return true;
    });
  });

  $effect(() => {
    win.set_title(list ? list.name : all ? "All lists" : null);
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

  function owner_of(id: string): List | undefined {
    return lists.find((candidate) => candidate.items.some((item) => item.id === id));
  }

  function find(id: string): Item | undefined {
    return owner_of(id)?.items.find((item) => item.id === id);
  }

  function add(text: string) {
    if (target) add_entry(target, text);
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

  function delete_item(id: string) {
    const item = find(id);
    if (!item) return;
    view_transition(() => remove(item));
    notifications.notify(app_id, {
      title: "Deleted",
      message: item.text,
      actions: [
        {
          label: "Undo",
          on_click: () => {
            const again = find(id);
            if (!again) return;
            delete again.deleted_at;
            again.updated_at = stamp(again);
          },
        },
      ],
    });
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
    const now = Date.now();
    target.items.push({ id: new_id(now), text: item.text, qty: item.qty, unit: item.unit, checked: item.checked, added_at: now, updated_at: stamp(undefined, now) });
    remove(item);
  }

  function clear_done() {
    if (done.length === 0) return;
    const cleared = done.map((item) => item.id);
    const history = $state.snapshot(file.value.history);
    file.value.history = record_trip(file.value.history, done.map((item) => item.text));
    view_transition(() => {
      for (const item of done) remove(item);
    });
    notifications.notify(app_id, {
      title: cleared.length === 1 ? "Cleared 1 item" : `Cleared ${cleared.length} items`,
      message: "Saved to Buy again.",
      duration: 8000,
      actions: [
        {
          label: "Undo",
          on_click: () => {
            file.value.history = history;
            for (const id of cleared) {
              const again = find(id);
              if (!again?.deleted_at) continue;
              delete again.deleted_at;
              again.updated_at = stamp(again);
            }
          },
        },
      ],
    });
  }

  async function item_menu(id: string, anchor: Position) {
    const item = find(id);
    if (!item) return;
    const others = lists.filter((candidate) => candidate.id !== owner_of(id)?.id);
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
    else if (choice === "delete") delete_item(id);
    else if (choice?.startsWith("move:")) move(id, choice.slice(5));
  }

  const below = (event: MouseEvent): Position => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: rect.left, y: rect.bottom + 4 };
  };

  function open_place(id: string | null) {
    if (id === null) current.value = ALL;
    else current.value = id;
  }

  async function pick_target(event: MouseEvent) {
    const choice = await dialogs.menu(
      lists.map((candidate) => ({ id: candidate.id, label: candidate.name, icon: candidate.id === target?.id ? CheckIcon : undefined })),
      { anchor: below(event) }
    );
    if (choice) add_to.value = choice;
  }

  const SORT_PREFIX = "sort:";

  function sort_menu(): MenuItem {
    return {
      label: "Sort",
      icon: SortAscendingIcon,
      items: Object.values(ItemSort).map((option) => ({ id: SORT_PREFIX + option, label: SORT_LABELS[option], icon: sort.value === option ? CheckIcon : undefined })),
    };
  }

  function pick_sort(choice: string | null): boolean {
    if (!choice?.startsWith(SORT_PREFIX)) return false;
    const option = choice.slice(SORT_PREFIX.length) as ItemSort;
    if (option !== sort.value) view_transition(() => (sort.value = option));
    return true;
  }

  async function more_menu(event: MouseEvent) {
    if (!list) return all_menu(event);
    const entries: MenuItem[] = [
      { id: "share", label: "Share…", icon: QrCodeIcon },
      { id: "receive", label: "Receive…", icon: ScanIcon },
      { id: "photo", label: "Read a photo…", icon: CameraIcon },
      { separator: true },
      sort_menu(),
      { id: "settings", label: "List settings…", icon: GearSixIcon },
      widget_for(list.id)
        ? { id: "widget", label: on_phone ? "Remove from home screen" : "Remove from desktop", icon: StickerIcon }
        : { id: "widget", label: on_phone ? "Add to home screen" : "Add to desktop", icon: StickerIcon },
    ];
    if (done.length > 0) entries.push({ id: "clear", label: `Clear done (${done.length})`, icon: BroomIcon });
    if (lists.length > 1) entries.push({ separator: true }, { id: "delete", label: "Delete list…", icon: TrashIcon, danger: true });

    const choice = await dialogs.menu(entries, { anchor: below(event) });
    if (pick_sort(choice)) return;
    if (choice === "share") view = View.SHARE;
    else if (choice === "receive") view = View.RECEIVE;
    else if (choice === "photo") await photo();
    else if (choice === "settings") open_settings(list.id);
    else if (choice === "widget") await toggle_widget(list);
    else if (choice === "clear") clear_done();
    else if (choice === "delete") await delete_list();
  }

  async function all_menu(event: MouseEvent) {
    const entries: MenuItem[] = [
      { id: "share", label: "Share…", icon: QrCodeIcon },
      { id: "receive", label: "Receive…", icon: ScanIcon },
      { separator: true },
      { id: "photo", label: "Read a photo…", icon: CameraIcon },
      { id: "new", label: "New list…", icon: ListPlusIcon },
      { separator: true },
      sort_menu(),
    ];
    if (done.length > 0) entries.push({ id: "clear", label: `Clear done (${done.length})`, icon: BroomIcon });
    const choice = await dialogs.menu(entries, { anchor: below(event) });
    if (pick_sort(choice)) return;
    if (choice === "share") view = View.SHARE;
    else if (choice === "receive") view = View.RECEIVE;
    else if (choice === "photo") await photo();
    else if (choice === "new") new_list();
    else if (choice === "clear") clear_done();
  }

  /** A list id, or `"new"` for one not created yet. */
  let settings_for = $state<string | null>(null);
  const settings_list = $derived(settings_for === "new" ? { name: "", color: next_color(lists) } : lists.find((candidate) => candidate.id === settings_for));

  function new_list() {
    settings_for = "new";
    view = View.SETTINGS;
  }

  function open_settings(id: string) {
    settings_for = id;
    view = View.SETTINGS;
  }

  async function save_settings(details: Pick<ListMeta, "name" | "color" | "icon">) {
    const id = settings_for;
    close_side_view();
    if (id === "new") {
      const created: List = { id: new_id(), ...details, items: [] };
      file.value.lists.push(created);
      current.value = created.id;
      return;
    }
    const edited = lists.find((candidate) => candidate.id === id);
    if (!edited) return;
    const renamed = edited.name !== details.name;
    edited.name = details.name;
    edited.color = details.color;
    edited.icon = details.icon;
    if (renamed) await rename_widget(edited);
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
      report_error(app_id, `Couldn't change the ${place}`, reason);
    }
  }

  async function rename_widget(target: List) {
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
    current.value = HOME;
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

  async function read(image: Blob, crop: Quad | null) {
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

  let incoming = $state.raw<{ share: Share; reviews: ListReview[] } | null>(null);

  function receive(share: Share) {
    incoming = { share, reviews: review_share($state.snapshot(file.value.lists) as List[], share) };
    view = View.INCOMING;
  }

  function apply_incoming(picked: Set<string>) {
    if (!incoming) return;
    const { share, reviews } = incoming;
    const applied = apply_changes(file.value.lists, share, picked, reviews);
    close_side_view();
    notifications.notify(app_id, { title: applied === 1 ? "1 change applied" : `${applied} changes applied` });
  }

  function close_side_view() {
    review_controller?.abort();
    review_controller = null;
    review_rows = null;
    review_error = null;
    photo_image = null;
    editing_id = null;
    settings_for = null;
    incoming = null;
    view = View.LIST;
  }

  function busy_elsewhere() {
    return dialogs.system.length > 0 || dialogs.for_window(window_id).length > 0;
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

<div
  bind:this={root}
  {@attach view !== View.SHARE && view !== View.RECEIVE && paste_files({ win, accept: ["image/*"], onfiles: (files) => choose_part(files[0]) })}
  role="presentation"
  class={cn("relative grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] bg-background", dragging_file && "ring-2 ring-primary ring-inset")}
  ondragover={on_dragover}
  ondragleave={(event) => {
    if (!root?.contains(event.relatedTarget as Node | null)) dragging_file = false;
  }}
  ondrop={on_drop}
>
  <div inert={view === View.EDIT}>
    <Toolbar class="flex-nowrap">
      {#if home}
        <ShoppingCartIcon weight="bold" class="ml-1 size-4.5 shrink-0 text-foreground/80" />
        <h1 class="min-w-0 flex-1 truncate text-sm font-semibold">Lists</h1>
        <Button size="sm" variant="quiet" onclick={() => (view = View.RECEIVE)}><ScanIcon weight="bold" /> Receive</Button>
        <Button size="sm" variant="quiet" onclick={() => (view = View.SHARE)}><QrCodeIcon weight="bold" /> Share</Button>
      {:else}
        <IconButton label="All your lists" class="shrink-0" onclick={() => (current.value = HOME)}><CaretLeftIcon weight="bold" /></IconButton>
        {#if list}
          <ListMark {list} size="md" />
          <h1 class="min-w-0 flex-1 truncate text-sm font-semibold">{list.name}</h1>
        {:else}
          <StackIcon weight="bold" class="size-4.5 shrink-0 text-foreground/80" />
          <h1 class="min-w-0 flex-1 truncate text-sm font-semibold">All lists</h1>
        {/if}
        <IconButton label="In-store mode" class="shrink-0" pressed={store.value} onclick={() => (store.value = !store.value)}>
          <StorefrontIcon weight="bold" />
        </IconButton>
        <IconButton label={list ? "List actions" : "Actions"} class="shrink-0" onclick={more_menu}><DotsThreeIcon weight="bold" /></IconButton>
      {/if}
    </Toolbar>
    {#if (view === View.LIST || view === View.EDIT) && !home && items.length > 0}
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

  <main class="min-h-0 overflow-auto" inert={view === View.EDIT}>
    {#if !file.ready}
      <div class="grid h-full place-items-center"><Spinner label="Loading lists" /></div>
    {:else if view === View.SETTINGS && settings_list}
      {#key settings_for}
        <ListSettings
          list={settings_list}
          title={settings_for === "new" ? "New list" : "List settings"}
          confirm_label={settings_for === "new" ? "Create" : "Save"}
          onsave={(details) => void save_settings(details)}
          oncancel={close_side_view}
        />
      {/key}
    {:else if view === View.SHARE}
      <SharePanel {lists} initial={list ? [list.id] : all ? lists.map((each) => each.id) : []} onclose={close_side_view} />
    {:else if view === View.RECEIVE}
      <ReceivePanel onreceive={receive} oncancel={close_side_view} />
    {:else if view === View.INCOMING && incoming}
      <ShareReview reviews={incoming.reviews} onapply={apply_incoming} oncancel={close_side_view} />
    {:else if view === View.CROP && photo_image}
      <PhotoCrop image={photo_image} onread={(crop) => photo_image && void read(photo_image, crop)} oncancel={close_side_view} />
    {:else if view === View.REVIEW}
      <PhotoReview
        bind:rows={review_rows}
        method={review_method}
        error={review_error}
        list_name={target?.name ?? ""}
        open_keys={open_keys}
        onadd={add_reviewed}
        oncancel={close_side_view}
        onretry={() => void photo()}
      />
    {:else if home}
      <ListsOverview {lists} onopen={open_place} onsettings={open_settings} onnew={new_list} />
    {:else if items.length === 0}
      <EmptyState
        icon={ShoppingCartIcon}
        title={all ? "Nothing on any list" : "Nothing on the list"}
        description="Type below, tap one you bought before, or read a list from a photo."
      >
        {#snippet actions()}
          <Button onclick={() => void photo()}><CameraIcon weight="bold" /> Read a photo…</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <div class="mx-auto flex max-w-xl flex-col gap-3 p-3">
        {#if open_items.length === 0}
          <p class="flex items-center justify-center gap-2 py-6 text-sm text-foreground/65"><CheckIcon weight="bold" class="text-primary" /> Everything's in the cart</p>
        {:else if all}
          {#each groups as group (group.list.id)}
            <section aria-label={group.list.name} class="flex flex-col gap-1.5">
              <button
                type="button"
                class="flex min-h-11 items-center gap-2 rounded-md px-1 text-left text-2xs font-medium tracking-wide text-foreground/80 uppercase hover:text-foreground"
                onclick={() => open_place(group.list.id)}
              >
                <ListMark list={group.list} size="sm" />
                <span class="min-w-0 flex-1 truncate">{group.list.name}</span>
                <span class="font-mono tabular-nums">{group.open.length}</span>
              </button>
              {@render card(group.open)}
            </section>
          {/each}
        {:else}
          {@render card(open_items)}
        {/if}
        {#if done.length > 0}
          <section aria-label="In the cart">
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-1.5 rounded-md px-1 text-2xs font-medium tracking-wide text-foreground/80 uppercase hover:text-foreground"
              aria-expanded={cart_open.value}
              onclick={() => (cart_open.value = !cart_open.value)}
            >
              <CaretRightIcon weight="bold" class={cn("size-3 transition-transform", cart_open.value && "rotate-90")} />
              In the cart · <span class="font-mono tabular-nums">{done.length}</span>
            </button>
            {#if cart_open.value}
              <ul class="flex flex-col divide-y divide-foreground/6 [--row-background:var(--color-background)]">
                {#each done as item (item.id)}
                  {@render row(item, all ? owner_of(item.id) : undefined)}
                {/each}
              </ul>
            {/if}
          </section>
        {/if}
      </div>
    {/if}
  </main>

  {#if (view === View.LIST || view === View.EDIT) && file.ready && !home}
    <div inert={view === View.EDIT}>
      {#if done.length > 0}
        <div class="border-t border-foreground/8 bg-background-light">
          <div class="mx-auto flex max-w-xl items-center justify-between gap-2 px-3 pt-2">
            <p class={cn("font-mono text-foreground/80 tabular-nums", store.value ? "text-sm" : "text-ui")} aria-live="polite">{done.length} of {items.length} in the cart</p>
            <Button size={store.value ? "lg" : "md"} variant={open_items.length === 0 ? "primary" : "secondary"} onclick={clear_done}>
              <BroomIcon weight="bold" /> Clear done
            </Button>
          </div>
        </div>
      {/if}
      <EntryBar history={file.value.history} exclude={open_keys} again={!store.value} compact={store.value} onadd={add} onphoto={() => void photo()}>
        {#snippet before()}
          {#if all && target}
            <button
              type="button"
              class="flex h-10 shrink-0 items-center gap-1 rounded-lg pr-1.5 pl-1 hover:bg-foreground/6"
              aria-label="Add to “{target.name}”, change list"
              onclick={pick_target}
            >
              <ListMark list={target} size="md" />
              <CaretDownIcon weight="bold" class="size-3 text-foreground/65" />
            </button>
          {/if}
        {/snippet}
      </EntryBar>
    </div>
  {/if}
  {#if view === View.EDIT && editing}
    <!-- A sheet over the list, not a view instead of it: the list keeps its scroll. -->
    <div class="absolute inset-0 z-20 flex flex-col justify-end">
      <button type="button" tabindex="-1" aria-label="Close" class="absolute inset-0 bg-(--overlay)" onclick={close_side_view}></button>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit item"
        tabindex="-1"
        class="relative mx-auto flex max-h-[90%] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-background shadow-raised ring-1 ring-foreground/10 outline-none motion-safe:animate-sheet-in"
        {@attach (element) => element.focus({ preventScroll: true })}
        {@attach swipe_dismiss({ on_dismiss: () => close_side_view() })}
        onkeydown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          close_side_view();
        }}
      >
        <Grabber class="mt-2" />
        {#key editing.id}
          <ItemEditor item={editing} added_at={editing.added_at} onsave={save_edit} oncancel={close_side_view} />
        {/key}
      </div>
    </div>
  {/if}
</div>

{#snippet card(rows: Item[])}
  <ul class="flex flex-col divide-y divide-foreground/8 overflow-hidden rounded-xl bg-background-light shadow-raised ring-1 ring-foreground/8 [--row-background:var(--color-background-light)]">
    {#each rows as item (item.id)}
      {@render row(item)}
    {/each}
  </ul>
{/snippet}

{#snippet row(item: Item, from?: List)}
  <ItemRow
    {item}
    {from}
    store={store.value}
    ontoggle={() => toggle(item.id)}
    onremove={() => delete_item(item.id)}
    onedit={() => edit(item.id)}
    onmenu={(anchor) => void item_menu(item.id, anchor)}
  />
{/snippet}
