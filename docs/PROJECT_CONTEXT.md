# WebOS - Quick Context for LLMs

> **TL;DR**: Browser-based operating system built with React 19 + TypeScript. Complete window management, OPFS file system, desktop environment. Currently in Phase 1 (foundation complete), moving to Phase 2 (app ecosystem).

---

## 🎯 What is This?

A **fully-featured web-based operating system** that runs entirely in the browser. Not just a file manager or window demo - it's a complete OS with:
- Native-like window management (drag, resize, minimize, maximize, snap)
- Persistent file storage (OPFS - Origin Private File System)
- Desktop environment with icons and taskbar
- Application ecosystem
- PWA capabilities (offline-first)

**Think:** Windows/macOS experience in your browser, no backend required.

---

## 📊 Current Status (October 2025)

### ✅ Completed
1. **Window Management System** - Full-featured with multi-window support, z-index ordering, snap zones
2. **Desktop Environment** - Icons, drag-to-reposition, custom backgrounds
3. **Taskbar** - Active window indicators, start menu, clock, pinned apps
4. **File System** - Complete OPFS implementation with 25+ API functions
5. **File Explorer App** - Modern file manager with upload/download, text editing, media preview
6. **TanStack Query Integration** - Automatic caching and multi-window sync
7. **Settings System** - Zustand + localStorage persistence
8. **Versioning System** - Auto-update detection and notifications

### 🔄 In Progress
- Refining UI/UX
- Bug fixes and polish
- Documentation updates

### ⏳ Next Up (Phase 2)
- Task Manager integration (@lilbunnyrabbit/task-manager)
- Import existing projects (static-utils)
- Color utility suite
- React Router for in-app navigation

---

## 🏗️ Architecture

```
Browser
└── WebOS (SPA)
    ├── Core Layer (Framework)
    │   ├── Window Manager (create/destroy/focus/resize windows)
    │   ├── Desktop (icon placement, backgrounds)
    │   ├── Taskbar (app launching, window switching)
    │   ├── File System API (OPFS wrapper)
    │   ├── Contexts (global state)
    │   └── Stores (Zustand + localStorage)
    │
    └── App Layer (Applications)
        ├── File Explorer ⭐ (OPFS-based)
        ├── Media Preview (images/video/audio)
        ├── Settings
        ├── Profiler (dev tool)
        └── [more apps...]
```

**Key Principle:** Separation between OS framework (`src/core/`) and applications (`src/apps/`).

---

## 🛠️ Tech Stack

| Category | Technology | Why |
|----------|-----------|-----|
| **Framework** | React 19 + TypeScript | Modern, type-safe, great DX |
| **Build** | Vite 7 | Fast dev server and builds |
| **Styling** | Tailwind CSS 4 | Utility-first, rapid styling |
| **State** | Zustand + TanStack Query | Simple state + smart caching |
| **Storage** | OPFS + localStorage | Modern file API + settings persistence |
| **UI Components** | Radix UI + Shadcn | Accessible, customizable |
| **Icons** | Lucide React | Consistent icon library |

**Notable APIs:**
- Origin Private File System (OPFS)
- Storage API (quota management)
- File System Access API
- PWA APIs (service workers, manifest)

---

## 📁 Project Structure (Simplified)

```
src/
├── core/                    # OS Framework
│   ├── api/                 # Core APIs (File System)
│   ├── components/          # OS components (Desktop, Taskbar, Window)
│   ├── contexts/            # React contexts (WindowManager, Apps, Version)
│   ├── stores/              # Zustand stores (settings, desktop)
│   ├── lib/                 # Utilities (flags, order, windows)
│   ├── ui/                  # UI primitives (Button, Dialog)
│   └── index.tsx            # Public API exports
│
└── apps/                    # Applications
    ├── apps.ts              # App registry
    ├── index.tsx            # App exports
    ├── file-explorer/       # ⭐ File management
    ├── media-preview/       # Media viewer
    ├── settings/            # Settings app
    └── [other-apps]/
```

**Import Pattern:**
- Apps import from `@/core` to access OS features
- Core never imports from apps (one-way dependency)

---

## 🔑 Key Systems

### Window Management

**State:**
```typescript
{
  index: Record<WindowId, WindowInstance>,  // All windows
  order: WindowId[],                        // Z-index order
  flags: ["profiler-enabled"]               // Global flags
}
```

**Operations:**
- CREATE_WINDOW, DESTROY_WINDOW, FOCUS_WINDOW
- TOGGLE_WINDOW (minimize/restore)
- TOGGLE_MAXIMIZE_WINDOW
- SET_SNAP_ZONE (snap to edges)

**Features:**
- Multi-window with proper z-ordering
- Drag to move, resize handles
- Snap to edges (left/right/corners)
- Minimize to taskbar
- Bounds checking (keeps windows on screen)

