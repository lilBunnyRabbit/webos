import type {
  AppsService,
  DialogsService,
  FilesService,
  Kernel,
  NotificationId,
  NotificationsService,
  SessionService,
} from "$lib/core/api";
import { untrack } from "svelte";
import { ArrowCircleUp as ArrowCircleUpIcon, Sparkle as SparkleIcon } from "phosphor-svelte";
import { LatestWriter } from "../files/latest-writer";
import { SessionStatus } from "../session/type";
import { introduced_apps } from "./history";
import { VERSION_STATE_PATH, parse_seen, serialize_seen } from "./persistence";
import { compare_versions } from "./semver";
import { scope_caches, strip_update_param, with_update_param } from "./update";
import { count_cached, keys_to_download, parse_precache_manifest, precache_cache_name } from "./precache";
import {
  ChangeKind,
  UpdateStage,
  type AppIntroduction,
  type Release,
  type UpdateProgress,
  type VersionInfo,
  type VersionService as IVersionService,
} from "./type";
import { version_shell } from "./shell";

declare const __VERSION_INFO__: VersionInfo;

const POLL_INTERVAL = 30 * 60 * 1000; // 30 minutes
const VISIBILITY_THROTTLE = 60 * 1000; // 1 minute
const SLOW_AFTER = 8000;
/** Gives up on the new worker when no file has landed for this long, or after `INSTALL_LIMIT` in all. */
const STALL_TIMEOUT = 20_000;
const INSTALL_LIMIT = 120_000;
/** `registration.update()` only fetches sw.js; it has no timeout of its own. */
const UPDATE_TIMEOUT = 15_000;
const PROGRESS_POLL = 400;
/** Long enough for a stage to paint before the next one, or the page, replaces it. */
const STAGE_BEAT = 250;

const intro_dialog = () => import("$lib/core/components/intro/intro-dialog.svelte");
const announcement_dialog = () => import("$lib/core/components/announcement/app-announcement.svelte");

export class VersionService implements IVersionService {
  name = "VersionService";
  description = "Build info, update detection, release notes and the introduction";
  inspector = () => import("./inspector.svelte");
  shell = () => version_shell(this, () => this.apps_service);

  public info = $state<VersionInfo>(__VERSION_INFO__);
  public update_available = $state<VersionInfo | null>(null);
  public is_checking = $state(false);
  public update_stage = $state<UpdateStage>(UpdateStage.IDLE);
  public update_progress = $state<UpdateProgress | null>(null);
  private restart?: () => void;

  public changelog = $state.raw<Release[]>([]);
  private loading: Promise<Release[]> | null = null;

  public load_changelog(): Promise<Release[]> {
    return (this.loading ??= import("./changelog").then(({ CHANGELOG }) => (this.changelog = CHANGELOG)));
  }
  public unseen = $state<Release[]>([]);
  public announced = $state<AppIntroduction[]>([]);

  private last_check = 0;
  private notified_build = 0;
  private update_toast: NotificationId | null = null;
  private poll_interval?: ReturnType<typeof setInterval>;
  private destroyed = false;
  private dispose_announcement?: () => void;

  private files_service!: FilesService;
  private notifications_service!: NotificationsService;
  private dialogs_service!: DialogsService;
  private apps_service!: AppsService;
  private session_service!: SessionService;

  private writer = new LatestWriter(() => this.files_service, VERSION_STATE_PATH, "version state");

  private on_visibility_change = () => {
    if (document.visibilityState === "visible" && Date.now() - this.last_check > VISIBILITY_THROTTLE) {
      this.check();
    }
  };

