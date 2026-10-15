import { z } from "zod";
import { arg, ArgKind } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution, type Tagged } from "../shell/type";
import { is_file_value } from "../files/shell";
import { resolve_path } from "../files/path";
import type { FilesService } from "../files/type";
import { author_names } from "./authors";
import { APP_CATEGORY_LABELS } from "./search";
import type { AppManifest, AppsService } from "./type";

const EXPLORER = "file-explorer";

function app_value(manifest: AppManifest): Tagged {
  return {
    $type: "app",
    id: manifest.id,
    name: manifest.name,
    category: manifest.system ? "System" : APP_CATEGORY_LABELS[manifest.category],
    authors: author_names(manifest),
    description: manifest.description ?? "",
  };
}

export function apps_shell(apps: AppsService, files: () => FilesService): ShellContribution {
  const require_app = (id: string) => {
    const manifest = apps.get(id);
    if (!manifest) throw new ShellError(`no app "${id}". Try app list`);
    return manifest;
  };

  /** Folders open in File Explorer; files in their associated app (ADR-018). */
  async function open_path(path: string): Promise<void> {
    if (await files().get_directory(path)) apps.launch(EXPLORER, { path });
    else await apps.open(path);
  }

  const contributions = [...apps.list()].flatMap(([id, manifest]) => (manifest.shell ? [{ id, shell: manifest.shell }] : []));

  return {
    completers: {
      ...Object.assign({}, ...contributions.map(({ shell }) => shell.completers)),
      [ArgKind.APP]: () => [...apps.list()].map(([id, manifest]) => ({ value: id, detail: manifest.name })),
    },
    values: {
      ...Object.assign({}, ...contributions.map(({ shell }) => shell.values)),
      app: {
        columns: ["id", "name", "category", "authors"],
        text: (app) => `${String(app.id).padEnd(20)} ${String(app.name)}`,
        open: (app) => void apps.launch(String(app.id)),
      },
      file: {
        open: (file) => void open_path(String(file.path)),
      },
    },
    commands: [
      ...contributions.flatMap(({ id, shell }) => (shell.commands ?? []).map((command) => ({ ...command, app: id }))),
      define_command({
        id: "app list",
        description: "Installed apps",
        yields: "app",
        *run() {
          for (const [, manifest] of [...apps.list()].sort(([, a], [, b]) => a.name.localeCompare(b.name))) yield app_value(manifest);
        },
      }),
      define_command({
        id: "app info",
        description: "Details of an app",
        args: z.object({ id: arg.app() }),
        positional: ["id"],
        run({ args }) {
          const manifest = require_app(args.id);
          const { $type: _, authors, ...app } = app_value(manifest);
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
        id: "app launch",
        description: "Open an app in a new window",
        args: z.object({ id: arg.app() }),
        positional: ["id"],
        run({ args }) {
          require_app(args.id);
          apps.launch(args.id);
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
