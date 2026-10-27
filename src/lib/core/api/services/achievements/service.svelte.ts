import { SvelteMap } from "svelte/reactivity";
import type { Kernel } from "../../kernel/kernel.svelte";
import type { AppsService, AppId, AppListing } from "../apps/type";
import { AppCategory } from "../apps/type";
import type { FilesService } from "../files/type";
import type { NotificationsService } from "../notifications/type";
import { split_path } from "../files/path";
import type { AchievementsService as IAchievementsService, Achievement, AchievementEntry } from "./type";
import { ACHIEVEMENTS_FILE, achievements_path, empty_record, parse_record, same_record, serialize_record, type AchievementRecord } from "./persistence";
import { achievements_lock } from "./validate";
import { apply_achieve, apply_progress, builtin_entries, declared_entries } from "./entries";
import { fetch_definitions, type Definitions } from "./definitions";
import { achievements_shell } from "./shell";

const DefinitionsState = { IDLE: "idle", LOADING: "loading", LOADED: "loaded", FAILED: "failed" } as const;
type DefinitionsState = (typeof DefinitionsState)[keyof typeof DefinitionsState];

const DEFINITIONS_RETRY_MS = 30_000;

export class AchievementsService implements IAchievementsService {
  name = "AchievementsService";
  description = "Achievements apps declare and report";
  inspector = () => import("./inspector.svelte");
  shell = () => achievements_shell(this, () => this.apps_service);

  to_string(): string {
    const unlocked = [...this.records.values()].reduce((sum, record) => sum + Object.keys(record.unlocked).length, 0);
    return `AchievementsService: ${this.records.size} apps read, ${unlocked} unlocked`;
  }

  private files_service!: FilesService;
  private notifications_service!: NotificationsService;
  private apps_service!: AppsService;

