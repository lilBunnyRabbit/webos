# ADR-008: App Props Validation with Zod

**Date:** 2026-01-31
**Status:** Accepted

## Context

Apps receive props when launched programmatically (e.g., opening a file in a media viewer). However, apps must also work with no props since they can be launched from app search. The current system passes props as untyped `Record<string, any>` with no runtime validation — invalid props silently reach the component.

### Related ADRs

- **ADR-001** (App Manifest Structure) — Props schema extends the manifest
- **ADR-003** (App Context) — Props are consumed within app context

## Decision

### Zod Schema in Manifest

App manifests may declare an optional `props` field containing a zod schema:

```typescript
import { define_app } from "$lib/core/api";
import { z } from "zod";

export default define_app({
  id: "media-viewer",
  name: "Media Viewer",
  // ...
  props: z.object({
    file_path: z.string(),
    autoplay: z.boolean(),
  }),
  component: () => import("./media-viewer.app.svelte"),
});
```

### Validation: All-or-Nothing

Props are validated at launch time in `AppsService.launch()` using `safeParse`:

- **Valid** → pass parsed data as props
- **Invalid** → discard entirely, pass `undefined`, **log validation errors**
- **No props given** → `undefined`

No partial validation, no field-level stripping, no defaults injection. The app receives either the full validated object or `undefined`.

### Automatic Logging

When props fail validation, `AppsService.launch()` logs the discarded props and zod validation issues via `console.warn`. This is default behavior built into the service — apps do not need to implement any logging themselves.

```typescript
console.warn(
  `[AppsService] Props for "${id}" failed validation, discarding:`,
  result.error.issues
);
```

### Type Inference

`TProps` is inferred from the zod schema via `z.infer<>`:

```typescript
export function define_app<TSchema extends ZodType>(config: AppConfig & { props?: TSchema }): AppManifest<z.infer<TSchema>>

// Usage — no manual generic needed
define_app({
  props: z.object({ count: z.number() }),
  // TProps automatically = { count: number }
})
```

### App Component Contract

All app props are implicitly optional at the component level. Apps must handle the no-props case:

```svelte
<script lang="ts">
  let { file_path, autoplay }: { file_path?: string; autoplay?: boolean } = $props();
</script>
```

## Alternatives Considered

1. **No validation (current)** — Props pass through unchecked. Simple but error-prone at runtime.
2. **TypeScript-only generics** — Type safety at compile time but no runtime validation. Doesn't help with dynamic prop sources (URL params, IPC, etc.).
3. **Partial validation (strip invalid fields)** — More complex, ambiguous behavior when required fields are missing. Components would need to handle arbitrary subsets of props.

## Consequences

### Positive
- Runtime validation catches bad props before they reach components
- Type inference from schema — single source of truth for prop types
- Simple mental model: props are either all there or undefined
- Zod is lightweight and tree-shakeable

### Negative
- Adds zod as a dependency
- Apps with props need a schema definition (minor boilerplate)
- Invalid props are logged automatically, but only visible in the browser console
