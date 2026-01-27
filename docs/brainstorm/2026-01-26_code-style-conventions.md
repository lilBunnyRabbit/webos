# Code Style Conventions Discussion

**Date:** 2026-01-26
**Participants:** Developer, Claude
**Status:** Open

## Context

The project currently uses snake_case for variables, functions, properties, and file names (as documented in CLAUDE.md). Developer is questioning whether this was the right call given JavaScript's native camelCase conventions.

## The Tension

JavaScript's standard library and ecosystem are entirely camelCase:
- Native methods: `forEach`, `addEventListener`, `createElement`, `setTimeout`
- DOM APIs: `getElementById`, `classList`, `innerHTML`
- Framework APIs: Svelte, React, Vue all use camelCase

This creates visual inconsistency when mixing project code with native/library calls:
```typescript
// Mixed conventions in same expression
items.forEach(item => process_item(item));
window.addEventListener("click", handle_click);
```

## Arguments Discussed

### For keeping snake_case
- Personal preference has value - you read this code daily
- Consistency within *your* codebase matters
- Visually distinguishes "my code" from "library code"
- Other languages (Python, Rust, Ruby) use snake_case successfully

### For switching to camelCase
- JavaScript ecosystem standard
- Less cognitive friction
- Contributor expectations
- Tooling defaults

### Middle ground options
- snake_case for data properties, camelCase for functions
- Accept the mix as a non-issue

## Developer's Concern

> "Just feel like I'm complicating a standard because of my preference."

This is the core tension: personal preference vs. ecosystem convention.

## Questions to Consider

1. Is this a solo project or will others contribute?
2. How much does the visual inconsistency actually bother you in practice?
3. Would you regret switching later when the codebase is larger?
4. Is the "distinguishes my code" argument actually useful or post-hoc rationalization?

## Research: Snake_case in JS/TS Ecosystem

Searched for major JavaScript/TypeScript projects using snake_case. **Found none.**

Snake_case in JS/TS is limited to:
- `SCREAMING_SNAKE_CASE` for constants (this is standard)
- API response data from Python/Ruby backends
- Some config files

The JS/TS ecosystem is uniformly camelCase. No major library or framework uses snake_case for internal source code.

This means:
- No prior art to reference
- No "they do it too" justification
- Purely a personal preference choice

## Decision

**Keeping snake_case.**

Rationale: Personal preference, solo project, codebase is the developer's to maintain. The lack of precedent doesn't invalidate the choice - it just means accepting the role of outlier.

## Takeaways

- The inconsistency with native JS methods is a known trade-off
- "No one else does it" noted but not considered a blocker
- May revisit if contributors join or friction becomes significant
