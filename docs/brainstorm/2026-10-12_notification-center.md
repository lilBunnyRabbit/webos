# Notification center + system tray

**Date:** 2026-10-12
**Participants:** owner, Claude

## Context

Roadmap block 3. ADR-006 is implemented for the service and toasts only. `NotificationsService` already keeps `all`, `unread_count`, `mark_read`, `mark_all_read` and `dismiss`, but nothing in the UI reads them: a toast that hides is gone from view until reload (`docs/system/services/notifications.md`, Known gaps). The taskbar ends with the clock (`taskbar-clock.svelte`); there's no tray. The mobile shell has no top bar (mobile-shell brainstorm: "Nothing, safe area only"), so the top-edge shade iOS/Android use isn't available, and the nav bar has three buttons.

## Topics

### 1. Desktop entry point
- **Clock = tray button** (chosen). The clock and a bell with the unread badge become one button at the dock's end. It opens a popover anchored to the dock, like the start menu (Windows 11, macOS).
- Separate bell button: clearer, but one more target in a dock that's already tight when vertical.
- Both, with a calendar header: more UI than the problem needs.

### 2. Mobile entry point
- **Inside the switcher** (chosen). The Running apps screen lists notifications above the cards. The nav bar stays three buttons; the Cards badge adds an unread dot.
- 4th nav-bar button: breaks the familiar trio.
- Home screen bell: unreachable from inside an app.
- Against it: notifications are one hop away and the switcher gets busier.

### 3. Open state
- **`ui.overlay` gets `NOTIFICATIONS`** (chosen, extends ADR-028). One overlay at a time, a shortcut can open it, mobile Back closes it. The tray popover mirrors it both ways, like the start menu.
- Local popover state: no shortcut, and two popovers rely on the auto stack.
- On mobile, `NOTIFICATIONS` opens the switcher (scrolled to the list). One screen, two ways in.

### 4. Read
- **Opening the panel reads everything** (chosen). The badge means "new since you last looked". `mark_read(id)` stays unused.
- Per item: badge clears slowly. Toast seen = read: "seen" is undefinable.

### 5. Persistence
- **Memory only, capped at 50** (chosen). Actions are functions and progress is live work; neither survives a reload. The cap keeps `all` bounded. Notifications still on screen as toasts are never trimmed.
- Persisting to `/var/lib/notifications`: a schema for little gain. Against the pick: the boot "couldn't restore" warning is lost on the next reload.

### 6. Toast position
- **Toasts follow the tray, no setting** (chosen). They stack in the desktop corner nearest the tray: bottom-right for a bottom or right dock, top-right for a top dock, bottom-left for a left dock. ADR-006's SettingsService preference is dropped.

### 7. Tray
- **Plain component, no registry** (chosen). `taskbar-tray.svelte` holds bell + clock. Tasks (ADR-013) edits it when block 4 comes. A tray-item registry would have one consumer.

## Key takeaways

- No new service, no persistence, no schema. `ui` gains one overlay, `NotificationsService` gains a history cap.
- One notification item component renders toasts, the desktop panel and the mobile list.

## Action items

- [x] ADR-006 revision, ADR-028 revision
- [x] Tray button + panel (desktop), list in the switcher (mobile), Alt+Shift+N
- [x] Toasts follow the tray; history cap
- [x] System reference, design docs, roadmap, changelog

## Next session topics

- Window polish (ADR-014): cascade, animations, closed-window stack.
