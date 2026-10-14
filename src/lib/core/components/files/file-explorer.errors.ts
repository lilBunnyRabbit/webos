import { error_message } from "$lib/core/utils";
import kernel, { NotificationType, type NotificationsService } from "$lib/core/api";

export function report_file_error(title: string, error: unknown): void {
  console.error(`[FileExplorer] ${title}`, error);

  kernel.service<NotificationsService>("notifications").notify("file-explorer", {
    type: NotificationType.ERROR,
    title,
    message: error_message(error),
  });
}
