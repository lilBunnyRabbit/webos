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
| [003](./003-app-context.md) | App Context & AppData | 2026-01-24 | Implemented (app_data became storage.file; no set_icon or status bar) |
| [004](./004-version-update-system.md) | Version & Update Detection | 2026-01-27 | Implemented |
| [005](./005-files-service.md) | Files Service API | 2026-01-27 | Implemented |
| [006](./006-notifications-service.md) | Notifications Service | 2026-01-31 | Implemented |
| [007](./007-shell-service.md) | Shell Service & Terminal | 2026-01-31 | Superseded by ADR-033 |
| [008](./008-app-props-validation.md) | App Props Validation (zod) | 2026-01-31 | Implemented |
| [009](./009-app-ecosystem.md) | App Ecosystem | 2026-02-01 | Accepted |
| [010](./010-url-deep-linking.md) | URL Deep Linking | 2026-02-01 | Implemented (app links; file, workspace, demo, embed deferred) |
| [011](./011-desktop-enhancements.md) | Desktop Enhancements | 2026-02-01 | Implemented (multi-select, wallpaper, Sort by; icon settings not built) |
| [012](./012-shortcuts-service.md) | Shortcuts Service | 2026-02-01 | Implemented (global + window scope, no remap) |
| [013](./013-tasks-service.md) | Tasks Service | 2026-02-01 | Implemented |
| [014](./014-window-enhancements.md) | Window Enhancements | 2026-02-01 | Implemented (single-instance parked) |
| [015](./015-customization-theming.md) | Customization & Theming | 2026-02-01 | Implemented (colours, appearance, export/import, taskbar size and auto-hide; no icon or sound settings) |
| [016](./016-mobile-support.md) | Mobile Support | 2026-02-01 | Implemented |
| [017](./017-keyboard-shortcuts-strategy.md) | Keyboard Shortcuts Strategy | 2026-02-01 | Implemented (tier 1 only; tiers 2-3 not built) |
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
| [029](./029-close-guard-window-title.md) | Close Guard and Window Titles | 2026-10-12 | Implemented |
| [030](./030-text-editor.md) | Text Editor | 2026-10-13 | Implemented |
| [031](./031-open-from-device.md) | Open from Device | 2026-10-13 | Implemented |
| [032](./032-p2p-transfer.md) | P2P Transfer | 2026-10-13 | Implemented |
| [033](./033-shell.md) | Shell, Terminal and Command Palette | 2026-10-14 | Implemented (jobs, window-scoped app commands, bigger language deferred) |
| [034](./034-app-extension-points.md) | App Extension Points: Commands, Badge, Widgets | 2026-10-14 | Implemented (widgets hidden on mobile) |
| [035](./035-app-platform-wave-2.md) | App Platform for the Second App Wave | 2026-10-14 | Implemented |
| [036](./036-boot-loading-screen.md) | Boot Loading Screen and Boot Weight | 2026-10-15 | Implemented |
| [037](./037-backups.md) | Backups | 2026-10-15 | Implemented |
| [038](./038-app-announcements.md) | New-App Announcements and App History | 2026-10-16 | Implemented |
| [039](./039-hopsprite.md) | Hopsprite File Format and Export Pipeline | 2026-10-16 | Implemented |
| [040](./040-installed-apps.md) | Installed Apps | 2026-10-16 | Implemented |
| [041](./041-getting-started.md) | Getting Started and Sample Files | 2026-10-16 | Implemented |
| [042](./042-quick-launch.md) | Taskbar Quick Launch and Drag to Pin | 2026-10-16 | Implemented |
| [043](./043-window-extraction.md) | Window Extraction | 2026-10-16 | Implemented |
| [044](./044-folder-mounts-and-sources.md) | Folder Mounts and One Picker for Every Source | 2026-10-17 | Accepted |
| [045](./045-scoped-app-dependencies.md) | Scoped App Dependencies | 2026-10-17 | Accepted |

All ADR snippets use the snake_case naming from [CONVENTIONS.md](../CONVENTIONS.md). The one exception is the `version.json` wire format in ADR-004.

## When to Create an ADR

- Significant structural decisions
- API design choices
- Technology selections
- Patterns that will be used throughout the codebase

## Relationship to Brainstorm Logs

- **Brainstorm logs** (`/docs/brainstorm/`) = Discussion, exploration, back-and-forth
- **ADRs** (`/docs/adrs/`) = Final decisions, concise reference
