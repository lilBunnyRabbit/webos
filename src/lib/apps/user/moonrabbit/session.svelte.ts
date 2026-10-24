import type { FilesService } from "$lib/core/api";
import { activity_list, type ActivityDef } from "./activities";
import {
  additional_data,
  from_base64,
  inbox_private_key,
  Item,
  open,
  open_json,
  random_id,
  seal,
  seal_json,
  type JournalHeader,
} from "./crypto";
import { inbox_id, inbox_path, read_inbox_item } from "./inbox";
import {
  ENTRIES_DIR,
  EntrySchema,
  EMPTY_INDEX,
  IndexSchema,
  INDEX_FILE,
  index_entry,
  MEDIA_DIR,
  newest_first,
  media_of,
  type Entry,
  type IndexEntry,
  type JournalIndex,
} from "./journal";
import { track_unlocked } from "./sessions";
import { child, read_bin, remove_bin, write_bin, type JournalRef } from "./store";
import { image_kind } from "$kit/utils/exif/containers";
import { ImageKind } from "$kit/utils/exif/type";

export class LockedError extends Error {
  constructor() {
    super("The journal is locked");
    this.name = "LockedError";
  }
}

// Photos are WebP where the browser encodes it; Safari hands back PNG, so the type comes from the bytes.
export function media_type(bytes: Uint8Array): string {
  return `image/${image_kind(bytes) ?? ImageKind.WEBP}`;
}

/**
 * One unlocked journal in one window. The data key and everything decrypted live here and nowhere else; `lock()` drops
 * them all, revokes photo URLs and tells the window.
 */
export class JournalSession {
  index = $state.raw<IndexEntry[]>([]);
  activities = $state.raw<ActivityDef[]>(activity_list(undefined));
  /** Entries merged from the inbox since this unlock: "N new entries since last unlock". */
  arrived = $state(0);
  /** Inbox items that failed their tag: left in `inbox/`, never merged. */
  unreadable = $state(0);
  ref: JournalRef & { header: JournalHeader };
  locked = $state(false);
  /** The camera or the phone's file chooser hides the page; the hidden-lock waits while one this session opened is up. */
  picking = $state(0);

  private key: CryptoKey | null;
  private readonly bodies = new Map<string, Entry>();
  private readonly urls = new Map<string, Promise<string>>();
  private readonly flushers = new Set<() => void>();
  private readonly untrack: () => void;

  constructor(
    private readonly files: () => FilesService,
    ref: JournalRef & { header: JournalHeader },
    key: CryptoKey,
    private readonly on_lock: () => void
  ) {
    this.ref = $state.raw(ref);
    this.key = key;
    this.untrack = track_unlocked(this);
  }

  get id(): string {
    return this.ref.header.id;
  }

  private get unlocked_key(): CryptoKey {
    if (!this.key) throw new LockedError();
    return this.key;
  }

  private aad(item: string) {
    return additional_data(this.id, item);
  }

  /** Pending edits start their save here; a save captures the key first, so it lands even though the key goes now. */
  before_lock(flush: () => void): () => void {
    this.flushers.add(flush);
    return () => this.flushers.delete(flush);
  }

  lock(): void {
    if (this.locked) return;
    for (const flush of [...this.flushers]) flush();
    this.flushers.clear();
    this.key = null;
    this.locked = true;
    this.bodies.clear();
    for (const url of this.urls.values()) void url.then(URL.revokeObjectURL, () => undefined);
    this.urls.clear();
    this.index = [];
    this.activities = activity_list(undefined);
    this.untrack();
    this.on_lock();
  }

  private async read_index(key: CryptoKey): Promise<JournalIndex> {
    const bytes = await read_bin(this.files(), child(this.ref.path, INDEX_FILE));
    if (!bytes) return EMPTY_INDEX;
    return IndexSchema.parse(await open_json(key, this.aad(Item.INDEX), bytes));
  }

  private show(index: JournalIndex): void {
    if (this.locked) return;
    this.index = [...index.entries].sort(newest_first);
    this.activities = activity_list(index.activities);
  }

  async load_index(): Promise<void> {
    this.show(await this.read_index(this.unlocked_key));
  }

  /** Under a Web Lock per journal, read fresh: two windows saving at once both land. */
  private async edit_index(key: CryptoKey, change: (index: JournalIndex) => JournalIndex): Promise<void> {
    await navigator.locks.request(`moonrabbit:${this.id}`, async () => {
      const next = change(await this.read_index(key));
      const sealed = await seal_json(key, this.aad(Item.INDEX), next);
      await write_bin(this.files(), this.ref.path, INDEX_FILE, sealed);
      this.show(next);
    });
  }

  private edit_entries(key: CryptoKey, change: (entries: IndexEntry[]) => IndexEntry[]): Promise<void> {
    return this.edit_index(key, (index) => ({ ...index, entries: change(index.entries) }));
  }

  async set_activities(activities: ActivityDef[]): Promise<void> {
    await this.edit_index(this.unlocked_key, (index) => ({ ...index, activities }));
  }

