<script lang="ts">
  import kernel, { NotificationType, type DialogsService, type FilesService, type NotificationsService } from "$lib/core/api";
  import { RouteKind, route_url } from "$lib/core/api/services/router/route";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, IconButton, Input, Spinner, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, error_message } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { create_barcode_detector, detect_barcode, type BarcodeDetector, type DetectedCode } from "$kit/utils/qr";
  import { has_files } from "$kit/utils/image";
  import {
    Cards as CardsIcon,
    DotsThree as DotsThreeIcon,
    FileZip as FileZipIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    PencilSimple as PencilSimpleIcon,
    Plus as PlusIcon,
    QrCode as QrCodeIcon,
    Warning as WarningIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { adopt_cards, archive_photo_name, ARCHIVE_NAME, build_archive, read_archive, type PhotoBlobs } from "./archive";
  import CardEditor, { type PhotoChanges } from "./card-editor.svelte";
  import CardTile from "./card-tile.svelte";
  import CardView from "./card-view.svelte";
  import Checkout from "./checkout.svelte";
  import {
    CARDS_FILE,
    CARDS_VERSION,
    CardsFileSchema,
    create_card,
    display_name,
    EMPTY_FILE,
    empty_draft,
    filter_cards,
    find_card,
    PhotoSide,
    record_use,
    sort_cards,
    type Card,
    type CardDraft,
  } from "./data";
  import { DETECTOR_FORMATS, FORMATS, format_from_detected } from "./formats";
  import { delete_photo, delete_photos, encode_photo, read_photo, write_photo } from "./photos";
  import QrImport from "./qr-import.svelte";
  import QrShare from "./qr-share.svelte";
  import CardsReviewSheet from "./cards-review.svelte";
  import { CARDS_APP, cards_from_drafts, compact_cards, decode_share, encode_share, fits_qr, merge_cards, payload_of, read_compact, review_cards, type CardsReview } from "./share";
  import { CollectResult, encode_frames, FrameCollector } from "$kit/utils/qr-transfer";

  interface Props {
    card?: string;
    import?: string;
  }

  let { card: card_prop, import: import_prop }: Props = $props();

  const { app_id, window_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const data = storage.file(CARDS_FILE, EMPTY_FILE, CardsFileSchema);
  const open_id = storage.window<string | null>("card", null, z.string().nullable());
  // Props come back with a restored window; remembering what was handled keeps a reload from importing or counting twice.
  const handled = storage.window("handled", { card: "", import: "" }, z.object({ card: z.string(), import: z.string() }));

  interface Editing {
    id: string;
    is_new: boolean;
    initial: CardDraft;
    photos: Record<PhotoSide, boolean>;
  }

  type Overlay =
    | { kind: "share"; title: string; caption: string; text: string | null; frames?: string[] }
    | { kind: "import" }
    | { kind: "review"; review: CardsReview };

  let editing = $state.raw<Editing | null>(null);
  let editor = $state<ReturnType<typeof CardEditor>>();
  let checkout_id = $state<string | null>(null);
  let overlay = $state.raw<Overlay | null>(null);
  let query = $state("");
  let photo_version = $state(0);
  let dropping = $state(false);
  let busy = $state(false);
  let root = $state<HTMLElement>();

  const cards = $derived(data.value.cards);
  const sorted = $derived(sort_cards(cards));
  const shown = $derived(filter_cards(sorted, query));
  const open_card = $derived(open_id.value ? (cards.find((entry) => entry.id === open_id.value) ?? null) : null);
  const checkout_card = $derived(checkout_id ? (cards.find((entry) => entry.id === checkout_id) ?? null) : null);

  let detector: Promise<BarcodeDetector> | null = null;
  const get_detector = () => (detector ??= create_barcode_detector(DETECTOR_FORMATS));

  function report(title: string, reason?: unknown, type: NotificationType = NotificationType.ERROR) {
    if (type === NotificationType.ERROR) console.error(`[Cards] ${title}`, reason);
    notifications.notify(app_id, { type, title, message: reason === undefined ? undefined : error_message(reason) });
  }

  function update(id: string, change: (card: Card) => Card) {
    data.value = { ...data.value, cards: data.value.cards.map((entry) => (entry.id === id ? change(entry) : entry)) };
  }

  function show_card(id: string) {
    update(id, (entry) => record_use(entry, Date.now()));
    open_id.value = id;
  }

  function new_card(scan?: DetectedCode) {
    const initial = empty_draft(scan?.value);
    if (scan) initial.format = format_from_detected(scan.format) ?? initial.format;
    editing = { id: crypto.randomUUID(), is_new: true, initial, photos: { front: false, back: false } };
  }

  function edit_card(card: Card) {
    const { name, code, format, color, notes } = card;
    editing = { id: card.id, is_new: false, initial: { name, code, format, color, notes }, photos: card.photos };
  }

  async function save_edit(draft: CardDraft, changes: PhotoChanges) {
    const target = editing;
    if (!target) return;
    busy = true;
    const photos = { ...target.photos };
    try {
      for (const side of Object.values(PhotoSide)) {
        const change = changes[side];
        if (change === undefined) continue;
        if (change === null) await delete_photo(files, target.id, side);
        else await write_photo(files, target.id, side, await encode_photo(change instanceof File ? change : new File([change], side)));
        photos[side] = change !== null;
      }
    } catch (reason) {
      report("Couldn't save the photos", reason);
    } finally {
      busy = false;
    }
    if (target.is_new) {
      const created = { ...create_card(draft, target.id, Date.now()), photos };
      data.value = { ...data.value, cards: [...data.value.cards, created] };
    } else {
      update(target.id, (entry) => ({ ...entry, ...create_card(draft, entry.id, entry.created_at), pinned: entry.pinned, uses: entry.uses, used_at: entry.used_at, photos }));
    }
    photo_version++;
    editing = null;
    open_id.value = target.id;
  }

  async function delete_card(card: Card) {
    const confirmed = await win.confirm(`Delete “${display_name(card)}”?`, {
      detail: "The card, its notes and photos are deleted from this device.",
      confirm_label: "Delete",
      danger: true,
    });
    if (!confirmed) return;
    data.value = { ...data.value, cards: data.value.cards.filter((entry) => entry.id !== card.id) };
    open_id.value = null;
    try {
      await delete_photos(files, card.id);
    } catch (reason) {
      console.warn("[Cards] couldn't delete the photos", reason);
    }
  }

  async function scan_image(file: File): Promise<DetectedCode | null> {
    if (!file.type.startsWith("image/")) {
      report("That isn't an image", file.name, NotificationType.WARNING);
      return null;
    }
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const found = await detect_barcode(await get_detector(), bitmap);
      const code = found?.value ? found : null;
      if (!code) report("No barcode found in the image", "Try a sharper photo with the whole code in it.", NotificationType.WARNING);
      return code;
    } catch (reason) {
      report("Couldn't read the image", reason);
      return null;
    } finally {
      bitmap?.close();
    }
  }

  function list_names(list: readonly { name: string; code: string }[]): string {
    const names = list.map((entry) => display_name(entry));
    return names.length <= 6 ? names.join(", ") : `${names.slice(0, 6).join(", ")} and ${names.length - 6} more`;
  }

  /** Resolves `true` when the text was a Cards payload, whether or not the user went ahead. */
  async function import_payload(text: string): Promise<boolean> {
    const drafts = await decode_share(payload_of(text));
    if (!drafts) return false;
    const incoming = cards_from_drafts(drafts, () => crypto.randomUUID(), Date.now());
    const { added, skipped } = merge_cards(data.value.cards, incoming);
    overlay = null;
    if (added.length === 0) {
      report(drafts.length === 1 ? "You already have this card" : "You already have these cards", undefined, NotificationType.INFO);
      return true;
    }
    const confirmed = await win.confirm(added.length === 1 ? `Add “${display_name(added[0])}”?` : `Add ${added.length} cards?`, {
      detail: `${added.length === 1 ? `${FORMATS[added[0].format].label} · ${added[0].code}` : list_names(added)}${skipped ? `. ${skipped} already here ${skipped === 1 ? "is" : "are"} skipped.` : "."}`,
      confirm_label: "Add",
    });
    if (!confirmed) return true;
    data.value = { ...data.value, cards: merge_cards(data.value.cards, added).cards };
    if (added.length === 1) open_id.value = added[0].id;
    return true;
  }

  const collector = new FrameCollector(CARDS_APP);
  let collected = $state<{ got: number; total: number } | null>(null);

  /** One frame of a multi-part list: `true` once the list is in and the review is open. */
  async function take_frame(text: string): Promise<boolean | null> {
    const result = collector.add(text);
    if (result === CollectResult.NOT_A_FRAME) return null;
    if (result === CollectResult.FOREIGN) {
      report("Those codes are for another app", undefined, NotificationType.WARNING);
      return false;
    }
    collected = { got: collector.got, total: collector.total };
    if (result !== CollectResult.COMPLETE) return false;
    try {
      const drafts = read_compact(await collector.payload());
      overlay = { kind: "review", review: review_cards(data.value.cards, drafts) };
      return true;
    } catch (reason) {
      report("Couldn't read those codes", reason);
      return false;
    } finally {
      collector.reset();
      collected = null;
    }
  }

  function apply_review(review: CardsReview, added: number[], changed: number[]) {
    const now = Date.now();
    const created = added.map((index) => create_card(review.added[index], crypto.randomUUID(), now));
    const updates = new Map(changed.map((index) => [review.changed[index].card.id, review.changed[index].draft]));
    data.value = {
      ...data.value,
      cards: [...data.value.cards.map((card) => {
        const draft = updates.get(card.id);
        return draft ? { ...card, name: draft.name, color: draft.color, notes: draft.notes } : card;
      }), ...created],
    };
    overlay = null;
    const total = created.length + updates.size;
    notifications.notify(app_id, { title: total === 1 ? "1 change applied" : `${total} changes applied` });
  }

  async function scan_import_code(text: string): Promise<boolean> {
    const framed = await take_frame(text);
    if (framed !== null) return framed;
    if (await import_payload(text)) return true;
    report("That QR code isn't from Cards", undefined, NotificationType.WARNING);
    return false;
  }

  async function scan_import_photo(file: File | undefined) {
    if (!file) return;
    const code = await scan_image(file);
    if (code) await scan_import_code(code.value);
  }

  async function collect_photos(): Promise<PhotoBlobs> {
    const photos: PhotoBlobs = new Map();
    for (const card of data.value.cards) {
      for (const side of Object.values(PhotoSide)) {
        if (!card.photos[side]) continue;
        const blob = await read_photo(files, card.id, side);
        if (blob) photos.set(archive_photo_name(card.id, side), blob);
      }
    }
    return photos;
  }

  async function export_file() {
    overlay = null;
    const target = await win.pick_save({ name: ARCHIVE_NAME, accept: [".zip"], title: "Export cards as" });
    if (!target) return;
    busy = true;
    try {
      const zip = await build_archive({ version: CARDS_VERSION, cards: data.value.cards }, await collect_photos());
      const directory = await files.get_directory(parent_path(target));
      if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
      await files.create_file(directory, base_name(target), { content: zip, overwrite: true });
      notifications.notify(app_id, { title: `Exported ${data.value.cards.length === 1 ? "1 card" : `${data.value.cards.length} cards`}`, message: target });
    } catch (reason) {
      report("Couldn't export the cards", reason);
    } finally {
      busy = false;
    }
  }

  async function import_file(file: File) {
    busy = true;
    try {
      const archive = await read_archive(file);
      const adopted = adopt_cards(archive.cards, archive.photos, () => crypto.randomUUID());
      const { added, skipped } = merge_cards(data.value.cards, adopted.map((entry) => entry.card));
      for (const card of added) {
        const photos = adopted.find((entry) => entry.card.id === card.id)?.photos ?? {};
        for (const [side, blob] of Object.entries(photos) as [PhotoSide, Blob][]) await write_photo(files, card.id, side, blob);
      }
      data.value = { ...data.value, cards: [...data.value.cards, ...added] };
      notifications.notify(app_id, {
        title: added.length === 1 ? "Imported 1 card" : `Imported ${added.length} cards`,
        message: skipped ? `${skipped} already here ${skipped === 1 ? "was" : "were"} skipped.` : undefined,
      });
    } catch (reason) {
      report("Couldn't import the file", reason);
    } finally {
      busy = false;
    }
  }

  async function pick_import_file() {
    const path = await win.pick_file({ accept: [".zip"], title: "Import cards" });
    if (!path) return;
    const file = await files.get_file(path).catch(() => null);
    if (file) await import_file(file);
    else report("File not found", path);
  }

  async function share_card(card: Card) {
    const payload = await encode_share([card]);
    const link = route_url({ kind: RouteKind.APP, id: app_id, props: { import: payload } });
    overlay = {
      kind: "share",
      title: `Share “${display_name(card)}”`,
      caption: "Scan with a phone camera to add this card in WebOS. No photos are shared.",
      text: fits_qr(link) ? link : null,
    };
  }

  async function share_list() {
    const frames = await encode_frames(CARDS_APP, compact_cards(sorted));
    overlay = {
      kind: "share",
      title: `Share ${cards.length === 1 ? "1 card" : `${cards.length} cards`}`,
      caption: `On the other device, open Cards › Add › Import from QR and point it here${frames.length > 1 ? " until all the codes are in" : ""}. You pick what to keep there; photos stay here.`,
      text: null,
      frames,
    };
  }

  function anchor_of(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: rect.left, y: rect.bottom };
  }

  async function add_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      [
        { id: "new", label: "New card", icon: PencilSimpleIcon },
        { id: "qr", label: "Import from QR", icon: QrCodeIcon },
        { id: "file", label: "Import file…", icon: FileZipIcon },
      ],
      { anchor: anchor_of(event) }
    );
    if (choice === "new") new_card();
    else if (choice === "qr") overlay = { kind: "import" };
    else if (choice === "file") void pick_import_file();
  }

  async function more_menu(event: MouseEvent) {
    const empty = cards.length === 0;
    const choice = await dialogs.menu(
      [
        { id: "share", label: "Share list as QR", icon: QrCodeIcon, disabled: empty },
        { id: "export", label: "Export as file…", icon: FileZipIcon, disabled: empty },
        { separator: true },
        { id: "import-qr", label: "Import from QR", icon: QrCodeIcon },
        { id: "import-file", label: "Import file…", icon: FileZipIcon },
      ],
      { anchor: anchor_of(event) }
    );
    if (choice === "share") void share_list();
    else if (choice === "export") void export_file();
    else if (choice === "import-qr") overlay = { kind: "import" };
    else if (choice === "import-file") void pick_import_file();
  }

  async function take_files(list: File[]) {
    const zip = list.find((file) => file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip");
    if (zip) return import_file(zip);
    const image = list.find((file) => file.type.startsWith("image/"));
    if (!image) return report("Cards takes a photo of a barcode or a Cards export", list[0]?.name, NotificationType.WARNING);
    if (overlay?.kind === "import") return scan_import_photo(image);
    const code = await scan_image(image);
    if (!code) return;
    if (await import_payload(code.value)) return;
    if (editing) editor?.apply_scan(code);
    else new_card(code);
  }

  function blocked(): boolean {
    return !win.is_focused || checkout_id !== null || dialogs.system.length > 0 || dialogs.for_window(window_id).length > 0;
  }

  function on_paste(event: ClipboardEvent) {
    if (blocked()) return;
    const target = event.target as Node | null;
    if (target && target !== document.body && !root?.contains(target)) return;
    const pasted = [...(event.clipboardData?.files ?? [])];
    if (pasted.length) {
      event.preventDefault();
      void take_files(pasted);
      return;
    }
    const element = event.target as HTMLElement | null;
    if (element?.closest("input, textarea, [contenteditable]")) return;
    const text = event.clipboardData?.getData("text") ?? "";
    if (!text.trim()) return;
    event.preventDefault();
    void import_payload(text).then((handled) => {
      if (!handled && overlay?.kind === "import") report("That isn't a Cards list", undefined, NotificationType.WARNING);
    });
  }

  function on_dragover(event: DragEvent) {
    if (!has_files(event) || checkout_id) return;
    event.preventDefault();
    dropping = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!(event.currentTarget as Node).contains(event.relatedTarget as Node | null)) dropping = false;
  }

  function on_drop(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dropping = false;
    void take_files([...(event.dataTransfer?.files ?? [])]);
  }

  $effect(() => {
    const ref = card_prop;
    if (!data.ready || data.error || !ref || ref === untrack(() => handled.value.card)) return;
    untrack(() => {
      handled.value = { ...handled.value, card: ref };
      const found = find_card(data.value.cards, ref);
      if (!found) return report(`No card called “${ref}”`, undefined, NotificationType.WARNING);
      editing = null;
      overlay = null;
      show_card(found.id);
      checkout_id = found.id;
    });
  });

  $effect(() => {
    const payload = import_prop;
    if (!data.ready || data.error || !payload || payload === untrack(() => handled.value.import)) return;
    untrack(() => {
      handled.value = { ...handled.value, import: payload };
      void import_payload(payload).then((handled) => {
        if (!handled) report("This link doesn't hold any cards", undefined, NotificationType.WARNING);
      });
    });
  });

  $effect(() => win.set_title(editing ? (editing.is_new ? "New card" : "Edit card") : open_card ? display_name(open_card) : null));

  $effect(() =>
    win.on_back(() => {
      if (checkout_id) checkout_id = null;
      else if (overlay) overlay = null;
      else if (editing) editing = null;
      else if (open_id.value) open_id.value = null;
      else return false;
      return true;
    })
  );
