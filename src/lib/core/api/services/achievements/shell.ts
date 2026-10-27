import { z } from "zod";
import { format_date } from "$lib/core/utils";
import { arg } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution, type Tagged } from "../shell/type";
import type { AppsService } from "../apps/type";
import type { AchievementEntry, AchievementsService } from "./type";

const LIBRARY = "app-library";

export interface AchievementValue extends Tagged {
  $type: "achievement";
  app: string;
  app_id: string;
  id: string;
  title: string;
  text: string;
  unlocked: boolean;
  unlocked_at: number | null;
  progress: string;
  builtin: boolean;
}

function value(entry: AchievementEntry, apps: AppsService): AchievementValue {
  const hidden = entry.def.secret && !entry.unlocked;
  return {
    $type: "achievement",
    app: apps.get(entry.app_id)?.name ?? entry.app_id,
    app_id: entry.app_id,
    id: hidden ? "" : entry.def.id,
    title: hidden ? "Secret" : entry.def.title,
    text: hidden ? "" : entry.def.text,
    unlocked: entry.unlocked,
    unlocked_at: entry.unlocked_at,
    progress: hidden ? "" : (entry.progress_text ?? ""),
    builtin: entry.builtin,
  };
}

export function achievements_shell(achievements: AchievementsService, apps: () => AppsService): ShellContribution {
  return {
    commands: [
      define_command({
        id: "achievements",
        description: "Achievements of an app, or of every app that has some: achievements | where unlocked == true",
        args: z.object({ app: arg.app().optional() }),
        positional: ["app"],
        yields: "achievement",
        async *run({ args }) {
          if (args.app !== undefined && !apps().get(args.app)) throw new ShellError(`no app "${args.app}". Try app list`);
          achievements.list(args.app);
          await achievements.idle();
          for (const entry of achievements.list(args.app)) yield value(entry, apps());
        },
      }),
    ],
    values: {
      achievement: {
        columns: ["app", "title", "unlocked", "progress"],
        cell: (item, column) => {
          if (column !== "unlocked") return String(item[column] ?? "");
          if (!item.unlocked) return "no";
          return item.unlocked_at === null ? "yes" : format_date(new Date(Number(item.unlocked_at)));
        },
        text: (item) => `${String(item.app).padEnd(16)} ${item.unlocked ? "✓" : " "} ${String(item.title)}${item.progress ? `  ${String(item.progress)}` : ""}`,
        open: (item) => void apps().launch(LIBRARY, { app: String(item.app_id) }),
      },
    },
  };
}
