import type { Component } from "svelte";
import type { ZodType } from "zod";
import type { IService } from "../../type";
import type { WindowId, WindowOptions } from "../windows/type";
import type { Position } from "$lib/core/utils/type";
import type { ShellContribution } from "../shell/type";
import type { OnFire } from "../scheduler/type";
import type { BackgroundRun } from "../background/type";
import type { Catalogue, CatalogueHeader } from "./catalogue";
import type { AppUsage } from "./active-time";
import type { Achievement } from "../achievements/type";

export interface AppsService extends IService {
  register(manifest: AppManifest): void;
  /**
   * Props are validated against the manifest's `props` schema; anything else is discarded (ADR-008). An app that isn't
   * installed opens without installing (ADR-077). `null` for an app of another core while a core update
   * waits: it toasts "Update WebOS to open {App}" and opens nothing.
   */
  launch(id: AppId, props?: unknown): WindowId | null;
  /**
   * The instance `launch()` would open, without opening a window or reporting problems: `null` when the app is unknown
   * or the props fail its schema. Used by session restore (ADR-023).
   */
  create_instance(id: AppId, props?: unknown, state?: Record<string, unknown>): AppInstance | null;
  /**
   * Opens a file in the app associated with it (ADR-018). Resolves to the new window,
   * or `null` when the file is missing or no app matches (both notify).
   */
  open(path: string, options?: OpenOptions): Promise<WindowId | null>;
  get(id: AppId): AppManifest | undefined;
  /** Every registered app, or only the installed (`true`) or not installed (`false`) ones (ADR-040). */
  list(filter?: AppsFilter): IterableIterator<[AppId, AppManifest]>;
  /** The core apps (`CORE_APPS`) always are; unknown ids never. */
  is_installed(id: AppId): boolean;
  /** Installs the ones that aren't yet and saves the list. Resolves to the newly installed ids. */
  install(ids: AppId | AppId[]): AppId[];
  /**
   * Takes an app out of the installed list (core apps throw). With `data`, also deletes its `app.{id}.*`
   * localStorage and `/var/lib/apps/{id}/`; never anything in `/home`. Windows and desktop entries are the caller's.
   */
  uninstall(id: AppId, options?: UninstallOptions): Promise<void>;
  /** The app's display text from its catalogue entry; an app this device doesn't know yet fetches the full catalogue. */
  meta(id: AppId): Promise<AppMeta>;
  /**
   * Every app known so far, or only the installed (`true`) or not installed (`false`) ones, with its catalogue text
   * (ADR-077). Boot knows the installed apps; the rest arrive with `catalogue()`. Reactive.
   */
  listings(filter?: AppsFilter): AppListing[];
  /**
   * Makes every app of this build known (ADR-077): fetches `store/catalogue.json` network-first, once, and lists the
   * apps it names. Resolves `false` when it couldn't (offline with no copy, or a copy from another build, whose apps are
   * listed but can't open); a later call tries again. Lists of apps that may not be installed pass `{ all: true }` to `list()` or `listings()` instead.
   */
  catalogue(): Promise<boolean>;
  /**
   * The app's manifest with its code: `get()` gives a stub built from the catalogue entry until the manifest's chunk
   * has loaded (installed apps' load after first paint). Needed before reading `props`, or `badge`. `undefined` for an
   * unknown id; rejects when the chunk can't load.
   */
  load(id: AppId): Promise<AppManifest | undefined>;
  /**
   * The entries boot reads (`/var/lib/apps/catalogue.json`): the installed apps' and every system app's, so what opens a
   * system app on demand finds it. `null` while some aren't this build's or known.
   */
  installed_catalogue(): Catalogue | null;
  /**
   * Fetches the catalogue and takes it when it's a newer build of the running core (ADR-077 stage 3): an app-only
   * update, no reload. Skipped when `newer_than` (a build stamp) isn't newer than the catalogue held. Resolves to the
   * apps whose version changed. Apps not running here switch at once; one with open windows keeps its code until
   * every window is closed (`update_ready`).
   */
  refresh(newer_than?: number): Promise<AppId[]>;
  /** The last catalogue `refresh()` (or a fetch) took on this core, with what changed. Reactive. */
  readonly last_update: AppsUpdate | null;
  /** The release WebOS runs (ADR-077); `null` offline with another core's slice. Reactive. */
  readonly header: CatalogueHeader | null;
  /** Open windows run an older version of the app than its entry. Reactive. */
  update_ready(id: AppId): boolean;
  /**
   * Restart app: loads the app's current version first (a failure toasts and keeps every window), then closes its
   * windows, dirty ones first (a kept one reopens the ones already closed, resolving `false`), and reopens them on it
   * with the same props, frames and window state. Never rejects.
   */
  restart(id: AppId): Promise<boolean>;
  /** The window was closed by `restart()` to reopen, not by the user: Session leaves it out of Reopen closed window. */
  restarting(window_id: WindowId): boolean;
  /** Files of installed apps and of apps whose code runs in this tab: what pruning the app cache must keep. */
  files_in_use(): Set<string>;
  /**
   * Apps `launch()` opened lately, newest first, each once, at most 16, installed or not; never the core apps, and
   * apps no catalogue knows drop out. Reactive. Saved in `/var/lib/apps/recent.json`; always empty in solo mode (ADR-047).
   */
  readonly recent: AppId[];
  clear_recent(): void;
  /**
   * Apps the user marked as favourites, in their order (added at the end, moved by drag), installed ones only (ADR-083).
   * Reactive. Saved in `/var/lib/apps/favourites.json`; uninstalling drops the app. Always empty in solo mode.
   */
  readonly favourites: AppId[];
  /** Adding takes installed apps only. */
  favourite(id: AppId, on: boolean): void;
  /** `index` counts `favourites` without `id`. */
  move_favourite(id: AppId, index: number): void;
  /**
   * Time the app was in front (a window of it focused, the page visible), when it last was and on how many days.
   * `null` before its first use. Reactive. Saved in `/var/lib/apps/usage.json`, never sent anywhere.
   */
  usage(id: AppId): AppUsage | null;
}

