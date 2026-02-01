# Legacy Gap Analysis — What's Missing from Current Roadmap

**Date:** 2026-02-01
**Context:** Reviewing legacy docs (PLAN.md, TODO.md, DOCUMENTATION.md, IDEAS.md, etc.) against current ROADMAP.md to identify missing items.

---

## 1. Missing Services (not in current roadmap)

| Service/System | Source | Notes |
|---|---|---|
| **Tasks Service** | PLAN.md Phase 2.2 | Listed briefly in ROADMAP P2 but missing detail. Original plan had deep `@lilbunnyrabbit/task-manager` integration with progress tracking, retry, task groups, visual Task Manager app |
| **Workers Service** | PLAN.md Phase 6 | Mentioned in P4 but no detail. Web Worker pool for heavy ops (compression, image processing, WASM) |
| **URL Router / Deep Linking** | PLAN.md Phase 7.1 | Not in current roadmap at all. Hash-based routing for app deep links, workspace sharing, demo modes, embed support |
| **Capabilities/Permissions** | PLAN.md Phase 7 | Deferred in CLAUDE.md but not tracked. `domain:action:scope` format |

## 2. Missing Apps

### Planned but not in current ROADMAP P3

| App | Source | Description |
|---|---|---|
| **Game Hub** | PLAN.md Phase 3.1 | Game library browser, categories, play time tracking, recently played |
| **Nonogram** | PLAN.md Phase 3.2 | Priority puzzle game with editor, color support, hint system |
| **Other Puzzle Games** | PLAN.md Phase 3.2 | Kakuro, maze, word search (osmosmerka), nurikabe, futoshiki |
| **Quick Notes (quno)** | PLAN.md Phase 4.1 | Chronological unorganized notes, timestamps, markdown, tags |
| **Speed Reader** | PLAN.md Phase 4.2 | RSVP reading, library management, adjustable WPM |
| **Markdown-to-PDF** | PLAN.md Phase 4.2.5 | Live preview, custom styling, templates, batch conversion |
| **Work Hours Tracker** | PLAN.md Phase 4.3 | Time tracking, monthly reports, PDF export |
| **Series Tracker** | PLAN.md Phase 5.1 | TV show tracker with TMDB API, episode tracking, watchlist |
| **Gifski Wrapper** | PLAN.md Phase 5.2 | Video-to-GIF converter via WASM |
| **Image Editor** | PLAN.md Phase 5.3 | Basic crop, resize, rotate, filters, format conversion |
| **Video Tools** | PLAN.md Phase 5.3 | Trimmer, merger, audio extraction |
| **Compression Tools** | PLAN.md Phase 6.1 | DEFLATE, LZ77, Huffman + WASM implementation |
| **P2P File Transfer** | PLAN.md Phase 6.2 | WebRTC file sharing with QR codes |
| **Color Tools (Chromatics)** | PLAN.md Phase 2.3 | Color picker, palette generator, harmony calculator, contrast checker, color blindness simulator |
| **RNG Tools** | PLAN.md Phase 2.1 | Dice roller, coin flip, list shuffler, password generator |
| **Profiler App** | PLAN.md Phase 7.3.5 | Performance profiling per window, render counts, FPS overlay (existed in React version) |
| **Style Guide App** | TODO.md | Component showcase / design system app |
| **QR Code Scanner** | Ideas Dump | QR code scanner app |
| **static-utils ports** | PLAN.md Phase 2.1 | Image combiner, PDF generator, video trimmer/cropper, video merger, file download utility |

## 3. Missing System Features (not yet documented in recent talks)

### Window System
- **Single-instance apps** — flag in manifest, focus existing window instead of opening new one (PLAN.md 1.1)
- **Window animations** — open, close, minimize, maximize transitions (PLAN.md 1.1)
- **Minimize animation to taskbar** (PLAN.md 1.1)
- **Reopen last closed window** — Ctrl+Shift+T (PLAN.md shortcuts)
- **Window grouping by app** — taskbar groups windows of same app (IDEAS.md)
- **Session persistence** — save/restore open windows (partially in roadmap)

### Desktop
- **Desktop icon multi-selection** — marquee selection, Ctrl+Click, Shift+Click, group drag/delete (PLAN.md 1.1)
- **Desktop wallpapers** — upload, presets, solid colors, gradients, fit/fill/stretch/tile, blur/opacity (PLAN.md 1.1)
- **Desktop context menu** — right-click on desktop background (PLAN.md 1.1)
- **Icon auto-arrange** (PLAN.md 1.1)
- **Desktop app sorting in settings** (IDEAS.md)

### Taskbar
- **System tray area** — background apps, notifications (PLAN.md 1.1)
- **Clock/date display** — in current roadmap as single item
- **Quick launch area** (PLAN.md 1.1)
- **Context menus for taskbar items** (PLAN.md 1.1)
- **Task count badge** — when background tasks running (PLAN.md 2.2)

