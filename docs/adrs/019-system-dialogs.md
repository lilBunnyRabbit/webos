# ADR-019: System Dialogs Service
**Date:** 2026-10-11
**Status:** Implemented (2026-10-11, see revision)

> **Revision 2026-10-11: required answers**
> - `DialogOptions.dismissible` (default `true`). With `false`, the host renders `closedby="none"` and cancels Esc, so only the dialog's own buttons close it. This is for questions whose dismissal would silently pick an answer. The session restore dialog is the first: dismissing it used to mean "Start fresh" and threw the saved session away. Menus stay light-dismiss.

> **Revision 2026-10-11: implementation**
> - **Native `<dialog closedby="any">` opened with `showModal()`** (owner decision, over a hand-written `popover="manual"` host). The platform handles Esc, outside-click dismissal, focus trap and return, the top layer and the stack. Dialogs are modal: an outside click closes the top dialog only and does not reach what was clicked, like OS context menus.
> - **Placement by CSS anchor positioning** (owner decision). The host puts a 0×0 anchor at the point; anchored dialogs use `position-area: bottom span-right` with `flip-block`/`flip-inline` fallbacks, unanchored ones `position-area: center`. No JS measuring.
> - The no-anchor fallback point is the center of the focused window's element, else the window container.

## Context

The "Open with" chooser (ADR-018) is the first UI that belongs to no window: it can be triggered from File Explorer, the shell or a deep link. ADR-003's window overlays (`confirm`, `prompt`, `pick_file`) are window-scoped and still deferred. The owner chose a generic layer over a one-off component.

Brainstorm: [2026-10-11 File Associations](../brainstorm/2026-10-11_file-associations.md)

## Decision

A `dialogs` kernel service holds a reactive stack. One `dialogs-host.svelte` at the web-os root renders it above all windows.

```ts
interface DialogsService extends IService {
  readonly stack: DialogEntry[];
  show<T>(
    component: Component<DialogProps<T>>,
    props: object,
    options?: { anchor?: Position },
  ): Promise<T | null>;
}

interface DialogProps<T> {
  resolve(value: T | null): void;
}
```

- `show()` pushes an entry and returns a promise. The dialog component calls `resolve(value)`; the entry is removed and the promise settles.
- `null` means cancelled. Esc and click outside resolve `null` (light dismiss, native via `closedby="any"`).
- `anchor` positions the dialog at a point; without one the host centers it over the focused window, else over the desktop.
- On shutdown (ADR-002 `destroy`) open dialogs resolve `null`.
- Mobile (ADR-016) presentation is open. Because callers only use `show()`, a mobile implementation can change it without touching them.

## Alternatives Considered

- **Single-purpose component on AppsService**: no new infrastructure, but every later system dialog repeats it.
- **Module-level store, no service**: lighter, but not swappable per platform and against "shared state lives in services".

## Consequences

### Positive
- Any service can ask the user something with one awaited call.
- One place handles stacking, focus, dismissal and platform differences.

### Negative
- An eighth service with a single consumer at first.
- Window-scoped overlays (ADR-003) are a separate question: they may reuse the host or not.

## Related
- ADR-002 (lifecycle), ADR-003 (window overlays), ADR-016 (mobile), ADR-018 (file associations)
