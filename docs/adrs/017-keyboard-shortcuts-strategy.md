# ADR-017: Keyboard Shortcuts Strategy

**Date:** 2026-02-01
**Status:** Revised 2026-10-12

> **Revision 2026-10-12: Alt+Shift** (owner, [brainstorm](../brainstorm/2026-10-12_shortcuts.md)). The `Ctrl+Shift+` scheme below doesn't hold: Ctrl+Shift+W closes the browser window and Ctrl+Shift+T reopens a tab (neither interceptable in Chrome), Ctrl+Shift+Esc is Windows' Task Manager, Ctrl+Space switches input on macOS, and Ctrl+Shift+arrows select text. OS shortcuts use **Alt+Shift** (Option+Shift on macOS) instead: close W, maximize ↑, minimize ↓, snap ← →, show desktop D, next/previous window Alt+\` / Alt+Shift+\`. Mod+K launcher, Mod+/ cheat sheet, Mod+, Settings. Tiers 2 and 3 (PWA, Keyboard Lock) aren't built. Not configurable in v1.


## Context

A browser-based web OS cannot intercept many standard OS keyboard shortcuts (`Alt+Tab`, `Win+Arrow`, `Cmd+Tab`, etc.) because the native OS or browser handles them before JavaScript receives the event. This creates a UX gap where users expect familiar window management shortcuts but the web platform cannot deliver them.

This ADR documents which shortcuts are interceptable, which are not, and establishes a consistent alternative keybind scheme for WebOS.

## OS Shortcut Conflict Analysis

### Window Management

| Shortcut | OS(es) | Native Action | Interceptable? | WebOS Alternative |
|----------|--------|---------------|----------------|-------------------|
| `Alt+Tab` | Win/Linux | Switch windows | No (OS) | `Ctrl+Tab`* / app switcher UI |
| `Cmd+Tab` | macOS | Switch apps | No (OS) | App switcher UI |
| `Win+Up/Down` | Windows | Maximize/minimize | No (OS) | `Ctrl+Shift+Up/Down` |
| `Win+Left/Right` | Windows | Snap window | No (OS) | `Ctrl+Shift+Left/Right` |
| `Super+Arrow` | Linux | Tile/maximize | No (OS) | `Ctrl+Shift+Arrow` |
| `Cmd+M` | macOS | Minimize | No (OS) | `Ctrl+Shift+M` |
| `Alt+F4` | Win/Linux | Close window | **Yes** | Intercept directly |
| `Cmd+Q` | macOS | Quit app | No (OS) | `Ctrl+Shift+Q` |
| `Win+D` | Windows | Show desktop | No (OS) | `Ctrl+Shift+D` |
| `Super` alone | Win/Linux | Start menu | No (OS) | Click taskbar / `Ctrl+Space` |

### Browser-Protected Shortcuts

These are captured by the browser before JavaScript can intercept them.

| Shortcut | Browser Action | Interceptable? | WebOS Alternative |
|----------|----------------|----------------|-------------------|
| `Ctrl/Cmd+W` | Close tab | **No** (Chrome) | `Ctrl+Shift+W` |
| `Ctrl/Cmd+T` | New tab | **No** (Chrome) | Use shell/launcher |
| `Ctrl/Cmd+N` | New window | **No** (Chrome) | `Ctrl+Shift+N` |
| `Ctrl/Cmd+Tab` | Next tab | **No** | Custom cycle binding |
| `Ctrl/Cmd+1-9` | Switch tab | **No** | Prefix with Shift/Alt |
| `Ctrl/Cmd+Shift+T` | Reopen tab | **No** | Avoid |
| `Ctrl/Cmd+Shift+N` | Incognito | **No** | Avoid |
| `Ctrl/Cmd+L` | Address bar | Partial | `Ctrl+Shift+L` |

### Safely Interceptable (via `preventDefault`)

| Shortcut | Default Action | WebOS Use |
|----------|---------------|-----------|
| `Ctrl/Cmd+S` | Save page | App save |
| `Ctrl/Cmd+O` | Open file | App open file |
| `Ctrl/Cmd+F` | Find in page | In-app search |
| `Ctrl/Cmd+P` | Print | App print |
| `Ctrl/Cmd+R` / `F5` | Reload | Block or custom |
| `Ctrl/Cmd+Z` | Undo | App undo |
| `Ctrl/Cmd+Shift+Z` | Redo | App redo |
| `F1-F12` | Various | Custom |
| `Escape` | Various | Close dialog/menu |
| `Alt+Space` | Win system menu | Window menu |

*`Ctrl+Tab` is browser-protected in normal mode but freed in PWA standalone.

### System Shortcuts (Never Interceptable)

| Shortcut | OS | Action |
|----------|-----|--------|
| `Ctrl+Alt+Del` | Windows | Security screen |
| `Ctrl+Alt+F1-F6` | Linux | TTY switch |
| `Win+L` | Windows | Lock screen |

## Decision

### Primary Modifier Prefix: `Ctrl+Shift+`

All WebOS window management shortcuts use `Ctrl+Shift+` as the primary modifier, mirroring the native shortcut's key but replacing `Win/Super/Cmd` with `Ctrl+Shift`.

### WebOS Keybind Scheme

#### Window Management
| Action | Shortcut |
|--------|----------|
| Close window | `Ctrl+Shift+W` / `Alt+F4` |
| Maximize/restore | `Ctrl+Shift+Up` |
| Minimize | `Ctrl+Shift+Down` |
| Snap left | `Ctrl+Shift+Left` |
| Snap right | `Ctrl+Shift+Right` |
| Snap top-left | `Ctrl+Shift+Home` |
| Snap top-right | `Ctrl+Shift+PageUp` |
| Snap bottom-left | `Ctrl+Shift+End` |
| Snap bottom-right | `Ctrl+Shift+PageDown` |
| Show desktop | `Ctrl+Shift+D` |

#### App Switching & Launching
| Action | Shortcut |
|--------|----------|
| App switcher / window cycle | `` Alt+` `` |
| Reverse cycle | `` Alt+Shift+` `` |
| Command palette / shell | `Ctrl+K` |
| App launcher | `Ctrl+Space` |

#### In-App (Context-Dependent, intercepted)
| Action | Shortcut |
|--------|----------|
| Save | `Ctrl+S` |
| Open | `Ctrl+O` |
| Find | `Ctrl+F` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Copy/Cut/Paste | `Ctrl+C/X/V` (**never intercept**) |

### Tiered Capture Strategy

**Tier 1 - Normal browser mode (default):**
- `Ctrl+Shift+` prefix for window management
- Intercept safe `Ctrl+` shortcuts (`S`, `O`, `F`, `P`, `Z`)
- `` Alt+` `` for window cycling
- `Ctrl+K` / `Ctrl+Space` for launcher/shell

