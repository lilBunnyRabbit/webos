import { describe, expect, test, vi } from "vitest";
import type {
  AppConfig,
  AppDefinition,
  AppHighlight,
  AppId,
  AppManifest,
  AppProps,
  AppsService,
  Command,
  CommandContext,
  CommandShortcut,
  Completer,
  Completion,
  CreateFileOptions,
  DesktopItem,
  DesktopService,
  DialogOptions,
  DialogProps,
  DialogsService,
  DirtyOptions,
  FileSystemDirectoryItem,
  FileSystemFileItem,
  FileSystemItem,
  FilesService,
  KeyShortcut,
  ListOptions,
  MenuItem,
  NotificationAction,
  NotificationId,
  NotificationUpdate,
  NotificationsService,
  NotifyOptions,
  OpenOptions,
  Output,
  RunShortcut,
  SettingsService,
  ShellContribution,
  ShellSession,
  ShortcutsService,
  Tagged,
  Theme,
  Value,
  ValueType,
  WidgetProps,
  WidgetSize,
  WidgetSizeLimits,
  WindowId,
  WindowOptions,
  WindowsService,
} from "$lib/core/api";
import type { FileValue } from "$lib/core/api/services/files/shell";
import type {
  AppContext,
  ConfirmOptions,
  JsonFile,
  LiveFile,
  PickOptions,
  PromptOptions,
  SaveOptions,
  StorageHandle,
  WindowHandle,
} from "$lib/core/contexts/app";
import type { BadgeVariants, ButtonVariants, FieldVariants, IconComponent } from "$lib/core/components/ui";
import type { Axis, FormatTimeOptions, GameStats, ParsedDay, PlayTracker, Plays } from "$lib/core/games";
import type { DeviceFileOptions } from "$lib/core/utils/device-file";
import type { SourceImage } from "$lib/core/utils/image";
import type { Rng } from "$lib/core/utils/random";
import type { Bounds, Dimensions, Position } from "$lib/core/utils/type";

const DOC = "docs/system/app-api.md";

// `$lib/core/api` builds the kernel singleton on import (it reads `location` and `matchMedia`), and app discovery
// imports every manifest back through the half-initialized barrel, which only native ESM tolerates.
vi.mock("$lib/apps", () => ({ apps: [] }));
vi.stubGlobal("location", { search: "" });
vi.stubGlobal("matchMedia", () => ({ matches: false }));

const STABLE: [string, () => Promise<object>, string[]][] = [
  [
    "$lib/core/api",
    () => import("$lib/core/api"),
    [
      "AppCategory",
      "ArgKind",
      "FILE_PROPS",
      "NotificationType",
      "Platform",
      "ShellError",
      "ShortcutCategory",
      "WindowFlag",
      "arg",
      "default",
      "define_app",
      "define_command",
      "format_keys",
    ],
  ],
  [
    "$lib/core/contexts/app",
    () => import("$lib/core/contexts/app"),
    ["app_data_path", "confirm_discard", "create_storage_handle", "get_app_context", "json_file", "live_file"],
  ],
  [
    "$lib/core/components/ui",
    () => import("$lib/core/components/ui"),
    [
      "Badge",
      "BoardOverlay",
      "Button",
      "Checkbox",
      "CopyButton",
      "EmptyState",
      "IconButton",
      "Input",
      "Kbd",
      "Section",
      "Segmented",
      "Select",
      "Separator",
      "SettingRow",
      "SideNav",
      "Slider",
      "Spinner",
      "StatusBar",
      "Switch",
      "Textarea",
      "Toolbar",
      "badge",
      "button",
      "field",
    ],
  ],
  [
    "$lib/core/games",
    () => import("$lib/core/games"),
    [
      "Direction",
      "EMPTY_PLAYS",
      "PLAYS_PATH",
      "PlaysSchema",
      "Stopwatch",
      "daily_seed",
      "format_time",
      "grid_key_move",
      "key_direction",
      "parse_day",
      "stroke_axis",
      "stroke_cells",
      "stroke_end",
      "swipe_direction",
      "track_play",
      "use_plays",
    ],
  ],
  [
    "$lib/core/utils",
    () => import("$lib/core/utils"),
    [
      "clamp",
      "cn",
      "error_message",
      "escape_html",
      "format_bytes",
      "format_date",
      "format_datetime",
      "pad2",
      "resolve_token",
    ],
  ],
  ["$lib/core/api/services/apps/type", () => import("$lib/core/api/services/apps/type"), ["AppCategory"]],
  [
    "$lib/core/api/services/apps/helpers",
    () => import("$lib/core/api/services/apps/helpers"),
    ["FILE_PROPS", "define_app"],
  ],
  ["$lib/core/api/services/shell/type", () => import("$lib/core/api/services/shell/type"), ["ShellError"]],
  ["$lib/core/api/services/shell/arg", () => import("$lib/core/api/services/shell/arg"), ["ArgKind", "arg"]],
  ["$lib/core/api/services/shell/define", () => import("$lib/core/api/services/shell/define"), ["define_command"]],
  [
    "$lib/core/api/services/files/path",
    () => import("$lib/core/api/services/files/path"),
    [
      "base_name",
      "file_extension",
      "file_stem",
      "join_path",
      "parent_path",
      "resolve_path",
      "split_path",
      "tilde_path",
    ],
  ],
  [
    "$lib/core/api/services/files/hierarchy",
    () => import("$lib/core/api/services/files/hierarchy"),
    ["is_system_path"],
  ],
  [
    "$lib/core/api/services/files/shell",
    () => import("$lib/core/api/services/files/shell"),
    ["assert_writable", "file_value", "is_file_value"],
  ],
  ["$lib/core/games/time", () => import("$lib/core/games/time"), ["daily_seed", "format_time", "parse_day"]],
  ["$lib/core/games/direction", () => import("$lib/core/games/direction"), ["Direction", "key_direction", "swipe_direction"]],
  ["$lib/core/utils/date", () => import("$lib/core/utils/date"), ["day_key", "parse_time", "resolve_day"]],
  ["$lib/core/utils/detached-root.svelte", () => import("$lib/core/utils/detached-root.svelte"), ["detached_root"]],
  ["$lib/core/utils/device-file", () => import("$lib/core/utils/device-file"), ["pick_device_files"]],
  [
    "$lib/core/utils/image",
    () => import("$lib/core/utils/image"),
    [
      "FORMAT_OPTIONS",
      "ImageFormat",
      "extension_for",
      "has_files",
      "image_files",
      "load_image",
      "load_image_at",
      "paint",
      "save_image",
    ],
  ],
  ["$lib/core/utils/long-press", () => import("$lib/core/utils/long-press"), ["long_press"]],
  ["$lib/core/utils/print", () => import("$lib/core/utils/print"), ["print_html"]],
  [
    "$lib/core/utils/random",
    () => import("$lib/core/utils/random"),
    ["create_rng", "pick", "random_int", "random_seed", "shuffle"],
  ],
  ["$lib/core/utils/ticker.svelte", () => import("$lib/core/utils/ticker.svelte"), ["Ticker"]],
];