</script>

<svelte:document onpaste={on_paste} />

<div
  bind:this={root}
  role="presentation"
  class={cn("relative flex h-full min-h-0 flex-col", dropping && "ring-2 ring-primary ring-inset")}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  {#if !data.ready}
    <div class="grid flex-1 place-items-center"><Spinner label="Loading cards" /></div>
  {:else if data.error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't read your cards" description="{data.error}. The file is left as it is; nothing is saved until it's fixed or removed." />
  {:else if editing}
    {#key editing.id}
      <CardEditor
        bind:this={editor}
        id={editing.id}
        is_new={editing.is_new}
        initial={editing.initial}
        photos={editing.photos}
        detector={get_detector}
        onscanimage={scan_image}
        onsave={save_edit}
        oncancel={() => (editing = null)}
        onerror={report}
      />
    {/key}
  {:else if open_card}
    <CardView
      card={open_card}
      {photo_version}
      onback={() => (open_id.value = null)}
      onedit={() => edit_card(open_card)}
      ondelete={() => delete_card(open_card)}
      onpin={() => update(open_card.id, (entry) => ({ ...entry, pinned: !entry.pinned }))}
      oncheckout={() => (checkout_id = open_card.id)}
      onshare={() => share_card(open_card)}
    />
  {:else}
    <Toolbar>
      <span class="flex min-w-0 flex-1 items-baseline gap-2">
        <span class="text-ui font-medium">Cards</span>
        {#if cards.length > 0}<span class="font-mono text-2xs text-foreground/65 tabular-nums">{cards.length}</span>{/if}
      </span>
      <IconButton size="sm" label="More" onclick={more_menu}><DotsThreeIcon weight="bold" /></IconButton>
    </Toolbar>

    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if cards.length === 0}
        <EmptyState icon={CardsIcon} title="No cards yet" description="Add a loyalty card by scanning its barcode or typing its number. You can also drop or paste a photo of it here.">
          {#snippet actions()}
            <Button size="lg" onclick={() => (overlay = { kind: "import" })}><QrCodeIcon weight="bold" />Import from QR</Button>
          {/snippet}
        </EmptyState>
      {:else if shown.length === 0}
        <EmptyState icon={MagnifyingGlassIcon} title="No card matches “{query.trim()}”" description="Search looks at names, numbers and notes." />
      {:else}
        <ul class="grid grid-cols-2 gap-3 p-3 @lg:grid-cols-3 @3xl:grid-cols-4 @lg:p-4" aria-label="Cards">
          {#each shown as card (card.id)}
            <li class="min-w-0"><CardTile {card} onopen={() => show_card(card.id)} /></li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="flex shrink-0 items-center gap-2 border-t border-foreground/8 bg-background-light p-3">
      {#if cards.length > 0}
        <Input size="lg" inputmode="search" bind:value={query} placeholder="Search cards" aria-label="Search cards" class="flex-1" enterkeyhint="search">
          {#snippet leading()}<MagnifyingGlassIcon />{/snippet}
          {#snippet trailing()}
            {#if query}<IconButton size="sm" label="Clear search" onclick={() => (query = "")}><XIcon weight="bold" /></IconButton>{/if}
          {/snippet}
        </Input>
      {:else}
        <span class="flex-1"></span>
      {/if}
      <Button size="lg" variant="primary" onclick={add_menu}><PlusIcon weight="bold" />Add</Button>
    </div>
  {/if}

  {#if overlay?.kind === "share"}
    <QrShare title={overlay.title} caption={overlay.caption} text={overlay.text} frames={overlay.frames} onclose={() => (overlay = null)} onfile={export_file} />
  {:else if overlay?.kind === "import"}
    <QrImport
      detector={get_detector}
      oncode={scan_import_code}
      onphoto={async () => scan_import_photo((await pick_device_files({ accept: ["image/*"] }))[0])}
      onclose={() => ((overlay = null), collector.reset(), (collected = null))}
      onerror={report}
      progress={collected}
    />
  {:else if overlay?.kind === "review"}
    {@const review = overlay.review}
    <CardsReviewSheet {review} onapply={(added, changed) => apply_review(review, added, changed)} onclose={() => (overlay = null)} />
  {/if}

  {#if checkout_card}
    <Checkout card={checkout_card} onclose={() => (checkout_id = null)} />
  {/if}

  {#if busy}
    <div class="absolute inset-0 z-30 grid place-items-center bg-background/60"><Spinner label="Working" /></div>
  {/if}
</div>