  // Vite fires this when a lazy chunk fails to load anywhere (dialogs, shell bodies, sections). After a deploy that means this
  // tab runs a replaced build, so check now and ask again even if this build was announced and the toast dismissed.
  private on_preload_error = async () => {
    await this.check();
    if (this.update_available) this.notify_update_available(this.update_available, true);
  };

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
    this.dialogs_service = $derived(this.kernel.service<DialogsService>("dialogs"));
    this.apps_service = $derived(this.kernel.service<AppsService>("apps"));
    this.session_service = $derived(this.kernel.service<SessionService>("session"));
  }

  async init() {
    const clean = strip_update_param(location.href);
    if (clean) history.replaceState(history.state, "", clean);

    this.poll_interval = setInterval(() => this.check(), POLL_INTERVAL);
    document.addEventListener("visibilitychange", this.on_visibility_change);
    window.addEventListener("vite:preloadError", this.on_preload_error);

    const file = await this.files_service.get_file(VERSION_STATE_PATH);
    const seen = file ? parse_seen(await file.text()) : null;

    if (seen === null) {
      // Off the boot chunk: the samples are only ever written once (ADR-041).
      void import("./samples")
        .then(({ seed_samples }) => seed_samples(this.files_service))
        .catch((error) => console.error("[VersionService] Failed to add sample files", error));
      // Loaded during boot, so the introduction is already up when the splash goes. Only a first boot waits for the meta.
      await Promise.all([intro_dialog(), this.apps_service.meta_ready]);
      // Not awaited: the kernel awaits init() before mounting, and the dialog only renders once the shell is mounted.
      this.show_intro().then(() => {
        if (!this.destroyed) this.writer.write(serialize_seen(this.info.version));
      });
      return;
    }

    if (compare_versions(seen, this.info.version) >= 0) return;

    await this.load_changelog();
    this.unseen = this.changelog.filter(
      (release) =>
        compare_versions(release.version, seen) > 0 && compare_versions(release.version, this.info.version) <= 0
    );
    this.writer.write(serialize_seen(this.info.version));
    if (this.unseen.length > 0) this.notify_updated();

    this.announced = introduced_apps(this.unseen).filter(({ app }) => this.apps_service.get(app));
    if (this.announced.length > 0) this.announce_after_restore();
  }

  destroy() {
    this.destroyed = true;
    this.dispose_announcement?.();
    clearInterval(this.poll_interval);
    document.removeEventListener("visibilitychange", this.on_visibility_change);
    window.removeEventListener("vite:preloadError", this.on_preload_error);
  }

  to_string(): string {
    return `VersionService: v${this.info.version} (${this.info.commit})`;
  }

  async check(): Promise<void> {
    if (this.is_checking) return;
    this.is_checking = true;
    this.last_check = Date.now();

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: "no-store" });
      if (!response.ok) return;

      const remote: VersionInfo = await response.json();
      if (remote.buildTimestamp > this.info.buildTimestamp) {
        this.update_available = remote;
        this.notify_update_available(remote);
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
    } finally {
      this.is_checking = false;
    }
  }

  async apply_update(): Promise<void> {
    if (this.update_stage !== UpdateStage.IDLE) return;
    this.update_stage = UpdateStage.INSTALLING;
    this.update_progress = { started: Date.now(), done: 0, total: null, slow: false };
    await beat();

    // The service worker serves the app shell from its precache, so a plain reload would boot the old build. The happy
    // path fetches the new worker; it skips waiting and claims this page, and the reload loads its precache.
    const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
    const stop = new AbortController();
    const given_up = new Promise<false>((resolve) => (this.restart = () => resolve(false)));
    const timers = [
      setTimeout(() => {
        if (this.update_progress) this.update_progress.slow = true;
      }, SLOW_AFTER),
      setTimeout(() => this.restart?.(), INSTALL_LIMIT),
    ];
    try {
      if (registration && (await Promise.race([this.install(registration, stop.signal), given_up]))) {
        return this.reload();
      }
    } catch (error) {
      console.warn("[VersionService] Service worker update failed, clearing instead", error);
    } finally {
      stop.abort();
      timers.forEach(clearTimeout);
      this.restart = undefined;
    }
    this.update_progress = null;

    // No new worker: GitHub Pages' CDN can serve the old sw.js for minutes after version.json changed. Drop this app's
    // worker and caches (never another app's: every lilbunnyrabbit.github.io site shares the origin) and load from the network.
    this.update_stage = UpdateStage.CLEARING;
    try {
      await registration?.unregister();
      const keys = await caches.keys();
      await Promise.all(
        scope_caches(keys, registration?.scope ?? new URL(import.meta.env.BASE_URL, location.origin).href).map((key) =>
          caches.delete(key)
        )
      );
    } catch (error) {
      console.warn("[VersionService] Couldn't clear the old build", error);
    }
    await beat();
    this.reload();
  }

  restart_update(): void {
    this.restart?.();
  }

  private async install(registration: ServiceWorkerRegistration, signal: AbortSignal): Promise<boolean> {
    const cache_name = precache_cache_name(registration.scope);
    // Taken before update(): the install starts as soon as sw.js arrives, and what it stores counts as downloaded.
    const before = await cached_keys(cache_name);
    await with_timeout(registration.update(), UPDATE_TIMEOUT, "sw.js didn't arrive");
    const worker = registration.installing ?? registration.waiting;
    if (!worker || signal.aborted) return false;
    void this.track_install(worker, cache_name, before, signal);
    await activated(worker);
    return true;
  }

  // Workbox stores each file in the precache as it lands, one at a time, so the cache's keys are the progress. No
  // change to the worker needed. Bytes aren't counted: the manifest has no sizes.
  private async track_install(worker: ServiceWorker, cache_name: string, before: Set<string>, signal: AbortSignal) {
    try {
      const response = await fetch(worker.scriptURL, { cache: "no-cache", signal });
      const manifest = parse_precache_manifest(await response.text());
      if (manifest.length === 0) return;
      const needed = keys_to_download(manifest, worker.scriptURL, before);
      let changed = Date.now();
      while (!signal.aborted && this.update_progress) {
        const done = count_cached(needed, await cached_keys(cache_name));
        if (signal.aborted || !this.update_progress) return;
        if (done !== this.update_progress.done) changed = Date.now();
        this.update_progress.done = done;
        this.update_progress.total = needed.length;
        if (done < needed.length && Date.now() - changed > STALL_TIMEOUT) return this.restart?.();
        await delay(PROGRESS_POLL);
      }
    } catch (error) {
      if (!signal.aborted) console.warn("[VersionService] Couldn't follow the download", error);
    }
  }

  private reload(): void {
    this.update_stage = UpdateStage.RELOADING;
    this.update_progress = null;
    // A plain reload can replay the old navigation from the HTTP cache; a new query forces a fresh document.
    setTimeout(() => location.replace(with_update_param(location.href, Date.now())), STAGE_BEAT);
  }

  async show_intro(): Promise<void> {
    const [{ default: component }] = await Promise.all([intro_dialog(), this.apps_service.meta_ready]);
    await this.dialogs_service.show(component, {}, { dismissible: false });
  }

  // Like RouterService's links: after the Restore answer, so an app opened from it lands above the restored windows.
  private announce_after_restore(): void {
    let shown = false;
    this.dispose_announcement = $effect.root(() => {
      $effect(() => {
        if (shown || this.session_service.status === SessionStatus.PENDING) return;
        shown = true;
        untrack(() => this.show_announcement());
      });
    });
  }

  private async show_announcement(): Promise<void> {
    const [{ default: component }] = await Promise.all([announcement_dialog(), this.apps_service.meta_ready]);
    const listings = this.apps_service.listings();
    const apps = this.announced.flatMap(({ app, release }) => {
      const manifest = listings.find((listing) => listing.id === app);
      return manifest ? [{ manifest, version: release.version }] : [];
    });
    if (this.destroyed || apps.length === 0) return;
    await this.dialogs_service.show(component, { apps });
  }

  private notify_updated(): void {
    const changes = this.unseen.flatMap((release) => release.changes);
    const counts = Object.values(ChangeKind)
      .map((kind) => [kind, changes.filter((change) => change.kind === kind).length] as const)
      .filter(([, count]) => count > 0);

    this.notifications_service.notify("version", {
      title: `Updated to v${this.info.version}`,
      message: counts.map(([kind, count]) => `${count} ${kind}`).join(" · "),
      icon: SparkleIcon,
      // Sticky: at boot it can sit behind the introduction or the Restore dialog.
      duration: null,
      actions: [
        { label: "What's new", on_click: () => this.apps_service.launch("settings", { section: "whats-new" }) },
      ],
    });
  }

  /** Once per detected build; a later check that finds the same build stays quiet. */
  private notify_update_available(remote: VersionInfo, again = false): void {
    if (import.meta.env.DEV || (!again && remote.buildTimestamp === this.notified_build)) return;
    this.notified_build = remote.buildTimestamp;

    // One toast at a time: several chunks failing together would otherwise stack copies.
    if (this.update_toast) this.notifications_service.dismiss(this.update_toast);
    this.update_toast = this.notifications_service.notify("version", {
      title: "A new version is ready",
      message: `v${remote.version}. WebOS reloads and offers your open windows back.`,
      icon: ArrowCircleUpIcon,
      duration: null,
      actions: [{ label: "Update and reload", on_click: () => this.apply_update() }],
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function beat(): Promise<void> {
  return delay(STAGE_BEAT);
}

function with_timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function cached_keys(name: string): Promise<Set<string>> {
  if (!(await caches.has(name))) return new Set();
  const cache = await caches.open(name);
  return new Set((await cache.keys()).map((request) => request.url));
}

function activated(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    if (worker.state === "activated") return resolve();
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve();
      if (worker.state === "redundant") reject(new Error("New service worker failed to install"));
    });
  });
}
