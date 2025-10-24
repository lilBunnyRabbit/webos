# Svelte Migration Checklist

Practical step-by-step checklist for migrating WebOS from React to Svelte 5.

---

## Pre-Migration

- [ ] **Read complete migration guide** (`SVELTE_MIGRATION_GUIDE.md`)
- [ ] **Review quick reference** (`SVELTE_QUICK_REFERENCE.md`)
- [ ] **Create backup/branch**
  ```bash
  git checkout -b feat/svelte-migration
  git push -u origin feat/svelte-migration
  ```
- [ ] **Document current issues** (what you want to fix)
- [ ] **Take performance baseline** (Lighthouse, bundle size)

---

## Phase 1: Setup (2-4 hours)

### Dependencies

- [ ] **Remove React**
  ```bash
  npm uninstall react react-dom @types/react @types/react-dom
  ```

- [ ] **Install Svelte Core**
  ```bash
  npm install svelte@^5.0.0
  npm install -D @sveltejs/vite-plugin-svelte
  npm install -D svelte-check
  npm install -D svelte-preprocess
  ```

- [ ] **Install Ecosystem**
  ```bash
  npm install @tanstack/svelte-query
  npm install bits-ui
  npm install mode-watcher
  npm install lucide-svelte
  ```

### Configuration

- [ ] **Update `vite.config.ts`**
  - [ ] Add `@sveltejs/vite-plugin-svelte`
  - [ ] Enable runes mode
  - [ ] Test: `npm run dev` (will error but should parse config)

- [ ] **Create `svelte.config.js`**
  - [ ] Add preprocessor
  - [ ] Enable runes
  - [ ] Test: No errors

- [ ] **Update `tsconfig.json`**
  - [ ] Extend `@tsconfig/svelte`
  - [ ] Update includes for `.svelte` files
  - [ ] Test: `npm run check` (will error but config works)

- [ ] **Update `package.json` scripts**
  - [ ] Add `check` script
  - [ ] Add `check:watch` script

### Entry Points

- [ ] **Update `index.html`**
  - [ ] Verify `<div id="app"></div>`
  - [ ] Update script to `src/main.ts`

- [ ] **Create `src/main.ts`**
  ```typescript
  import './index.css';
  import App from './App.svelte';
  
  const app = new App({
    target: document.getElementById('app')!,
  });
  
  export default app;
  ```

- [ ] **Create placeholder `src/App.svelte`**
  ```svelte
  <script lang="ts">
    // Placeholder
  </script>
  
  <div class="h-screen w-screen bg-background text-foreground flex items-center justify-center">
    <h1 class="text-4xl font-bold">Svelte Migration Started</h1>
  </div>
  ```

- [ ] **Test: Dev server starts**
  ```bash
  npm run dev
  ```
  Should see "Svelte Migration Started"

### shadcn-svelte (Optional)

- [ ] **Run init**
  ```bash
  npx shadcn-svelte@latest init
  ```
  - Style: New York
  - Base color: Neutral
  - CSS variables: Yes

- [ ] **Install first component** (to test)
  ```bash
  npx shadcn-svelte@latest add button
  ```

- [ ] **Test button in App.svelte**

---

## Phase 2: Core Stores (1-2 days)

### Window Manager Store

- [ ] **Create `src/core/stores/window-manager.svelte.ts`**
- [ ] **Copy types** from `window-manager.type.ts`
- [ ] **Implement state** with `$state` rune
- [ ] **Implement `WindowAPI.open()`**
- [ ] **Implement `WindowAPI.close()`**
- [ ] **Implement `WindowAPI.focus()`**
- [ ] **Implement `WindowAPI.minimize()`**
- [ ] **Implement `WindowAPI.maximize()`**
- [ ] **Implement `WindowAPI.setContext()`**
- [ ] **Add keyboard shortcuts** with `$effect`
- [ ] **Test: Import in App.svelte** and log state

### Settings Store

- [ ] **Create `src/core/stores/settings.svelte.ts`**
- [ ] **Implement state** with `$state`
- [ ] **Add localStorage persistence** with `$effect`
- [ ] **Implement `SettingsAPI`**
- [ ] **Test: Change theme** and verify CSS variables update

### Version Store

- [ ] **Create `src/core/stores/version.svelte.ts`**
- [ ] **Implement version checking**
- [ ] **Add update functionality**
- [ ] **Test: Call `checkForUpdates()`**

### Desktop Store

- [ ] **Create `src/core/stores/desktop.svelte.ts`**
- [ ] **Migrate desktop state**
- [ ] **Test: Basic functionality**

