import { v4 as uuid } from "uuid";
import type { AppId } from "../apps/type";
import type {
  NotificationsService as INotificationsService,
  NotificationId,
  NotificationUpdate,
  NotifyOptions,
  SystemNotification,
} from "./type";
import { NotificationType } from "./type";

const DEFAULT_DURATION = 5000;

export class NotificationsService implements INotificationsService {
  name = "NotificationsService";
  description = "NotificationsService";

  to_string(): string {
    return `NotificationsService: ${this.all.length} notifications, ${this.unread_count} unread, ${this.toasts.length} toasts`;
  }

  public all = $state<SystemNotification[]>([]);
  private toast_ids = $state<NotificationId[]>([]);
  private timers = new Map<NotificationId, ReturnType<typeof setTimeout>>();

  public toasts = $derived(this.all.filter((notification) => this.toast_ids.includes(notification.id)));
  public unread_count = $derived(this.all.filter((notification) => !notification.read).length);

  destroy() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  public notify(app_id: AppId, options: NotifyOptions): NotificationId {
    const id = uuid();

    this.all = [
      { ...options, id, app_id, type: options.type ?? NotificationType.INFO, created_at: new Date(), read: false },
      ...this.all,
    ];
    this.toast_ids = [id, ...this.toast_ids];

    const duration = options.duration === undefined ? DEFAULT_DURATION : options.duration;
    if (duration !== null) {
      this.timers.set(
        id,
        setTimeout(() => this.hide_toast(id), duration)
      );
    }

    return id;
  }

  public update(id: NotificationId, update: NotificationUpdate): void {
    const notification = this.all.find((item) => item.id === id);
    if (!notification) return;

    Object.assign(notification, update);
  }

  public dismiss(id: NotificationId): void {
    this.hide_toast(id);
    this.all = this.all.filter((notification) => notification.id !== id);
  }

  public hide_toast(id: NotificationId): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.toast_ids = this.toast_ids.filter((toast_id) => toast_id !== id);
  }

  public mark_read(id: NotificationId): void {
    const notification = this.all.find((item) => item.id === id);
    if (notification) notification.read = true;
  }

  public mark_all_read(): void {
    for (const notification of this.all) {
      notification.read = true;
    }
  }
}
