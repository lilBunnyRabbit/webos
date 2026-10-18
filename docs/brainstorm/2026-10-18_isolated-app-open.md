# Isolated app open

**Date:** 2026-10-18
**Participants:** owner, Claude

## Context

Roadmap item under URL Deep Linking. Today a link `#/app/forms?f=…` boots the whole OS: the router waits for the Restore answer, launches Forms over the desktop and clears the hash. Someone filling a shared form sees the Restore dialog, the first-boot intro, the taskbar and the desktop. The goal is a URL that opens one app, full page, and nothing else. Forms is the first user; sharing any single app is the general case.

## Topics

### Shape: which services boot

- Apps don't declare which services they use. `kernel.service()` throws on a missing key, and the window plumbing every app runs in already touches shell, shortcuts, extract, router, clipboard and dialogs. A reduced service set would crash in ways that are only found by clicking.
- **Decided:** boot every key. Solo mode registers solo implementations under the same keys for the behaviour it must not have (Restore dialog, session saving, intro, version notices, desktop layout), the same swap ADR-016 uses for mobile. Full-OS services stay untouched.
- The app itself runs the same as in the full OS. What differs: no desktop, taskbar or other windows, no session.

### Way back to the OS

- Owner: an "Open WebOS" / "Back to OS" control, visibly highlighted. Keeping the app's state when going over is wanted but optional.
- No API exposes an app's live state (Copy link carries launch props), and switching shells in place can't undo boot-time service swaps.
- **Decided:** a primary Open WebOS link in a slim bar opens `#/app/{id}?{props}` in a new tab; the solo tab stays with its state. Rejected: same tab with a dirty confirm (loses a half-filled form), a `snapshot()` state hook in `define_app` (new API every app opts into).

### URL

- **Decided:** `#/solo/{id}?{props}`, a route kind next to `#/app/`. Not cleared, so a reload reopens it. Rejected: `&solo=1` (mixes into props), `?solo` search param (two URL parts).

### Reach

- **Decided:** one window only. Another launch or file open shows a toast pointing to Open WebOS; the app's own dialogs, pickers and sheets work. Rejected: stacked full-page windows, escaping to a full-OS tab.

### Mobile

- **Decided:** one SoloShell for both platforms; platform services still follow detection.

### Opt-in, sharing, shell, storage

- Every app can open solo, no manifest flag.
- Titlebar Copy link becomes a menu: Copy link / Copy solo link. Forms shares forms as solo links; the answer link back stays a full OS link.
- Shell: `link --solo`.
- Solo uses the person's own OPFS and settings. Rejected: a read-only device (breaks Forms' Save answer).

## Action items

- [x] Finish the grill
- [x] [ADR-047](../adrs/047-solo-app-open.md), revision note on ADR-010
- [x] Implement (same day)

## Key takeaways

- Swap services, never drop them: a missing key throws.
- New tab is the cheap way to keep state.