export interface AppsUpdate {
  build: number;
  /** Apps whose version changed. */
  changed: AppId[];
  /** Apps whose files changed: installed ones download again. */
  swapped: AppId[];
}

export interface AppsFilter {
  installed?: boolean;
  /** Also fetch the full catalogue (`catalogue()`) when this device doesn't know every app yet; the list grows when it arrives. */
  all?: boolean;
}

export interface UninstallOptions {
  data?: boolean;
}

export type AppId = string;

export interface OpenOptions {
  /** Where the user clicked; the "Open with" chooser anchors here (ADR-018). */
  anchor?: Position;
}
/** What an app is, for grouping and search. Whether it's a system app comes from its folder, not from this. */
export const AppCategory = {
  PRODUCTIVITY: "productivity",
  MEDIA: "media",
  UTILITIES: "utilities",
  DEVELOPER: "developer",
  GAMES: "games",
} as const;
export type AppCategory = (typeof AppCategory)[keyof typeof AppCategory];

/** How a game's daily results rank (ADR-035). Time always breaks a tie. Re-exported by the games kit. */
export const DailyRank = { TIME: "time", SCORE_ASC: "score-asc", SCORE_DESC: "score-desc" } as const;
export type DailyRank = (typeof DailyRank)[keyof typeof DailyRank];
/** One rank per mode, for a game with a daily per mode (ADR-050): mode id → rank. */
export type DailyRanks = Record<string, DailyRank>;

export type AppProps = Record<string, unknown>;

