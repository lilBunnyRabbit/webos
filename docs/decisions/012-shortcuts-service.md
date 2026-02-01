# ADR-012: Shortcuts Service

**Date:** 2026-02-01
**Status:** Accepted

## Context

WebOS needs keyboard shortcuts for window management, file operations, app launching, and in-app actions. The legacy plan documented 100+ shortcuts across categories. Without a centralized service, shortcuts will be scattered across components with no conflict detection, customization, or discoverability.

### Related ADRs

- **ADR-007** (Shell Service) — Command palette uses shortcuts for quick access
- **ADR-006** (Notifications) — Shortcuts may trigger notifications

## Decision

### Shortcuts Service — Kernel Service

Registered as `"shortcuts"` in the kernel. Manages shortcut registration, conflict detection, scope resolution, and key event handling.

### Shortcut Scopes

Shortcuts have one of three scopes, resolved in order of specificity:

1. **Global** — always active (e.g., Alt+Tab, Ctrl+K for command palette)
2. **App** — active when a specific app type has focus (e.g., Space for play/pause in media apps)
3. **Window** — active when a specific window instance has focus

When a key combination matches multiple scopes, the most specific wins: window > app > global.

### Shortcut Definition

```typescript
interface ShortcutDef {
  id: string;
  keys: string[];              // e.g. ["ctrl", "shift", "esc"]
  mac_keys?: string[];         // e.g. ["cmd", "option", "esc"]
  action: () => void;
  description: string;
  category: string;            // "window" | "file" | "system" | "app" | "text"
  scope: "global" | "app" | "window";
  scope_id?: string;           // app_id or window_id for non-global scopes
  enabled?: () => boolean;
}
```

### Service API

```typescript
class ShortcutsService {
  register(shortcut: ShortcutDef): void;
  unregister(id: string): void;
  list(filter?: { scope?: string; category?: string }): ShortcutDef[];
  get_conflicts(keys: string[]): ShortcutDef[];
  readonly enabled: boolean;   // global enable/disable toggle
}
```

### Key Event Handling

The service attaches a single `keydown` listener at the document level. On each event:

1. Build the key combination from the event (modifiers + key)
2. Determine the focused window/app
3. Find matching shortcuts, filtered by scope
4. Execute the most specific match
5. Call `preventDefault()` if a match is found

### OS-Level Default Shortcuts (Phase 1)

| Keys (Win) | Keys (Mac) | Action | Scope |
|---|---|---|---|
| Alt+F4 | Cmd+Q | Close active window | global |
| Alt+Tab | Cmd+Tab | Window switcher | global |
| Ctrl+K | Cmd+K | Command palette | global |
| Ctrl+, | Cmd+, | Open Settings | global |
| Ctrl+Shift+Esc | Cmd+Option+Esc | Task Manager | global |
| Win+D | Cmd+F3 | Show desktop (minimize all) | global |
| Win+E | — | Open File Explorer | global |

Additional shortcuts registered by individual apps and services as they are built.

### Customization

Users can remap non-system shortcuts via Settings > Shortcuts:
- View all registered shortcuts by category
- Change key binding (with conflict detection)
- Disable individual shortcuts
- Reset to defaults
- Stored in SettingsService

### Shortcut Cheat Sheet

Ctrl+/ opens a modal listing all active shortcuts, grouped by category. Searchable.

### OS Detection

Auto-detect platform and display appropriate modifier keys:
- Windows/Linux: Ctrl, Alt, Shift
- macOS: Cmd, Option, Shift

## Alternatives Considered

1. **Decentralized shortcuts in each component** — current implicit approach. No conflict detection, no customization, no discoverability.
2. **Shell-only approach** — use command palette for everything. Rejected — keyboard shortcuts are faster for frequent actions.
3. **Browser-native shortcuts only** — too limited, can't override browser defaults for many combinations.

## Consequences

### Positive
- Single source of truth for all keyboard shortcuts
- Conflict detection prevents duplicate bindings
- Scope system prevents app shortcuts from interfering with global ones
- Customizable shortcuts improve accessibility and user preference
- Cheat sheet provides discoverability

### Negative
- Some browser shortcuts can't be overridden (Ctrl+T, Ctrl+W in some browsers)
- Need to be careful not to hijack important browser shortcuts
- Single keydown listener must be efficient — many registered shortcuts need fast lookup