### File System (OPFS)

**Core API** (`src/core/api/file.ts`):
```typescript
// Directory operations
getOPFSRoot()
createDirectory(parent, name)
listDirectory(dirHandle, options)
getDirectorySize(dirHandle)

// File operations
createFile(parent, name, { content })
writeFile(fileHandle, content)
readFile(fileHandle)
readFileAsText(fileHandle)
deleteEntry(parent, name, { recursive })

// Transfer
uploadFiles(targetDir, { multiple, accept })
downloadFile(fileHandle, fileName)
copyFile(sourceHandle, targetDir, newName)
moveFile(sourceParent, sourceHandle, targetDir)
```

**TanStack Query Hooks** (`src/core/api/file.hooks.ts`):
- `useDirectoryQuery(path)` - List directory with caching
- `useCreateFile()` - Create file with auto-invalidation
- `useWriteFile()` - Update file with cache sync
- `useDeleteEntry()` - Delete with multi-window updates

**Benefits:**
- Automatic caching (stale-while-revalidate)
- Multi-window sync (changes update all windows)
- Loading/error states built-in
- Request deduplication

### App System

**Registration** (`src/apps/index.tsx`):
```typescript
{
  "app-id": {
    name: "App Name",
    icon: IconComponent,
    tags: ["utility"] as const,
    defaultWindow: { size, position },
    App: (props) => <AppComponent {...props} />
  }
}
```

**Opening Apps:**
```typescript
const apps = useApps();
apps.open("file-explorer");
apps.open("media-preview", { file: fileObject });
```

**App Props:**
- Apps receive props when opened
- Props are type-safe via TypeScript
- Props persist with window state

---

## 🎨 Development Patterns

### Adding a New App

1. **Create app directory:** `src/apps/my-app/`
2. **Create component:** `my-app.app.tsx`
3. **Export from index:** `index.ts`
4. **Register in apps.ts:** `export * as "my-app" from "./my-app"`
5. **Add to registry:** `src/apps/index.tsx`

**Template:**
```typescript
// my-app.app.tsx
interface MyAppProps {
  initialValue?: string;
}

export function MyApp({ initialValue }: MyAppProps) {
  return (
    <div className="flex flex-col h-full p-4">
      <h1>My App</h1>
      {/* Content */}
    </div>
  );
}

// index.tsx
"my-app": {
  name: "My App",
  icon: MyIcon,
  tags: ["utility"],
  defaultWindow: { size: { width: 600, height: 400 } },
  App: (props: MyAppProps) => <MyApp {...props} />
}
```

### Using File System in Apps

```typescript
import { useDirectoryQuery, useCreateFile } from "@/core/api/file.hooks";

function MyFileApp() {
  // List directory with automatic caching
  const { data: items, isLoading } = useDirectoryQuery("/documents");
  
  // Create file with auto-invalidation
  const createFile = useCreateFile();
  
  const handleCreate = () => {
    createFile.mutate({
      path: "/documents",
      name: "new-file.txt",
      content: "Hello, World!"
    });
  };
  
  return (
    <div>
      {isLoading ? "Loading..." : items?.map(item => (
        <div key={item.name}>{item.name}</div>
      ))}
      <button onClick={handleCreate}>Create File</button>
    </div>
  );
}
```

### Accessing Settings

```typescript
import { useSettingsStore } from "@/core/stores/settings.store";

function MyComponent() {
  const theme = useSettingsStore(state => state.theme);
  const updateTheme = useSettingsStore(state => state.updateTheme);
  
  return (
    <button onClick={() => updateTheme({ mode: "dark" })}>
      Dark Mode
    </button>
  );
}
```

---

## 🚀 Roadmap Summary

### MVP (3 months) - Phases 1-3
✅ Phase 1: Core OS (window management, desktop, file system) - **COMPLETE**
⏳ Phase 2: App ecosystem (task manager, utilities) - **NEXT**
⏳ Phase 3: Game hub (games platform + puzzles)

### Feature Complete (6 months) - Phases 4-6
📝 Phase 4: Productivity (notes, speed reader, work tracker)
🎬 Phase 5: Media (series tracker, video tools)
🚀 Phase 6: Advanced (WebAssembly, P2P, compression)

### Production Ready (9 months) - Phases 7-9
🔗 Phase 7: System enhancements (URL sharing, notifications, customization)
💎 Phase 8: Polish (PWA, service worker, performance, testing)
📖 Phase 9: Documentation & deployment

