# Mobile Support Brainstorming

**Date:** 2026-02-01
**Participants:** @lilbunnyrabbit, Claude

## Context

The current UI is a desktop OS metaphor (windows, taskbar, desktop grid). Mobile needs a fundamentally different UX — fullscreen apps, app switcher, paged home screen with dock. The kernel's service-swapping design was built for exactly this use case.

## The Core Idea

Swap service implementations based on environment:
- `WindowsService` → `MobileWindowsService` (fullscreen, no drag/resize/snap)
- `DesktopService` → `MobileDesktopService` (pages, dock, app search)
- Taskbar → removed, replaced by mobile navigation patterns
- `SettingsService` → may need mobile-specific settings (no taskbar position)

Services that stay the same: `FilesService`, `AppsService` (mostly), `VersionService`.

## Discussion

### What the kernel already supports

The `init.ts` registration is the single point where services are chosen. Swapping is straightforward:

```typescript
if (is_mobile) {
  register("windows", { instance: MobileWindowsService, dependencies: [] });
  register("desktop", { instance: MobileDesktopService, dependencies: ["apps"] });
} else {
  register("windows", { instance: WindowsService, dependencies: [] });
  register("desktop", { instance: DesktopService, dependencies: [] });
}
```

This works because components access services by name (`kernel.service("windows")`), not by import.

### Problem 1: Interface compatibility

Components call specific methods on services: `windows.open()`, `windows.focus()`, `instance.bounds`, `instance.flags.has("MAXIMIZED")`, `windows.snap()`, etc.

The mobile windows service must expose the **same interface** or components break. Two approaches:

**Option A: Shared interface, different behavior**
- `MobileWindowsService` implements the same `WindowsService` interface
- `snap()` is a no-op, `bounds` always returns fullscreen, `flags` never has `MAXIMIZED` (or always has it)
- Pro: Zero component changes. Con: Leaky abstraction — desktop concepts leak into mobile.

**Option B: Abstract interface + platform-specific components**
- Define `IWindowsService` interface with only the common operations (`open`, `close`, `focus`, `list`, `get`)
- Desktop-specific operations (`snap`, `resize`, `bounds`) only exist on `WindowsService`
- Components that need desktop-specific features check the platform or use type narrowing
- Pro: Clean separation. Con: More work, components need platform awareness.

**Option C: Same service, different component trees**
- Keep services mostly the same, but render completely different component trees for mobile vs desktop
- The `os.svelte` root component switches between `<DesktopShell>` and `<MobileShell>`
- Pro: Cleanest separation at UI level. Con: Duplication in shell components.

### Problem 2: Component coupling

The real challenge isn't services — it's components. The entire component tree assumes desktop:
- `window.svelte` — titlebar, drag handles, resize edges, snap zones
- `window-manager.svelte` — positions windows in a container
- `desktop.svelte` — grid layout for icons
- `taskbar.svelte` — window list, system tray

Mobile needs completely different components:
- Fullscreen app container (no chrome, maybe a status bar)
- App switcher (horizontal scroll of app cards)
- Home screen (paged grid with dock)
- Navigation gestures (swipe up for home, swipe from edge for back)

This suggests **Option C is the most practical** — different component trees, potentially shared services where interfaces align.

### Problem 3: When to detect and switch

- **Build-time**: Separate builds for mobile/desktop. Simplest, but no tablet/responsive support.
- **Runtime (once)**: Detect on load, register appropriate services. Good enough for v1.
- **Runtime (reactive)**: Watch viewport changes, swap services dynamically. Complex — service state would need migration on swap.

Recommendation: **Runtime (once)** for initial implementation. Detect on first load, commit to mobile or desktop. Tablets get mobile by default (can add tablet breakpoint later).

### Problem 4: Apps and responsiveness

**Resolved:** Apps already use Tailwind container queries (`@sm:`, `@md:`, etc.) because windows use `@container`. Apps are inherently responsive to their container size — on mobile that container is just the full viewport. No app changes needed.

