import { z } from "zod";
import { format_bytes } from "$lib/core/utils";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution } from "../shell/type";
import { BACKUP_AREAS, BackupError, type BackupArea, type BackupService } from "./type";

async function reported<T>(command: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof BackupError) throw new ShellError(`${command}: ${error.message}`);
    throw error;
  }
}

export function backup_shell(backup: BackupService): ShellContribution {
  const idle = () => backup.activity === null;

  return {
    commands: [
      define_command({
        id: "backup create",
        description: "Save a backup zip to this device; every area without flags",
        args: z.object({
          files: z.boolean().default(false).describe("Files (/home)"),
          settings: z.boolean().default(false).describe("Settings (/etc)"),
          apps: z.boolean().default(false).describe("App data (/var/lib and app storage)"),
        }),
        available: idle,
        async run({ args }) {
          const flagged = BACKUP_AREAS.filter(({ area }) => args[area]);
          const areas: BackupArea[] = (flagged.length > 0 ? flagged : BACKUP_AREAS).map(({ area }) => area);
          const saved = await reported("backup create", () => backup.create(areas));
          return saved ? `saved ${saved.name} · ${format_bytes(saved.size)}` : "not saved";
        },
      }),
      define_command({
        id: "backup restore",
        description: "Replace data with a backup zip from this device, then reload",
        available: idle,
        async run() {
          const restored = await reported("backup restore", () => backup.restore());
          return restored ? "restored, reloading…" : "not restored";
        },
      }),
    ],
  };
}
