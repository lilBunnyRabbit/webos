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
import { notifications_shell } from "./shell";

const DEFAULT_DURATION = 5000;
const MAX_HISTORY = 50;

export class NotificationsService implements INotificationsService {
  name = "NotificationsService";
  description = "Toasts and notification history";
  inspector = () => import("./inspector.svelte");
  shell = () => notifications_shell(this);

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
    this.trim();

    // A progress toast stays until its work finishes, unless the caller set a duration.
    const duration = options.duration !== undefined ? options.duration : options.type === NotificationType.PROGRESS ? null : DEFAULT_DURATION;
    if (duration !== null) this.schedule_hide(id, duration);

    if (options.system && document.hidden) void this.show_system(id, options);

    return id;
  }

  public async request_system(): Promise<boolean> {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "default") await Notification.requestPermission();
    return Notification.permission === "granted";
  }

  private async show_system(id: NotificationId, options: NotifyOptions): Promise<void> {
    if (!(await this.request_system())) return;
    const notification = new Notification(options.title, { body: options.message, tag: id });
    notification.onclick = () => {
      window.focus();
      this.mark_read(id);
      notification.close();
    };
  }

  public update(id: NotificationId, update: NotificationUpdate): void {
    const notification = this.all.find((item) => item.id === id);
    if (!notification) return;

    const finished_progress =
      notification.type === NotificationType.PROGRESS && update.type !== undefined && update.type !== NotificationType.PROGRESS;

    Object.assign(notification, update);

    if (finished_progress && notification.duration === undefined && this.toast_ids.includes(id)) {
      this.schedule_hide(id, DEFAULT_DURATION);
    }
  }

  /** Drops the oldest past the cap, but never one still on screen as a toast (a running progress toast can be old). */
  private trim(): void {
    let excess = this.all.length - MAX_HISTORY;
    if (excess <= 0) return;
    const dropped = new Set<NotificationId>();
    for (let index = this.all.length - 1; index >= 0 && excess > 0; index--) {
      const { id } = this.all[index];
      if (this.toast_ids.includes(id)) continue;
      dropped.add(id);
      excess--;
    }
    this.all = this.all.filter((notification) => !dropped.has(notification.id));
  }

  private schedule_hide(id: NotificationId, duration: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => this.hide_toast(id), duration)
    );
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