**Tier 2 - PWA standalone mode (recommended):**
- All Tier 1 bindings
- `Ctrl+W`, `Ctrl+T`, `Ctrl+N`, `Ctrl+Tab` become available (no browser UI)
- More native experience

**Tier 3 - Fullscreen + Keyboard Lock (opt-in, Chromium only):**
- All Tier 2 bindings
- `Alt+Tab`, `Escape`, `Meta` key capturable
- Full desktop replacement experience
- Long-press `Esc` (2s) always exits

### Feature Detection

```typescript
const has_keyboard_lock = 'keyboard' in navigator && 'lock' in (navigator as any).keyboard;
const is_pwa_standalone = window.matchMedia('(display-mode: standalone)').matches;
const is_fullscreen = !!document.fullscreenElement;
```

The shortcuts service (ADR-012) should detect the current tier and adjust available bindings accordingly.

### Implementation Notes

1. **All shortcuts must be configurable** - Users have different OS/browser combos
2. **Show cheat sheet** - `Ctrl+Shift+/` to open shortcut reference
3. **Scope-based** - Global, app-level, and window-level scopes (per ADR-012)
4. **Conflict detection** - Warn at registration time if a shortcut conflicts with known browser/OS shortcuts for the detected platform

## Alternatives Considered

1. **Requiring fullscreen + Keyboard Lock** - Too restrictive; only works on Chromium, poor UX for casual use
2. **Using `Alt+` prefix for everything** - Conflicts with browser menu bar access on Windows/Linux
3. **Using `Cmd/Ctrl+` directly** - Too many browser conflicts in normal mode
4. **No alternative shortcuts** - Poor UX; users expect keyboard-driven window management

## Consequences

- Window management shortcuts require learning new key combos (`Ctrl+Shift+` instead of `Win+`)
- PWA standalone mode becomes the recommended deployment for best experience
- The shortcuts service must be platform-aware to adjust defaults per OS
- Cheat sheet / onboarding becomes important for discoverability
- Future Keyboard Lock support can progressively enhance the experience on Chromium
