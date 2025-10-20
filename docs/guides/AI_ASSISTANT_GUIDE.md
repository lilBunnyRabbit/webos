# Guide for AI Assistants Working on WebOS

> **Purpose:** Instructions for LLMs/AI assistants on how to effectively work on this project

---

## 📖 Documentation Structure

This project has **layered documentation** to suit different needs:

### 1. Quick Context (Start Here)
**File:** `PROJECT_CONTEXT.md`  
**When to use:** First interaction, need quick understanding  
**Content:** TL;DR version with essential information
- What the project is
- Current status
- Architecture overview
- Key patterns
- Common operations

**Typical Use Case:** "I need to understand what this project does in 5 minutes"

### 2. Comprehensive Reference
**File:** `DOCUMENTATION.md`  
**When to use:** Deep dive, implementing features, architectural decisions  
**Content:** Complete project documentation
- Full vision and goals
- Detailed architecture
- All completed features
- Development patterns
- How to add features
- Technology stack details

**Typical Use Case:** "I need to add a new app/feature and want to understand all the patterns"

### 3. Development Plan
**File:** `PLAN.md`  
**When to use:** Understanding roadmap, prioritizing work, planning features  
**Content:** Master development plan (1600+ lines)
- 9 phases of development
- Detailed feature specifications
- Priority matrix
- Timeline estimates
- Technology recommendations

**Typical Use Case:** "What features are planned? What should I work on next?"

### 4. Visual Roadmap
**File:** `ROADMAP.md`  
**When to use:** Understanding timeline, seeing big picture  
**Content:** Mermaid diagrams
- Gantt charts
- Flow diagrams
- Technology mindmaps
- Priority matrices

**Typical Use Case:** "Show me a visual overview of the project timeline"

### 5. Current Tasks
**File:** `TODO.md`  
**When to use:** Day-to-day development, bug fixes  
**Content:** Checklist of current tasks
- Completed items
- In-progress items
- Planned improvements

**Typical Use Case:** "What immediate work needs to be done?"

### 6. Specialized Docs
**Files:** Various `README.md` in subdirectories  
**When to use:** Working with specific systems

| File | Content |
|------|---------|
| `src/core/api/README.md` | File System API reference (650+ lines) |
| `src/core/api/HOOKS.md` | TanStack Query hooks documentation (800+ lines) |
| `src/core/api/MIGRATION.md` | Migration guide for legacy code |
| `src/apps/file-explorer/README.md` | File Explorer app guide |
| `docs/SESSION_SUMMARY_FILE_EXPLORER.md` | Development session notes |

---

## 🎯 How to Work with This Project

### First-Time Setup

1. **Read:** `PROJECT_CONTEXT.md` (5-10 min)
   - Get high-level understanding
   - Learn architecture
   - Understand tech stack

2. **Skim:** `DOCUMENTATION.md` table of contents (2-3 min)
   - See what's available
   - Bookmark for later reference

3. **Check:** `TODO.md` (1 min)
   - See current priorities
   - Understand active work

4. **Optional:** `PLAN.md` relevant sections
   - Read phases related to current work
   - Understand long-term vision

### Typical Workflows

#### Workflow 1: Adding a New Feature

```
1. Check PLAN.md → Is this feature planned? What phase?
2. Read DOCUMENTATION.md → "How to Add New Features" section
3. Look at existing examples → Similar apps/features in codebase
4. Implement following patterns
5. Update DOCUMENTATION.md → Add to "Completed Features"
6. Update TODO.md → Mark related tasks complete
```

#### Workflow 2: Fixing a Bug

```
1. Understand the system → Read relevant section in DOCUMENTATION.md
2. Check TODO.md → Is this a known issue?
3. Locate code → Use project structure guide
4. Review related code → Understand dependencies
5. Fix and test
6. Update docs if behavior changed
```

#### Workflow 3: Understanding Existing Code

```
1. Check PROJECT_CONTEXT.md → System overview
2. Read DOCUMENTATION.md → "Core Systems Deep Dive"
3. Follow code → Read implementation
4. Check specialized docs → API docs, README files
```

