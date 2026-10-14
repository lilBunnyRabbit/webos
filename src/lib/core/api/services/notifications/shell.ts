import { z } from "zod";
import { format_datetime } from "$lib/core/utils";
import { define_command } from "../shell/define";
import type { ShellContribution } from "../shell/type";
import { NotificationType, type NotificationsService } from "./type";

export function notifications_shell(notifications: NotificationsService): ShellContribution {
  return {
    values: {
      notification: {
        columns: ["time", "title", "message"],
        cell: (item, column) => (column === "time" ? format_datetime(Number(item.time)) : String(item[column] ?? "")),
        text: (item) => `${format_datetime(Number(item.time))}  ${String(item.title)}${item.message ? `: ${String(item.message)}` : ""}`,
      },
    },
    commands: [
      define_command({
        id: "notify",
        description: "Show a notification",
        args: z.object({
          title: z.string(),
          message: z.string().optional(),
          type: z.enum([NotificationType.INFO, NotificationType.WARNING, NotificationType.ERROR]).default(NotificationType.INFO),
        }),
        positional: ["title", "message"],
        run({ args }) {
          notifications.notify("shell", { title: args.title, message: args.message, type: args.type });
        },
      }),
      define_command({
        id: "notifications",
        description: "Notification history, newest first",
        yields: "notification",
        *run() {
          for (const item of notifications.all) {
            yield { $type: "notification", time: item.created_at.getTime(), type: item.type, app: item.app_id, title: item.title, message: item.message ?? "" };
          }
        },
      }),
    ],
  };
}
