# ADR-006: Notifications Service
**Date:** 2026-01-31
**Status:** Implemented

> **Revision 2026-10-12: notification center** (owner, [brainstorm](../brainstorm/2026-10-12_notification-center.md))
> - Desktop: the taskbar clock becomes the tray button (bell + unread badge + clock). It opens the center as a popover anchored to the dock. No tray-item registry.
> - Mobile: the center is a list at the top of the running-apps switcher; the Cards button shows an unread dot.
> - Open state is `ui.overlay === "notifications"` (ADR-028 revision). On mobile that opens the switcher.
> - Opening the center marks everything read and hides the toasts. `mark_read(id)` stays for API completeness.
> - History stays in memory, capped at 50. Notifications still shown as toasts are never trimmed.
> - **Toast position follows the tray**, no SettingsService preference: bottom-right for a bottom or right dock, top-right for a top dock, bottom-left for a left dock. Mobile: top, centred.

> **Revision 2026-10-10: implementation notes**
> - The notification type is `SystemNotification`, not `Notification`, so it doesn't shadow the DOM `Notification` global.
> - Toasts and history are separate. `toasts` lists the notifications currently shown, and `hide_toast(id)` hides one but keeps it in `all`. `dismiss(id)` removes it from both. The ADR left this split unspecified.
> - `duration` applies to the toast only. The notification stays in `all` until dismissed.
> - The first consumer is the file explorer's error reporting.

## Context

Apps need a way to notify users of events, progress, and results — especially when running background tasks or when the app window isn't focused. A centralized notification system provides consistent UX and a notification center for history.

## Decision

### NotificationsService — Kernel Service

Registered as `"notifications"` in the kernel. Manages toast display and notification center state.

```typescript
type NotificationId = string;

type NotificationType = 'info' | 'warning' | 'error' | 'progress';

interface NotificationAction {
  label: string;
  on_click: () => void;
}

interface NotifyOptions {
  title: string;
  message?: string;
  type?: NotificationType;        // default: 'info'
  icon?: Component;
  duration?: number | null;       // ms, null = persistent, default: 5000
  actions?: NotificationAction[];
  progress?: number | null;       // 0-1 for determinate, -1 for indeterminate
}

interface NotificationUpdate {
  title?: string;
  message?: string;
  type?: NotificationType;
  progress?: number | null;
  actions?: NotificationAction[];
}

interface Notification extends NotifyOptions {
  id: NotificationId;
  app_id: AppId;
  created_at: Date;
  read: boolean;
}
```

### Service API

```typescript
class NotificationsService {
  // Send a notification — returns ID for updates
  notify(app_id: AppId, options: NotifyOptions): NotificationId;

  // Update an existing notification in-place
  update(id: NotificationId, update: NotificationUpdate): void;

  // Dismiss a notification
  dismiss(id: NotificationId): void;

  // Mark as read (for notification center)
  mark_read(id: NotificationId): void;
  mark_all_read(): void;

  // Query
  readonly all: Notification[];         // all notifications (reactive)
  readonly unread_count: number;        // reactive count for badge
}
```

### App Usage

Apps access via kernel:

```typescript
const notifications = kernel.service<NotificationsService>("notifications");

// Simple notification
notifications.notify(app_id, {
  title: "Export complete",
  message: "Saved to /documents/report.pdf",
});

// Progress notification (updatable)
const id = notifications.notify(app_id, {
  title: "Processing images...",
  type: "progress",
  progress: 0,
  duration: null,  // persistent until dismissed
});

// Update progress
notifications.update(id, { progress: 0.5, message: "50% complete" });

// Complete
notifications.update(id, {
  title: "Processing complete",
  type: "info",
  progress: null,
  message: "12 images processed",
});
```

### UI Components

- **Toast area** — renders active toasts (bottom-right or configurable via SettingsService)
- **Notification center** — panel/dropdown listing all notifications, accessible from taskbar
- **Unread badge** — shown on notification center taskbar icon

### Dependencies

- None (standalone service)
- SettingsService (optional — for toast position preference)

## Alternatives Considered

### 1. Window-scoped notifications
Notifications tied to individual windows.
**Rejected:** Notifications should persist even if the window is closed. They're system-level.

### 2. Browser Notification API wrapper
Use native browser notifications.
**Rejected:** Doesn't fit the desktop environment aesthetic. Could be added later as an opt-in alongside the in-app system.

## Consequences

### Positive
- Consistent notification UX across all apps
- Updatable notifications enable progress tracking
- Notification center provides history
- Apps don't need to implement their own notification UI

### Negative
- Another service to maintain
- Toast positioning/stacking needs careful UI work

## Related
- ADR-003: App Context (apps access via kernel)
- Brainstorm: `/docs/brainstorm/2026-01-31_window-api-actions.md`
