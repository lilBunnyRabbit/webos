import { z } from "zod";
import { arg, ArgKind } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution, type Tagged } from "../shell/type";
import { is_file_value } from "../files/shell";
import { resolve_path } from "../files/path";
import type { FilesService } from "../files/type";
import { with_pin, without_pin } from "../settings/taskbar";
import { TaskbarPosition, TaskbarSize, type SettingsService } from "../settings/type";
import { author_names } from "./authors";
import { APP_CATEGORY_LABELS, search_apps } from "./search";
import type { AppManifest, AppMeta, AppsService } from "./type";

const EXPLORER = "file-explorer";
const LIBRARY = "app-library";
const FIND_LIMIT = 10;

function app_value(manifest: AppManifest, meta: AppMeta): Tagged {
  return {
    $type: "app",
    id: manifest.id,
    name: manifest.name,
    category: manifest.system ? "System" : APP_CATEGORY_LABELS[manifest.category],
    authors: author_names(meta),
    description: meta.description ?? "",
  };
}

export function apps_shell(apps: AppsService, files: () => FilesService, settings: () => SettingsService): ShellContribution {
  const require_app = (id: string) => {
    const manifest = apps.get(id);
    if (!manifest) throw new ShellError(`no app "${id}". Try app list`);
    return manifest;
  };

  /** The shell never installs (ADR-040): an app that isn't installed has no commands until the App Library gets it. */
  const not_installed = (manifest: AppManifest) => `${manifest.name} isn't installed. Get it in the App Library`;

  /** Folders open in File Explorer; files in their associated app (ADR-018). */
  async function open_path(path: string): Promise<void> {
    if (await files().get_directory(path)) apps.launch(EXPLORER, { path });
    else await apps.open(path);
  }

  // allSettled: an app whose module fails to load loses only its own commands.
  async function app_contributions(): Promise<ShellContribution> {
    const loaders = [...apps.list()].flatMap(([id, manifest]) => (manifest.shell ? [{ id, load: manifest.shell }] : []));
    const settled = await Promise.allSettled(loaders.map(async ({ id, load }) => ({ id, shell: (await load()).default })));
    const contributions = settled.flatMap((result, index) => {
      if (result.status === "fulfilled") return [result.value];
      console.error(`[AppsService] ${loaders[index].id}'s shell commands failed to load`, result.reason);
      return [];
    });
    return {
      completers: Object.assign({}, ...contributions.map(({ shell }) => shell.completers)),
      values: Object.assign({}, ...contributions.map(({ shell }) => shell.values)),
      commands: contributions.flatMap(({ id, shell }) =>
        (shell.commands ?? []).map((command) => ({
          ...command,
          app: id,
          available: () => (apps.is_installed(id) ? (command.available?.() ?? true) : not_installed(apps.get(id)!)),
        }))
      ),
    };
  }

  return {
    lazy: app_contributions,
    completers: {
      [ArgKind.APP]: () => [...apps.list({ installed: true })].map(([id, manifest]) => ({ value: id, detail: manifest.name })),
    },
    values: {
      app: {
        columns: ["id", "name", "category", "authors"],
        text: (app) => `${String(app.id).padEnd(20)} ${String(app.name)}`,
        // The shell never installs (ADR-040): an app that isn't installed opens in the App Library to be got.
        open: (app) => void (apps.is_installed(String(app.id)) ? apps.launch(String(app.id)) : apps.launch(LIBRARY, { app: String(app.id) })),
      },
      file: {
        open: (file) => void open_path(String(file.path)),
      },
    },
    commands: [
      define_command({
        id: "app list",
        description: "Installed apps",
        yields: "app",
        async *run() {
          for (const [id, manifest] of [...apps.list({ installed: true })].sort(([, a], [, b]) => a.name.localeCompare(b.name))) {
            yield app_value(manifest, await apps.meta(id));
          }
        },
      }),
      define_command({
        id: "app info",
        description: "Details of an app",
        args: z.object({ id: arg.app() }),
        positional: ["id"],
        async run({ args }) {
          const manifest = require_app(args.id);
          const { $type: _, authors, ...app } = app_value(manifest, await apps.meta(args.id));
          return {
            ...app,
            author: authors,
            version: manifest.version,
            opens: (manifest.associations ?? []).join(" "),
            props: manifest.props ? "yes" : "no",
          };
        },
      }),
      define_command({
        id: "app recent",
        description: "Apps opened lately, newest first",
        args: z.object({ clear: z.boolean().default(false).describe("Forget them") }),
        yields: "app",
        async *run({ args }) {
          if (args.clear) return apps.clear_recent();
          for (const id of apps.recent) {
            const manifest = apps.get(id);
            if (manifest) yield app_value(manifest, await apps.meta(id));
          }
        },
      }),
      define_command({
        id: "app find",
        ai: "read",
        description: "Apps for what you want to do, in your own words, installed or not: app find make pixel art",
        args: z.object({ words: z.array(z.string()).default([]).describe("What the app should do") }),
        positional: ["words"],
        yields: "app",
        async *run({ args }) {
          const sentence = args.words.join(" ").trim();
          if (!sentence) throw new ShellError("say what the app should do, like: app find make pixel art");
          await apps.meta_ready;
          const listings = apps.listings();
          const { build_sentence_index, rank_sentence } = await import("./sentence");
          const strict = search_apps(listings, sentence);
          const listed = new Set(strict.map((app) => app.id));
          const related = rank_sentence(build_sentence_index(listings), sentence).filter((app) => !listed.has(app.id));
          for (const app of [...strict, ...related].slice(0, FIND_LIMIT)) yield app_value(app, app);
        },
      }),
      define_command({
        id: "app launch",
        description: "Open an app in a new window",
        args: z.object({ id: arg.app() }),
        positional: ["id"],
        run({ args }) {
          const manifest = require_app(args.id);
          if (!apps.is_installed(args.id)) throw new ShellError(not_installed(manifest));
          apps.launch(args.id);
        },
      }),
      define_command({
        id: "taskbar list",
        description: "Apps pinned to the taskbar's quick launch, in order",
        yields: "app",
        async *run() {
          for (const id of settings().taskbar.pinned) {
            const manifest = apps.get(id);
            if (manifest) yield app_value(manifest, await apps.meta(manifest.id));
          }
        },
      }),
      define_command({
        id: "taskbar pin",
        description: "Pin an app to the taskbar's quick launch",
        args: z.object({ id: arg.app() }),
        positional: ["id"],
        run({ args }) {
          const manifest = require_app(args.id);
          if (!apps.is_installed(args.id)) throw new ShellError(not_installed(manifest));
          settings().taskbar.pinned = with_pin(settings().taskbar.pinned, args.id);
        },
      }),
      define_command({
        id: "taskbar unpin",
        description: "Remove an app from the taskbar's quick launch",
        args: z.object({ id: arg.app() }),
        positional: ["id"],
        run({ args }) {
          if (!settings().taskbar.pinned.includes(args.id)) throw new ShellError(`${args.id} isn't pinned. Try taskbar list`);
          settings().taskbar.pinned = without_pin(settings().taskbar.pinned, args.id);
        },
      }),
      define_command({
        id: "taskbar position",
        description: "Which screen edge the taskbar docks to; no argument prints it",
        args: z.object({ position: z.enum(Object.values(TaskbarPosition)).optional() }),
        positional: ["position"],
        run({ args }) {
          if (!args.position) return settings().taskbar.position;
          settings().taskbar.position = args.position;
        },
      }),
      define_command({
        id: "taskbar size",
        description: "Taskbar size; no argument prints it",
        args: z.object({ size: z.enum(Object.values(TaskbarSize)).optional() }),
        positional: ["size"],
        run({ args }) {
          if (!args.size) return settings().taskbar.size;
          settings().taskbar.size = args.size;
        },
      }),
      define_command({
        id: "taskbar autohide",
        description: "Hide the taskbar until the pointer reaches its edge; no argument prints it",
        args: z.object({ state: z.enum(["on", "off"]).optional() }),
        positional: ["state"],
        run({ args }) {
          if (!args.state) return settings().taskbar.auto_hide ? "on" : "off";
          settings().taskbar.auto_hide = args.state === "on";
        },
      }),
      define_command({
        id: "taskbar seconds",
        description: "Show seconds on the taskbar clock; no argument prints it",
        args: z.object({ state: z.enum(["on", "off"]).optional() }),
        positional: ["state"],
        run({ args }) {
          if (!args.state) return settings().taskbar.seconds ? "on" : "off";
          settings().taskbar.seconds = args.state === "on";
        },
      }),
      define_command({
        id: "open",
        description: "Open files in their app, folders in File Explorer",
        args: z.object({ paths: z.array(arg.path()).default([]).describe("Paths, or the files piped in") }),
        positional: ["paths"],
        async run({ args, input, piped, session }) {
          const paths = args.paths.map((path) => resolve_path(session.cwd, path));
          if (args.paths.length === 0 && piped) {
            for await (const item of input) {
              if (is_file_value(item)) paths.push(item.path);
              else if (typeof item === "string") paths.push(resolve_path(session.cwd, item));
            }
          }
          if (paths.length === 0) paths.push(session.cwd);
          for (const path of paths) await open_path(path);
        },
      }),
    ],
  };
}
