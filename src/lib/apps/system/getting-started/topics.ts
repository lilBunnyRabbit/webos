import kernel, {
  Platform,
  type AppsService,
  type DesktopService,
  type FilesService,
  type RouterService,
  type ShellService,
  type WindowId,
} from "$lib/core/api";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import {
  AppWindow as AppWindowIcon,
  Archive as ArchiveIcon,
  ChatCircleText as ChatCircleTextIcon,
  ArrowsLeftRight as ArrowsLeftRightIcon,
  Command as CommandIcon,
  FolderOpen as FolderOpenIcon,
  House as HouseIcon,
  Keyboard as KeyboardIcon,
  Link as LinkIcon,
  ListChecks as ListChecksIcon,
  MagnifyingGlass as MagnifyingGlassIcon,
  SquaresFour as SquaresFourIcon,
  Sticker as StickerIcon,
  TerminalWindow as TerminalWindowIcon,
} from "phosphor-svelte";
import type { Component } from "svelte";
import type { TopicId } from "./ids";

export interface Topic {
  id: TopicId;
  icon: Component;
  title: string;
  text: string;
  /** Shortcut keys shown as chips, `format_keys` syntax. */
  keys?: string;
  platforms: Platform[];
  /** The Try it button's label; it counts as tried once pressed. */
  action: string;
  run(window_id: WindowId): unknown;
}

const BOTH = [Platform.DESKTOP, Platform.MOBILE];
const DESKTOP = [Platform.DESKTOP];
const MOBILE = [Platform.MOBILE];

const apps = () => kernel.service<AppsService>("apps");
const shell = (line: string) => kernel.service<ShellService>("shell").execute(line);

export const TOPICS: Topic[] = [
  {
    id: "launcher",
    icon: MagnifyingGlassIcon,
    title: "Find any app",
    text: "Search by name or by what it does: \"zip\", \"timer\", \"pdf\". Apps you haven't installed show up too, under Get.",
    keys: "mod+k",
    platforms: BOTH,
    action: "Open search",
    run: () => shell("ui launcher"),
  },
  {
    id: "palette",
    icon: CommandIcon,
    title: "Command palette",
    text: "Type > in the search to run commands instead: switch the theme, snap a window, list your files.",
    keys: "mod+k",
    platforms: DESKTOP,
    action: "Open the palette",
    run: () => shell("ui launcher"),
  },
  {
    id: "terminal",
    icon: TerminalWindowIcon,
    title: "Terminal",
    text: "Commands with pipes: ls ~ | where size > 1mb | sort size. Results are clickable, Tab completes.",
    keys: "alt+shift+enter",
    platforms: BOTH,
    action: "Run ls ~",
    run: () => apps().launch("terminal", { run: "ls ~" }),
  },
  {
    id: "ask",
    icon: ChatCircleTextIcon,
    title: "Ask about your apps",
    text: "Ask \"what's on my shopping list?\" or \"what am I doing tomorrow?\". Choose what Ask may read; the AI runs on this device, offline too.",
    platforms: DESKTOP,
    action: "Open Ask",
    run: () => apps().launch("ask"),
  },
  {
    id: "shortcuts",
    icon: KeyboardIcon,
    title: "Keyboard shortcuts",
    text: "Windows, apps and the system all have keys. The cheat sheet lists every one.",
    keys: "mod+/",
    platforms: DESKTOP,
    action: "Show the cheat sheet",
    run: () => shell("shortcuts sheet"),
  },
  {
    id: "snap",
    icon: AppWindowIcon,
    title: "Snap windows",
    text: "Drag a title bar to a screen edge for half the screen, to a corner for a quarter. Double-click it to maximize.",
    keys: "alt+shift+left",
    platforms: DESKTOP,
    action: "Snap this window left",
    run: (window_id) => shell(`win snap left ${window_id}`),
  },
  {
    id: "widgets",
    icon: StickerIcon,
    title: "Desktop widgets",
    text: "Some apps live on the desktop as widgets: a clock with your next alarm and running timers, notes, today's puzzle.",
    platforms: DESKTOP,
    action: "Add a clock widget",
    run: () => {
      apps().install("clock");
      return kernel.service<DesktopService>("desktop").pin_widget("clock", { label: "Clock" });
    },
  },
  {
    id: "files",
    icon: FolderOpenIcon,
    title: "Files open in their app",
    text: "Double-click a file and the right app opens it. Right-click for Open with, Compress, Save to disk.",
    platforms: BOTH,
    action: "Open the samples",
    run: async () => {
      const files = kernel.service<FilesService>("files");
      const { SAMPLES_FOLDER, seed_samples } = await import("$lib/core/api/services/version/samples");
      const samples = `${PATHS.documents}/${SAMPLES_FOLDER}`;
      // Only a first boot writes them, so a device from before 1.9.0 (or one that deleted them) gets them here.
      if (!(await files.get_directory(samples))) await seed_samples(files);
      apps().launch("file-explorer", { path: (await files.get_directory(samples)) ? samples : PATHS.home });
    },
  },
  {
    id: "apps",
    icon: SquaresFourIcon,
    title: "Get more apps",
    text: "The App Library has every app: pixel art, PDFs, puzzles, a kanban board. Get one, or uninstall what you don't use.",
    platforms: BOTH,
    action: "Open App Library",
    run: () => apps().launch("app-library"),
  },
  {
    id: "tasks",
    icon: ListChecksIcon,
    title: "Background tasks",
    text: "Zipping, PDF jobs and exports run as tasks: a progress toast with Cancel, and every run in Activity Monitor.",
    platforms: BOTH,
    action: "Open Tasks",
    run: () => apps().launch("activity-monitor", { section: "tasks" }),
  },
  {
    id: "links",
    icon: LinkIcon,
    title: "Share a window",
    text: "The link button in a title bar copies a link that opens the same app, as it is now, on any device.",
    platforms: DESKTOP,
    action: "Copy this window's link",
    run: (window_id) => kernel.service<RouterService>("router").copy_link(window_id),
  },
  {
    id: "backup",
    icon: ArchiveIcon,
    title: "Back up your files",
    text: "Everything lives in this browser. A backup saves your files, settings and app data as one zip on your device.",
    platforms: BOTH,
    action: "Open Backup",
    run: () => apps().launch("settings", { section: "backup" }),
  },
  {
    id: "home",
    icon: HouseIcon,
    title: "Home and dock",
    text: "Swipe between home pages. Hold an icon to move it, add it to the dock or uninstall its app.",
    platforms: MOBILE,
    action: "Open all apps",
    run: () => shell("ui launcher"),
  },
  {
    id: "switcher",
    icon: ArrowsLeftRightIcon,
    title: "Switch apps",
    text: "Every app you open keeps running. The switcher shows them all; Back closes sheets and steps out of apps.",
    platforms: MOBILE,
    action: "Open the switcher",
    run: () => shell("ui switcher"),
  },
];

export function topics_for(platform: Platform): Topic[] {
  return TOPICS.filter((topic) => topic.platforms.includes(platform));
}