#### Workflow 4: Planning New Work

```
1. Check PLAN.md → What's the long-term vision?
2. Check ROADMAP.md → Current phase and priorities
3. Check TODO.md → Current tasks and blockers
4. Propose approach → Based on established patterns
5. Update TODO.md → Add new tasks if accepted
```

---

## 🔍 Quick Reference by Task Type

### "I need to understand the window management system"
1. Read: `DOCUMENTATION.md` → "Window Management System" section
2. Read: `src/core/contexts/window-manager/window-manager.type.ts`
3. Read: `src/core/contexts/window-manager/window-manager.reducer.ts`

### "I need to work with files"
1. Read: `src/core/api/README.md` → Complete API reference
2. Read: `src/core/api/HOOKS.md` → TanStack Query hooks
3. Example: `src/apps/file-explorer/` → Working implementation

### "I need to create a new app"
1. Read: `DOCUMENTATION.md` → "Adding a New App" section
2. Copy pattern from: `src/apps/file-explorer/` or `src/apps/settings/`
3. Register in: `src/apps/apps.ts` and `src/apps/index.tsx`

### "I need to add a core feature (notification system, etc.)"
1. Read: `DOCUMENTATION.md` → "Adding a New Core Feature" section
2. Follow example in that section
3. Export in: `src/core/index.tsx`

### "I need to understand the tech stack"
1. Read: `PROJECT_CONTEXT.md` → "Tech Stack" table
2. Read: `DOCUMENTATION.md` → "Technology Stack" section
3. Check: `package.json` for versions

### "I need to see the big picture / roadmap"
1. Read: `ROADMAP.md` → Visual diagrams
2. Read: `PLAN.md` → Detailed phases
3. Check: Current phase in `PROJECT_CONTEXT.md`

---

## 🚨 Important Rules for AI Assistants

### Do's ✅

1. **Read docs before coding** - Understand patterns first
2. **Follow established patterns** - Look at existing code
3. **Maintain core/apps separation** - Never mix layers
4. **Keep type safety** - Use TypeScript strictly
5. **Update documentation** - Keep docs in sync with code
6. **Test multi-window scenarios** - Changes affect all windows
7. **Use TanStack Query properly** - Invalidate caches correctly
8. **Ask when uncertain** - Better to clarify than guess

### Don'ts ❌

1. **Don't use `any` type** - Always provide proper types
2. **Don't break imports** - Respect `@/core` and `@/apps` boundaries
3. **Don't ignore documentation** - It's there for a reason
4. **Don't create new patterns** - Use existing ones unless necessary
5. **Don't skip testing** - File operations need real browser testing
6. **Don't forget multi-window** - Always consider multiple instances
7. **Don't hardcode values** - Use constants and configuration
8. **Don't skip error handling** - Especially for OPFS operations

### Code Quality Standards

```typescript
// ✅ Good
import { useWindowManager } from "@/core/contexts/window-manager";
import type { WindowInstance } from "@/core/contexts/window-manager";

export function MyComponent() {
  const { windows } = useWindowManager();
  return <div>{windows.length} windows open</div>;
}

// ❌ Bad
import { useWindowManager } from "../../core/contexts/window-manager"; // Don't use relative
const windows: any = useWindowManager().windows; // Don't use 'any'
```

---

## 📋 Checklist for Common Tasks

### Before Adding a New Feature

- [ ] Feature is in PLAN.md or has been discussed
- [ ] Read "How to Add New Features" in DOCUMENTATION.md
- [ ] Understand which layer (core vs apps)
- [ ] Reviewed similar existing code
- [ ] Planned the implementation approach

### After Implementing a Feature

- [ ] Code follows established patterns
- [ ] TypeScript types are complete
- [ ] Multi-window scenarios tested
- [ ] Error handling implemented
- [ ] Documentation updated (DOCUMENTATION.md)
- [ ] TODO.md updated (mark complete, add follow-ups)
- [ ] Code is linted (no errors)