### File Manager Store

- [ ] **Create `src/core/stores/file-manager.svelte.ts`**
- [ ] **Setup TanStack Query client**
- [ ] **Create query key factory**
- [ ] **Implement `FileManagerAPI`**
- [ ] **Test: OPFS operations work**

---

## Phase 3: Core Components (2-3 days)

### Main Layout

- [ ] **Create `src/core/components/OS.svelte`**
- [ ] **Basic layout structure**
- [ ] **Test: Renders in App.svelte**

### Window Components

- [ ] **Create `src/core/components/window/Window.svelte`**
  - [ ] Window positioning
  - [ ] Minimize/maximize/close
  - [ ] Lazy loading
  - [ ] Error handling
  - [ ] Test: Create dummy window

- [ ] **Create `src/core/components/window/WindowTitle.svelte`**
  - [ ] Title bar UI
  - [ ] Control buttons
  - [ ] Drag handle
  - [ ] Test: Buttons work

- [ ] **Create `src/core/components/window/WindowContent.svelte`**
  - [ ] Content area
  - [ ] Loading state
  - [ ] Error state
  - [ ] Zoom support
  - [ ] Test: All states display

- [ ] **Create `src/core/components/window/WindowManagerContainer.svelte`**
  - [ ] Container bounds tracking
  - [ ] Window rendering loop
  - [ ] Test: Multiple windows render

- [ ] **Create `src/core/components/window/ResizeHandlers.svelte`**
  - [ ] Resize handles (8 directions)
  - [ ] Resize logic
  - [ ] Test: Window resizes

### Desktop Components

- [ ] **Create `src/core/components/desktop/Desktop.svelte`**
  - [ ] Desktop grid
  - [ ] App icons
  - [ ] Test: Icons display

- [ ] **Create `src/core/components/desktop/DesktopItem.svelte`**
  - [ ] Icon component
  - [ ] Click handler
  - [ ] Test: Opens app

### Taskbar Components

- [ ] **Create `src/core/components/taskbar/Taskbar.svelte`**
  - [ ] Taskbar layout
  - [ ] Window list
  - [ ] Test: Shows open windows

- [ ] **Create `src/core/components/taskbar/TaskbarItem.svelte`**
  - [ ] Window preview
  - [ ] Click to focus
  - [ ] Test: Focuses window

- [ ] **Create `src/core/components/taskbar/DateTime.svelte`**
  - [ ] Current date/time
  - [ ] Auto-update
  - [ ] Test: Updates every second

- [ ] **Create `src/core/components/taskbar/start-menu/StartMenu.svelte`**
  - [ ] Menu button
  - [ ] App list
  - [ ] Test: Opens apps

### File Explorer Components

- [ ] **Create `src/core/components/file-explorer/FileList.svelte`**
- [ ] **Create `src/core/components/file-explorer/FileItem.svelte`**
- [ ] **Create `src/core/components/file-explorer/FileIcon.svelte`**
- [ ] **Create `src/core/components/file-explorer/FolderNavigation.svelte`**
- [ ] **Create `src/core/components/file-explorer/StatusBar.svelte`**
- [ ] **Test: All components render**

### Utility Components

- [ ] **Create `src/core/components/VersionNotification.svelte`**
- [ ] **Create `src/core/components/ProfilerWrapper.svelte`** (if needed)

---

## Phase 4: UI Components (1 day)

### shadcn-svelte Components

- [ ] **Button** - `npx shadcn-svelte@latest add button`
- [ ] **Dialog** - `npx shadcn-svelte@latest add dialog`
- [ ] **Dropdown Menu** - `npx shadcn-svelte@latest add dropdown-menu`
- [ ] **Context Menu** - `npx shadcn-svelte@latest add context-menu`
- [ ] **Popover** - `npx shadcn-svelte@latest add popover`
- [ ] **Command** - `npx shadcn-svelte@latest add command`

### Custom UI Components

- [ ] **Migrate any custom UI components**
- [ ] **Update imports in other components**

---

## Phase 5: Apps Migration (2-3 days)

### App Structure

- [ ] **Update `src/apps/index.ts`**
  - [ ] Export all apps
  - [ ] Type definitions

### File Explorer

- [ ] **Update `src/apps/file-explorer/index.ts`**
  - [ ] Change lazy import to `.svelte`
- [ ] **Create `src/apps/file-explorer/FileExplorer.svelte`**
  - [ ] Migrate component logic
  - [ ] Use TanStack Query
  - [ ] Test: Opens and works

### Files App

