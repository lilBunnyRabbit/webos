import kernel, { NotificationType, type AppId, type NotificationsService } from "$lib/core/api";
import { error_message } from "$lib/core/utils/utils";

export function report_error(app_id: AppId, title: string, reason: unknown): void {
  kernel.service<NotificationsService>("notifications").notify(app_id, { type: NotificationType.ERROR, title, message: error_message(reason) });
}