/** Resolved app manifest with normalized fields */
export interface AppManifest<TProps extends AppProps = AppProps> {
  id: AppId;
  name: string;
  /** The release the app last changed in, from the catalogue (ADR-077). What `define_app` is given is replaced. */
  version: string;
  icon: Component;
  category: AppCategory;
  /** Set at discovery: the app lives in `src/lib/apps/system/`. */
  system: boolean;
  /** @deprecated Stored only and never read; credits come from `authors` in `meta`. Removed in 4.0. */
  author?: string;
  /** @deprecated Stored only and never read. Removed in 4.0. */
  license?: string;
  /** @deprecated Stored only and never read. Removed in 4.0. */
  repository?: string;
  defaults?: WindowOptions;
  /** File types this app opens: extensions (`".md"`) or MIME types (`"text/*"`, `"image/png"`). See ADR-018. */
  associations?: string[];
  /** File types this app can work on without being their viewer: listed under "Open with", never the default. Same syntax as `associations`, plus `"*"` for every file. */
  tools?: string[];
  /** `false` keeps the app out of saved sessions (ADR-023). Defaults to `true`. */
  restore?: boolean;
  /** Without a schema the app never receives props. */
  props?: ZodType<TProps>;
  /**
   * How Game Hub ranks the app's daily results (ADR-035): `time` (the default), or a score passed to
   * `tracker.daily(day, ms, score)`, lower (`score-asc`) or higher (`score-desc`) first. Time breaks a tie. A record
   * gives the game one daily per mode (ADR-050): each mode's results rank by its own entry, stored under
   * `{app_id}/{mode}`, and Game Hub lists one row per mode.
   */
  daily_rank?: DailyRank | DailyRanks;
  /**
   * Ids this app took over (ADR-071). A launch, file, link, installed or offline entry for an id no app has opens the
   * app whose entry's `props` it carries, minus those props; an entry without `props` takes the rest.
   */
  replaces?: AppReplacement[];
  /**
   * Commands, completers and value types that work with no window open (ADR-034), as `import("./commands")`: the
   * module's default export is the contribution. Lazy: the shell loads every app's the first time it needs commands.
   * Service commands win an id clash.
   */
  shell?: () => Promise<{ default: ShellContribution }>;
  /**
   * A count on the app's icon wherever it shows, even with no window open (ADR-034). Read inside the shell UI's
   * reactive scope: back it with `createSubscriber` so the app only checks while an icon is on screen. `null` or `0`
   * shows nothing.
   */
  badge?: () => number | null;
  /** Lazy so it costs no boot weight: the leader tab loads it the first time one of the app's jobs fires or is missed. */
  on_fire?: () => Promise<{ default: OnFire }>;
  /**
   * Code that runs with no window (ADR-081), started by `background.start(id)`: the module's default export is a
   * `BackgroundRun`. One job per app per browser; the app's windows are views onto it.
   */
  background?: () => Promise<{ default: BackgroundRun }>;
  /**
   * Lazy: runs after `uninstall(id, { data: true })` cleared `app.{id}.*` and `/var/lib/apps/{id}`, for stores the OS
   * can't see (IndexedDB, caches). A throw is logged and toasted; the uninstall still completes.
   */
  on_uninstall_data?: () => Promise<{ default: () => Promise<void> }>;
  /**
   * Sheets other apps open over their own window with `win.request("{id}::{kind}", input)` (ADR-079): kind → a lazy
   * component taking `AppSheetProps`. Declare each one's input and output in `AppSheets` too.
   */
  provides?: Record<string, AppSheetLoader>;
  /** What the app renders on the desktop for its `.widget` files (ADR-034). Props are validated against `props`. */
  widget?: () => Promise<{ default: Component<WidgetProps> }>;
  /**
   * The widget's size range in cells, and the size `pin_widget` uses when none is given. Without it the widget keeps
   * its file's size and can't be resized.
   */
  widget_size?: WidgetSizeLimits;
  /**
   * Placed on every desktop once, at `widget_size.default`: on first boot and on desktops set up before. Removing it
   * sticks.
   */
  default_widget?: boolean;
  /**
   * What the app does, as three or four cards: the new-app announcement and the App Store details show them (ADR-038).
   * Lazy like `preview`: only the announcement and the App Store need them.
   */
  highlights?: () => Promise<{ default: AppHighlight[] }>;
  /**
   * How to use or play the app, as short markdown, `import("./guide.md?raw")` (ADR-085): the window's guide overlay
   * shows it under the pitch, and opens by itself on the app's first launch with no props. Lazy, never loaded at boot.
   */
  guide?: () => Promise<{ default: string }>;
  /** A picture of the app for the announcement, `import("./preview.webp?url")`. Lazy, so it never weighs on boot. */
  preview?: () => Promise<{ default: string }>;
  /**
   * Display text, as `import("./meta")` (ADR-049). The build copies it into the catalogue (ADR-077), so the OS never
   * loads it; read it through `meta(id)` or `listings()`.
   */
  meta?: () => Promise<{ default: AppMeta }>;
  /**
   * What users can earn (ADR-078), as plain data: the build copies it to `store/achievements.json` and gives the
   * catalogue entry the count. Reported through `get_app_context().achievements`.
   */
  achievements?: Achievement[];
  /** Every prop is optional: apps are also launched with none (start menu, desktop). */
  component: () => Promise<Component<Partial<TProps>>>;
}

