import type { AppId, AppManifest } from "./type";

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