- [ ] **Update `src/apps/files/index.ts`**
- [ ] **Create `src/apps/files/Files.svelte`**
- [ ] **Test: Works correctly**

### Media Preview

- [ ] **Update `src/apps/media-preview/index.ts`**
- [ ] **Create `src/apps/media-preview/MediaPreview.svelte`**
- [ ] **Test: Previews media files**

### Settings

- [ ] **Update `src/apps/settings/index.ts`**
- [ ] **Create `src/apps/settings/Settings.svelte`**
- [ ] **Connect to SettingsAPI**
- [ ] **Test: Changes persist**

### Profiler

- [ ] **Update `src/apps/profiler/index.ts`**
- [ ] **Create `src/apps/profiler/Profiler.svelte`**
- [ ] **Test: Shows performance metrics**

### Style Guide

- [ ] **Update `src/apps/style-guide/index.ts`**
- [ ] **Create `src/apps/style-guide/StyleGuide.svelte`**
- [ ] **Test: Shows all UI components**

### Test App

- [ ] **Update `src/apps/test/index.ts`**
- [ ] **Create `src/apps/test/Test.svelte`**
- [ ] **Test: Test utilities work**

### Tic Tac Toe

- [ ] **Update `src/apps/tic-tac-toe/index.ts`**
- [ ] **Create `src/apps/tic-tac-toe/TicTacToe.svelte`**
- [ ] **Test: Game works**

---

## Phase 6: Integration Testing (1-2 days)

### Core Functionality

- [ ] **Window Management**
  - [ ] Open window
  - [ ] Close window
  - [ ] Minimize window
  - [ ] Maximize window
  - [ ] Restore window
  - [ ] Focus window
  - [ ] Drag window
  - [ ] Resize window
  - [ ] Snap to edges

- [ ] **Multiple Windows**
  - [ ] Open 5+ windows
  - [ ] Z-index ordering
  - [ ] Focus switching
  - [ ] Minimize all (Alt+Down)
  - [ ] Restore all (Alt+Up)

- [ ] **File Manager**
  - [ ] Open two file explorer windows
  - [ ] Create folder in one
  - [ ] Verify it appears in both
  - [ ] Delete file
  - [ ] Upload file
  - [ ] Navigate folders

### Apps Testing

- [ ] **File Explorer**
  - [ ] List files
  - [ ] Create folder
  - [ ] Delete item
  - [ ] Upload file
  - [ ] Download file
  - [ ] Navigation works

- [ ] **Settings**
  - [ ] Change theme
  - [ ] Verify persistence
  - [ ] Change taskbar position
  - [ ] Reset settings

- [ ] **All Other Apps**
  - [ ] Open each app
  - [ ] Verify basic functionality
  - [ ] Close without errors

### Edge Cases

- [ ] **Lazy Loading**
  - [ ] Slow network simulation
  - [ ] Error handling
  - [ ] Retry mechanism

- [ ] **Window State**
  - [ ] Minimize then restore
  - [ ] Maximize then minimize
  - [ ] Drag maximized window
  - [ ] Resize to minimum

- [ ] **OPFS**
  - [ ] Large file upload
  - [ ] Many files (100+)
  - [ ] Deep folder structure
  - [ ] Storage quota

---

## Phase 7: Performance Testing (1 day)

### Metrics

- [ ] **Build**
  ```bash
  npm run build
  ```
  - [ ] Record bundle size
  - [ ] Compare to React version

- [ ] **Lighthouse**
  - [ ] Run Lighthouse audit
  - [ ] Record scores
  - [ ] Compare to baseline

- [ ] **Runtime Performance**
  - [ ] Open 10 windows
  - [ ] Record FPS during drag
  - [ ] Test memory usage
  - [ ] Compare to React

### Optimization

- [ ] **Code Splitting**
  - [ ] Verify chunks created per app
  - [ ] Check chunk sizes

- [ ] **Lazy Loading**
  - [ ] Verify apps load on demand
  - [ ] Check network tab

- [ ] **Bundle Analysis**
  ```bash
  npx vite-bundle-visualizer
  ```
  - [ ] Identify large dependencies
  - [ ] Tree-shake unused code

---

## Phase 8: Polish (1 day)

### User Experience

- [ ] **Animations**
  - [ ] Add window transitions
  - [ ] Add minimize animation
  - [ ] Add maximize animation
  - [ ] Smooth drag/resize

- [ ] **Accessibility**
  - [ ] Keyboard navigation
  - [ ] ARIA labels
  - [ ] Focus management
  - [ ] Screen reader testing