describe("app API 1.0", () => {
  test.each(STABLE)(
    "%s keeps its stable exports",
    async (path, load, names) => {
      const exported = Object.keys(await load());
      expect(
        names.filter((name) => exported.includes(name)),
        `${path} lost a stable export. Removing or renaming one breaks ${DOC}: that's 2.0`
      ).toEqual(names);
    },
    60_000
  );
});

// Checked by `bun run check`, not at run time. A removed member fails the `K extends keyof T` constraint; an added one
// turns the type into its name, so `true` no longer fits. Either way, update DOC in the same change.
type Members<T, K extends keyof T> = [Exclude<keyof T, K>] extends [never] ? true : Exclude<keyof T, K>;

const manifest_fields: Members<
  AppConfig,
  | "associations"
  | "author"
  | "badge"
  | "category"
  | "component"
  | "default_widget"
  | "defaults"
  | "description"
  | "highlights"
  | "icon"
  | "id"
  | "keywords"
  | "license"
  | "name"
  | "preview"
  | "props"
  | "repository"
  | "restore"
  | "shell"
  | "tools"
  | "version"
  | "widget"
  | "widget_size"
> = true;

const window_handle_members: Members<
  WindowHandle,
  | "bounds"
  | "close"
  | "confirm"
  | "focus"
  | "id"
  | "is_focused"
  | "is_maximized"
  | "is_minimized"
  | "is_visible"
  | "maximize"
  | "minimize"
  | "on_back"
  | "pick_directory"
  | "pick_file"
  | "pick_save"
  | "prompt"
  | "restore"
  | "set_dirty"
  | "set_title"
> = true;

const storage_handle_members: Members<StorageHandle, "file" | "get" | "persisted" | "remove" | "set" | "window"> = true;
const app_context_members: Members<AppContext, "app_id" | "storage" | "window" | "window_id"> = true;
const app_highlight_members: Members<AppHighlight, "icon" | "text" | "title"> = true;
const widget_props_members: Members<WidgetProps, "name" | "props" | "size"> = true;
const window_options_members: Members<WindowOptions, "constraints" | "flags" | "snap_zone"> = true;
const json_file_members: Members<JsonFile<unknown>, "error" | "ready" | "release" | "value"> = true;
const shell_contribution_members: Members<ShellContribution, "commands" | "completers" | "values"> = true;
const command_members: Members<
  Command,
  "app" | "args" | "available" | "complete" | "description" | "id" | "positional" | "run" | "short" | "yields"
> = true;
const command_context_members: Members<CommandContext, "args" | "elevated" | "input" | "piped" | "session" | "signal"> =
  true;
const value_type_members: Members<ValueType, "cell" | "columns" | "open" | "render" | "text"> = true;

type StableTypes = [
  AppConfig,
  AppDefinition,
  AppHighlight,
  AppId,
  AppManifest,
  AppProps,
  AppsService,
  Command,
  CommandContext,
  CommandShortcut,
  Completer,
  Completion,
  CreateFileOptions,
  DesktopItem,
  DesktopService,
  DialogOptions,
  DialogProps<unknown>,
  DialogsService,
  DirtyOptions,
  FileSystemDirectoryItem,
  FileSystemFileItem,
  FileSystemItem,
  FilesService,
  KeyShortcut,
  ListOptions,
  MenuItem,
  NotificationAction,
  NotificationId,
  NotificationUpdate,
  NotificationsService,
  NotifyOptions,
  OpenOptions,
  Output,
  RunShortcut,
  SettingsService,
  ShellContribution,
  ShellSession,
  ShortcutsService,
  Tagged,
  Theme,
  Value,
  ValueType,
  WidgetProps,
  WidgetSize,
  WidgetSizeLimits,
  WindowId,
  WindowOptions,
  WindowsService,
  FileValue,
  AppContext,
  ConfirmOptions,
  JsonFile<unknown>,
  LiveFile<unknown>,
  PickOptions,
  PromptOptions,
  SaveOptions,
  StorageHandle,
  WindowHandle,
  BadgeVariants,
  ButtonVariants,
  FieldVariants,
  IconComponent,
  Axis,
  FormatTimeOptions,
  GameStats,
  ParsedDay,
  PlayTracker,
  Plays,
  DeviceFileOptions,
  SourceImage,
  Rng,
  Bounds,
  Dimensions,
  Position,
];
