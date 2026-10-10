# App Props Validation (ADR-008) Implementation

**Date:** 2026-10-11
**Participants:** Owner, Claude

## Context

ADR-008 (accepted 2026-01-31): an optional zod `props` schema in the app manifest, `safeParse` in `AppsService.launch()`, all-or-nothing (invalid means `undefined` plus `console.warn`), `TProps` inferred from the schema, every prop optional in the component.

State of the code:

- `launch(id, props?: AppProps)` passes props straight to the window; `window-content.svelte` spreads them into the component.
- Callers: `desktop-item.svelte:28` (`item.props`, currently never set: the grid seeds settings and file-explorer without props) and the start menu (no props).
- Only the Example app reads props (`count?: number`). No other app declares any.
- zod 4 is installed (came with ADR-003).

Gaps the ADR doesn't cover:

- **Apps without a schema.** The ADR only says what happens when a schema exists. Props given to an app with no schema could pass through unchecked (today's behaviour) or be dropped.
- **Where failures go.** The ADR says `console.warn`. Since then ADR-006 added NotificationsService and the rule "report user-facing errors there".

## Topics

| Question | Decision | Rejected |
|----------|----------|----------|
| Props given to an app with no schema | Discarded and reported, same as invalid props. One rule: props need a schema | Pass through unchecked (keeps the untyped path ADR-008 exists to close) |
| Where failures are reported | `console.warn` plus a warning notification ("{App} opened without its data"). AppsService gains a `notifications` dependency | `console.warn` only (Claude's recommendation: bad props are a caller bug; owner chose visibility for when file associations/URLs feed props) |

### Defaults Claude chose

- `AppProps = Record<string, unknown>`, schema typed `ZodType<TProps>`: props are spread into the component, so they must be an object.
- `launch(id, props?: unknown)`: callers can't know the target's props type from a string id; the schema is the check.
- `AppConfig.component` is `Component<Partial<NoInfer<TProps>>>`: types come from the schema only, and a component with a required prop is a compile error. `define_app`'s default `TProps` is `{}` so schema-less apps with no props still type-check.
- The notification is raised for both cases (no schema, invalid), from one `discard_props` path.

## Key takeaways

1. Props reach an app only through its schema. Everything else becomes `undefined`, a console warning and a toast.
2. "Handle no props" is enforced by the compiler, not by convention.

## Action items

- [x] Implement in AppsService, `define_app`, types; Example app declares `z.object({ count: z.number() })`
- [ ] File associations (File Explorer opens files in apps) will be the first real props source

## Next session topics

- File associations: how a file maps to an app, and the props shape it passes.
