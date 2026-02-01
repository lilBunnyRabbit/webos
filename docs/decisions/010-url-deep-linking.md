# ADR-010: URL Deep Linking & Share System

**Date:** 2026-02-01
**Status:** Accepted

## Context

WebOS runs as a single-page app with no URL routing. Every visit loads the same default desktop state. This makes it impossible to:
- Link directly to a specific app or app state
- Share a demo workspace configuration
- Embed a single app in an iframe on a blog
- Bookmark a specific view

For a portfolio project, shareable links are a killer feature — interviewers and visitors can jump directly to curated demos.

### Related ADRs

- **ADR-007** (Shell Service) — URL params may trigger commands
- **ADR-003** (App Context) — URL-opened apps receive props
- **ADR-008** (App Props Validation) — URL-sourced props are validated via zod

## Decision

### Hash-Based Routing

Use `window.location.hash` for all routing. This avoids server configuration and works on static hosts (GitHub Pages).

```
https://webos.example.com/#/app/file-explorer?path=/documents
https://webos.example.com/#/app/settings?tab=theme
https://webos.example.com/#/demo/showcase
https://webos.example.com/#/workspace?state=eyJ3aW5kb3dzIjp...
```

### Route Types

#### App Links
Open a specific app with optional props:
```
#/app/{app_id}?{props_as_query_params}
```
Props are parsed from query params and validated via the app's zod schema (ADR-008). Invalid props are discarded.

#### File Links
Open a file in its associated app:
```
#/file/{path}
```
Resolves file association and launches the appropriate app.

#### Demo/Workspace Links
Restore a full desktop configuration:
```
#/demo/{preset_name}
#/workspace?state={base64_encoded_json}
```
Workspace state includes: which apps are open, window positions/sizes, and app props.

#### Embed Mode
Strip OS chrome for iframe embedding:
```
#/app/{app_id}?embed=true
```
Hides taskbar and desktop, shows only the app window maximized.

### Implementation

A lightweight router reads the hash on load and on `hashchange`:

```typescript
interface Route {
  type: "app" | "file" | "demo" | "workspace";
  params: Record<string, string>;
}

function parse_hash(hash: string): Route | null;
function serialize_route(route: Route): string;
```

The router lives at the OS level (not a service). On startup:
1. Parse hash
2. If route found, execute it (open app, restore workspace, etc.)
3. Otherwise, load default desktop state

### Share Dialog

Apps can include a "Share" button that:
1. Serializes current app state to URL params
2. Copies the full URL to clipboard
3. Optionally generates a QR code

### Demo Presets

Curated demo configurations stored as static JSON:
```typescript
const DEMO_PRESETS: Record<string, WorkspaceState> = {
  showcase: { /* multiple apps open in arranged layout */ },
  games: { /* game hub + a game open */ },
  productivity: { /* notes + files + terminal */ },
};
```

## Alternatives Considered

1. **`history.pushState`** — Cleaner URLs but requires server-side redirect config. Not feasible on GitHub Pages without hacks.
2. **Query params only** — Works but less structured than hash routing. Conflicts with actual page query params.
3. **No routing** — Current state. Loses a major portfolio and UX feature.

## Consequences

### Positive
- Shareable demos for portfolio and interviews
- Bookmarkable app states
- Embeddable apps for blogs/docs
- Browser back/forward works for hash changes
- Zero server configuration needed

### Negative
- Hash URLs are less "clean" than path-based routing
- Workspace state encoding can create very long URLs
- Props passed via URL must be serializable (no functions, no complex objects)
- XSS risk from URL params — must sanitize all values

### Security
- All URL params must be sanitized before use
- Workspace state JSON must be validated before restoration
- Embed mode should restrict available APIs (no filesystem access from embedded apps)
