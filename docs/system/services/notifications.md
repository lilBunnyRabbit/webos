# NotificationsService

Key `notifications` · Depends on: none · ADR: [006](../../adrs/006-notifications-service.md) · Source: `src/lib/core/api/services/notifications/`, `src/lib/core/components/notifications/` (`toast-area`, `notification-list`, `notification-item`) · Inspector: `inspector.svelte` (ADR-020)

## Purpose

System-level notifications. `notify()` adds one to the history and shows it as a toast. The toast goes away on a timer or on click; the notification stays in `all` until `dismiss()`. This is where user-facing errors go (CONVENTIONS, Errors).

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `all` | `SystemNotification[]` | Every notification, newest first, capped at 50. Reactive |
| `toasts` | `SystemNotification[]` | `$derived`: the subset currently shown as toasts, newest first |
| `unread_count` | `number` | `$derived`: `all` where `!read` |
| `notify(app_id, options)` | `(app_id: AppId, options: NotifyOptions): NotificationId` | Adds to history and shows a toast |
| `update(id, update)` | `(id, update: NotificationUpdate): void` | `Object.assign` onto the stored notification. Unknown id → no-op |
| `dismiss(id)` | `(id): void` | Removes from toasts and history |
| `hide_toast(id)` | `(id): void` | Hides the toast, clears its timer, keeps it in history |
| `mark_read(id)` | `(id): void` | |
| `mark_all_read()` | `(): void` | |
| `request_system()` | `(): Promise<boolean>` | Asks for browser notification permission if not decided yet. Call it from a click (Pomodoro's Start) so the prompt isn't blocked. Resolves whether `system` alerts can show |

`NotifyOptions`:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `title` | `string` | required | |
| `message` | `string` | | Second line |
| `type` | `NotificationType` | `"info"` | |
| `icon` | `Component` | type icon | Replaces the type icon in the toast |
| `duration` | `number \| null` | `5000`; for `"progress"`, no auto-hide | Toast lifetime in ms. `null` keeps the toast until closed. History is unaffected |
| `actions` | `NotificationAction[]` | | `{ label, on_click }`. Clicking runs `on_click` then hides the toast |
| `system` | `boolean` | `false` | While the tab is hidden, also a browser `Notification` (title, message, `tag` = id). Asks for permission on first use; denied → toast only. Clicking it focuses the tab and marks it read (ADR-035) |
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

None. History is in memory and gone on reload (ADR-006 revision: actions are functions, progress is live work).

## Behaviour & invariants

- `notify` prepends to `all` and `toast_ids`, trims the history to 50 (oldest first, skipping any notification still shown as a toast, so a long-running progress toast survives), then starts the hide timer (private `schedule_hide`, which clears any existing timer for the id first). Duration: the caller's `duration` if set (`null` → no timer); otherwise none for `type: "progress"`, 5 s for every other type. Returns a uuid.
- `update()` that switches a `"progress"` notification to another type, when the caller never set `duration` and the toast is still showing, starts the default 5 s timer. So `notify({ type: "progress" })` → `update({ type: "info" })` stays up while working and hides 5 s after it finishes.
- A caller-set `duration` on a progress toast is a fixed lifetime from `notify`. `update()` never restarts it.
- The toast's close button calls `hide_toast`, not `dismiss`.

### Notification center

Desktop: the tray popover ([taskbar](../shell/taskbar.md#tray-and-notification-center)). Mobile: a list on top of the switcher ([mobile shell](../shell/mobile.md#windows-and-switcher)). Both render `notification-list.svelte` and open through `ui.overlay === "notifications"` ([UiService](ui.md)). While shown, everything is marked read (`mark_all_read`) and toasts are hidden. An entry's close button and actions call `dismiss`; "Clear all" dismisses every one. The unread badge reads `unread_count`.

### Toast area

`toast-area.svelte`. On desktop, `desktop-shell.svelte` mounts it in the desktop's grid cell and places it in the corner nearest the tray (ADR-006 revision): bottom-right for a bottom or right dock, top-right for a top dock, bottom-left for a left dock; toasts slide in from the left only for a left dock (`from` prop). On mobile it's top, centred, sliding down. A `pointer-events-none` flex column, `p-4`, newest on top. It has `min-h-0` and scrolls (scrollbar hidden) when the stack is taller than its grid cell, with `justify-end-safe` so the overflow starts at the newest toast; without this a tall stack grew the grid row and pushed the taskbar off screen. Each toast is a `notification-item.svelte` (shared with the notification center):

- `w-80`, `rounded-xl bg-background-lighter p-3 shadow-popover`. `role="alert"` for errors, `role="status"` otherwise.
- Grid: icon tile | title + message | dismiss `IconButton` ("Dismiss"). The icon tile is the type's colour at 12% with the full colour as ink (`info`, `warning`, `error`; `progress` uses `primary` and spins). The title is `text-ui font-semibold`, the message `text-ui` at 80%. A custom `icon` replaces the type icon.
- An optional 4px progress bar under the text column (`primary` on `foreground/12`, with the percentage beside it; a pulsing third for indeterminate `progress < 0`), then an optional row of `Button`s, all `sm`: the first `primary`, the rest `secondary`. On a `progress` toast every action is `secondary`, so Cancel doesn't shout.
- Enters/leaves with `fly` (x 24px, 180 ms).

Dialogs ([dialogs.md](dialogs.md)) are in the top layer and cover toasts.

### Who notifies

| Source | app id | When |
|--------|--------|------|
| `files/file-explorer.errors.ts` (`report_file_error`) | `"file-explorer"` | File operation failed |
| File Explorer (`file-explorer.svelte`, `file-actions.ts`) | `"file-explorer"` | The open folder was moved or deleted (info), Save to disk finished |
| [TasksService](tasks.md) jobs (zip and unzip, PDF Tools) | the calling app's id | A `progress` toast with Cancel, updated through `update()` at most every 150 ms, then done, cancelled or failed (Archive adds Discard / Keep for a partial file) |
| `AppsService.open()` | `"apps"` | File not found (error), broken `.desktop` shortcut or `.widget` (error), no app can open it (warning) |
| `AppsService` props validation | the app's id | Props discarded (warning) |
| `SessionService` restore | `"session"` | Some saved windows couldn't be restored (warning, one toast with the count) |
| `RouterService` | `"router"` | Link copied (info) or couldn't be copied; a deep link that's unknown, names a missing app or has bad props (error) |
| `VersionService` | `"version"` | Updated to a new version (sticky, "What's new"), a new version is ready (sticky, "Update and reload") |
| `ShellService.execute()` | `"shell"` | A command run from a shortcut or the palette failed (error) |
| `notify` command | `"shell"` | Whatever the user asked for |

## Divergence from ADR

Covered by ADR-006's revision notes: `SystemNotification` name, separate `toasts`/`hide_toast`, `duration` applies only to the toast; the history cap; toast position follows the tray instead of a setting.

## Shell

Contributes `notify`, `notifications` and the `notification` value type (`notifications/shell.ts`). See [shell](shell.md#contributions).

## Known gaps

- No toast tap action: a toast doesn't open the center or the sending app.
- `app_id` is shown in the center, not in the toast.
- `system` alerts depend on a timer firing in a hidden tab, which Chrome throttles to about once a minute: up to a minute late.
