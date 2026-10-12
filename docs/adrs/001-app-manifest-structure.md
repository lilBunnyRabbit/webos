# ADR-001: App Manifest Structure
**Date:** 2026-01-24
**Status:** Implemented

> **Revision 2026-10-12: one category, system from the folder** (owner, [brainstorm](../brainstorm/2026-10-12_app-candidates.md))
> - `categories: AppCategory[]` (`"system" | "user" | custom-*`) is replaced by a required `category` from a closed const object: Productivity, Media, Utilities, Developer, Games.
> - `system: boolean` is set at discovery from the folder (`./system/*`). `define_app` returns an `AppDefinition` without it.
> - The start menu and mobile drawer group apps into sections by category, System last, while the query is empty. Search ranks name prefix, word prefix, name substring, then id/keywords, then description/category.

## Context

Need a consistent structure for defining app metadata, window configuration, and component loading. Apps should be auto-discovered (no manual registration) with lazy component loading but eager metadata access.

## Decision

Use a **flat structure with nested `defaults`** for complex window configuration:

```typescript
export default define_app({
  // Identity (required)
  id: "calculator",
  name: "Calculator",
  version: "1.0.0",

  // Display (required)
  icon: CalculatorIcon,

  // Display (optional)
  description: "A simple calculator",

  // Classification (optional)
  categories: ["utilities"],
  keywords: ["math", "arithmetic"],

  // Authorship (optional)
  author: "John Doe",
  license: "MIT",
  repository: "https://github.com/...",

  // Window defaults (optional, nested)
  defaults: {
    size: { width: 350, height: 500 },
    constraints: {
      width: { min: 280, max: 500 },
      height: { min: 400 },
    },
    flags: [],
  },

  // Loader (required) - explicit dynamic import
  component: () => import("./calculator.app.svelte"),
});
```

### Lazy Loading Pattern

Explicit dynamic import, with `define_app` handling `.default` extraction:

```typescript
// What you write
component: () => import("./calculator.app.svelte")

// define_app transforms it to
component: () => import("./calculator.app.svelte").then(m => m.default)
```

```typescript
function define_app<T>(config: AppConfig<T>): AppManifest<T> {
  return {
    ...config,
    component: () => config.component().then(m => m.default),
  };
}
```

**Why explicit over convention-based:**
- Clear what's being loaded
- No filename magic
- Easy to understand and debug

### Auto-Discovery via Glob

```typescript
const modules = import.meta.glob<{ default: AppManifest }>(
  './**/index.ts',
  { eager: true }  // Metadata eager
);

export const apps = Object.values(modules).map(m => m.default);
```

- Metadata loads eagerly (available for app listing)
- Component loads lazily (only when app launches)

## Alternatives Considered

### 1. Nested metadata wrapper
```typescript
{ id, metadata: { name, version, ... }, component }
```
**Rejected:** Unnecessary nesting, doesn't match package.json convention.

### 2. Fully flat
```typescript
{ id, name, default_width, min_width, max_width, ... }
```
**Rejected:** Too verbose, window config has many related fields.

### 3. Single-file apps (metadata in .svelte)
```svelte
<script module>
  export const manifest = { ... };
</script>
```
**Rejected:** Prevents lazy component loading.

### 4. Convention-based component loading (no component field)
```typescript
// Glob discovers *.app.svelte automatically based on folder
export default define_app({
  id: "calculator",
  // No component field - discovered by convention
});
```
**Rejected:** Too much magic, prefer explicit imports.

## Consequences

### Positive
- Familiar structure (package.json-like)
- Simple values flat, complex values nested (consistent)
- `defaults` is expandable for future non-window defaults
- Clear intent: defaults can be overridden at launch time
- Auto-discovery eliminates manual registration

### Negative
- Two files per app (index.ts + .app.svelte)
- Must remember to use `define_app` helper

## Related
- Brainstorm: `/docs/brainstorm/2026-01-24_app-architecture.md`
