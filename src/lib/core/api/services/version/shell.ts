import { z } from "zod";
import { installer } from "$lib/core/utils/install.svelte";
import { define_command } from "../shell/define";
import type { ShellContribution, Value } from "../shell/type";
import type { AppsService } from "../apps/type";
import { introduced_apps } from "./history";
import { format_took } from "./pipeline";
import type { VersionService } from "./type";

export function version_shell(version: VersionService, apps: () => AppsService): ShellContribution {
  return {
    values: {
      // Its own type rather than `app`, whose columns (id, name, category) would hide when it came.
      "new-app": {
        columns: ["id", "name", "added", "date"],
        text: (app) => `${String(app.id).padEnd(20)} ${String(app.name).padEnd(20)} v${String(app.added).padEnd(8)} ${String(app.date)}`,
        open: (app) => void apps().launch(String(app.id)),
      },
      "ci-job": {
        columns: ["job", "status", "took"],
        text: (job) => `${String(job.job).padEnd(10)} ${String(job.status).padEnd(10)} ${String(job.took)}`,
        open: (job) => void window.open(String(job.url), "_blank", "noopener,noreferrer"),
      },
      release: {
        columns: ["version", "date", "title"],
        text: (release) => `${String(release.version).padEnd(8)} ${String(release.date)}  ${String(release.title)}`,
      },
    },
    commands: [
      define_command({
        id: "version",
        description: "The running WebOS build",
        run: () => ({ version: version.info.version, commit: version.info.commit, built: version.info.buildTime }),
      }),
      define_command({
        id: "ci status",
        description: "The newest CI run on master, one row per job",
        yields: "ci-job",
        async *run({ signal }): AsyncGenerator<Value, void> {
          const pipeline = await version.pipeline(signal);
          if (!pipeline) return;
          for (const job of pipeline.jobs) {
            const took = job.started && job.completed ? format_took(job.completed - job.started) : "-";
            yield { $type: "ci-job", job: job.name, status: job.state, took, url: job.url };
          }
        },
      }),
      define_command({
        id: "changelog",
        description: "Releases, newest first",
        args: z.object({
          changes: z.boolean().default(false).describe("Each change instead of each release"),
          apps: z.boolean().default(false).describe("Each app a release introduced, newest first"),
        }),
        short: { changes: "c" },
        yields: "release",
        async *run({ args }): AsyncGenerator<Value, void> {
          await version.load_changelog();
          if (args.apps) {
            for (const { app, release } of introduced_apps(version.changelog)) {
              const manifest = apps().get(app);
              if (manifest) yield { $type: "new-app", id: app, name: manifest.name, added: release.version, date: release.date };
            }
            return;
          }
          for (const release of version.changelog) {
            if (!args.changes) yield { $type: "release", version: release.version, date: release.date, title: release.title };
            else for (const change of release.changes) yield { version: release.version, kind: change.kind, text: change.text };
          }
        },
      }),
      define_command({
        id: "install",
        description: "Install WebOS as an app",
        available: () => !installer.installed,
        async *run() {
          if (!installer.can_install) {
            yield installer.hint;
            return;
          }
          yield "Installing…";
          const outcome = await installer.install();
          yield outcome === "accepted" ? "Installed." : outcome === "dismissed" ? "Install dismissed." : installer.hint;
        },
      }),
    ],
  };
}
