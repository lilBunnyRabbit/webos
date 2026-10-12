# Brainstorm: Mobile shell

**Date:** 2026-10-12
**Participants:** owner, agent

## Context

The owner pulled block 8 of the [agreed order](2026-10-12_roadmap-order.md) forward: full focus on the mobile shell (ADR-016). The [groundwork](2026-10-12_mobile-groundwork.md) is in: `kernel.platform` and the `WindowsService` / `DesktopWindowsService` split. Nothing reads `platform` yet.

The owner's brief:

- Phones and tablets get one UI (responsive). Desktop keeps what it has.
- Behaviour comes from the services the shell uses, not from platform checks inside components. Mobile gets its own windows and desktop implementations.
- iOS/Android-like: fullscreen apps, a paged home screen, a list of running apps.
- Nothing may clash with the device's own gestures: WebOS runs inside a mobile browser.
- Design it in the browser and follow the design docs.
- First pass is the core shell. Adjusting individual apps for small screens is a second pass.

Gestures the device owns, so WebOS stays away from them:

| Where | iOS | Android |
|-------|-----|---------|
| Left edge swipe | Browser back | Back |
| Right edge swipe | Browser forward | Back |
| Bottom edge | Home indicator / Safari toolbar | Home, recents |
| Top edge | Notification / Control Center | Notification shade |
| Pull down at the top | Pull to refresh | Pull to refresh |

## Topics discussed

### How the shell gets picked

- **Root branch plus swapped services** (chosen). `init.ts` registers the mobile implementations when `kernel.platform` is mobile. `os.svelte` renders `MobileShell` or `DesktopShell` once; everything inside types against its platform's service. Against: a desktop component dropped into the mobile tree gets the wrong service at runtime, not at compile time.
- Services ship their own view (like inspectors). Rejected: the shell layout belongs to no single service, so a new "shell" owner would appear.

### What a running app is

- **Mounted cards, live** (chosen). `MobileWindowsService` keeps `WindowInstance` records. The focused one is fullscreen; the rest stay mounted and hidden. Home is "nothing focused" (the state desktop already has when every window is minimized). The switcher scales the real mounted windows into cards, so previews are live. Against: every open app stays in memory; there's no auto-kill.
- Unmount background apps. Rejected: anything outside window state (scroll, unsaved text) is lost on every switch.

### Home screen

- **Desktop folder pages plus an app drawer** (chosen). Home shows the `/home/Desktop` items, the same ones the desktop shows. All apps live in a drawer with search, which replaces the start menu. A dock holds a few items.
- All apps, iOS style. Rejected: desktop shortcuts and files would vanish on mobile.
- Reuse the desktop's `layout.json`. Rejected: desktop cells mean nothing on a four-column phone.

### Navigation

- **Three-button bar** (chosen): back, home, running apps. The owner: they use the gesture handle on their own phone, and so do most people, so a WebOS handle right above the system one would be impossible to use. Buttons don't clash with anything.
- Handle bar with swipe up / hold. Rejected for that clash.
- Edge swipes (ADR-016's original plan). Rejected: both edges belong to the OS.

### Back

- **Layer stack, no OS back** (chosen). Back closes the top shell layer (drawer, switcher), then sends the app home; the app keeps running. The OS back gesture keeps its browser meaning for now.
- Apps claiming back (`window.on_back`), and wiring the OS back gesture through history: parked for a separate brainstorm (roadmap item). Both touch ADR-010 deep linking.

### Where shell state lives

- **The service owns focus only** (chosen). Switcher open and drawer open are local `$state` in the mobile shell; a window gaining focus closes them. Against: a future shortcut (ADR-012) can't open the switcher without reaching into the shell.

### Top of the screen

- **Nothing, safe area only** (chosen). The device already shows a status bar with a clock. Apps run under it with `env(safe-area-inset-top)` padding. Toasts come from the top.

### Session

- **Same file, bounds ignored** (chosen). Mobile writes `/var/lib/session/session.json` like desktop; restore ignores geometry. Platform and OPFS are both per device, so the two only meet with `?platform=`.

### Desktop service shape

The desktop service addresses items by grid position (`remove_item(position)`), which means nothing on a paged home.

- **Base interface by entry name** (chosen). `DesktopService` keeps the shared surface: `items()`, `open`, `pin`, `remove_item(name)`, `rename_item(name, new_name)`, `create_folder`, `names`. `GridDesktopService` adds the desktop's container, grid, `list()` and `move_item`. `MobileDesktopService` adds pages and the dock. `desktop-actions.ts` moves from positions to names.
- Each keeps its own addressing. Rejected: the rename and delete flows couldn't be shared.

### Sharing the folder logic

- **Composition** (chosen): a `DesktopFolder` class holds the folder state and operations (read, watch, seed, pin, open, remove, rename). Both services own one and add their layout on top.
- An abstract base class. Rejected: inheritance, no such pattern in the repo.
- Mobile extending the desktop class. Rejected: carries grid state it never uses.

### Home layout

- **Ordered flow, no gaps** (chosen). Icons pack left to right; pages fill by capacity (columns x rows measured from the screen). `/var/lib/desktop/home-layout.json` holds an order list and the dock names. Rotation and tablets just reflow. This replaced the page/x/y idea from the first round once rotation came up.
- Free cells (page, x, y). Rejected: rotating or a tablet changes the column count, and every page would need refitting.

### Home editing

- **Long-press menu plus drag reorder** (chosen). A long press with no movement opens the context menu; a long press followed by movement drags to reorder, across pages by holding near the side (inset from the edge). Movement before the timer is a page swipe.

## Key takeaways

- No WebOS gesture starts at a screen edge. Navigation is buttons.
- The windows service decides what's on screen (focused app or home); the shell decides its own overlays.
- The `/home/Desktop` folder is one source for two layouts: desktop cells and the mobile order.

## Action items

- [ ] ADR-016 revision with these decisions
- [ ] `refactor:` DesktopService base by name, `DesktopFolder`, `GridDesktopService`
- [ ] `MobileWindowsService`, `MobileDesktopService`, registration by platform
- [ ] Mobile shell: home pages, dock, drawer, switcher, nav bar, toasts, dialogs at phone size
- [ ] System docs, design docs (shell), roadmap, changelog
- [ ] Second pass: apps at phone width

## Next session topics

- Back: apps claiming it, and the OS back gesture through history (with ADR-010).
- Apps pass: which apps need work at phone width.
