# Architecture Decision Records (ADR)

This directory contains records of significant architectural decisions made for the WebOS project.

## What is an ADR?

An ADR documents a decision that was made, why it was made, and what alternatives were considered. Unlike brainstorm logs (which capture the discussion), ADRs capture the **final decision** in a concise, referenceable format.

## Format

Each ADR follows this structure:

```markdown
# ADR-{number}: {Title}
**Date:** YYYY-MM-DD
**Status:** Accepted | Superseded by ADR-X | Deprecated

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

| ADR | Title | Date | Status |
|-----|-------|------|--------|
| [001](./001-app-manifest-structure.md) | App Manifest Structure | 2026-01-24 | Accepted |

## When to Create an ADR

- Significant structural decisions
- API design choices
- Technology selections
- Patterns that will be used throughout the codebase

## Relationship to Brainstorm Logs

- **Brainstorm logs** (`/docs/brainstorm/`) = Discussion, exploration, back-and-forth
- **ADRs** (`/docs/decisions/`) = Final decisions, concise reference
