import { z } from "zod";
import { define_command } from "../shell/define";
import type { ShellContribution, Value } from "../shell/type";
import type { VersionService } from "./type";

export function version_shell(version: VersionService): ShellContribution {
  return {
    values: {
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
        id: "changelog",
        description: "Releases, newest first",
        args: z.object({ changes: z.boolean().default(false).describe("Each change instead of each release") }),
        short: { changes: "c" },
        yields: "release",
        *run({ args }): Generator<Value, void> {
          for (const release of version.changelog) {
            if (!args.changes) yield { $type: "release", version: release.version, date: release.date, title: release.title };
            else for (const change of release.changes) yield { version: release.version, kind: change.kind, text: change.text };
          }
        },
      }),
    ],
  };
}
