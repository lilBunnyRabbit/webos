# Architecture Review Session
**Date:** 2026-01-24
**Participants:** Developer + Claude (Opus 4.5)

---

## Context

First deep-dive session reviewing the WebOS architecture after migration from React to Svelte 5. Goal was to get professional assessment of current approach and identify areas for improvement.

---

## Topics Discussed

### 1. Kernel Pattern Assessment

**Current State:** Kernel acts as service registry with dependency resolution.

**Pros identified:**
- Service swapping (mobile/desktop implementations)
- Runtime service discovery
- Dependency injection for testing

**Cons identified:**
- Adds indirection without clear benefit for single-developer project
- Capability system not implemented
- Over-engineered for current scope

**Decision:** Keep kernel pattern but recognize its value is primarily for:
- Implementation swapping (e.g., `MobileWindowsService` vs `DesktopWindowsService`)
- Future plugin/app store ecosystem

**Open Question:** How to implement app store with capability enforcement?
- Option A: Trust third-party code (dangerous)
- Option B: iframe isolation with postMessage (limited but safe)
- Option C: Config-based app format/DSL (limited but safe)

---

### 2. Service Count (11 Proposed vs 5 Implemented)

**Currently implemented:**
1. WindowsService
2. AppsService
3. DesktopService
4. SettingsService
5. FilesService

**Proposed but not implemented:**
- TasksService
- NotificationsService
- RouterService
- ShortcutsService
- IPCService
- WorkersService
- ShellService

**Conclusion:** Start with current 5, add others when concrete need arises. The spec is aspirational documentation, not implementation requirement.

---

### 3. Router Service Clarification

**Misunderstanding:** Initially thought router was for URL-based deep linking.

**Clarification:** Router is for in-app navigation (e.g., sidebar linking to `/settings/theme` within an app).

**Revised assessment:** This is not a system service. It's an app-level pattern:
```typescript
// Inside an app component
let currentPath = $state('/settings/theme');
```

Apps can implement their own routing without a system service.

---

### 4. File System Decision

**Options:**
- File System Access API: Real files, requires permission prompts
- OPFS: Sandboxed, no prompts, browser-contained

**Decision:** OPFS - fits the WebOS metaphor better (self-contained virtual OS).

---

### 5. Svelte 5 Migration Validation

**Confirmed correct decision.** Key benefits:
- Fine-grained reactivity via runes
- No virtual DOM overhead during drag/resize
- Per-window isolation without re-render cascades

---

## Key Takeaways

1. **Simplify before scaling** - Current 5-service architecture is solid
2. **Kernel value is in swapping** - Mobile/desktop implementations justify the pattern
3. **Router is app-level** - Remove from system service spec
4. **OPFS for files** - Decision finalized
5. **Capabilities deferred** - Implement when plugin ecosystem exists

---

## Action Items

- [ ] Consider simplifying kernel to focus on service swapping use case
- [ ] Remove router from system services spec (it's an app pattern)
- [ ] Implement OPFS-based file system
- [ ] Document service interface contracts for future swapping
- [ ] Research iframe-based app isolation for future app store

---

## Follow-up Discussion (Same Session)

### Runtime Service Swapping

**Use cases confirmed:**
- Switch AppsService to point to external "app store"
- Switch FilesService from OPFS to IndexedDB
- Mobile/desktop variants

**Implications:**
- Services need lifecycle hooks: `pause()`, `resume()`, `destroy()`
- State migration between implementations
- Dependent services must handle swap gracefully

### App Store Vision

**Goal:** Let users install apps from external sources (in addition to bundled apps)

**Approach considered:** Dynamic code loading with capabilities

**Security challenge:** JavaScript has no true sandboxing. Once code runs, it can access:
- `window`, `document`, `fetch`
- Cookies, localStorage
- Any global state

**Options for isolation:**
1. **iframe sandbox** - Real browser isolation, postMessage API
2. **Capability proxy** - Expose limited API, but not truly secure (security theater)
3. **Trust model** - Users explicitly trust external apps (like browser extensions)

### Key Insight

Capabilities in browser JS are **advisory, not enforced** unless you use iframes. The kernel can check capabilities, but malicious code can bypass them by accessing globals directly.

**Realistic approaches:**
- A) Curated apps only (current) - full trust
- B) iframe isolation - real security but complex API
- C) User-consented trust - "This app requests X, Y, Z - Install?"

## Next Session Topics

- Service lifecycle hooks (init, destroy, pause, resume)
- iframe-based app isolation architecture
- External app manifest format
- State migration during service swap