The OS will export platform info (e.g., `kernel.platform`) that apps can check if they want platform-specific behavior, but this is opt-in. Most apps should never need it.

### Problem 5: AppsService coupling

`AppsService.launch()` calls `windows.open()` internally. If the mobile windows service has the same `open()` signature, this just works. But the returned `WindowInstance` carries desktop concepts (bounds, snap_zone, constraints).

Options:
- Mobile `WindowInstance` just ignores/defaults those fields
- Create a lighter `MobileWindowInstance` type — but then `AppsService` needs to handle both

### Problem 6: Navigation model

Desktop: window focus/minimize/close via titlebar and taskbar.
Mobile: home gesture, back gesture, app switcher gesture, notifications swipe.

This is entirely a component-level concern. The service just needs `open`, `close`, `focus`, `list`. The navigation UI is different components wired to the same service methods.

## Key Takeaways

1. **Service swapping works at kernel level** — `init.ts` conditional registration is clean
2. **The harder problem is components**, not services — need separate component trees for mobile vs desktop
3. **Option C (shell-level split)** is the most practical approach:
   - `os.svelte` picks `<DesktopShell>` or `<MobileShell>`
   - Each shell has its own component tree
   - Both consume services by the same names
4. **Service interfaces should be formalized** with a shared `IWindowsService` base — desktop adds `snap()`, `resize()`, mobile adds gesture-specific methods
5. **Runtime-once detection** is sufficient for v1
6. **Apps don't need changes** if they're already responsive (they receive full viewport on mobile)

### Problem 7: PlatformService vs simple value

A dedicated `PlatformService` is overkill if it only exposes `platform: "mobile" | "desktop"`. A simple reactive value on the kernel (`kernel.platform`) or an exported constant is sufficient. Could promote to a service later if capabilities grow (touch detection, orientation, PWA mode, etc.), but YAGNI for now.

### Problem 8: Dynamic service swapping at runtime

**Question:** Can we support resizing from desktop → mobile dynamically?

**Analysis:** Even if you transfer the open app list between service implementations, switching shells (`<DesktopShell>` → `<MobileShell>`) unmounts all Svelte components. App component state (form inputs, scroll positions, internal state) is lost regardless of service-level state preservation.

**Options:**
1. **Don't support it (v1)** — Commit on load. This is what real mobile/desktop OS experiences do. Simplest, no edge cases.
2. **Prompt to reload** — Detect breakpoint crossing, show "Switch to mobile mode? App state will reset." User-friendly, honest about the limitation.
3. **Transfer open app list** — Swap services, pass open `app_id`s + props to new service, reopen them. Apps reboot but same set reopens. Medium complexity, still loses component state.

**Decision:** Option 1 for v1. Option 2 as a future enhancement if there's demand.

## Decisions So Far

1. **Apps are already responsive** via container queries — no changes needed, platform info exposed as opt-in convenience
2. **No PlatformService** — simple `kernel.platform` value, promote to service only if needed
3. **No dynamic switching for v1** — commit to platform on load
4. **Shell-level component split** — `os.svelte` renders `<DesktopShell>` or `<MobileShell>`
5. **Service swapping via `init.ts`** — conditional registration based on platform detection

## Open Questions

- Should the app manifest declare `platforms: ["desktop", "mobile"]` to hide incompatible apps?
- Touch interactions: gesture service or purely component-level?
- How does persistence work when same user visits on desktop and mobile? (shared OPFS? separate?)

## Action Items

- [ ] Create ADR for mobile support strategy
- [ ] Define `IWindowsService` base interface (shared between desktop/mobile)
- [ ] Add `platform` detection to kernel
- [ ] Prototype shell-level split in `os.svelte`

## Next Session Topics

- Deep dive into mobile component design (home screen, app switcher, gestures)
- Tablet mode and responsive breakpoints
- App manifest platform compatibility flags
- Mobile-specific service interfaces
