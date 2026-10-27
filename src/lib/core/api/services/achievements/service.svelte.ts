import { SvelteMap } from "svelte/reactivity";
import type { Kernel } from "../../kernel/kernel.svelte";
import type { AppsService, AppId, AppListing } from "../apps/type";
import { AppCategory } from "../apps/type";
import type { FilesService } from "../files/type";
import type { NotificationsService } from "../notifications/type";
import { LatestWriter } from "../files/latest-writer";
import type { AchievementsService as IAchievementsService, Achievement, AchievementEntry } from "./type";
import { achievements_path, empty_record, merge_records, parse_record, same_record, serialize_record, type AchievementRecord } from "./persistence";
import { apply_achieve, apply_progress, builtin_entries, declared_entries } from "./entries";
import { fetch_definitions, type Definitions } from "./definitions";
import { achievements_shell } from "./shell";

const DefinitionsState = { IDLE: "idle", LOADING: "loading", LOADED: "loaded", FAILED: "failed" } as const;
type DefinitionsState = (typeof DefinitionsState)[keyof typeof DefinitionsState];

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

  /** What each app's file held when last read, merged with this tab's changes. */
  private readonly records = new SvelteMap<AppId, AchievementRecord>();
  private readonly reading = new Map<AppId, Promise<void>>();
  private readonly queues = new Map<AppId, Promise<void>>();
  private readonly writers = new Map<AppId, LatestWriter>();
  private definitions: Definitions | null = $state.raw(null);
  private definitions_state: DefinitionsState = $state(DefinitionsState.IDLE);
  private definitions_loading: Promise<void> = Promise.resolve();
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
      if (this.definitions_state === DefinitionsState.FAILED) this.definitions_state = DefinitionsState.IDLE;
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
    const record = this.records.get(app_id);
    if (record && (record.unlocked[id] !== undefined || (record.progress[id] ?? 0) >= n)) return;
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
    await Promise.all([...this.writers.values()].map((writer) => writer.idle()));
  }

  /** The app's declared achievements: from its manifest once loaded, else from the build's side file. */
  private declared(listing: AppListing): readonly Achievement[] {
    const own = this.apps_service.get(listing.id)?.achievements;
    if (own) return own;
    if (!listing.achievement_count) return [];
    if (this.definitions_state === DefinitionsState.IDLE) queueMicrotask(() => void this.load_definitions());
    return this.definitions?.[listing.id] ?? [];
  }

  private entries_of(listing: AppListing): AchievementEntry[] {
    const game = !listing.system && listing.category === AppCategory.GAMES;
    const declared = this.declared(listing);
    const record = declared.length > 0 ? this.record(listing.id) : empty_record();
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
      pending = this.read(app_id)
        .then((text) => {
          const current = this.records.get(app_id);
          const merged = current ? merge_records(current, parse_record(text)) : parse_record(text);
          if (!current || !same_record(current, merged)) this.records.set(app_id, merged);
        })
        .catch((error: unknown) => console.warn(`[AchievementsService] Couldn't read ${app_id}'s achievements`, error))
        .finally(() => this.reading.delete(app_id));
      this.reading.set(app_id, pending);
    }
    return pending;
  }

  private load_definitions(): Promise<void> {
    if (this.definitions_state === DefinitionsState.LOADING || this.definitions_state === DefinitionsState.LOADED) return this.definitions_loading;
    this.definitions_state = DefinitionsState.LOADING;
    this.definitions_loading = fetch_definitions().then((definitions) => {
      this.definitions = definitions;
      this.definitions_state = definitions ? DefinitionsState.LOADED : DefinitionsState.FAILED;
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
   * Merges the file first: an unlock another tab saved is already in `current`, so only what this change adds toasts.
   */
  private async commit(app_id: AppId, change: (record: AchievementRecord) => AchievementRecord | null): Promise<void> {
    const disk = parse_record(await this.read(app_id));
    const current = merge_records(this.records.get(app_id) ?? empty_record(), disk);
    const next = change(current) ?? current;
    this.records.set(app_id, next);
    if (!same_record(next, disk)) this.writer(app_id).write(serialize_record(next));
    for (const id of Object.keys(next.unlocked)) if (current.unlocked[id] === undefined) await this.toast(app_id, id);
  }

  private async toast(app_id: AppId, id: string): Promise<void> {
    const manifest = await this.apps_service.load(app_id).catch(() => undefined);
    const def = manifest?.achievements?.find((item) => item.id === id);
    if (!manifest || !def) return;
    this.notifications_service.notify(app_id, { title: `Achievement: ${def.title}`, message: def.text, icon: manifest.icon });
  }

  private writer(app_id: AppId): LatestWriter {
    let writer = this.writers.get(app_id);
    if (!writer) {
      writer = new LatestWriter(() => this.files_service, achievements_path(app_id), `${app_id} achievements`);
      this.writers.set(app_id, writer);
    }
    return writer;
  }

  private async read(app_id: AppId): Promise<string | null> {
    const file = await this.files_service.get_file(achievements_path(app_id));
    return file ? file.text() : null;
  }
}
