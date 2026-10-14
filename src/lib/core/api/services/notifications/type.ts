import type { Component } from "svelte";
import type { IService } from "../../type";
import type { AppId } from "../apps/type";

export type NotificationId = string;

export const NotificationType = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  PROGRESS: "progress",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export interface NotificationAction {
  label: string;
  on_click: () => void;
}

export interface NotifyOptions {
  title: string;
  message?: string;
  /** Defaults to `"info"`. */
  type?: NotificationType;
  icon?: Component;
  /** Toast lifetime in ms. `null` keeps the toast until dismissed. Defaults to 5000, or for `"progress"` to staying until an update switches the type, then 5000. */
  duration?: number | null;
  actions?: NotificationAction[];
  /** 0-1 for determinate, -1 for indeterminate. */
  progress?: number | null;
  /** Also a browser Notification while the tab is hidden; asks for permission on first use (ADR-035). */
  system?: boolean;
}

export interface NotificationUpdate {
  title?: string;
  message?: string;
  type?: NotificationType;
  progress?: number | null;
  actions?: NotificationAction[];
}

/** Named to avoid shadowing the DOM `Notification` global. */
export interface SystemNotification extends NotifyOptions {
  id: NotificationId;
  app_id: AppId;
  type: NotificationType;
  created_at: Date;
  read: boolean;
}

/**
 * System-level notifications (ADR-006). A notification is shown as a toast, then stays in the
 * history (`all`) until dismissed.
 */
export interface NotificationsService extends IService {
  /** Every notification, newest first. Capped at 50; ones still shown as toasts are kept past the cap. */
  readonly all: SystemNotification[];

  /** Notifications currently shown as toasts, newest first. */
  readonly toasts: SystemNotification[];

  readonly unread_count: number;

  /**
   * Sends a notification and shows it as a toast.
   * @returns The ID to update or dismiss it with.
   */
  notify(app_id: AppId, options: NotifyOptions): NotificationId;

  /** Asks for browser notification permission, ideally from a click. Resolves whether `system` alerts can show. */
  request_system(): Promise<boolean>;

  /** Updates a notification in place. No-op for unknown IDs. */
  update(id: NotificationId, update: NotificationUpdate): void;

  /** Removes a notification from the toasts and the history. */
  dismiss(id: NotificationId): void;

  /** Hides the toast but keeps the notification in the history. */
  hide_toast(id: NotificationId): void;

  mark_read(id: NotificationId): void;
  mark_all_read(): void;
}
