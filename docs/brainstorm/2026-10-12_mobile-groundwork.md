# Brainstorm: Mobile groundwork

**Date:** 2026-10-12
**Participants:** owner, agent

## Context

Block 1 of the [agreed order](2026-10-12_roadmap-order.md) includes only the ADR-016 groundwork: platform detection and the windows interface split. The mobile shell is the last block. The owner chose the early split so window features in blocks 3 and 4 land on the right interface.

ADR-016's interface sketch didn't match the code. The real `WindowsService` mixed shared operations with desktop-only ones (`container.bounds`, `set_container`, `snap`). What the shared callers outside the desktop shell use:

| Caller | Uses |
|--------|------|
| AppsService | `open` |
| DialogsService | `focus`, `get_focused`, `list`, `container.element` (anchor fallback) |
| SessionService | `restore`, `sorted_list`, `bounds`, `snap_zone` |
| Window handle | `get`, `is_focused`, `focus`, `close`, `toggle_minimize`, `toggle_maximize`, `bounds` |
| Activity Monitor | `list`, `get`, `close` |

## Topics discussed

### Interface shape

- **The base keeps the name** (chosen). `WindowsService` holds what shared code calls, including maximize and `container.element`. `DesktopWindowsService extends WindowsService` adds `container.bounds`, `set_container`, `snap`. Only three desktop-shell files changed type. Against: maximize and bounds sit in the base though mobile will ignore them.
- A strict base, where callers adapt. Rejected: it touches shared code now for a mobile service that doesn't exist.
- Platform only, no split yet. Rejected: the owner wants the split before the window features land.

### Detection

- **Touch-first plus a URL override** (chosen). `?platform=mobile|desktop` wins; otherwise `(pointer: coarse) and (hover: none)` means mobile.
- Width-based. Rejected: a narrow desktop window would boot as mobile.
- Touch AND narrow. Rejected: two heuristics to reason about.

## Key takeaways

- The ADR sketch was a guess. The split follows the callers that exist.
- `kernel.platform` is read by nothing until the mobile shell exists.

## Action items

- [x] `kernel/platform.ts` + unit tests, `kernel.platform`
- [x] `WindowsService` / `DesktopWindowsService` split
- [x] ADR-016 revision, system docs, roadmap

## Next session topics

- Service tests through a real kernel (the rest of block 1).