/** What an app sheet gets (ADR-079): the caller's `input`, and `resolve` to hand back a value, or `null` for nothing. */
export interface AppSheetProps<TInput = unknown, TOutput = unknown> {
  input?: TInput;
  resolve(value: TOutput | null): void;
}

/**
 * Every sheet an app provides, `"{app-id}::{kind}"` → `{ input; output }`. The providing app adds its own by declaration
 * merging, so a typo in `win.request()` fails to compile:
 * `declare module "$lib/core/api/services/apps/type" { interface AppSheets { "doc-scan::scan": { input: ScanInput; output: Blob } } }`
 */
export interface AppSheets {}

export interface AppSheetShape {
  input: unknown;
  output: unknown;
}

export type AppSheetKey = keyof AppSheets & `${string}::${string}`;
export type AppSheetInput<K extends AppSheetKey> = AppSheets[K] extends AppSheetShape ? AppSheets[K]["input"] : never;
export type AppSheetOutput<K extends AppSheetKey> = AppSheets[K] extends AppSheetShape ? AppSheets[K]["output"] : never;

export type AppSheetLoader = () => Promise<{ default: Component<AppSheetProps<never, unknown>> }>;

/** An app's display text, default-exported by its `meta.ts` (ADR-049). */
export interface AppMeta {
  description?: string;
  keywords?: string[];
  /**
   * The problem the app solves and how, one short sentence each: the App Store's showcase tells each app's story with
   * it, and falls back to `description` without it.
   */
  pitch?: AppPitch;
  /** Who made the app, credited in the App Store, the new-app announcement, Settings › About and `app info`. Omitted means the owner. */
  authors?: AppAuthor[];
}

export type AppListing = AppManifest & AppMeta & {
  /** Its props take `daily` (ADR-035), from the catalogue: a listing's `props` stays empty until its code loads. */
  daily?: boolean;
  /** How many achievements it declares (ADR-078), from the catalogue. */
  achievement_count?: number;
};

export interface AppReplacement {
  app: AppId;
  props?: AppProps;
}

export interface AppAuthor {
  name: string;
  /** GitHub handle; the credit links to the profile. */
  github?: string;
  /** Used when there's no `github`. */
  url?: string;
}

export interface AppPitch {
  /** What gets in the way without the app, from the user's side. */
  problem: string;
  /** What the app does about it. */
  solution: string;
}

export interface AppHighlight {
  icon: Component;
  title: string;
  /** One sentence. */
  text: string;
}

export interface WidgetSize {
  w: number;
  h: number;
}

export interface WidgetSizeLimits {
  min: WidgetSize;
  max: WidgetSize;
  default: WidgetSize;
}

/** A widget's frame on the desktop and the phone home, picked per widget from its menu (ADR-034 revision). */
export const WidgetStyle = { CARD: "card", GLASS: "glass", CLEAR: "clear" } as const;
export type WidgetStyle = (typeof WidgetStyle)[keyof typeof WidgetStyle];

export interface WidgetProps {
  /** The widget file's props, already validated against the manifest's `props`. */
  props: AppProps;
  /** In grid cells, within the manifest's `widget_size`. */
  size: WidgetSize;
  /** The `.widget` file's name in `/home/Desktop`. */
  name: string;
  /** The frame it sits in. On `clear` there's no background behind it, so content should read on any wallpaper. */
  style: WidgetStyle;
}

/** What `define_app` returns: a manifest before discovery knows its folder or the catalogue its version. */
export interface AppDefinition<TProps extends AppProps = AppProps> extends Omit<AppManifest<TProps>, "system" | "version"> {
  /** @deprecated Ignored: the catalogue gives every app its version (ADR-077). Removed in 4.0. */
  version?: string;
}

/** Input type for define_app - component returns module */
export interface AppConfig<TProps extends AppProps = AppProps> extends Omit<AppDefinition<TProps>, "component"> {
  component: () => Promise<{ default: Component<Partial<NoInfer<TProps>>> }>;
}

export interface AppInstance<TProps extends AppProps = AppProps> {
  id: AppId;
  manifest: Omit<AppManifest, "component">;
  component: Promise<Component<Partial<TProps>>>;
  props?: TProps;
  /** Per-window state from `storage.window()`, keyed by name. Saved with the session and handed back on restore. */
  state: Record<string, unknown>;
}