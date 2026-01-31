# App Props Validation
**Date:** 2026-01-31
**Participants:** Developer + Claude (Opus 4.5)

---

## Context

Reviewing how app component props are defined and passed. Current implementation uses a generic `AppProps` type (`Record<string, any>`) with no runtime validation. Props flow from `launch()` → `AppInstance` → `window-content.svelte` where they're spread onto the dynamic component.

### Problem

1. **No runtime validation** — Any object can be passed as props, silently causing issues
2. **No type connection** — The generic on `defineApp<TProps>` is lost after registry lookup; `launch()` accepts untyped `AppProps`
3. **Props must always be optional** — Apps are launchable from app search with no props, so every app must handle the no-props case

### Current Flow

```
defineApp({ component }) → registry.set(id, manifest)
                                    ↓
apps.launch(id, props?)  → windows.open({ component, props })
                                    ↓
window-content.svelte    → <Component {...props} />
```

The `props` value is passed through without any validation or transformation.

---

## Discussion

### Approach: Zod Schema in Manifest

Add an optional `props` field to the app manifest that holds a zod schema. This schema is used at launch time to validate incoming props.

```typescript
import { z } from "zod";

export default defineApp({
  id: "example",
  name: "Example",
  // ...
  props: z.object({
    count: z.number(),
  }),
  component: () => import("./example.app.svelte"),
});
```

### Validation Semantics: All-or-Nothing

Props are either **fully valid** or **`undefined`**. No partial merging or field-level stripping.

- If props are passed and valid → use them
- If props are passed and invalid → discard entirely (`undefined`)
- If no props passed → `undefined`

This keeps app components simple — they receive `Props | undefined` and handle the undefined case (which they must do anyway for app-search launches).

### Where Validation Happens

In `AppsService.launch()`, before passing to `windows.open()`. When validation fails, the service automatically logs which props were discarded and why — this is built into the launch logic, not something individual apps need to handle.

```typescript
public launch(id: AppId, props?: AppProps): WindowId {
  const manifest = this.registry.get(id);
  // ...

  let validated_props: AppProps | undefined;
  if (props && manifest.props) {
    const result = manifest.props.safeParse(props);
    if (result.success) {
      validated_props = result.data;
    } else {
      console.warn(
        `[AppsService] Props for "${id}" failed validation, discarding:`,
        result.error.issues
      );
      validated_props = undefined;
    }
  }

  return this.windows_service.open({
    // ...
    props: validated_props,
  });
}
```

### Type Inference

Zod's `z.infer<>` can derive the props type from the schema, removing the need for a separate generic parameter:

```typescript
// Before — manual generic
defineApp<{ count: number }>({ ... })

// After — inferred from schema
defineApp({
  props: z.object({ count: z.number() }),
  // TProps = { count: number } inferred
})
```

The `defineApp` signature would use conditional types to infer `TProps` from the schema when present, falling back to `{}` when no schema is provided.

### App Component Pattern

Apps must handle undefined props:

```svelte
<script lang="ts">
  // Props are always optional — app may be launched from search
  let { count }: { count?: number } = $props();
</script>

{#if count !== undefined}
  <p>Count: {count}</p>
{:else}
  <p>No count provided</p>
{/if}
```

---

## Key Takeaways

1. **Zod schema** as optional field in app manifest for runtime prop validation
2. **All-or-nothing** — valid props or `undefined`, no partial objects
3. **Type inference** from schema via `z.infer<>`, no manual generics needed
4. **Validation at launch** in `AppsService.launch()`, not in the component
5. **Apps always handle undefined** — props are a convenience, not a requirement

---

## Action Items

- [ ] Create ADR-008 for app props validation
- [ ] Install zod
- [ ] Add `props` schema field to `AppManifest` / `AppConfig`
- [ ] Update `defineApp` to infer `TProps` from schema
- [ ] Add validation in `AppsService.launch()`
- [ ] Update example app to use schema + handle undefined props
