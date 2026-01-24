# Architecture Gaps Review
**Date:** 2026-01-24
**Participants:** Developer + Claude (Opus 4.5)

---

## Context

Comprehensive review of all documentation to identify open architecture questions before implementation. This is a rewrite of the original React version - want to get architecture right first.

---

## Critical Decision Points (Must Decide Before Implementing)

### 1. Security Model for Third-Party Apps
**Options:**
- A) Curated only (no third-party) - simplest
- B) iframe isolation - real security, complex API
- C) Trust prompts - user consents, app has full access

**Impact:** Unblocks app store design, capability system decision

---

### 2. Capability System - Keep or Remove?
**Reality:** JavaScript can't enforce capabilities without iframes. Code can access `window`, `document`, `fetch` regardless of declared capabilities.

**Options:**
- A) Remove from spec (if curated apps only)
- B) Implement as documentation/advisory (security theater)
- C) Implement with iframe isolation (real security)

---

### 3. Service Count - 11 Planned vs 5 Implemented
**Current 5:** Windows, Apps, Desktop, Settings, Files

**Proposed 6 more:** Tasks, Notifications, Router, Shortcuts, IPC, Workers, Shell

**Questions:**
- Which are actually needed?
- What triggers adding a new service?
- Should spec only document implemented services?

---

### 4. Router Service - Wrong Layer
**Problem:** Designed as system service, but it's actually an app-level concern.

**Options:**
- A) Remove from spec entirely
- B) Redesign as "URL state sync" service (different purpose)
- C) Keep as optional pattern, not service

---

### 5. Specification vs Implementation
**Problem:** Spec and code don't match (field names, types, patterns differ)

**Decision needed:** Which is source of truth? Update one to match other.

---

## High Priority Gaps

### Service Lifecycle
**Missing:** `destroy()`, `pause()`, `resume()` hooks for service swapping.

**Need to define:**
- When each hook is called
- How state migrates between implementations
- How dependent services handle swaps

---

### App Lifecycle
**Missing:** Hooks for apps to react to window events.

**Proposed:**
- `onMount(ctx)` - app initialized
- `onUnmount()` - cleanup before close
- `onFocus()` / `onBlur()` - window focus changes

---

### Files Service (OPFS)
**Decided:** Use OPFS (sandboxed virtual filesystem)

**Not designed:**
- How to import files from real computer
- How to export files to real computer
- Storage quota handling
- Path → OPFS handle mapping

---

### Persistence Across Sessions
**Missing:**
- Auto-save window state?
- App data persistence pattern
- Backup/restore mechanism

---

### Error Handling
**Missing:**
- Standard error type/format
- Which operations can fail
- Recovery patterns

---

## Medium Priority Gaps

### Inter-Service Communication
**Current:** Direct `kernel.service()` calls

**Missing:** Event/pub-sub system for loose coupling

---

### Keyboard Shortcuts
**Spec promises:** Global + app + window scoped shortcuts with conflict resolution

**Reality:** Not implemented, no design

---

### Performance Metrics
**Spec claims:** Window ops < 16ms, file ops < 100ms, app launch < 500ms

**Missing:** How to measure, benchmark suite, CI monitoring

---

### Naming Conventions
**Issue:** Inconsistent method names across services

**Examples:**
- `launch()` vs `open()`
- `toast()` (type) vs `system()` (source)

---

## Low Priority / Future

- Offline support / service workers
- API versioning strategy
- Testing strategy details
- Svelte 5 runes best practices guide

---

## Recommended Discussion Order

1. **Security model** → Unblocks capability decision
2. **Capability decision** → Simplifies or complicates architecture
3. **Service lifecycle** → Needed for service swapping
4. **App lifecycle** → Improves app developer experience
5. **Files/OPFS design** → Core functionality
6. **Persistence** → User expectation for desktop OS
7. **Error handling** → Developer experience

---

## Action Items

- [ ] Decide security model (curated vs iframe vs trust)
- [ ] Decide capability system fate
- [ ] Define service lifecycle hooks
- [ ] Define app lifecycle hooks
- [ ] Design OPFS file import/export
- [ ] Design session persistence
- [ ] Establish naming conventions
- [ ] Reconcile spec with implementation
