# WebOS

A fully-featured **web-based operating system** built with React, TypeScript, and modern web APIs. Experience a complete desktop computing environment directly in your browser - no backend required.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![React](https://img.shields.io/badge/react-19.2.0-blue)
![TypeScript](https://img.shields.io/badge/typescript-5.9.3-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 🌟 Features

### Core Operating System
- **🪟 Window Management** - Multi-window support with drag, resize, minimize, maximize, and snap
- **🖥️ Desktop Environment** - Customizable desktop with app icons and background images
- **📊 Taskbar System** - App launcher, active windows, start menu, and system tray
- **⚙️ Settings** - Persistent configuration with localStorage
- **🔄 Auto-Update Detection** - Automatic version checking and update notifications

### File System
- **📁 Origin Private File System (OPFS)** - Modern browser-based file storage
- **🗂️ File Explorer** - Complete file management interface
  - Create, delete, move, copy files and folders
  - Upload from/download to local file system
  - Built-in text editor
  - Media preview integration
- **🔄 Real-time Sync** - Changes reflect across all windows automatically
- **📊 Storage Monitoring** - Quota usage tracking

### Applications
- **File Explorer** - OPFS-based file manager with full CRUD operations
- **Media Preview** - View images, videos, audio, and PDFs
- **Settings** - System configuration and customization
- **Profiler** - Developer tool for performance monitoring
- **Tic-Tac-Toe** - Game demo

### Technical Highlights
- ⚡ **TanStack Query** - Automatic caching and multi-window synchronization
- 🎨 **Tailwind CSS 4** - Modern utility-first styling
- 📦 **TypeScript** - Full type safety
- 🚀 **PWA Ready** - Progressive Web App capabilities
- 📱 **Responsive** - Works on various screen sizes

---

## 📚 Documentation

This project has **comprehensive documentation** for different use cases:

### For Quick Understanding
- **[docs/PROJECT_CONTEXT.md](./docs/PROJECT_CONTEXT.md)** - TL;DR version with essential information (10 min read)
  - What is WebOS?
  - Current status
  - Architecture overview
  - Quick reference

### For Deep Dive
- **[docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md)** - Complete project documentation (60 min read)
  - Full vision and goals
  - Detailed architecture
  - All systems explained
  - Development patterns
  - How to add features
  - Technology stack details

### For Planning & Roadmap
- **[docs/planning/PLAN.md](./docs/planning/PLAN.md)** - Master development plan (1600+ lines)
  - 9 phases of development
  - Feature specifications
  - Timeline and priorities
- **[docs/planning/ROADMAP.md](./docs/planning/ROADMAP.md)** - Visual timeline with Mermaid diagrams
- **[docs/planning/TODO.md](./docs/planning/TODO.md)** - Current task checklist

### For AI Assistants / LLMs
- **[docs/guides/AI_ASSISTANT_GUIDE.md](./docs/guides/AI_ASSISTANT_GUIDE.md)** - Guide for AI/LLM assistants
  - How to use documentation
  - Workflows and patterns
  - Best practices
  - Troubleshooting

### Complete Documentation Index
- **[docs/README.md](./docs/README.md)** - Documentation hub with organized navigation
- **[docs/reference/DOCUMENTATION_INDEX.md](./docs/reference/DOCUMENTATION_INDEX.md)** - Complete navigation guide

### Specialized Documentation
- **[src/core/api/README.md](./src/core/api/README.md)** - File System API reference (650+ lines)
- **[src/core/api/HOOKS.md](./src/core/api/HOOKS.md)** - TanStack Query hooks (800+ lines)
- **[src/apps/file-explorer/README.md](./src/apps/file-explorer/README.md)** - File Explorer app guide

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Bun (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/lilbunnyrabbit/webos.git
cd webos

# Install dependencies
bun install

# Start development server
bun dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
# Build the app
bun build

# Preview production build
bun preview
```

---

## 🏗️ Project Structure

```
src/
├── core/                    # OS Framework
│   ├── api/                 # Core APIs (File System)
│   ├── components/          # OS components (Desktop, Taskbar, Window)
│   ├── contexts/            # React contexts (WindowManager, Apps)
│   ├── stores/              # Zustand stores (settings, desktop)
│   ├── lib/                 # Utilities
│   └── ui/                  # UI primitives
│
└── apps/                    # Applications
    ├── file-explorer/       # File management app
    ├── media-preview/       # Media viewer
    ├── settings/            # Settings app
    └── [other-apps]/
```

**Architecture:** The codebase follows a **two-layer architecture**:
- **Core Layer** (`src/core/`) - OS framework and infrastructure
- **App Layer** (`src/apps/`) - Applications built on the framework

Read more in [DOCUMENTATION.md](./DOCUMENTATION.md#technical-architecture)

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | React 19, TypeScript 5.9 |
| **Build Tool** | Vite 7 |
| **Styling** | Tailwind CSS 4 |
| **State Management** | Zustand, TanStack Query |
| **Storage** | OPFS, localStorage |
| **UI Components** | Radix UI, Shadcn/ui |
| **Icons** | Lucide React |

### Key Browser APIs
- Origin Private File System (OPFS)
- Storage API
- File System Access API
- Service Worker API (planned)

---

## 🎯 Current Status (October 2025)

### ✅ Phase 1: Foundation - **COMPLETE**
- Core window management system ✅
- Desktop environment with icons ✅
- Taskbar with start menu ✅
- OPFS file system implementation ✅
- File Explorer app ✅
- TanStack Query integration ✅
- Settings persistence ✅
- Versioning system ✅

### 🔄 Phase 2: App Ecosystem - **IN PROGRESS**
- Task Manager integration (next priority)
- Import existing projects
- Color utility suite
- React Router integration

See [docs/planning/ROADMAP.md](./docs/planning/ROADMAP.md) for detailed timeline.

---

## 🎨 Key Features Demo

### Window Management
- Drag windows to move
- Resize from edges and corners
- Minimize to taskbar
- Maximize to fullscreen
- Snap to screen edges (left/right/corners)
- Multiple windows of same app

### File System
```typescript
import { useDirectoryQuery, useCreateFile } from "@/core/api/file.hooks";

function MyApp() {
  // List directory with automatic caching
  const { data: files } = useDirectoryQuery("/documents");
  
  // Create file with auto-sync across windows
  const createFile = useCreateFile();
  
  createFile.mutate({
    path: "/documents",
    name: "hello.txt",
    content: "Hello, World!"
  });
}
```

### App Registration
```typescript
// Register a new app
export default {
  "my-app": {
    name: "My App",
    icon: MyIcon,
    tags: ["utility"] as const,
    defaultWindow: {
      size: { width: 600, height: 400 }
    },
    App: (props) => <MyAppComponent {...props} />
  }
} satisfies AppsConfig;
```

---

## 🗺️ Roadmap

### MVP (3 months) - Phases 1-3
- ✅ Core OS (window management, desktop, file system)
- ⏳ App ecosystem (task manager, utilities)
- ⏳ Game hub (games platform + puzzles)

### Feature Complete (6 months) - Phases 4-6
- Productivity apps (notes, speed reader)
- Media apps (series tracker, video tools)
- Advanced features (WebAssembly, P2P)

### Production Ready (9 months) - Phases 7-9
- URL sharing system (deep linking)
- Service Worker + PWA
- Full customization
- Performance optimization
- Complete documentation

See [docs/planning/PLAN.md](./docs/planning/PLAN.md) for detailed feature specifications.

---

## 🤝 Contributing

Contributions are welcome! Before contributing:

1. Read [docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md) to understand the architecture
2. Check [docs/planning/TODO.md](./docs/planning/TODO.md) for current priorities
3. Follow established patterns (see [Development Patterns](./docs/DOCUMENTATION.md#development-patterns--conventions))
4. Ensure TypeScript strict mode compliance
5. Update documentation for significant changes

### Development Commands

```bash
bun dev          # Start dev server
bun build        # Build for production
bun lint         # Run linter
bun generate-version  # Generate version file
```

---

## 📖 Learning Resources

### Getting Started (Recommended Order)
1. [docs/PROJECT_CONTEXT.md](./docs/PROJECT_CONTEXT.md) - Quick overview (10 min)
2. [docs/DOCUMENTATION.md - Architecture](./docs/DOCUMENTATION.md#technical-architecture) - Understanding the structure (15 min)
3. [src/core/api/README.md](./src/core/api/README.md) - File System API (20 min)
4. Explore existing apps in `src/apps/` - Real examples (15 min)

### For AI Assistants / LLMs
- [docs/guides/AI_ASSISTANT_GUIDE.md](./docs/guides/AI_ASSISTANT_GUIDE.md) - Complete guide for working with this project

---

## 🌐 Browser Compatibility

### Supported Browsers
- ✅ Chrome/Edge 86+
- ✅ Firefox 111+
- ✅ Safari 15.2+

### Requirements
- 🔒 HTTPS (or localhost for development)
- 🔒 Secure context for OPFS API

---

## 📝 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

Built with:
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TanStack Query](https://tanstack.com/query/)
- [Radix UI](https://www.radix-ui.com/)
- [Lucide Icons](https://lucide.dev/)

---

## 📬 Contact

- **Repository:** [GitHub - WebOS](https://github.com/lilbunnyrabbit/webos)
- **Issues:** [GitHub Issues](https://github.com/lilbunnyrabbit/webos/issues)
- **Discussions:** [GitHub Discussions](https://github.com/lilbunnyrabbit/webos/discussions)

---

## 🎯 Project Goals

**Short-term:**
- Complete MVP (window management, file system, basic apps)
- Showcase modern web capabilities
- Demonstrate React/TypeScript expertise

**Long-term:**
- Full app ecosystem (20+ apps)
- Advanced features (WebAssembly, PWA, P2P)
- Portfolio-ready demonstration platform
- Potential framework extraction (`@webos/core`)

**Philosophy:**
- Progressive enhancement
- Performance first (<100ms interactions)
- Developer experience (type-safe, well-documented)
- No backend required (client-side only)

---

**Start exploring:** Read [docs/PROJECT_CONTEXT.md](./docs/PROJECT_CONTEXT.md) for a quick introduction or dive into [docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md) for the complete guide.

**For AI/LLM Assistants:** See [docs/guides/AI_ASSISTANT_GUIDE.md](./docs/guides/AI_ASSISTANT_GUIDE.md) for detailed instructions on working with this codebase.

**Complete Documentation:** Browse all documentation at [docs/README.md](./docs/README.md)