### File System
- **File search/filter** (TODO.md, PLAN.md)
- **Drag-and-drop file operations** (TODO.md)
- **Copy/paste operations** (TODO.md)
- **File rename** (TODO.md)
- **File properties dialog** (TODO.md)
- **Back/forward navigation** (TODO.md)
- **File associations** — file type to app mapping (PLAN.md, partially in roadmap)

### Keyboard Shortcuts
- **Comprehensive shortcuts system** — PLAN.md has an exhaustive list covering window management, file operations, text editing, media controls, app-specific, accessibility, developer shortcuts
- **Shortcut cheat sheet** — Ctrl+/ to show all shortcuts
- **Customizable shortcuts** in settings
- **Shortcut conflict detection**

### Versioning & Updates
- **Update notification UI polish** — animations, z-index, toast vs banner (PLAN.md 1.0)
- **Changelog display** in Settings About (PLAN.md 1.0)
- **Version report changelog** (IDEAS.md)
- **Retry logic with exponential backoff** for update checks (PLAN.md 1.0)
- **Option to disable auto-check** in settings (PLAN.md 1.0)

### Customization
- **Custom wallpapers** — upload, presets, Unsplash integration (PLAN.md 7.6)
- **Background effects** — blur, overlay, tint (PLAN.md 7.6)
- **Window appearance** — animation speed, shadow, border, transparency (PLAN.md 7.6)
- **Sound effects** — window sounds, notifications, typing sounds (PLAN.md 7.6)
- **Theme export/import** as JSON, share via URL (PLAN.md 7.6)
- **Desktop icon size settings** (PLAN.md 7.6)
- **Taskbar auto-hide** (PLAN.md 7.6)

### Window API (from TODO.md)
- **Confirmation modal** via WindowHandle
- **Small notifications** per-window
- **Update title/icon dynamically**
- **Open file overlay** (file picker overlay in window)

### App Store concept (IDEAS.md)
- Load apps into cache, only show loaded apps
- Version management per app
- Auto-update if app not open

### Kernel Events (IDEAS.md)
- Custom kernel events with zod validation

### Shadow DOM (Ideas Dump, IDEAS.md)
- App isolation via Shadow DOM

## 4. Infrastructure & Technical Items

- **PWA / Service Worker** — offline mode, caching strategies, background sync, push notifications (PLAN.md Phase 8)
- **WebAssembly** — Rust-compiled modules for compression, image processing, crypto (PLAN.md Phase 6)
- **Testing** — Vitest + Playwright/Cypress (in roadmap P4 but minimal detail)
- **CI/CD** — GitHub Actions for builds, automated testing, deployments (PLAN.md Phase 9)
- **SEO / Open Graph** — dynamic meta tags, Twitter cards (PLAN.md 7.7)
- **Mobile responsive** — touch gestures, virtual keyboard, simplified UI (PLAN.md Phase 8)
- **Accessibility (WCAG)** — keyboard nav, ARIA, screen reader, high contrast (PLAN.md Phase 8)
- **Performance targets** — <100ms interaction, <3s load, 50+ windows (PLAN.md)

## 5. Web APIs to Consider (from WEB_APIS_RECOMMENDATIONS.md)

High-priority additions not yet discussed:
- **View Transition API** — smooth window animations
- **Broadcast Channel API** — cross-tab communication
- **Screen Capture API** — screenshot app
- **EyeDropper API** — native color picker for Color Tools app
- **Picture-in-Picture API** — video PiP windows
- **Web Locks API** — prevent race conditions in shared OPFS
- **Compression Streams API** — built-in compression
- **Gamepad API** — controller support for games
- **Media Session API** — system media controls for media preview
- **Wake Lock API** — prevent sleep during long tasks

---

## Key Takeaways

1. **The current ROADMAP.md is very focused on core infrastructure** (services, lifecycle, app context) which is correct for the Svelte rewrite stage. But it's missing the broader app ecosystem vision from the legacy plan.

2. **Game Hub was a major planned feature** — not just individual games but a game library/launcher with play time tracking, categories, save management.

3. **URL deep linking / share system** was considered a "killer feature" for portfolio showcase — completely absent from current roadmap.

4. **The legacy plan had ~15+ apps planned** vs current roadmap listing only 4 (Media Preview, Tic-Tac-Toe, Text Editor, Calculator).

5. **Desktop multi-selection, wallpapers, and customization** were planned in detail but not captured in current docs.

6. **The `@lilbunnyrabbit/task-manager` integration** was a promotional opportunity — Task Manager app as a showcase for your npm package.

7. **Several "ideas" items** not in any formal plan: QR code scanner, shadow DOM isolation, kernel custom events with zod, app store with cache management, window grouping by app.

---

## Action Items

- [ ] Decide which legacy apps to carry forward to Svelte roadmap
- [ ] Add Game Hub section to ROADMAP.md
- [ ] Add URL deep linking/share system to roadmap
- [ ] Add desktop enhancements (multi-select, wallpapers) to roadmap
- [ ] Add Task Manager app + task-manager integration detail
- [ ] Add comprehensive keyboard shortcuts to roadmap
- [ ] Decide priority of customization features
- [ ] Track Web API recommendations for relevant services
