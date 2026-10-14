# ADR-036: Boot Loading Screen and Boot Weight

**Date:** 2026-10-15
**Status:** Accepted

## Context

WebOS boots like an OS: a splash shows until `kernel.init()` resolves (ADR-002), then the shell mounts. The splash is static, so a slow boot looks frozen. The [2026-10-15 quality pass](../brainstorm/2026-10-15_code-quality-pass.md) measured the boot chunk at 272 KB gz, with both platform shells, every service's shell command code, and dialogs boot never shows all inside it. Chunks the first screen needs (the desktop's widgets, the session's apps) only start loading after mount, which is why widgets flash a loader.

## Decision

1. **Progress.** `kernel.init(on_step?)` calls `on_step({ key, done, total })` before each service's `init()`. The splash in `main.ts` renders a bar and the step's label. The order stays serial (ADR-002).
2. **Platform split.** `os.svelte` imports only the current platform's shell with `import()`; `kernel/init.ts` imports the platform's `WindowsService` and `DesktopService` variants the same way. The other platform's code is never downloaded.
3. **Warm during boot.** While services init, boot starts loading in parallel: the platform shell chunk, the widget components of apps on the desktop, and the components of apps in the saved session. They are `import()` calls only; nothing renders before mount. A failed warm is ignored, since the real import retries.
4. **Off the boot path.** Code boot never runs is imported where it's used: rarely shown dialogs, the file picker, and service shell command bodies (definitions stay eager so completion and the palette work, ADR-033).
5. **Icons.** A local Vite plugin strips phosphor's `thin` and `light` branches. Those weights render as nothing more specific than regular.

## Alternatives Considered

- **Parallel kernel init by dependency level.** Faster on a cold disk, but the intro stacking above Restore relies on order. Rejected; services parallelize their own OPFS work instead.
- **Async `IService.shell()`.** Bigger saving, but every first command or shortcut would await a load.
- **Single-weight generated icons.** Biggest icon saving, but ~600 import sites and a generator to maintain.
- **zod/mini.** Rejected for readability.

## Consequences

- The splash knows about services by key only; it has no service logic.
- A shell built for one platform can't switch without a reload, which is already true (ADR-016 picks the platform once).
- Adding a service's shell commands means two modules: the definitions and the lazily imported bodies.
- `weight="thin"` and `weight="light"` no longer render those styles.