### Flagship Features (USPs)
1. **URL Sharing System** - Deep linking for easy demos
2. **Task Manager Integration** - Background task orchestration
3. **WebAssembly Acceleration** - High-performance ops in Rust
4. **Full PWA** - Offline-first, installable

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| **DOCUMENTATION.md** | Complete project documentation |
| **PROJECT_CONTEXT.md** | Quick context for LLMs (TL;DR version - this file) |
| **planning/PLAN.md** | Master development plan (1600+ lines) |
| **planning/ROADMAP.md** | Visual timeline with Mermaid diagrams |
| **planning/TODO.md** | Current task checklist |
| **guides/REFACTOR.md** | Code refactoring guide |
| `../src/core/api/README.md` | File System API docs |
| `../src/core/api/HOOKS.md` | File System hooks docs |
| `../src/apps/file-explorer/README.md` | File Explorer app guide |

---

## 🎯 Design Philosophy

1. **Progressive Enhancement** - Core works everywhere, enhanced features where supported
2. **Performance First** - <100ms interactions, smooth 60fps animations
3. **Developer Experience** - Type-safe, well-documented, clear patterns
4. **User Control** - Extensive customization options
5. **No Backend** - Everything client-side (localStorage + OPFS)

---

## 🔧 Common Operations

### Create a Window
```typescript
import { useWindowManager } from "@/core/contexts/window-manager";
const { dispatch } = useWindowManager();

dispatch({ 
  type: "CREATE_WINDOW", 
  app: appInstance,
  defaults: { size, position, flags }
});
```

### Read a File
```typescript
import * as FileAPI from "@/core/api/file";

const root = await FileAPI.getOPFSRoot();
const fileHandle = await FileAPI.getFileHandle(root, "file.txt");
const content = await FileAPI.readFileAsText(fileHandle);
```

### Open an App
```typescript
import { useApps } from "@/core/contexts/apps";
const apps = useApps();

apps.open("app-id");
apps.open("app-id", { prop1: "value" });
```

### Access Window Context (from inside app)
```typescript
import { useWindow } from "@/core/contexts/window";

function MyApp() {
  const window = useWindow();
  
  useEffect(() => {
    console.log("Window ID:", window.id);
    console.log("Position:", window.config.position);
  }, [window]);
}
```

---

## ⚡ Quick Commands

```bash
# Development
pnpm dev               # Start dev server
pnpm build             # Build for production
pnpm lint              # Run linter

# Utilities
pnpm generate-version  # Generate version.json
pnpm generate-pwa-assets # Generate PWA icons
```

---

## 🆘 Troubleshooting Common Issues

### Import Errors
- Ensure using `@/core/*` for core imports
- Check `@/apps/*` for app imports
- Verify tsconfig.json paths

### Window Not Opening
- Check app is registered in `apps/index.tsx`
- Verify app component renders without errors
- Check browser console for errors

### File Operations Failing
- OPFS requires HTTPS (or localhost)
- Check browser compatibility (Chrome 86+, Firefox 111+, Safari 15.2+)
- Verify storage quota not exceeded

### State Not Persisting
- Zustand stores persist to localStorage automatically
- Clear localStorage if corrupted: `localStorage.clear()`
- Check browser privacy settings (localStorage enabled)

---

## 🎓 Learning Resources

**Key Technologies to Understand:**
1. React 19 (Hooks, Context, Concurrent Features)
2. TypeScript (Generics, Utility Types)
3. Tailwind CSS (Utility Classes)
4. TanStack Query (Query/Mutation, Cache Management)
5. Zustand (State Management)
6. OPFS (File System API)

**External Docs:**
- [OPFS on MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [TanStack Query Docs](https://tanstack.com/query/latest)
- [Zustand Docs](https://zustand-demo.pmnd.rs/)

---

## 💡 Philosophy for LLM Assistants

When working on this project:

1. **Maintain the Core/Apps separation** - Core is framework, apps use framework
2. **Follow established patterns** - See existing apps for examples
3. **Type safety is critical** - Use TypeScript strictly, no `any`
4. **Document as you build** - Update docs/DOCUMENTATION.md for major features
5. **Test multi-window scenarios** - Changes should work across all windows
6. **Cache invalidation matters** - Use TanStack Query properly for file ops
7. **Keep it simple** - Favor simple solutions over clever ones

**When Adding Features:**
- Check if similar feature exists first
- Follow naming conventions
- Add to appropriate documentation
- Test in browser (OPFS needs real browser)
- Consider multi-window implications

**When Fixing Bugs:**
- Understand the system first (read core code)
- Check related systems (window manager, file system, etc.)
- Test edge cases (multiple windows, empty directories, etc.)
- Update docs if behavior changes

---

**Last Updated:** October 20, 2025  
**For Full Details:** See [DOCUMENTATION.md](./DOCUMENTATION.md)  
**Project Repository:** [GitHub - WebOS](https://github.com/lilbunnyrabbit/webos)

