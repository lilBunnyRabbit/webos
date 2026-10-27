import { z } from "zod";
import { define_command } from "../shell/define";
import type { ShellContribution } from "../shell/type";
import type { AppsService } from "./type";

// Loaded with the apps' own commands on the shell's first use, not at boot.
export function sheets_shell(apps: AppsService): ShellContribution {
  return {
    values: {
      sheet: {
        columns: ["key", "app"],
        text: (sheet) => `${String(sheet.key).padEnd(24)} ${String(sheet.app)}`,
      },
    },
    commands: [
      define_command({
        id: "app provides",
        description: "Sheets apps open for other apps (win.request), installed or not",
        args: z.object({ kind: z.string().optional().describe("Only this kind, like scan") }),
        positional: ["kind"],
        yields: "sheet",
        async *run({ args }) {
          await apps.catalogue();
          for (const app of apps.listings().sort((a, b) => a.id.localeCompare(b.id))) {
            for (const kind of Object.keys(app.provides ?? {})) {
              if (!args.kind || kind === args.kind) yield { $type: "sheet", key: `${app.id}::${kind}`, app: app.name };
            }
          }
        },
      }),
    ],
  };
}