- [ ] **Error Handling**
  - [ ] Graceful error states
  - [ ] Retry mechanisms
  - [ ] User-friendly messages

### Developer Experience

- [ ] **TypeScript**
  - [ ] No type errors
  - [ ] Good type inference
  - [ ] Document complex types

- [ ] **Code Quality**
  - [ ] Remove console.logs
  - [ ] Remove commented code
  - [ ] Consistent formatting
  - [ ] Add comments where needed

- [ ] **Documentation**
  - [ ] Update README
  - [ ] Document new patterns
  - [ ] Add code examples

---

## Phase 9: Final Review (1 day)

### Code Review

- [ ] **Self Review**
  - [ ] Review all changed files
  - [ ] Check for TODOs
  - [ ] Verify no debug code

- [ ] **Testing Checklist**
  - [ ] Run through all features
  - [ ] Test on different browsers
  - [ ] Test on different screen sizes
  - [ ] Test with slow network

### Cleanup

- [ ] **Remove Old Files**
  - [ ] Delete `src/core/contexts/`
  - [ ] Delete old React components
  - [ ] Delete unused dependencies
  - [ ] Clean up imports

- [ ] **Update Config**
  - [ ] Remove React from package.json
  - [ ] Update tsconfig
  - [ ] Update .gitignore if needed

### Documentation

- [ ] **Update README**
  - [ ] Svelte setup instructions
  - [ ] New development workflow
  - [ ] Architecture changes

- [ ] **Changelog**
  - [ ] Document migration
  - [ ] List breaking changes
  - [ ] Note performance improvements

---

## Phase 10: Deployment (1 day)

### Pre-Deploy

- [ ] **Final Build**
  ```bash
  npm run build
  ```
  - [ ] No errors
  - [ ] No warnings

- [ ] **Preview**
  ```bash
  npm run preview
  ```
  - [ ] Test production build locally
  - [ ] Verify all features work

### Deploy

- [ ] **Create PR**
  - [ ] Good description
  - [ ] Migration notes
  - [ ] Performance comparisons

- [ ] **Merge**
  - [ ] Squash or merge commits
  - [ ] Update main branch

- [ ] **Monitor**
  - [ ] Watch for errors
  - [ ] Check analytics
  - [ ] User feedback

---

## Rollback Plan

### If Issues Arise

- [ ] **Identify Issue**
  - [ ] Document the problem
  - [ ] Determine severity

- [ ] **Quick Fix or Rollback?**
  - [ ] Can it be fixed in < 1 hour?
  - [ ] Is it blocking users?

- [ ] **Rollback Steps**
  ```bash
  git checkout main
  npm install
  npm run build
  # Deploy previous version
  ```

- [ ] **Fix Forward**
  - [ ] Create hotfix branch
  - [ ] Fix issue
  - [ ] Test thoroughly
  - [ ] Deploy fix

---

## Success Metrics

### Performance Goals

- [ ] **Bundle Size**: 40-50% reduction
- [ ] **Initial Load**: 30-40% faster
- [ ] **FPS**: 60fps during window operations
- [ ] **Memory**: 30-50% less memory usage

### Functionality Goals

- [ ] **All features work** exactly as before
- [ ] **No regressions** in functionality
- [ ] **Better DX** - easier to add features
- [ ] **Cleaner code** - less boilerplate

### Developer Experience Goals

- [ ] **Fewer files** - contexts → stores
- [ ] **Less boilerplate** - no providers
- [ ] **Easier debugging** - reactive statements
- [ ] **Faster development** - simpler patterns

---

## Celebration! 🎉

When all checkboxes are complete:

- [ ] **Take screenshots** of before/after metrics
- [ ] **Write blog post** about the migration
- [ ] **Share on Twitter/Reddit** for feedback
- [ ] **Update portfolio** with new stack
- [ ] **Reflect on learnings** 

You've successfully migrated to Svelte 5! 🚀

---

## Notes & Issues

Use this section to track blockers, questions, or interesting findings:

```
Date: _______
Issue: _______
Solution: _______

Date: _______
Question: _______
Answer: _______
```

---

## Time Tracking

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| Setup | 2-4h | | |
| Stores | 1-2d | | |
| Components | 2-3d | | |
| UI Components | 1d | | |
| Apps | 2-3d | | |
| Testing | 1-2d | | |
| Performance | 1d | | |
| Polish | 1d | | |
| Review | 1d | | |
| Deploy | 1d | | |
| **Total** | **6-10d** | | |

---

Good luck! You've got this. 💪