  /** What each app's file held when last read or written by this tab. */
  private readonly records = new SvelteMap<AppId, AchievementRecord>();
  private readonly reading = new Map<AppId, Promise<void>>();
  private readonly queues = new Map<AppId, Promise<void>>();
  private definitions: Definitions | null = $state.raw(null);
  private definitions_state: DefinitionsState = $state(DefinitionsState.IDLE);
  private definitions_loading: Promise<void> = Promise.resolve();
  private definitions_retry_at = 0;
  private cleanups: (() => void)[] = [];

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
    this.apps_service = $derived(this.kernel.service<AppsService>("apps"));
  }

  init(): void {
    // Another tab's unlocks: read again when this one comes back, without toasting them.
    const on_visibility = () => {
      if (document.visibilityState !== "visible") return;
      for (const id of this.records.keys()) void this.read_into(id);
    };
    document.addEventListener("visibilitychange", on_visibility);
    this.cleanups.push(() => document.removeEventListener("visibilitychange", on_visibility));
    const on_online = () => {
      if (this.definitions_state !== DefinitionsState.FAILED) return;
      this.definitions_retry_at = 0;
      this.definitions_state = DefinitionsState.IDLE;
    };
    window.addEventListener("online", on_online);
    this.cleanups.push(() => window.removeEventListener("online", on_online));
  }

  destroy(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  public achieve(app_id: AppId, id: string): void {
    if (this.records.get(app_id)?.unlocked[id] !== undefined) return;
    this.enqueue(app_id, async () => {
      const def = await this.definition(app_id, id);
      if (def) await this.commit(app_id, (record) => apply_achieve(record, id, Date.now()));
    });
  }

  public progress(app_id: AppId, id: string, n: number): void {
    // Not `progress >= n`: uninstalling with data clears the file's progress behind this tab's back.
    if (this.records.get(app_id)?.unlocked[id] !== undefined) return;
    this.enqueue(app_id, async () => {
      const def = await this.definition(app_id, id);
      if (!def) return;
      if (def.goal === undefined) return console.warn(`[AchievementsService] ${app_id}: "${id}" has no goal; use achieve()`);
      await this.commit(app_id, (record) => apply_progress(record, def, n, Date.now()));
    });
  }

  public list(app_id?: AppId): AchievementEntry[] {
    const listings = this.apps_service.listings();
    if (app_id !== undefined) {
      const listing = listings.find((item) => item.id === app_id);
      return listing ? this.entries_of(listing) : [];
    }
    return listings
      .filter((listing) => (listing.achievement_count ?? 0) > 0 || this.apps_service.usage(listing.id) !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((listing) => this.entries_of(listing));
  }

  public async idle(): Promise<void> {
    // Lets reads and fetches that `list()` queued start first.
    await Promise.resolve();
    await Promise.all([...this.queues.values(), ...this.reading.values(), this.definitions_loading]);
  }

  /** The app's declared achievements: from its manifest once loaded, else from the build's side file. */
  private declared(listing: AppListing): readonly Achievement[] {
    const own = this.apps_service.get(listing.id)?.achievements;
    if (own) return own;
    if (!listing.achievement_count) return [];
    if (this.wants_definitions()) queueMicrotask(() => void this.load_definitions());
    return this.definitions?.[listing.id] ?? [];
  }

  private entries_of(listing: AppListing): AchievementEntry[] {
    const game = !listing.system && listing.category === AppCategory.GAMES;
    const declared = this.declared(listing);
    // Read with the definitions, not after them: `idle()` then covers both.
    const record = declared.length > 0 || (listing.achievement_count ?? 0) > 0 ? this.record(listing.id) : empty_record();
    return [...declared_entries(listing.id, declared, record), ...builtin_entries(listing.id, this.apps_service.usage(listing.id), game)];
  }

  // Read inside `$derived`, which may not write state: the read starts after it.
  private record(app_id: AppId): AchievementRecord {
    const record = this.records.get(app_id);
    if (!record && !this.reading.has(app_id)) queueMicrotask(() => void this.read_into(app_id));
    return record ?? empty_record();
  }

  private read_into(app_id: AppId): Promise<void> {
    let pending = this.reading.get(app_id);
    if (!pending) {
      pending = navigator.locks
        .request(achievements_lock(app_id), async (): Promise<void> => this.set_record(app_id, parse_record(await this.read(app_id))))
        .then(() => {})
        .catch((error: unknown) => console.warn(`[AchievementsService] Couldn't read ${app_id}'s achievements`, error))
        .finally(() => this.reading.delete(app_id));
      this.reading.set(app_id, pending);
    }
    return pending;
  }

  private wants_definitions(): boolean {
    return this.definitions_state === DefinitionsState.IDLE || (this.definitions_state === DefinitionsState.FAILED && Date.now() >= this.definitions_retry_at);
  }

  private load_definitions(): Promise<void> {
    if (!this.wants_definitions()) return this.definitions_loading;
    this.definitions_state = DefinitionsState.LOADING;
    this.definitions_loading = fetch_definitions().then((definitions) => {
      this.definitions = definitions;
      this.definitions_state = definitions ? DefinitionsState.LOADED : DefinitionsState.FAILED;
      if (!definitions) this.definitions_retry_at = Date.now() + DEFINITIONS_RETRY_MS;
    });
    return this.definitions_loading;
  }

  private async definition(app_id: AppId, id: string): Promise<Achievement | null> {
    const manifest = await this.apps_service.load(app_id).catch(() => undefined);
    const def = manifest?.achievements?.find((item) => item.id === id) ?? null;
    if (!def) console.warn(`[AchievementsService] ${app_id} declares no achievement "${id}"`);
    return def;
  }

  private enqueue(app_id: AppId, task: () => Promise<void>): void {
    const next = (this.queues.get(app_id) ?? Promise.resolve())
      .then(task)
      .catch((error: unknown) => console.warn(`[AchievementsService] Couldn't save ${app_id}'s achievements`, error));
    this.queues.set(app_id, next);
    void next.finally(() => {
      if (this.queues.get(app_id) === next) this.queues.delete(app_id);
    });
  }

  /**
   * Under the app's lock the file is the truth: every tab writes it before updating memory. An unlock another tab
   * saved is already in it, so only what this change adds toasts, and only once it's on disk.
   */
  private async commit(app_id: AppId, change: (record: AchievementRecord) => AchievementRecord | null): Promise<void> {
    const added = await navigator.locks.request(achievements_lock(app_id), async () => {
      const disk = parse_record(await this.read(app_id));
      const next = change(disk);
      if (next) await this.write(app_id, serialize_record(next));
      this.set_record(app_id, next ?? disk);
      return next ? Object.keys(next.unlocked).filter((id) => disk.unlocked[id] === undefined) : [];
    });
    for (const id of added) await this.toast(app_id, id);
  }

  private set_record(app_id: AppId, record: AchievementRecord): void {
    const current = this.records.get(app_id);
    if (!current || !same_record(current, record)) this.records.set(app_id, record);
  }

  private async toast(app_id: AppId, id: string): Promise<void> {
    const manifest = await this.apps_service.load(app_id).catch(() => undefined);
    const def = manifest?.achievements?.find((item) => item.id === id);
    if (!manifest || !def) return;
    this.notifications_service.notify(app_id, { title: `Achievement: ${def.title}`, message: def.text, icon: manifest.icon });
  }

  private async write(app_id: AppId, text: string): Promise<void> {
    const files = this.files_service;
    let directory = await files.get_root();
    for (const segment of split_path(achievements_path(app_id)).slice(0, -1)) {
      directory = (await files.exists(directory, segment, "directory")) ? await directory.getDirectoryHandle(segment) : await files.create_directory(directory, segment);
    }
    await files.create_file(directory, ACHIEVEMENTS_FILE, { content: text, overwrite: true });
  }

  private async read(app_id: AppId): Promise<string | null> {
    const file = await this.files_service.get_file(achievements_path(app_id));
    return file ? file.text() : null;
  }
}
