[2 tools called]

Perfect! Here's a comprehensive `REFACTOR.md` file for you to create:

```markdown
# Core/Apps Architecture Refactor

## Goal
Split the codebase into two clear layers:
- `src/core/` - WebOS framework (window management, UI primitives, contexts, utilities)
- `src/apps/` - Applications built on the framework

This separation will:
- Improve code organization and maintainability
- Make the framework reusable (e.g., for hard refresh logic)
- Create clear boundaries between OS and applications
- Enable potential future extraction of core into a separate package

## New Structure

```
src/
├── core/
│   ├── ui/                    # UI primitives (from components/ui/)
│   │   ├── button.tsx
│   │   ├── command.tsx
│   │   ├── dialog.tsx
│   │   └── popover.tsx
│   ├── components/            # OS components (from components/)
│   │   ├── desktop/          # (from components/core/desktop/)
│   │   │   ├── desktop-item.tsx
│   │   │   └── desktop.tsx
│   │   ├── window/           # (from components/core/window/)
│   │   │   ├── resize-handlers.tsx
│   │   │   ├── window-content.tsx
│   │   │   ├── window-title.tsx
│   │   │   └── window.tsx
│   │   ├── os.tsx
│   │   ├── profiler-wrapper.tsx
│   │   ├── start-menu.tsx
│   │   ├── taskbar.tsx
│   │   └── version-notification.tsx
│   ├── contexts/              # All contexts (from contexts/)
│   │   ├── apps/
│   │   ├── version/
│   │   ├── window/
│   │   └── windows/
│   ├── stores/                # State stores (from stores/)
│   │   ├── desktop.store.ts
│   │   └── settings.store.ts
│   ├── lib/                   # Utilities (from lib/)
│   │   ├── flags.ts
│   │   ├── order.ts
│   │   ├── update.ts
│   │   └── utils.ts
│   ├── hooks/                 # Shared hooks (from hooks/)
│   ├── emitters/              # Event emitters (from emitters/)
│   │   └── profiler.emitter.ts
│   ├── types/                 # Core types (from types/)
│   │   └── index.ts
│   ├── constants/             # Constants (from constants/)
│   │   └── index.ts
│   └── index.ts               # Public API exports (NEW)
│
├── apps/                      # Applications (stays as-is)
│   ├── app.type.ts
│   ├── apps.ts
│   ├── index.tsx
│   ├── files/
│   ├── media-preview/
│   ├── profiler/
│   ├── settings/
│   ├── style-guide/
│   ├── test/
│   └── tic-tac-toe/
│
├── assets/                    # Static assets (stays)
├── App.css
├── App.tsx                    # Root component (stays)
├── index.css
├── main.tsx                   # Entry point (stays)
└── version.json.d.ts
```

## Migration Steps

### Phase 1: Create Structure (Safe, No Breaking Changes)

1. **Create core directory structure**
   ```bash
   mkdir -p src/core/ui
   mkdir -p src/core/components/desktop
   mkdir -p src/core/components/window
   mkdir -p src/core/contexts
   mkdir -p src/core/stores
   mkdir -p src/core/lib
   mkdir -p src/core/hooks
   mkdir -p src/core/emitters
   mkdir -p src/core/types
   mkdir -p src/core/constants
   ```

2. **Create core/index.ts** (for future public API exports)
   ```typescript
   // Core UI Components
   export * from './ui/button';
   export * from './ui/command';
   export * from './ui/dialog';
   export * from './ui/popover';
   
   // Core Components
   export { OS } from './components/os';
   export { Desktop } from './components/desktop/desktop';
   export { Taskbar } from './components/taskbar';
   export { StartMenu } from './components/start-menu';
   // ... add others as needed
   
   // Contexts
   export * from './contexts/windows';
   export * from './contexts/window';
   export * from './contexts/apps';
   export * from './contexts/version';
   
   // Stores
   export * from './stores/desktop.store';
   export * from './stores/settings.store';
   
   // Utils
   export * from './lib/utils';
   export * from './lib/flags';
   export * from './lib/order';
   export * from './lib/update';
   
   // Types
   export * from './types';
   ```

### Phase 2: Move Files

**Option A: Git-Aware Move (Preserves History)**
```bash
# Move UI components
git mv src/components/ui src/core/ui

# Move core components
git mv src/components/core/desktop src/core/components/desktop
git mv src/components/core/window src/core/components/window
git mv src/components/os.tsx src/core/components/os.tsx
git mv src/components/profiler-wrapper.tsx src/core/components/profiler-wrapper.tsx
git mv src/components/start-menu.tsx src/core/components/start-menu.tsx
git mv src/components/taskbar.tsx src/core/components/taskbar.tsx
git mv src/components/version-notification.tsx src/core/components/version-notification.tsx

# Move contexts, stores, lib, etc.
git mv src/contexts src/core/contexts
git mv src/stores src/core/stores
git mv src/lib src/core/lib
git mv src/hooks src/core/hooks
git mv src/emitters src/core/emitters
git mv src/types src/core/types
git mv src/constants src/core/constants