  /**
   * Items added while locked become entries under the data key, then their inbox files go. The item id is the entry id,
   * so a merge cut short (or two windows merging at once) never makes a duplicate.
   */
  async merge_inbox(): Promise<number> {
    const key = this.unlocked_key;
    return navigator.locks.request(`moonrabbit:${this.id}:inbox`, async () => {
      const folder = await this.files().get_directory(inbox_path(this.ref));
      if (!folder) return 0;
      const ids = (await this.files().list(folder)).flatMap((item) =>
        item.kind === "file" ? (inbox_id(item.name) ?? []) : []
      );
      if (!ids.length) return 0;
      const private_key = await inbox_private_key(this.ref.header, key);
      const entries: Entry[] = [];
      let unreadable = 0;
      for (const id of ids) {
        const bytes = await read_bin(this.files(), child(inbox_path(this.ref), `${id}.bin`));
        if (!bytes) continue;
        try {
          entries.push(await read_inbox_item(this.ref.header, private_key, id, bytes));
        } catch {
          unreadable++;
        }
      }
      for (const entry of entries) {
        await write_bin(
          this.files(),
          child(this.ref.path, ENTRIES_DIR),
          `${entry.id}.bin`,
          await seal_json(key, this.aad(Item.entry(entry.id)), entry)
        );
      }
      if (entries.length) {
        const merged = new Set(entries.map((entry) => entry.id));
        await this.edit_entries(key, (list) => [
          ...list.filter((meta) => !merged.has(meta.id)),
          ...entries.map(index_entry),
        ]);
      }
      for (const entry of entries)
        await this.files()
          .delete_entry(folder, `${entry.id}.bin`)
          .catch(() => undefined);
      if (!this.locked) {
        this.arrived += entries.length;
        this.unreadable = unreadable;
      }
      return entries.length;
    });
  }

  async entry(id: string): Promise<Entry> {
    const cached = this.bodies.get(id);
    if (cached) return cached;
    const bytes = await read_bin(this.files(), child(this.ref.path, `${ENTRIES_DIR}/${id}.bin`));
    if (!bytes) throw new Error("This entry's file is missing");
    const entry = EntrySchema.parse(await open_json(this.unlocked_key, this.aad(Item.entry(id)), bytes));
    if (!this.locked) this.bodies.set(id, entry);
    return entry;
  }

  async all_entries(): Promise<Entry[]> {
    return Promise.all(this.index.map((meta) => this.entry(meta.id)));
  }

  new_entry(date: string, body: string, template?: string): Entry {
    const now = Date.now();
    return { id: random_id(), date, created: now, updated: now, body, ...(template ? { template } : {}) };
  }

  async save(entry: Entry): Promise<Entry> {
    const key = this.unlocked_key;
    const saved = { ...entry, updated: Date.now() };
    const previous = this.bodies.get(entry.id);
    const sealed = await seal_json(key, this.aad(Item.entry(entry.id)), saved);
    await write_bin(this.files(), child(this.ref.path, ENTRIES_DIR), `${entry.id}.bin`, sealed);
    if (!this.locked) this.bodies.set(entry.id, saved);
    await this.edit_entries(key, (entries) => [...entries.filter((meta) => meta.id !== entry.id), index_entry(saved)]);
    if (previous) {
      const kept = new Set(media_of(saved.body));
      for (const id of media_of(previous.body)) if (!kept.has(id)) await this.remove_media(id);
    }
    return saved;
  }

  async remove(id: string): Promise<void> {
    const key = this.unlocked_key;
    const entry = await this.entry(id).catch(() => null);
    await this.edit_entries(key, (entries) => entries.filter((meta) => meta.id !== id));
    await remove_bin(this.files(), child(this.ref.path, ENTRIES_DIR), `${id}.bin`);
    for (const media of entry ? media_of(entry.body) : []) await this.remove_media(media);
    this.bodies.delete(id);
  }

  /** A new entry closed before its first save: only the photos it already wrote exist. */
  async discard(entry: Entry): Promise<void> {
    for (const media of media_of(entry.body)) await this.remove_media(media);
  }

  /** `data_url` is the downscaled picture from `picture_data_url`; only its bytes are kept, encrypted. */
  async add_media(data_url: string): Promise<string> {
    const id = random_id();
    const bytes = from_base64(data_url.slice(data_url.indexOf(",") + 1));
    await write_bin(
      this.files(),
      child(this.ref.path, MEDIA_DIR),
      `${id}.bin`,
      await seal(this.unlocked_key, this.aad(Item.media(id)), bytes)
    );
    this.urls.set(id, Promise.resolve(URL.createObjectURL(new Blob([bytes], { type: media_type(bytes) }))));
    return id;
  }

  private async remove_media(id: string): Promise<void> {
    await remove_bin(this.files(), child(this.ref.path, MEDIA_DIR), `${id}.bin`);
    const url = this.urls.get(id);
    this.urls.delete(id);
    if (url) void url.then(URL.revokeObjectURL, () => undefined);
  }

  async media_bytes(id: string): Promise<Uint8Array<ArrayBuffer>> {
    const bytes = await read_bin(this.files(), child(this.ref.path, `${MEDIA_DIR}/${id}.bin`));
    if (!bytes) throw new Error("A photo's file is missing");
    return open(this.unlocked_key, this.aad(Item.media(id)), bytes);
  }

  media_url(id: string): Promise<string> {
    let url = this.urls.get(id);
    if (!url) {
      url = this.media_bytes(id).then((bytes) => {
        if (this.locked) throw new LockedError();
        return URL.createObjectURL(new Blob([bytes], { type: media_type(bytes) }));
      });
      this.urls.set(id, url);
      url.catch(() => this.urls.delete(id));
    }
    return url;
  }

  set_ref(ref: JournalRef & { header: JournalHeader }): void {
    this.ref = ref;
  }
}
