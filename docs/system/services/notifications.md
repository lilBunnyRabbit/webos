# NotificationsService

Key `notifications` · Depends on: none · ADR: [006](../../adrs/006-notifications-service.md) · Source: `src/lib/core/api/services/notifications/`, `src/lib/core/components/notifications/toast-area.svelte`

## Purpose

System-level notifications. `notify()` adds one to the history and shows it as a toast. The toast goes away on a timer or on click; the notification stays in `all` until `dismiss()`. This is where user-facing errors go (CONVENTIONS, Errors).

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `all` | `SystemNotification[]` | Every notification, newest first. Reactive |
| `toasts` | `SystemNotification[]` | `$derived`: the subset currently shown as toasts, newest first |
| `unread_count` | `number` | `$derived`: `all` where `!read` |
| `notify(app_id, options)` | `(app_id: AppId, options: NotifyOptions): NotificationId` | Adds to history and shows a toast |
| `update(id, update)` | `(id, update: NotificationUpdate): void` | `Object.assign` onto the stored notification. Unknown id → no-op |
| `dismiss(id)` | `(id): void` | Removes from toasts and history |
| `hide_toast(id)` | `(id): void` | Hides the toast, clears its timer, keeps it in history |
| `mark_read(id)` | `(id): void` | |
| `mark_all_read()` | `(): void` | |

`NotifyOptions`:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `title` | `string` | required | |
| `message` | `string` | | Second line |
| `type` | `NotificationType` | `"info"` | |
| `icon` | `Component` | type icon | Replaces the type icon in the toast |
| `duration` | `number \| null` | `5000`; for `"progress"`, no auto-hide | Toast lifetime in ms. `null` keeps the toast until closed. History is unaffected |
| `actions` | `NotificationAction[]` | | `{ label, on_click }`. Clicking runs `on_click` then hides the toast |
| `progress` | `number \| null` | | `0`–`1` determinate bar, `-1` indeterminate (pulsing) bar, `null`/absent no bar |

`NotificationUpdate` can change `title`, `message`, `type`, `progress`, `actions`. Not `duration` or `icon`.

`SystemNotification` = `NotifyOptions` + `{ id, app_id, type, created_at: Date, read: boolean }`. Named so it doesn't shadow the DOM `Notification`.

### Levels

`NotificationType` is a const-object enum:

| Key | Value | Toast icon | Colour token |
|-----|-------|------------|--------------|
| `INFO` | `"info"` | `Info` | `info` |
| `WARNING` | `"warning"` | `Warning` | `warning` |
| `ERROR` | `"error"` | `XCircle`, `role="alert"` | `error` |
| `PROGRESS` | `"progress"` | `CircleNotch`, spinning | `primary` |

There's no `success` level, although the theme has a `success` token. Non-error toasts get `role="status"`.

## State

| Field | Kind | |
|-------|------|-|
| `all` | `$state<SystemNotification[]>` | Replaced on `notify`/`dismiss`, mutated in place by `update`/`mark_*` (deep proxy) |
| `toast_ids` | private `$state<NotificationId[]>` | Which ids are toasts |
| `timers` | private `Map<id, timeout>` | Auto-hide timers |

## Lifecycle

No `init()`. `destroy()` clears all pending timers.

## Persistence

None. History is in memory and gone on reload.

## Behaviour & invariants

- `notify` prepends to `all` and `toast_ids`, then starts the hide timer (private `schedule_hide`, which clears any existing timer for the id first). Duration: the caller's `duration` if set (`null` → no timer); otherwise none for `type: "progress"`, 5 s for every other type. Returns a uuid.
- `update()` that switches a `"progress"` notification to another type, when the caller never set `duration` and the toast is still showing, starts the default 5 s timer. So `notify({ type: "progress" })` → `update({ type: "success" })` stays up while working and hides 5 s after it finishes.
- A caller-set `duration` on a progress toast is a fixed lifetime from `notify`. `update()` never restarts it.
- The toast's close button calls `hide_toast`, not `dismiss`.

### Toast area

`toast-area.svelte`, mounted in `os.svelte` in the same grid cell as the desktop, so it follows the taskbar position. A `pointer-events-none` flex column, aligned bottom-right (`items-end justify-end`, `p-4`), newest on top. Each toast:

- `w-80`, `bg-background`, 2px border in the level colour, `shadow-window`. Text stays `text-foreground`.
- Grid: icon | title + message | close button. Then an optional progress bar (`bg-current` on `bg-foreground/20`) and an optional row of action buttons.
- Enters/leaves with `fly` (x 24px, 150 ms).

Dialogs ([dialogs.md](dialogs.md)) are in the top layer and cover toasts.

### Who notifies

| Source | app id | When |
|--------|--------|------|
| `files/file-explorer.errors.ts` (`report_file_error`) | `"file-explorer"` | File operation failed |
| `AppsService.open()` | `"apps"` | File not found (error), no app can open it (warning) |
| `AppsService` props validation | the app's id | Props discarded (warning) |

## Divergence from ADR

Covered by ADR-006's revision note: `SystemNotification` name, separate `toasts`/`hide_toast`, `duration` applies only to the toast.

## Known gaps

- No notification center and no unread badge (ADR-006, pending). Nothing reads `all`, `unread_count`, `mark_read` or `mark_all_read`, and nothing calls `dismiss` or `update`. Hidden toasts accumulate in `all` until reload with no way to see them.
- Toast position is fixed bottom-right of the desktop area; ADR-006's SettingsService preference doesn't exist.
- `app_id` is stored but not shown in the toast.