# Clean up empty directories
rmdir src/components/core/desktop
rmdir src/components/core/window
rmdir src/components/core
rmdir src/components
```

**Option B: Manual Move (if Git history isn't critical)**
Just move the directories using your file explorer or IDE refactoring tools.

### Phase 3: Update Imports

**Strategy**: Use Find & Replace across the entire codebase

1. **UI Components**
   - Find: `@/components/ui/`
   - Replace: `@/core/ui/`

2. **Core Components**
   - Find: `@/components/core/desktop`
   - Replace: `@/core/components/desktop`
   
   - Find: `@/components/core/window`
   - Replace: `@/core/components/window`
   
   - Find: `@/components/os`
   - Replace: `@/core/components/os`
   
   - Find: `@/components/taskbar`
   - Replace: `@/core/components/taskbar`
   
   - Find: `@/components/start-menu`
   - Replace: `@/core/components/start-menu`
   
   - Find: `@/components/profiler-wrapper`
   - Replace: `@/core/components/profiler-wrapper`
   
   - Find: `@/components/version-notification`
   - Replace: `@/core/components/version-notification`

3. **Contexts**
   - Find: `@/contexts/`
   - Replace: `@/core/contexts/`

4. **Stores**
   - Find: `@/stores/`
   - Replace: `@/core/stores/`

5. **Lib/Utils**
   - Find: `@/lib/`
   - Replace: `@/core/lib/`

6. **Hooks**
   - Find: `@/hooks/`
   - Replace: `@/core/hooks/`

7. **Emitters**
   - Find: `@/emitters/`
   - Replace: `@/core/emitters/`

8. **Types**
   - Find: `from "@/types"`
   - Replace: `from "@/core/types"`

9. **Constants**
   - Find: `@/constants/`
   - Replace: `@/core/constants/`

### Phase 4: Testing

1. **TypeScript Check**
   ```bash
   npm run type-check
   # or
   tsc --noEmit
   ```

2. **Build Check**
   ```bash
   npm run build
   ```

3. **Dev Server**
   ```bash
   npm run dev
   ```

4. **Functional Testing**
   - [ ] Open multiple windows
   - [ ] Test window management (minimize, maximize, close, resize, drag)
   - [ ] Test taskbar functionality
   - [ ] Test desktop icons
   - [ ] Open each app (files, settings, profiler, etc.)
   - [ ] Test settings persistence
   - [ ] Test version notification
   - [ ] Test start menu

### Phase 5: Cleanup

1. **Remove old empty directories**
   ```bash
   # Verify these are empty first
   rmdir src/components
   ```

2. **Update documentation**
   - Update README.md with new structure
   - Update any architecture docs

3. **Update TODO.md**
   - Mark "move core os logic to /core" as complete

## Files That Should NOT Move

These stay at `src/` root level:
- `App.tsx` - Root application component
- `App.css` - Root styles
- `main.tsx` - Entry point
- `index.css` - Global styles
- `assets/` - Static assets
- `version.json.d.ts` - Type definitions

## Git Strategy

**Recommended: Single Atomic Commit**
```bash
# After all moves and import updates
git add -A
git commit -m "refactor: split codebase into core and apps architecture

- Move OS framework code to src/core/
- Keep applications in src/apps/
- Update all imports to reflect new structure
- Create core/index.ts for public API exports

BREAKING CHANGE: All @/components, @/contexts, @/stores, @/lib imports
now prefixed with @/core/"
```

**Alternative: Multi-Commit Approach**
1. Commit: Move files with `git mv` (preserves history)
2. Commit: Update imports
3. Commit: Create core/index.ts
4. Commit: Documentation updates

## Benefits Unlocked

After this refactor, you can:

1. **Reuse OS Logic Easily**
   ```typescript
   import { hardRefresh } from '@/core/lib/update';
   ```

2. **Clean Public API**
   ```typescript
   import { Button, useWindows, OS } from '@/core';
   ```

3. **Clear Mental Model**
   - Core = Framework (what you build)
   - Apps = Products (what users interact with)

4. **Easier Testing**
   - Test core independently
   - Mock core when testing apps

5. **Potential Package Extraction**
   - `@webos/core` package in the future
   - Apps could be separate packages

## Rollback Plan

If something goes wrong:
```bash
git reset --hard HEAD~1  # If in single commit
# or
git revert <commit-hash>  # If already pushed
```

## Estimated Time

- File moves: 5 minutes
- Import updates: 10-15 minutes (with Find & Replace)
- Testing: 15-20 minutes
- **Total: ~30-40 minutes**

## Notes

- The `@/*` path alias will still work, just now `@/core/*` and `@/apps/*`
- No tsconfig changes needed
- No build config changes needed
- This is primarily a organizational refactor, no logic changes
- Internal imports within core/ can use relative paths if preferred

---

**Ready to start?** Begin with Phase 1 and work through systematically. Test after each phase if you want to be extra safe.
```

You can save this as `REFACTOR.md` in your project root. This gives you a complete checklist to follow for the refactoring process!