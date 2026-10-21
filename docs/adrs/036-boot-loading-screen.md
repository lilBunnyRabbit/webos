# ADR-036: Boot Loading Screen and Boot Weight

**Date:** 2026-10-15
**Status:** Implemented 2026-10-15

> **Revision 2026-10-15: implementation.** The session's app components are warmed by SessionService in its own `init()` (it holds the saved list; no new API). `main.ts` warms widgets after the `desktop` step and awaits the shell chunk with `kernel.init()`, then passes it to `os.svelte` as a prop so it paints with the splash's removal. On first boot VersionService awaits the introduction's chunk inside `init()`, so the introduction is up at the first paint. `changelog.ts` stays eager: boot reads it for the "Updated to vX" toast. Measured on a cold first visit (HTTP/2 + gzip, 1.6 Mbps, 150 ms RTT, 4x CPU): the entry chunk went from 1021 KB / 269 KB gz to 583 KB / 164 KB gz, but time to a ready desktop went from ~2.1 s to ~3.2 s, mostly because the Inter preload (352 KB) now competes with the boot chunks (~2.4 s without it). Warm and unthrottled boots are unchanged.

> **Revision 2026-10-21: chunking and update size** ([slow updates](../brainstorm/2026-10-21_slow-updates.md)). The boot code now ships as three chunks: the entry (`main.ts`, `init.ts`, the app registry, AppsService, VersionService, BackupService and the build stamp), `core` (the rest of the boot graph: kernel, services, shell, kit, Svelte; `vite-core-chunk.ts`) and `app-boot` (what the manifests import: icons, props, sections). A chunk's hash covers the names of the chunks it imports. With the registry and the stamp in the one boot chunk, which nearly every app imports, any app change, version bump or even a rebuild renamed 606 of 765 precached files (5.65 MB). Now `core` holds nothing that reaches app code, the registry, the stamp or the changelog: a rebuild renames 16 files (0.32 MB), an app change 17 (0.33 MB), a version bump plus a changelog edit 17 (0.39 MB). `core` changes, as before, with any OS change and then renames every app. Kernel: `Kernel.init()` no longer calls `register_default_services()`; `main.ts` calls it first, so the kernel module doesn't import the registry. The stamp is read only in `services/version/build-info.ts`. Phosphor imports are rewritten at build time to one file per icon (`phosphor_imports_plugin`), because Rollup puts every static dependency of a manual chunk's modules into it and the barrel would bring every icon. The budget script now counts the preloaded chunks too: boot is 170.5 KB gz in three files (entry 25.9, `core` 131.9, `app-boot` 12.7, with the update-progress work included), against 171.8 KB gz before on 3.19.0 (entry 159.6 plus the `app-meta` chunk, 12.2, which the entry imported statically and the old script didn't count). `app-meta` is no longer on the boot path.

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
