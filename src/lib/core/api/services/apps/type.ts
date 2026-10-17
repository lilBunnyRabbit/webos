import type { Component } from "svelte";
import type { ZodType } from "zod";
import type { IService } from "../../type";
import type { WindowId, WindowOptions } from "../windows/type";
import type { Position } from "$lib/core/utils/type";
import type { ShellContribution } from "../shell/type";
import type { DailyRank } from "$lib/core/games/daily";

export interface AppsService extends IService {
  register(manifest: AppManifest): void;
  /**
   * Props are validated against the manifest's `props` schema; anything else is discarded (ADR-008). An app that isn't
   * installed gets installed first, with a toast (ADR-040).
   */
  launch(id: AppId, props?: unknown): WindowId;
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
  /** System apps always are; unknown ids never. */
  is_installed(id: AppId): boolean;
  /** Installs the ones that aren't yet and saves the list. Resolves to the newly installed ids. */
  install(ids: AppId | AppId[]): AppId[];
  /**
   * Takes a user app out of the installed list (system apps throw). With `data`, also deletes its `app.{id}.*`
   * localStorage and `/var/lib/apps/{id}/`; never anything in `/home`. Windows and desktop entries are the caller's.
   */
  uninstall(id: AppId, options?: UninstallOptions): Promise<void>;
}

export interface AppsFilter {
  installed?: boolean;
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
export type AppProps = Record<string, unknown>;

/** Resolved app manifest with normalized fields */
export interface AppManifest<TProps extends AppProps = AppProps> {
  id: AppId;
  name: string;
  version: string;
  icon: Component;
  description?: string;
  category: AppCategory;
  /** Set at discovery: the app lives in `src/lib/apps/system/`. */
  system: boolean;
  keywords?: string[];
  author?: string;
  /** Who made the app, credited in the App Library, the new-app announcement, Settings › About and `app info`. Omitted means the owner. */
  authors?: AppAuthor[];
  license?: string;
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
   * `tracker.daily(day, ms, score)`, lower (`score-asc`) or higher (`score-desc`) first. Time breaks a tie.
   */
  daily_rank?: DailyRank;
  /** Commands, completers and value types that work with no window open (ADR-034). Service commands win an id clash. */
  shell?: ShellContribution;
  /**
   * A count on the app's icon wherever it shows, even with no window open (ADR-034). Read inside the shell UI's
   * reactive scope: back it with `createSubscriber` so the app only checks while an icon is on screen. `null` or `0`
   * shows nothing.
   */
  badge?: () => number | null;
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
   * What the app does, as three or four cards: the new-app announcement and the App Library details show them (ADR-038).
   * Lazy like `preview`: manifests load at boot, and the cards' icons and text are worth ~1 KB gz each app.
   */
  highlights?: () => Promise<{ default: AppHighlight[] }>;
  /** A picture of the app for the announcement, `import("./preview.webp?url")`. Lazy, so it never weighs on boot. */
  preview?: () => Promise<{ default: string }>;
  /** Every prop is optional: apps are also launched with none (start menu, desktop). */
  component: () => Promise<Component<Partial<TProps>>>;
}

export interface AppAuthor {
  name: string;
  /** GitHub handle; the credit links to the profile. */
  github?: string;
  /** Used when there's no `github`. */
  url?: string;
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

export interface WidgetProps {
  /** The widget file's props, already validated against the manifest's `props`. */
  props: AppProps;
  /** In grid cells, within the manifest's `widget_size`. */
  size: WidgetSize;
  /** The `.widget` file's name in `/home/Desktop`. */
  name: string;
}

/** What `define_app` returns: a manifest before discovery knows its folder. */
export type AppDefinition<TProps extends AppProps = AppProps> = Omit<AppManifest<TProps>, "system">;

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