# WebOS - Comprehensive Project Documentation

> **Last Updated:** October 20, 2025  
> **Version:** 1.0.0  
> **Purpose:** Complete reference for understanding, extending, and contributing to the WebOS project

---

## Table of Contents

1. [Project Vision & Goals](#project-vision--goals)
2. [Current State & Completed Features](#current-state--completed-features)
3. [Technical Architecture](#technical-architecture)
4. [Core Systems Deep Dive](#core-systems-deep-dive)
5. [Technology Stack](#technology-stack)
6. [Project Structure](#project-structure)
7. [Development Patterns & Conventions](#development-patterns--conventions)
8. [How to Add New Features](#how-to-add-new-features)
9. [Roadmap & Future Plans](#roadmap--future-plans)
10. [Key Concepts & Terminology](#key-concepts--terminology)

---

## Project Vision & Goals

### 🎯 Primary Vision

**Build a fully-featured, browser-based operating system** that provides a complete desktop computing experience in the web browser. This is not just a window manager or file explorer - it's a comprehensive OS environment with:

- Native-like window management
- Persistent file system storage
- Rich application ecosystem
- System utilities and productivity tools
- Games and entertainment apps
- Customizable user experience
- Progressive Web App capabilities

### 🌟 Key Objectives

1. **Create a Platform**: Build a framework for hosting multiple applications with a consistent OS experience
2. **Showcase Skills**: Demonstrate full-stack development capabilities, React mastery, and system architecture design
3. **Portfolio Piece**: Make it easily shareable and demo-able for job applications and presentations
4. **Reusable Components**: Extract patterns and libraries that can benefit the broader community
5. **Learning Playground**: Experiment with cutting-edge web APIs and technologies (OPFS, WebAssembly, WebRTC, PWA, etc.)
6. **Practical Utility**: Make actually useful tools people can use

### 💡 Unique Selling Points

- **No Backend Required**: Everything runs client-side with browser storage
- **Deep Linking**: URL-based state sharing for easy demonstrations
- **Offline-First**: PWA architecture enables full offline functionality
- **Modern Stack**: React 19, TypeScript, Tailwind CSS 4, latest web APIs
- **Extensible**: Easy to add new apps following established patterns

### 🎨 Design Philosophy

- **Progressive Enhancement**: Core features work everywhere, enhanced features where supported
- **Performance First**: <100ms interactions, smooth animations, efficient rendering
- **User Control**: Extensive customization and configuration options
- **Developer Experience**: Clear patterns, comprehensive documentation, type safety
- **Accessibility**: Keyboard navigation, screen reader support, WCAG compliance

---

## Current State & Completed Features

### ✅ Phase 1: Foundation (MOSTLY COMPLETE)

#### Core Window Management System
- **Window Operations**: Create, destroy, focus, minimize, maximize, restore, resize, drag
- **Multi-Window Support**: Unlimited concurrent windows with proper z-index ordering
- **Window Snapping**: Snap to edges (left, right, corners) with visual feedback
- **Window Bounds**: Automatic boundary checks to keep windows on screen
- **Window Persistence**: Windows restore position/size on app reopen
- **Keyboard Shortcuts**: Alt+F4 to close, window management shortcuts

#### Desktop Environment
- **Desktop Icons**: Add apps to desktop, drag to reposition, persist settings
- **Desktop Background**: Customizable background color/image with fit options
- **Icon Grid System**: Auto-snap icons to grid positions
- **Desktop Context Menu**: Right-click for quick actions (future enhancement)

#### Taskbar System
- **Active Window Indicators**: Visual indication of open and focused windows
- **Quick Launch**: Click to open or focus existing windows
- **Start Menu**: Browse and launch all installed apps
- **System Tray**: Clock/date display, system information
- **Customizable Position**: Top, bottom, left, right positioning
- **App Pinning**: Pin frequently used apps to taskbar

#### Settings & Persistence
- **Settings App**: Centralized configuration interface
- **Zustand Store**: State management with localStorage persistence
- **Theme System**: Basic theming support (light/dark modes)
- **Taskbar Configuration**: Position, behavior settings

#### Versioning System ⭐ NEW
- **Automatic Version Detection**: Checks for updates periodically
- **Update Notifications**: Non-intrusive update prompts
- **Hard Refresh Utility**: Clears cache and reloads for clean updates
- **Build Information**: Display commit hash, version, build date
- **Settings Integration**: View version info and check for updates manually
- **Development Mode Detection**: Disables version checks in dev environment

### ✅ Phase 1.2: File System (COMPLETE) 🎉

#### Origin Private File System (OPFS) Implementation
- **Complete OPFS API Wrapper**: 25+ functions for file/folder operations
- **Native Browser Storage**: Uses modern OPFS instead of IndexedDB
- **Hierarchical Structure**: Full directory tree support
- **File Operations**: Create, read, write, delete, copy, move, rename
- **Metadata Support**: Size, lastModified, file type detection
- **Storage Management**: Quota monitoring, usage statistics

#### TanStack Query Integration ⭐ MODERN
- **Automatic Caching**: Smart cache strategies with stale-time management
- **Cache Invalidation**: Automatic updates on mutations
- **Real-time Sync**: Changes in one window update all other windows
- **Loading States**: Built-in loading/error state management
- **Request Deduplication**: Prevents duplicate API calls
- **Optimistic Updates**: Instant UI feedback with rollback on error

#### Comprehensive Documentation
- **API Documentation**: 650+ lines (`file.ts` README)
- **Hooks Documentation**: 800+ lines (`file.hooks.ts` documentation)
- **Migration Guide**: 500+ lines for updating legacy code
- **Working Examples**: 300+ lines of example implementations

### ✅ Applications

#### File Explorer App ⭐ FLAGSHIP
- **OPFS-backed Storage**: Modern browser file system
- **Breadcrumb Navigation**: Click through directory hierarchy
- **File Operations**: Create, delete, upload, download
- **Context Menu**: Right-click for quick actions (Open, Edit, Download, Delete)
- **Text Editor**: Built-in text file editor
- **Media Preview Integration**: Opens images/videos/audio in dedicated viewer
- **Storage Monitor**: Real-time quota and usage display
- **Multi-window Sync**: Changes reflect across all file explorer windows
- **Error Handling**: Comprehensive error alerts with dismissible UI

#### Media Preview App
- **Image Viewer**: Display JPG, PNG, GIF, WebP, SVG, BMP, etc.
- **Video Player**: MP4, WebM, OGG, MOV, AVI with controls
- **Audio Player**: MP3, WAV, OGG, M4A, AAC with controls
- **PDF Viewer**: Embedded PDF display
- **File Integration**: Opened automatically from File Explorer

#### Settings App
- **About Section**: Version info, system details, update checker
- **Appearance**: Theme settings, taskbar position
- **Desktop Configuration**: Background settings, icon management
- **Taskbar Settings**: Position, pinned apps

#### Profiler App (Developer Tool)
- **Performance Monitoring**: React Profiler integration
- **Window Stats**: Render count, render time per window
- **Toggle-able**: Enable/disable profiling globally
- **Development Aid**: Debug performance issues

#### Other Apps
- **Files App**: Legacy file browser (needs migration to new FileAPI)
- **Style Guide**: UI component showcase
- **Tic-Tac-Toe**: Game demo
- **Test App**: Development testing sandbox

### 🏗️ Core Infrastructure

#### Context System
- **WindowManager Context**: Global window state, creation, destruction, focus management
- **Window Context**: Individual window state (position, size, flags)
- **Apps Context**: Registered apps, app metadata, app opening logic
- **Version Context**: Version checking, update detection

#### State Management
- **Zustand Stores**: `desktop.store.ts`, `settings.store.ts`
- **localStorage Persistence**: Automatic sync with browser storage
- **Type-Safe State**: Full TypeScript integration

#### Utility Libraries
- **Flags System**: Type-safe boolean flags (minimized, maximized, etc.)
- **Order System**: Z-index and order management
- **Update Utilities**: Hard refresh, cache clearing
- **Window Utilities**: Bounds checking, snap zones, position calculations

#### UI Components (Radix + Shadcn)
- **Button**: Styled button variants
- **Dialog**: Modal dialog component
- **Popover**: Dropdown popovers
- **Command**: Command palette (future)

---

## Technical Architecture

### 🏛️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    WebOS (React App)                   │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              OS Layer (Core)                     │  │  │
│  │  │  - Window Manager                                │  │  │
│  │  │  - Desktop Environment                           │  │  │
│  │  │  - Taskbar                                       │  │  │
│  │  │  - Context Providers                             │  │  │
│  │  │  - State Management                              │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │           Application Layer (Apps)               │  │  │
│  │  │  - File Explorer                                 │  │  │
│  │  │  - Media Preview                                 │  │  │
│  │  │  - Settings                                      │  │  │
│  │  │  - Games                                         │  │  │
│  │  │  - Utilities                                     │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Browser APIs & Storage                    │  │
│  │  - OPFS (File System)                                  │  │
│  │  - localStorage (Settings)                             │  │
│  │  - Service Worker (Offline)                            │  │
│  │  - Storage API (Quota)                                 │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 📦 Core/Apps Separation

The codebase follows a **two-layer architecture**:

#### Layer 1: Core (`src/core/`)
The **WebOS framework** - reusable OS components and infrastructure

```
src/core/
├── components/      # OS-level UI (Desktop, Taskbar, Window)
├── contexts/        # Global state providers
├── stores/          # Zustand state stores
├── lib/             # Utility functions
├── ui/              # UI primitives (Button, Dialog, etc.)
├── api/             # Core APIs (File System, etc.)
├── types/           # TypeScript type definitions
├── constants/       # Global constants
├── emitters/        # Event emitters
└── index.ts         # Public API exports
```

#### Layer 2: Apps (`src/apps/`)
**Applications** built on the framework

```
src/apps/
├── apps.ts                # App registry
├── index.tsx             # App components index
├── file-explorer/        # File management app
├── media-preview/        # Media viewer app
├── settings/             # Settings app
├── profiler/             # Developer tools
├── tic-tac-toe/          # Game
└── [other-apps]/         # Additional apps
```

### 🔄 Component Hierarchy

```
App.tsx (Root)
└── QueryClientProvider (TanStack Query)
    └── VersionProvider
        └── AppsProvider
            └── WindowManagerProvider
                └── OS
                    ├── Desktop
                    │   └── DesktopItem (for each desktop icon)
                    ├── Taskbar
                    │   ├── StartMenu
                    │   ├── TaskbarItem (for each open window)
                    │   └── DateTime
                    └── WindowManagerContainer
                        └── Window (for each open window)
                            ├── WindowTitle
                            ├── WindowContent
                            │   └── [App Component]
                            └── ResizeHandlers
```

### 🔁 State Flow

#### Window Creation Flow
```
User clicks app icon
  → AppsContext.open(appId, props)
  → WindowManager dispatch(CREATE_WINDOW)
  → Generate Window ID (UUID)
  → Create WindowInstance
  → Add to state.index
  → Add to state.order (z-index)
  → Focus new window
  → Render Window component
  → Mount app inside window
```

#### File Operation Flow (with TanStack Query)
```
User triggers file operation (e.g., create file)
  → Call mutation hook (useCreateFile)
  → Execute OPFS operation
  → On success:
    → Invalidate relevant queries
    → TanStack Query refetches directory listing
    → All windows with that directory update automatically
  → On error:
    → Show error state
    → Optionally rollback optimistic update
```

---

## Core Systems Deep Dive

### 🪟 Window Management System

#### Window State Structure
```typescript
interface WindowInstance {
  id: WindowId;                    // Unique UUID
  app: AppInstance;                // App metadata and props
  createdAt: Date;                 // Creation timestamp
  flags: Flags<WindowFlag>;        // minimized, maximized
  snapZone: SnapZone;              // Snap position
  config: {
    position: { x: number, y: number };
    size: { width: number, height: number };
  };
}
```

#### Window Manager Actions
- **CREATE_WINDOW**: Create new window with defaults
- **DESTROY_WINDOW**: Remove window from state
- **FOCUS_WINDOW**: Bring window to front (z-index)
- **TOGGLE_WINDOW**: Minimize/restore window
- **TOGGLE_MAXIMIZE_WINDOW**: Maximize/restore window
- **SET_SNAP_ZONE**: Update window snap position
- **MINIMIZE_ALL_WINDOWS**: Minimize all windows (Show Desktop)
- **RESTORE_ALL_WINDOWS**: Restore all windows

#### Z-Index Management
Uses an **Order system** that maintains a sorted list of window IDs. The window with highest order index gets the highest z-index.

```typescript
// Order structure
type Order<T> = T[];  // Array of items, index = priority

// Operations
Order.add(order, item);      // Add to end (highest priority)
Order.remove(order, item);   // Remove item
Order.top(order, item);      // Move to end (bring to front)
Order.bottom(order, item);   // Move to start (send to back)
```

### 📂 File System API

#### OPFS Architecture
```
Browser Storage
└── Origin Private File System (OPFS)
    └── Root Directory (/)
        ├── documents/
        │   └── file.txt
        ├── images/
        │   ├── photo.jpg
        │   └── screenshot.png
        └── projects/
            └── webos/
                └── README.md
```

#### Core File API Functions
```typescript
// Directory operations
await FileAPI.getOPFSRoot()
await FileAPI.createDirectory(parent, name)
await FileAPI.listDirectory(dirHandle, options)
await FileAPI.getDirectorySize(dirHandle)

// File operations
await FileAPI.createFile(parent, name, { content })
await FileAPI.writeFile(fileHandle, content)
await FileAPI.readFile(fileHandle)
await FileAPI.readFileAsText(fileHandle)
await FileAPI.deleteEntry(parent, name, { recursive })

// Transfer operations
await FileAPI.uploadFiles(targetDir, { multiple, accept })
await FileAPI.downloadFile(fileHandle, fileName)
await FileAPI.copyFile(sourceHandle, targetDir, newName)
await FileAPI.moveFile(sourceParent, sourceHandle, targetDir)

// Storage management
await FileAPI.getStorageEstimate()
await FileAPI.exists(parent, name, kind)
```

#### TanStack Query Hooks

**Query Hooks** (data fetching with caching):
```typescript
useDirectoryQuery(path)        // List directory contents
useFileQuery(path)             // Get file handle
useFileContentQuery(path)      // Read file content
useStorageEstimate()           // Storage quota info
```

**Mutation Hooks** (data modification with cache invalidation):
```typescript
useCreateDirectory()           // Create folder
useCreateFile()                // Create file
useWriteFile()                 // Write to file
useDeleteEntry()               // Delete file/folder
useUploadFiles()               // Upload from computer
useDownloadFile()              // Download to computer
useCopyFile()                  // Copy file
useMoveFile()                  // Move file
```

All mutations automatically invalidate relevant queries, triggering UI updates across all open windows.

### 🎨 App System

#### App Registration

Apps are registered in `src/apps/index.tsx`:

```typescript
export default {
  "app-id": {
    name: "App Name",
    icon: IconComponent,
    tags: ["utility"] as const,
    defaultWindow: {
      size: { width: 800, height: 600 },
      position: { x: 100, y: 100 },
    },
    App: ({ prop1, prop2 }) => <AppComponent />
  }
} satisfies AppsConfig;
```

#### App Instance Creation

When opening an app:
```typescript
const appInstance: AppInstance = {
  id: "app-id",
  name: "App Name",
  icon: IconComponent,
  tags: ["utility"],
  props: { prop1: "value1", prop2: "value2" },
  $node: <AppComponent prop1="value1" prop2="value2" />
};
```

#### App Opening Flow

```typescript
// Open app without props
apps.open("file-explorer");

// Open app with props
apps.open("media-preview", { 
  file: fileObject,
  path: "/images/photo.jpg"
});

// Open multiple instances
apps.open("file-explorer");  // Window 1
apps.open("file-explorer");  // Window 2 (new instance)
```

### ⚙️ Settings & Persistence

#### Settings Store Structure
```typescript
interface SettingsState {
  taskbar: {
    position: "top" | "bottom" | "left" | "right";
    pinned: string[];  // App IDs
  };
  desktop: {
    apps: Array<{
      appId: string;
      position: { x: number; y: number };
    }>;
    background: {
      type: "color" | "image";
      value: string;
    };
  };
  theme: {
    mode: "light" | "dark";
  };
}
```

#### Persistence Strategy
- **Zustand middleware**: Automatically syncs store to `localStorage`
- **Key**: `webos-settings`
- **Format**: JSON
- **Rehydration**: On app load, settings restore from localStorage

---

## Technology Stack

### 🛠️ Core Technologies

#### Frontend Framework
- **React 19.2.0**: Latest React with concurrent features
- **TypeScript 5.9.3**: Type safety and better DX
- **Vite 7.1.7**: Fast build tool and dev server

#### Styling
- **Tailwind CSS 4.1.14**: Utility-first CSS framework
- **tw-animate-css**: Animation utilities
- **CVA (class-variance-authority)**: Component variant management
- **clsx + tailwind-merge**: Conditional class merging

#### State Management
- **Zustand 5.0.8**: Lightweight state management
- **TanStack Query 5.90.5**: Server state management and caching
- **React Context**: Component-level state sharing

#### UI Components
- **Radix UI**: Headless accessible components
  - `@radix-ui/react-dialog`: Modals
  - `@radix-ui/react-popover`: Popovers
  - `@radix-ui/react-slot`: Polymorphic components
  - `@radix-ui/react-visually-hidden`: Accessibility
- **Shadcn/ui**: Pre-styled Radix components
- **Lucide React 0.545.0**: Icon library
- **cmdk 1.1.1**: Command palette

#### Utilities
- **uuid 13.0.0**: Unique ID generation
- **axios 1.12.2**: HTTP client (for version checking)
- **@lilbunnyrabbit/event-emitter**: Custom event system
- **@lilbunnyrabbit/utils**: Utility functions
- **react-error-boundary 6.0.0**: Error handling

#### Development Tools
- **ESLint 9.37.0**: Code linting
- **TypeScript ESLint**: TypeScript-specific linting
- **@vitejs/plugin-react-swc**: Fast React refresh with SWC

#### PWA
- **vite-plugin-pwa**: Progressive Web App support
- **@vite-pwa/assets-generator**: Generate PWA assets

### 🌐 Browser APIs Used

#### Storage
- **Origin Private File System (OPFS)**: Modern file storage
- **Storage API**: Quota management
- **localStorage**: Settings persistence

#### Modern Web APIs
- **File System Access API**: File handles and operations
- **Service Worker API**: Offline support (future)
- **Storage Manager API**: Quota estimation
- **Blob API**: Binary data handling
- **URL API**: Object URLs for media

### 📚 Planned Technologies

#### Phase 2+
- **React Router (MemoryRouter)**: In-app navigation
- **@lilbunnyrabbit/task-manager**: Background task orchestration ⭐
- **WebRTC**: Peer-to-peer file sharing
- **WebAssembly**: High-performance operations (compression, image processing)
- **Workbox**: Service worker management
- **ffmpeg.wasm**: Video processing
- **jsPDF / pdf-lib**: PDF generation

---

## Project Structure

### 📁 Complete Directory Tree

```
webos/
├── public/                       # Static assets
│   ├── logo.svg                  # App logo
│   ├── favicon.ico               # Favicon
│   ├── pwa-*.png                 # PWA icons
│   ├── version.json              # Generated version info
│   └── files/                    # Sample files for demos
│
├── src/
│   ├── core/                     # 🏛️ OS Framework
│   │   ├── api/                  # Core APIs
│   │   │   ├── file.ts           # OPFS API (25+ functions)
│   │   │   ├── file.hooks.ts    # TanStack Query hooks
│   │   │   ├── file.types.ts    # Type definitions
│   │   │   ├── README.md         # API documentation
│   │   │   ├── HOOKS.md          # Hooks documentation
│   │   │   └── MIGRATION.md      # Migration guide
│   │   │
│   │   ├── components/           # OS Components
│   │   │   ├── desktop/          # Desktop environment
│   │   │   │   ├── desktop.tsx
│   │   │   │   └── desktop-item.tsx
│   │   │   ├── taskbar/          # Taskbar components
│   │   │   │   ├── taskbar.tsx
│   │   │   │   ├── taskbar-item.tsx
│   │   │   │   ├── date-time.tsx
│   │   │   │   └── start-menu/
│   │   │   ├── window/           # Window system
│   │   │   │   ├── window.tsx
│   │   │   │   ├── window-title.tsx
│   │   │   │   ├── window-content.tsx
│   │   │   │   └── resize-handlers.tsx
│   │   │   ├── os.tsx            # Main OS component
│   │   │   ├── profiler-wrapper.tsx
│   │   │   └── version-notification.tsx
│   │   │
│   │   ├── contexts/             # React Context Providers
│   │   │   ├── apps/             # App registration context
│   │   │   ├── version/          # Version checking context
│   │   │   ├── window/           # Individual window context
│   │   │   └── window-manager/   # Window manager context
│   │   │
│   │   ├── stores/               # Zustand Stores
│   │   │   ├── desktop.store.ts
│   │   │   └── settings.store.ts
│   │   │
│   │   ├── lib/                  # Utility Functions
│   │   │   ├── flags.ts          # Flag system
│   │   │   ├── order.ts          # Z-index ordering
│   │   │   ├── update.ts         # Update utilities
│   │   │   ├── utils.ts          # General utilities
│   │   │   └── windows.ts        # Window utilities
│   │   │
│   │   ├── ui/                   # UI Primitives
│   │   │   ├── button.tsx
│   │   │   ├── command.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── popover.tsx
│   │   │
│   │   ├── types/                # TypeScript Types
│   │   │   └── index.ts
│   │   │
│   │   ├── constants/            # Constants
│   │   │   └── index.ts
│   │   │
│   │   ├── emitters/             # Event Emitters
│   │   │   └── profiler.emitter.ts
│   │   │
│   │   └── index.tsx             # Core public API
│   │
│   ├── apps/                     # 📱 Applications
│   │   ├── apps.ts               # App registry
│   │   ├── index.tsx             # App exports
│   │   │
│   │   ├── file-explorer/        # ⭐ File management app
│   │   │   ├── file-explorer.app.tsx
│   │   │   ├── README.md
│   │   │   └── index.ts
│   │   │
│   │   ├── media-preview/        # Media viewer
│   │   │   ├── media-preview.app.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── settings/             # Settings app
│   │   │   ├── settings.app.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── profiler/             # Developer profiler
│   │   │   ├── profiler.app.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── files/                # Legacy files app
│   │   ├── style-guide/          # UI component showcase
│   │   ├── test/                 # Test app
│   │   └── tic-tac-toe/          # Game demo
│   │
│   ├── assets/                   # Static assets
│   │   └── version.json          # Built version info
│   │
│   ├── App.tsx                   # Root component
│   ├── main.tsx                  # Entry point
│   └── index.css                 # Global styles
│
├── scripts/
│   └── generate-version.js       # Version generation script
│
├── docs/                         # Documentation
│   ├── GITHUB_BUILD_STATUS.md
│   └── SESSION_SUMMARY_FILE_EXPLORER.md
│
├── PLAN.md                       # 📋 Master development plan
├── ROADMAP.md                    # Timeline visualization
├── TODO.md                       # Current tasks
├── REFACTOR.md                   # Refactoring guide
├── DOCUMENTATION.md              # 📚 This file
├── README.md                     # Project readme
│
├── package.json                  # Dependencies
├── pnpm-lock.yaml               # Lock file
├── tsconfig.json                # TypeScript config
├── tsconfig.app.json            # App-specific TS config
├── tsconfig.node.json           # Node-specific TS config
├── vite.config.ts               # Vite configuration
├── eslint.config.js             # ESLint configuration
└── components.json              # Shadcn config
```

### 🔑 Key Files Explained

#### `src/core/index.tsx`
Public API for the core framework. Apps import from `@/core` to access OS functionality.

#### `src/apps/apps.ts`
App registry that exports all app configurations. Each app is a module with name, icon, component, etc.

#### `src/core/contexts/window-manager/`
The heart of the window management system. Contains reducer logic, state management, and context provider.

#### `src/core/api/file.ts`
Complete OPFS API wrapper with 25+ functions for file system operations.

#### `src/core/api/file.hooks.ts`
TanStack Query hooks for file operations with automatic caching and invalidation.

#### `scripts/generate-version.js`
Generates `version.json` during build with commit hash, branch, timestamp, and version number.

---

## Development Patterns & Conventions

### 🎯 Coding Standards

#### TypeScript
- **Strict mode enabled**: All type checking rules enforced
- **No `any` types**: Use `unknown` and type guards
- **Prefer interfaces**: For object shapes
- **Use `as const`**: For constants and enums
- **Export types separately**: `export type { ... }`

#### React
- **Functional components only**: No class components
- **Hooks for state**: `useState`, `useReducer`, `useContext`
- **Custom hooks**: Prefix with `use`, extract reusable logic
- **Error boundaries**: Wrap unstable components
- **Memoization**: Use `useMemo`/`useCallback` for expensive operations

#### Naming Conventions
- **Components**: PascalCase (`WindowManager`, `DesktopItem`)
- **Files**: kebab-case (`window-manager.tsx`, `desktop-item.tsx`)
- **Hooks**: camelCase with `use` prefix (`useWindowManager`, `useFileQuery`)
- **Constants**: SCREAMING_SNAKE_CASE (`WINDOW_MIN_WIDTH`, `APP_TAG`)
- **Types/Interfaces**: PascalCase (`WindowInstance`, `AppConfig`)
- **Utilities**: camelCase (`formatBytes`, `calculateBounds`)

#### File Organization
```typescript
// 1. Imports (React, external, internal)
import React, { useState } from "react";
import { Button } from "@/core/ui/button";
import { useWindowManager } from "@/core/contexts/window-manager";

// 2. Types/Interfaces
interface MyComponentProps {
  title: string;
  onClose: () => void;
}

// 3. Constants
const DEFAULT_SIZE = { width: 800, height: 600 };

// 4. Component
export function MyComponent({ title, onClose }: MyComponentProps) {
  // ... implementation
}

// 5. Helper functions (if any)
function helperFunction() {
  // ...
}
```

#### Import Aliases
- `@/core/*`: Core framework code
- `@/apps/*`: Applications
- `@/assets/*`: Static assets

### 🧩 Component Patterns

#### Window-based App Pattern
```typescript
// apps/my-app/my-app.tsx
export function MyApp({ someProp }: MyAppProps) {
  // App state
  const [data, setData] = useState();
  
  // Window context (optional)
  const window = useWindow();
  
  // Render app content
  return (
    <div className="flex flex-col h-full">
      <header>...</header>
      <main className="flex-1 overflow-auto">
        {/* Content */}
      </main>
      <footer>...</footer>
    </div>
  );
}
```

#### App Registration Pattern
```typescript
// apps/index.tsx
export default {
  "my-app": {
    name: "My App",
    icon: MyIcon,
    tags: ["utility"] as const,
    defaultWindow: {
      size: { width: 600, height: 400 },
      flags: [],
    },
    App: (props: MyAppProps) => <MyApp {...props} />
  }
} satisfies AppsConfig;
```

#### Custom Hook Pattern
```typescript
// hooks/use-my-feature.ts
export function useMyFeature(config: Config) {
  const [state, setState] = useState();
  
  useEffect(() => {
    // Setup
    return () => {
      // Cleanup
    };
  }, []);
  
  const doSomething = useCallback(() => {
    // Action
  }, []);
  
  return { state, doSomething };
}
```

### 📝 Documentation Standards

#### Code Comments
```typescript
/**
 * Brief description of function/component
 * 
 * @param param1 - Description
 * @param param2 - Description
 * @returns Description of return value
 * 
 * @example
 * ```typescript
 * const result = myFunction("input", 123);
 * ```
 */
export function myFunction(param1: string, param2: number): Result {
  // Implementation
}
```

#### README Files
Each major feature/app should have a README with:
- **Overview**: What it does
- **Features**: Key capabilities
- **Usage**: How to use it
- **API Reference**: Public API (if applicable)
- **Examples**: Code examples
- **Technical Details**: Implementation notes

### 🔄 Git Workflow

#### Branch Strategy
- `master`: Production-ready code
- `develop`: Integration branch (future)
- `feature/*`: New features
- `fix/*`: Bug fixes
- `refactor/*`: Code refactoring

#### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

Examples:
```
feat(file-explorer): add drag-and-drop file upload

- Implement drag-over visual feedback
- Handle multiple file drops
- Integrate with uploadFiles API

Closes #123
```

---

## How to Add New Features

### 🆕 Adding a New App

#### Step 1: Create App Directory
```bash
mkdir src/apps/my-app
cd src/apps/my-app
```

#### Step 2: Create App Component
```typescript
// src/apps/my-app/my-app.app.tsx
import { useState } from "react";

interface MyAppProps {
  initialValue?: string;
}

export function MyApp({ initialValue = "" }: MyAppProps) {
  const [value, setValue] = useState(initialValue);
  
  return (
    <div className="flex flex-col h-full p-4">
      <h1 className="text-2xl font-bold mb-4">My App</h1>
      <input 
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="border rounded px-3 py-2"
      />
    </div>
  );
}
```

#### Step 3: Create Index File
```typescript
// src/apps/my-app/index.ts
export { MyApp } from "./my-app.app";
export type { MyAppProps } from "./my-app.app";
```

#### Step 4: Create Icon Component
```typescript
// Option 1: Use Lucide icon
import { Heart } from "lucide-react";
export const MyAppIcon = Heart;

// Option 2: Custom SVG
export function MyAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      {/* SVG paths */}
    </svg>
  );
}
```

#### Step 5: Register App
```typescript
// src/apps/apps.ts
export * as "my-app" from "./my-app"
```

```typescript
// src/apps/index.tsx
import { MyAppIcon } from "./my-app";

export default {
  // ... other apps
  "my-app": {
    name: "My App",
    icon: MyAppIcon,
    tags: ["utility"] as const,
    defaultWindow: {
      size: { width: 600, height: 400 },
      position: { x: 100, y: 100 },
    },
    App: (props: MyAppProps) => <MyApp {...props} />
  }
} satisfies AppsConfig;
```

#### Step 6: Add to Desktop (Optional)
Users can add to desktop via drag-and-drop or context menu. To add by default:

```typescript
// In desktop.store.ts or initial settings
const defaultDesktopApps = [
  { appId: "my-app", position: { x: 20, y: 20 } }
];
```

#### Step 7: Test
```bash
npm run dev
```
- Check app appears in start menu
- Verify app opens in window
- Test window operations (minimize, maximize, resize, close)
- Test with props: `apps.open("my-app", { initialValue: "test" })`

### ➕ Adding a New Core Feature

#### Example: Adding a Notification System

#### Step 1: Define Types
```typescript
// src/core/types/notification.ts
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: Date;
  duration?: number;
}
```

#### Step 2: Create Context
```typescript
// src/core/contexts/notifications/notification.context.tsx
import { createContext, useContext, useState } from "react";

interface NotificationContextValue {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const addNotification = (notif) => {
    const notification: Notification = {
      ...notif,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    setNotifications(prev => [...prev, notification]);
    
    // Auto-remove after duration
    if (notification.duration) {
      setTimeout(() => {
        removeNotification(notification.id);
      }, notification.duration);
    }
  };
  
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };
  
  return (
    <NotificationContext.Provider value={{ 
      notifications, 
      addNotification, 
      removeNotification 
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within NotificationProvider");
  return context;
}
```

#### Step 3: Create UI Component
```typescript
// src/core/components/notification-center.tsx
import { useNotifications } from "@/core/contexts/notifications";

export function NotificationCenter() {
  const { notifications, removeNotification } = useNotifications();
  
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map(notif => (
        <div 
          key={notif.id}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">{notif.title}</h3>
              <p className="text-sm text-gray-600">{notif.message}</p>
            </div>
            <button onClick={() => removeNotification(notif.id)}>×</button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

#### Step 4: Integrate in App
```typescript
// src/App.tsx
import { NotificationProvider } from "@/core/contexts/notifications";
import { NotificationCenter } from "@/core/components/notification-center";

export function App() {
  return (
    <NotificationProvider>
      <OS />
      <NotificationCenter />
    </NotificationProvider>
  );
}
```

#### Step 5: Export in Core
```typescript
// src/core/index.tsx
export { useNotifications, NotificationProvider } from "./contexts/notifications";
export type { Notification } from "./types/notification";
```

#### Step 6: Use in Apps
```typescript
// In any app
import { useNotifications } from "@/core";

export function MyApp() {
  const { addNotification } = useNotifications();
  
  const handleSave = () => {
    // ... save logic
    addNotification({
      title: "Success",
      message: "File saved successfully",
      type: "success",
      duration: 3000,
    });
  };
}
```

### 🔧 Adding a New File API Function

#### Step 1: Add to file.ts
```typescript
// src/core/api/file.ts

/**
 * Rename a file or directory
 * @param parent - Parent directory handle
 * @param oldName - Current name
 * @param newName - New name
 */
export async function renameEntry(
  parent: FileSystemDirectoryHandle,
  oldName: string,
  newName: string
): Promise<void> {
  // Get handle for the old entry
  const entry = await parent.getFileHandle(oldName)
    .catch(() => parent.getDirectoryHandle(oldName));
  
  // Copy to new name
  if (entry.kind === "file") {
    const file = await (entry as FileSystemFileHandle).getFile();
    await createFile(parent, newName, { content: file });
  } else {
    // For directories, need recursive copy
    const newDir = await createDirectory(parent, newName);
    // ... copy contents recursively
  }
  
  // Delete old entry
  await deleteEntry(parent, oldName, { recursive: entry.kind === "directory" });
}
```

#### Step 2: Add Hook (if needed)
```typescript
// src/core/api/file.hooks.ts

export function useRenameEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      path, 
      oldName, 
      newName 
    }: { 
      path: string; 
      oldName: string; 
      newName: string; 
    }) => {
      const parent = await navigateToPath(path);
      return FileAPI.renameEntry(parent, oldName, newName);
    },
    onSuccess: (_, variables) => {
      // Invalidate directory query
      queryClient.invalidateQueries({ 
        queryKey: ["directory", variables.path] 
      });
    },
  });
}
```

#### Step 3: Document
Add to `README.md` and `HOOKS.md` with usage examples.

#### Step 4: Use in App
```typescript
// In file-explorer app
const renameMutation = useRenameEntry();

const handleRename = (oldName: string, newName: string) => {
  renameMutation.mutate({
    path: currentPath,
    oldName,
    newName,
  });
};
```

---

## Roadmap & Future Plans

### 📅 Development Timeline (9 Months Total)

#### ✅ Phase 1: Foundation (Weeks 1-3) - MOSTLY COMPLETE
- Core window management ✅
- Desktop environment ✅
- Taskbar system ✅
- Settings persistence ✅
- Versioning system ✅
- **OPFS file system** ✅
- **File Explorer app** ✅

#### 🔄 Phase 2: App Ecosystem (Weeks 4-8) - IN PROGRESS
- [ ] Import static-utils projects
- [ ] **@lilbunnyrabbit/task-manager integration** ⭐
- [ ] Color utility suite (Chromatics)
- [ ] RNG tools
- [ ] React Router (MemoryRouter) for in-app navigation

#### 🎮 Phase 3: Game Hub (Weeks 9-12)
- [ ] Game Hub core application
- [ ] Nonogram puzzle game ⭐
- [ ] Additional puzzle games (3-4)
- [ ] Game library management
- [ ] Save game system

#### 📝 Phase 4: Productivity (Weeks 13-16)
- [ ] Quick Notes (quno) - chronological notes app
- [ ] Speed Reader - RSVP reading app
- [ ] Markdown to PDF converter
- [ ] Work Hours Tracker

#### 🎬 Phase 5: Media & Entertainment (Weeks 17-20)
- [ ] Series Tracker (TV show tracker with API)
- [ ] Gifski wrapper (video to GIF converter)
- [ ] Image editor (basic editing tools)
- [ ] Video tools (trimmer, merger)

#### 🚀 Phase 6: Advanced Features (Weeks 21-24)
- [ ] Compression tools suite
- [ ] **WebAssembly implementation** (Rust) ⚡
- [ ] P2P file transfer (WebRTC)
- [ ] Terminal emulator

#### 🔗 Phase 7: System Enhancements (Weeks 25-28)
- [ ] **URL sharing system** ⭐ (deep linking)
- [ ] Notifications system
- [ ] Profiler app (enhanced)
- [ ] Context menus everywhere
- [ ] Keyboard shortcuts system
- [ ] Customization system (themes, sounds, wallpapers)

#### 💎 Phase 8: Polish & Optimization (Weeks 29-32)
- [ ] Service Worker + PWA ⭐
- [ ] Performance optimization
- [ ] Accessibility (WCAG compliance)
- [ ] Testing (unit, integration, E2E)
- [ ] Mobile responsive design

#### 📖 Phase 9: Documentation & Deployment (Weeks 33-36)
- [ ] Complete documentation
- [ ] User guide
- [ ] Developer guide
- [ ] Production deployment
- [ ] CI/CD pipeline

### 🎯 MVP Scope (3 Months)

**Must Have:**
1. ✅ Window management
2. ✅ Desktop & Taskbar
3. ✅ OPFS file system
4. ✅ File Explorer app
5. ⏳ Task Manager integration
6. ⏳ Game Hub with 2-3 games

### ⭐ Flagship Features (Unique Selling Points)

#### 1. URL Sharing System (Phase 7)
Deep linking for easy demos and sharing:
```
yourwebos.com/#/demo/showcase  → Full demo workspace
yourwebos.com/#/app/file-explorer?path=/documents → Open specific folder
yourwebos.com/#/workspace?state=... → Restore complete workspace
```

#### 2. Task Manager Integration (Phase 2)
Background task orchestration using `@lilbunnyrabbit/task-manager`:
- File upload/download progress
- Video processing pipelines
- Batch operations
- Visual task manager app

#### 3. WebAssembly Acceleration (Phase 6)
High-performance operations in Rust:
- Compression algorithms (10-100x faster)
- Image processing
- Cryptography
- Learning opportunity

#### 4. Service Worker + PWA (Phase 8)
Full offline capabilities:
- Work without internet
- Fast subsequent loads
- Background sync
- Push notifications

### 🔮 Future Considerations

**Potential Extensions:**
- App Store/Marketplace
- Backend services (AWS SAM, Remix)
- Mobile app (React Native)
- Electron desktop app
- VS Code extension
- Plugin system
- Multi-user support
- Cloud sync

---

## Key Concepts & Terminology

### 🧠 Core Concepts

#### Origin Private File System (OPFS)
Modern browser API providing a private file system for each origin. Unlike IndexedDB, OPFS:
- Has a true file/folder hierarchy
- Offers synchronous access in Workers
- Performs better for file operations
- Is quota-managed like other storage

#### Window Instance
A running instance of an application within a window frame. Multiple instances of the same app can exist.

#### App Instance
Metadata about an app including ID, name, icon, props, and the React element to render.

#### Z-Index Order
The stacking order of windows. Managed by the Order system, which maintains a sorted array of window IDs.

#### Snap Zone
Predefined screen areas where windows can snap (left, right, corners, top, bottom).

#### Flags System
Type-safe boolean flags for state (e.g., minimized, maximized). Uses a readonly array of string literals.

#### TanStack Query Keys
Arrays used to uniquely identify cached data:
```typescript
["directory", "/path/to/folder"]  // Directory listing
["file", "/path/to/file.txt"]     // File handle
["file-content", "/path"]          // File content
```

### 📖 Terminology

| Term | Definition |
|------|------------|
| **OPFS** | Origin Private File System - browser file storage API |
| **TanStack Query** | React library for server state management and caching |
| **Zustand** | Lightweight React state management library |
| **PWA** | Progressive Web App - web app with native-like features |
| **Service Worker** | JavaScript worker that intercepts network requests |
| **Deep Linking** | URL that opens app in specific state |
| **Snap** | Window positioning to screen edges |
| **Order** | Z-index management system |
| **Flags** | Type-safe boolean state values |
| **Context** | React's way of sharing state across components |
| **Hook** | React function for state and lifecycle logic |
| **Mutation** | TanStack Query operation that modifies data |
| **Query** | TanStack Query operation that fetches data |

---

## Extending This Documentation

### 📝 When Adding New Features

When you add a significant new feature, update this documentation:

#### 1. Update "Current State & Completed Features"
Add the feature to the appropriate phase section with:
- Feature name
- Brief description
- Status (✅ Complete, 🔄 In Progress, ⏳ Planned)
- Key capabilities

#### 2. Update "Core Systems Deep Dive" (if applicable)
If adding a new core system:
- Add a new subsection
- Explain the architecture
- Show key data structures
- Document the API

#### 3. Update "How to Add New Features"
If you've established a new pattern:
- Add a section explaining the pattern
- Provide step-by-step guide
- Include code examples
- Show integration points

#### 4. Update "Technology Stack"
If adding new dependencies:
- Add to appropriate section
- Explain why it was chosen
- Note version number
- Document key uses

#### 5. Update "Project Structure"
If adding new directories or major files:
- Update the directory tree
- Add explanation in "Key Files Explained"

#### 6. Update "Roadmap & Future Plans"
- Mark completed items with ✅
- Add new planned features
- Adjust timeline if needed

### 🔄 Version History

Maintain a changelog of major documentation updates:

```markdown
## Documentation Changelog

### 2025-10-20 - Initial Version 1.0
- Created comprehensive project documentation
- Documented all completed features through Phase 1
- Established patterns and conventions
- Created extensible structure for future updates
```

### 🤝 Contributing to Documentation

If you're extending this project:

1. **Keep it current**: Update docs as you build
2. **Be thorough**: Explain not just what, but why
3. **Add examples**: Code samples help understanding
4. **Link related docs**: Reference other documentation
5. **Use clear language**: Write for other developers
6. **Include diagrams**: Visual aids when helpful

---

## Quick Reference

### 🚀 Getting Started Commands

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Run linter
pnpm lint

# Generate version file
pnpm generate-version

# Generate PWA assets
pnpm generate-pwa-assets
```

### 📂 Key Directories

| Path | Purpose |
|------|---------|
| `src/core/` | OS framework and infrastructure |
| `src/apps/` | Applications built on framework |
| `src/core/api/` | Core APIs (File System, etc.) |
| `src/core/contexts/` | React context providers |
| `src/core/components/` | OS-level UI components |

### 🔗 Important Links

- **PLAN.md**: Master development plan (1600+ lines)
- **ROADMAP.md**: Visual timeline and diagrams
- **TODO.md**: Current task list
- **File API Docs**: `src/core/api/README.md`
- **File Hooks Docs**: `src/core/api/HOOKS.md`
- **File Explorer README**: `src/apps/file-explorer/README.md`

### 🆘 Common Tasks

**Opening an app:**
```typescript
import { useApps } from "@/core/contexts/apps";
const apps = useApps();
apps.open("file-explorer");
```

**Creating a file:**
```typescript
import { useCreateFile } from "@/core/api/file.hooks";
const createFile = useCreateFile();
createFile.mutate({ path: "/", name: "test.txt", content: "Hello" });
```

**Accessing settings:**
```typescript
import { useSettingsStore } from "@/core/stores/settings.store";
const theme = useSettingsStore(state => state.theme);
```

**Managing windows:**
```typescript
import { useWindowManager } from "@/core/contexts/window-manager";
const { dispatch, windows } = useWindowManager();
dispatch({ type: "FOCUS_WINDOW", windowId: "..." });
```

---

## Contact & Support

For questions, suggestions, or contributions:
- **Repository**: [GitHub - WebOS](https://github.com/lilbunnyrabbit/webos)
- **Issues**: Use GitHub Issues for bug reports and feature requests
- **Discussions**: Use GitHub Discussions for questions and ideas

---

**Last Updated:** October 20, 2025  
**Document Version:** 1.0.0  
**Project Version:** 1.0.0  

This documentation is maintained alongside the codebase and should be kept in sync with implementation changes.

