import type { FilesService, FileSystemItem } from "../files/type";
import { PATHS } from "../files/hierarchy";
import { parse_session, SESSION_PATH } from "../session/persistence";
import { HISTORY_PATH } from "../shell/history";
import { file_extension } from "./associations";
import { parse_shortcut, SHORTCUT_EXTENSION } from "./shortcut";
import type { AppId, AppManifest } from "./type";
import { parse_widget, WIDGET_EXTENSION } from "./widget";

/** What the OS already keeps about past use, read once for the move to installed apps (ADR-040). */
export interface UsageSignals {
  /** Apps with a remembered window frame or a window in the saved session. */
  windows: Iterable<AppId>;
  /** Targets of desktop shortcuts and widgets. */
  desktop: Iterable<AppId>;
  /** localStorage keys; `app.{id}.*` ones count. */
  storage_keys: Iterable<string>;
  /** Folder names under `/var/lib/apps`. */
  data_folders: Iterable<string>;
  /** Shell history lines; a stage running an app's command counts. */
  history: Iterable<string>;
  /** Apps picked as the default for a file type. */
  defaults: Iterable<AppId>;
}

function command_apps(manifests: Iterable<AppManifest>): [string, AppId][] {
  return [...manifests].flatMap((manifest) => (manifest.shell?.commands ?? []).map((command): [string, AppId] => [command.id, manifest.id]));
}

/** The registered apps any signal points to. */
export function used_apps(manifests: Iterable<AppManifest>, signals: UsageSignals): Set<AppId> {
  const known = new Map([...manifests].map((manifest) => [manifest.id, manifest]));
  const used = new Set<AppId>([...signals.windows, ...signals.desktop, ...signals.data_folders, ...signals.defaults]);
  for (const key of signals.storage_keys) {
    if (key.startsWith("app.")) used.add(key.slice(4).split(".")[0]);
  }
  const commands = command_apps(known.values());
  for (const line of signals.history) {
    for (const stage of line.split("|")) {
      const words = stage.trim().replace(/^sudo\s+/, "");
      for (const [id, app] of commands) if (words === id || words.startsWith(`${id} `)) used.add(app);
    }
  }
  return new Set([...used].filter((id) => known.has(id)));
}

async function read(files: FilesService, path: string): Promise<string | null> {
  const file = await files.get_file(path);
  return file ? file.text() : null;
}

async function entries(files: FilesService, path: string): Promise<FileSystemItem[]> {
  const directory = await files.get_directory(path);
  return directory ? files.list(directory) : [];
}

/** Reads every signal from disk and localStorage. */
export async function read_usage(files: FilesService, file_defaults: Record<string, AppId>): Promise<UsageSignals> {
  const session = parse_session((await read(files, SESSION_PATH)) ?? "");
  const desktop: AppId[] = [];
  for (const item of await entries(files, PATHS.desktop)) {
    if (item.kind !== "file") continue;
    const extension = file_extension(item.name);
    if (extension !== SHORTCUT_EXTENSION && extension !== WIDGET_EXTENSION) continue;
    const text = await (await item.handle.getFile()).text();
    const target = extension === SHORTCUT_EXTENSION ? parse_shortcut(text)?.app_id : parse_widget(text)?.app;
    if (target) desktop.push(target);
  }
  return {
    windows: [...Object.keys(session.frames), ...session.windows.map((window) => window.app_id)],
    desktop,
    storage_keys: Object.keys(localStorage),
    data_folders: (await entries(files, `${PATHS.var_lib}/apps`)).filter((item) => item.kind === "directory").map((item) => item.name),
    history: ((await read(files, HISTORY_PATH)) ?? "").split("\n").filter(Boolean),
    defaults: Object.values(file_defaults),
  };
}
