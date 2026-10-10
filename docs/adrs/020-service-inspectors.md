# ADR-020: Service Inspectors
**Date:** 2026-10-11
**Status:** Implemented (2026-10-11)

## Context

The Kernel app shows each service as `name`, `description` and the `to_string()` text. A string can't carry the views services actually need: the window table, theme swatches, the app registry, the dialog stack. The owner wants each service to decide what it shows and how it looks, with a toggle between basic and detailed information.

## Decision

### 1. `IService.inspector`: lazy, owned by the service

```ts
export interface InspectorProps<T extends IService = IService> {
  service: T;
  detailed: boolean;
}

export interface IService {
  // ...
  /** Kernel app view of this service. Loaded only when inspected. */
  inspector?: () => Promise<{ default: Component<InspectorProps<never>> }>;
}

// services/windows/service.svelte.ts
inspector = () => import("./inspector.svelte");
```

- The component lives in the service's folder (`services/{key}/inspector.svelte`). A swapped implementation (ADR-016) brings its own.
- It's lazy, so no inspector code loads until the Kernel app opens.
- The inspector reads only the service's public API, the same as any other consumer.
- A service without an inspector falls back to `to_string()`. `to_string()` stays for debugging.

### 2. One component, `detailed` prop

The inspector always renders its basic view. With `detailed: true` it adds the detailed view below it. Sharing one component keeps layout and state stable when the view is toggled.

### 3. Toggle per service, plus expand all

Each service card has its own chevron. A header toggle expands or collapses every card. The expanded set is persisted in the Kernel app's storage (`storage.persisted`, ADR-003).

## Alternatives Considered

- **Registry in the Kernel app** (service key → component): keeps services UI-free, but the service doesn't own its view, and a swapped implementation can't bring its own.
- **Glob `services/*/inspector.svelte`**: no interface change, but it works by naming convention and ties the folder name to the service key.
- **`to_string()` as the basic view**: lightest, but the basic row stays plain text.
- **Two components (summary + details)**: two files per service, and no shared state.
- **One global toggle only**: can't look at one service in depth while the others stay compact.

## Consequences

### Positive
- Every service gets a view that fits its data.
- Inspectors are code-split away from boot.

### Negative
- `IService` changes shape. The service layer now points at a `.svelte` file (AppsService already imports a dialog).
- `InspectorProps<never>` is needed so a component typed for one service fits the shared field. The Kernel app casts once when rendering.
- Every new service should ship an inspector. The fallback hides when one is missing.

## Related
- ADR-002 (service lifecycle), ADR-003 (app storage), ADR-016 (service swapping)
- Brainstorm: [2026-10-11 Kernel inspector](../brainstorm/2026-10-11_kernel-inspector.md)