### Before Committing Code

- [ ] Code builds successfully (`pnpm build`)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] No linting errors (`pnpm lint`)
- [ ] Tested in browser (dev server)
- [ ] Tested relevant features (windows, files, etc.)
- [ ] Documentation is up to date
- [ ] Commit message follows convention

---

## 🎓 Learning the Codebase

### Recommended Reading Order (First Time)

1. **PROJECT_CONTEXT.md** - Overall understanding (10 min)
2. **src/core/contexts/window-manager/** - Window system (15 min)
3. **src/core/api/README.md** - File system API (20 min)
4. **src/apps/file-explorer/** - Example app (15 min)
5. **DOCUMENTATION.md** "Development Patterns" - Coding standards (10 min)

**Total: ~70 minutes to become productive**

### Key Files to Understand

Priority order:

1. `src/core/contexts/window-manager/window-manager.type.ts` - Window types
2. `src/core/contexts/window-manager/window-manager.reducer.ts` - Window logic
3. `src/core/contexts/apps/apps.type.ts` - App system types
4. `src/core/api/file.ts` - File system operations
5. `src/core/api/file.hooks.ts` - File system hooks
6. `src/apps/index.tsx` - App registration
7. `src/core/components/os.tsx` - Main OS component

### Understanding Data Flow

1. **User clicks app icon**
   - Location: `src/core/components/desktop/desktop-item.tsx` or start menu
   - Action: Calls `apps.open(appId)`

2. **App opens in window**
   - Location: `src/core/contexts/apps/apps.hooks.tsx`
   - Flow: `open()` → `windowManager.dispatch(CREATE_WINDOW)` → `reducer` → state update → render

3. **Window renders**
   - Location: `src/core/components/window/window.tsx`
   - Content: Renders `app.$node` (the app component)

4. **App uses file system**
   - Location: Inside app component
   - Action: Calls `useDirectoryQuery()` or mutation hooks
   - Flow: Hook → TanStack Query → FileAPI → OPFS → cache → UI update

### Common Confusion Points

#### "Where do I put my code?"
- **OS features** (windows, desktop, etc.) → `src/core/`
- **Applications** (user-facing apps) → `src/apps/`
- **UI primitives** (buttons, dialogs) → `src/core/ui/`

#### "How do I share state between apps?"
- **Global OS state** → Contexts in `src/core/contexts/`
- **Settings** → `src/core/stores/settings.store.ts`
- **File data** → OPFS + TanStack Query (automatic)
- **Don't** use global variables or module-level state

#### "How do I make apps communicate?"
- **Via OPFS** → Apps read/write shared files
- **Via Settings** → Apps read shared settings
- **Via Context** → Create a new context in core if needed
- **Via URL** (future) → Deep linking with state

#### "What if I need a library not in package.json?"
1. Check if existing library can do it
2. Consider if it's worth the bundle size
3. Discuss with team / check PLAN.md
4. Add with version pinning
5. Update DOCUMENTATION.md tech stack section

---

## 🤖 Prompt Templates for Efficient Work

### Understanding Existing Code
```
I'm looking at [file/system]. Based on DOCUMENTATION.md and the code:

1. What is the purpose of this code?
2. What are the key concepts/patterns used?
3. What are the dependencies?
4. What would break if I modify X?

Please explain with reference to the documentation.
```

### Adding a Feature
```
I want to add [feature] to WebOS.

Based on:
- PLAN.md: [relevant section]
- DOCUMENTATION.md: [relevant pattern]
- Existing code: [similar feature]

My approach:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Does this align with the project patterns?
What should I watch out for?
```

### Fixing a Bug
```
Bug: [description]
Location: [file/line]
Context: [what user was doing]

From DOCUMENTATION.md, I understand this system [explain system].

Potential causes:
1. [Cause 1]
2. [Cause 2]

Proposed fix: [approach]

Does this make sense? Are there side effects I'm missing?
```

---

## 🔄 Keeping Documentation Updated

### When to Update Docs

| Change | Update |
|--------|--------|
| New feature completed | DOCUMENTATION.md "Completed Features" |
| New development pattern | DOCUMENTATION.md "Development Patterns" |
| New core system | DOCUMENTATION.md "Core Systems" |
| New dependency | DOCUMENTATION.md "Technology Stack" |
| New app created | Add to app list in relevant docs |
| File structure change | DOCUMENTATION.md "Project Structure" |
| API change | Relevant README (file.ts, HOOKS.md, etc.) |
| Task completed | TODO.md (mark complete) |
| New tasks identified | TODO.md (add items) |
| Major milestone | Update PROJECT_CONTEXT.md status |

### Documentation Update Checklist

After implementing a significant feature:

- [ ] Update DOCUMENTATION.md:
  - [ ] Add to "Completed Features"
  - [ ] Update "Current State" section
  - [ ] Add to "Core Systems" if core feature
  - [ ] Update "How to Add Features" if new pattern
  
- [ ] Update PROJECT_CONTEXT.md:
  - [ ] Update status checkboxes
  - [ ] Add to architecture if relevant
  - [ ] Update quick reference if needed

- [ ] Update TODO.md:
  - [ ] Mark completed tasks
  - [ ] Add follow-up tasks
  - [ ] Update priorities

- [ ] Update specialized docs:
  - [ ] API docs if API changed
  - [ ] App README if app feature
  - [ ] Migration guide if breaking change

---

## 🆘 Troubleshooting Guide

### "I can't find where X is implemented"

1. Check `DOCUMENTATION.md` → "Project Structure" section
2. Use grep/search: `grep -r "functionName" src/`
3. Check import statements in related files
4. Look at file naming conventions (kebab-case)

### "The types don't match"

1. Check `src/core/types/` for type definitions
2. Check component prop types
3. Use TypeScript's "Go to Definition" (F12)
4. Read DOCUMENTATION.md "Development Patterns" for type conventions

### "My changes don't show up"

1. Check if dev server reloaded (Vite should auto-reload)
2. Check browser console for errors
3. Check if file is actually imported somewhere
4. Try hard refresh (Ctrl+Shift+R)
5. Restart dev server

### "File operations aren't working"

1. OPFS requires HTTPS or localhost
2. Check browser compatibility (Chrome 86+, Firefox 111+, Safari 15.2+)
3. Check Storage API quota
4. Check browser console for errors
5. Read `src/core/api/README.md` for requirements

### "Multi-window sync not working"

1. Using TanStack Query hooks? (not raw FileAPI)
2. Invalidating queries on mutation?
3. Check query keys match
4. Read `src/core/api/HOOKS.md` for cache invalidation patterns

---

## 📞 Getting Help

### Self-Service Resources

1. **Search documentation:** Ctrl+F in DOCUMENTATION.md
2. **Check examples:** Look at existing similar code
3. **Read specialized docs:** API docs, README files
4. **Check TODO.md:** Might be a known issue
5. **Check PLAN.md:** Feature might be planned differently

### When to Ask for Help

- After reading relevant documentation
- After trying to understand the code
- After checking similar implementations
- When unsure about architectural decisions
- When dealing with unclear requirements

### What to Include When Asking

1. What you're trying to do
2. What documentation you've read
3. What you've tried
4. Specific questions
5. Code snippets (if relevant)

---

## ✨ Best Practices Summary

1. **Read docs first** → Saves time in the long run
2. **Follow patterns** → Consistency is key
3. **Type everything** → TypeScript saves you from bugs
4. **Test thoroughly** → Multi-window, edge cases
5. **Update docs** → Future you will thank you
6. **Ask questions** → Better than guessing
7. **Keep it simple** → Complexity is a bug

---

**Remember:** This documentation structure exists to make your work easier. Use it! If something is unclear or missing, that's valuable feedback - suggest improvements.

---

**Last Updated:** October 20, 2025  
**For Questions:** See main DOCUMENTATION.md

