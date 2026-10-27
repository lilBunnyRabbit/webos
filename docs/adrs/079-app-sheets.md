# ADR-079: App Sheets
**Date:** 2026-10-27
**Status:** Implemented

## Context
Doc Scan straightens a photographed page. Shopping List wants the same step before it reads a photographed list, and other apps will want other apps' small tools the same way. Today an app can only reuse another app's code by importing from its folder (Image Tools imports PDF Tools' writer), which ties one app to the other's files and skips the install model of ADR-077. The file picker already shows how a window borrows UI: `win.pick_file()` opens File Explorer as a sheet over the calling window and resolves a value ([brainstorm](../brainstorm/2026-10-27_doc-scan-and-app-sheets.md)).

## Decision
1. **`provides` on the manifest.** `define_app({ provides: { scan: () => import("./scan-sheet.svelte") } })`: kind → a lazy sheet component. The component takes `AppSheetProps<Input, Output>`: `input` and `resolve(value | null)`.
2. **`win.request(key, input?)` on the window handle.** `key` is `"app-id::kind"` (the owner: "i always loved the :: from rust"). The caller names the provider, so there's no registry of kinds and no clash rule. Keys, inputs and outputs are typed by an `AppSheets` interface the provider extends by declaration merging, so a typo fails `bun run check`.
3. **A sheet over the calling window,** exactly like `pick_file`: DialogsService's window sheet, with the caller's app context, on desktop and in the mobile shell. The window closing resolves `null`.
4. **Loaded on demand, installed or not.** An app that isn't installed loads online the way Open does without installing (ADR-077); one this device doesn't know yet fetches the catalogue first.
5. **Any failure is `null`.** Offline, an unknown app or kind, the manifest or sheet failing to load, the sheet throwing while it renders: `request` resolves `null` and never rejects. The owner: "always assume that it can fail. the app should handle fallback or what happens if it doesn't work". Every caller handles `null` with its own way to carry on.
6. **Shell.** `app provides [kind]` lists every provided sheet, installed or not, as `sheet` values with columns `key` and `app`.

## Alternatives Considered
- **Import the other app's component directly.** Works today (Image Tools → PDF Tools), but the caller depends on the other folder's file layout and the provider's install state is ignored.
- **A registry by kind** (`request("scan")`, any app that scans). Needs a clash rule and a chooser; nobody asked for a second scanner.
- **Opening the provider in its own window** and messaging back. A second window on a phone is a different screen; the sheet keeps the caller in place, as the picker does.

## Consequences
- An app grows a public, typed entry point other apps can use without importing its files.
- Failure is part of the contract: a caller that doesn't handle `null` is a bug.
- The sheet runs inside the caller's window context: `get_app_context()` there is the caller's, so a sheet uses the handle for pickers and keeps its own data out of the caller's storage.
- The catalogue entry gains `provides` (the kinds), so a stub knows them and `app provides` lists apps whose code never loaded.

## Revision 2026-10-27: as built
- **Types.** `AppSheetProps<Input, Output>`, the merge target `AppSheets` (`"doc-scan::scan": { input: ScanInput; output: Blob }`), `AppSheetKey`, `AppSheetInput<K>`, `AppSheetOutput<K>` and `AppSheetLoader` live in `services/apps/type.ts`. `request` takes only `AppSheetKey`s; deleting a provider's folder fails its callers' check, which is the point.
- **Catalogue.** Entries carry `provides: string[]` (the kinds); a stub turns each into a loader that loads the manifest first, like the other lazy parts.
- **Throwing sheets.** `window-sheets.svelte` wraps every sheet in a `<svelte:boundary>` whose `onerror` resolves `null`, so a provider's render error can't take the window down. Errors in a sheet's own event handlers aren't caught there; the sheet resolves `null` itself.
- **Shell values.** `app provides` yields a new `sheet` value type (columns `key`, `app`, no `open`).
