# Architecture Decision Records (ADR)

This directory contains records of significant architectural decisions made for the WebOS project.

## What is an ADR?

An ADR documents a decision that was made, why it was made, and what alternatives were considered. Unlike brainstorm logs (which capture the discussion), ADRs capture the **final decision** in a concise, referenceable format.

## Format

Each ADR follows this structure:

```markdown
# ADR-{number}: {Title}
**Date:** YYYY-MM-DD
**Status:** Accepted | Implemented | Superseded by ADR-X | Deprecated

## Context
What prompted this decision?

## Decision
What did we decide?

## Alternatives Considered
What other options were evaluated?

## Consequences
What are the implications of this decision?
```

## Index

**Accepted** = decided, not built. **Implemented** = in the code. Check the code before trusting either.

| ADR | Title | Date | Status |
|-----|-------|------|--------|
| [001](./001-app-manifest-structure.md) | App Manifest Structure | 2026-01-24 | Implemented |
| [002](./002-service-lifecycle.md) | Service Lifecycle Hooks | 2026-01-24 | Implemented (no swap/state yet) |
| [003](./003-app-context.md) | App Context & AppData | 2026-01-24 | Implemented (no app_data/overlays yet) |
| [004](./004-version-update-system.md) | Version & Update Detection | 2026-01-27 | Implemented |
| [005](./005-files-service.md) | Files Service API | 2026-01-27 | Implemented (explorer features pending) |
| [006](./006-notifications-service.md) | Notifications Service | 2026-01-31 | Implemented |
| [007](./007-shell-service.md) | Shell Service & Terminal | 2026-01-31 | Accepted |
| [008](./008-app-props-validation.md) | App Props Validation (zod) | 2026-01-31 | Implemented |
| [009](./009-app-ecosystem.md) | App Ecosystem | 2026-02-01 | Accepted |
| [010](./010-url-deep-linking.md) | URL Deep Linking | 2026-02-01 | Accepted |
| [011](./011-desktop-enhancements.md) | Desktop Enhancements | 2026-02-01 | Accepted |
| [012](./012-shortcuts-service.md) | Shortcuts Service | 2026-02-01 | Implemented (global + window scope, no remap) |
| [013](./013-tasks-service.md) | Tasks Service | 2026-02-01 | Accepted |
| [014](./014-window-enhancements.md) | Window Enhancements | 2026-02-01 | Implemented (single-instance, grouping parked) |
| [015](./015-customization-theming.md) | Customization & Theming | 2026-02-01 | Accepted |
| [016](./016-mobile-support.md) | Mobile Support | 2026-02-01 | Implemented (core shell; apps pass and back pending) |
| [017](./017-keyboard-shortcuts-strategy.md) | Keyboard Shortcuts Strategy | 2026-02-01 | Revised (Alt+Shift scheme) |
| [018](./018-file-associations.md) | File Associations | 2026-10-11 | Implemented |
| [019](./019-system-dialogs.md) | System Dialogs Service | 2026-10-11 | Implemented |
| [020](./020-service-inspectors.md) | Service Inspectors | 2026-10-11 | Implemented |
| [021](./021-file-system-hierarchy.md) | File System Hierarchy | 2026-10-11 | Implemented |
| [022](./022-desktop-folder.md) | Desktop Folder and Shortcuts | 2026-10-11 | Implemented |
| [023](./023-session-persistence.md) | Session Persistence | 2026-10-11 | Implemented |
| [024](./024-design-system.md) | Design System | 2026-10-11 | Implemented |
| [025](./025-menus-sheets-clipboard.md) | Context Menus, Window Sheets and Clipboard | 2026-10-11 | Implemented |
| [026](./026-release-notes-intro.md) | Release Notes and First-Run Introduction | 2026-10-11 | Implemented |
| [027](./027-testing.md) | Testing | 2026-10-12 | Implemented |
| [028](./028-ui-service.md) | UI Service | 2026-10-12 | Implemented |

All ADR snippets use the snake_case naming from [CONVENTIONS.md](../CONVENTIONS.md). The one exception is the `version.json` wire format in ADR-004.

## When to Create an ADR

- Significant structural decisions
- API design choices
- Technology selections
- Patterns that will be used throughout the codebase

## Relationship to Brainstorm Logs

- **Brainstorm logs** (`/docs/brainstorm/`) = Discussion, exploration, back-and-forth
- **ADRs** (`/docs/adrs/`) = Final decisions, concise reference
