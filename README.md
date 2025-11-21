# WebOS

A modern, browser-based operating system built with Svelte 5, featuring a microkernel architecture and capability-based security.

## Features

- 🪟 **Multi-Window Management** - Resizable, draggable windows with snap zones
- 🔐 **Capability-Based Security** - Fine-grained permission control for apps
- 📁 **File System** - Origin Private File System (OPFS) for persistent storage
- ⚙️ **Background Tasks** - Task orchestration with progress tracking
- 🔔 **Notifications** - In-OS notification center + system notifications
- ⌨️ **Keyboard Shortcuts** - Configurable shortcuts with conflict resolution
- 🎨 **Theming** - Customizable system themes
- 🔌 **IPC** - Inter-process communication between apps
- 🧩 **Plugin Architecture** - Extensible app ecosystem

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Preview
npm run preview
```

## Documentation

### 📚 API Documentation

Comprehensive documentation for the WebOS API architecture:

- **[API Index](./docs/API_INDEX.md)** - Start here! Navigation hub for all documentation
- **[API Specification](./docs/API_SPECIFICATION.md)** - Complete technical specification
- **[Quick Reference](./docs/API_QUICK_REFERENCE.md)** - One-page cheat sheet
- **[Design Decisions](./docs/API_DESIGN_DECISIONS.md)** - Architectural rationale
- **[Implementation Roadmap](./docs/IMPLEMENTATION_ROADMAP.md)** - Development plan

### 🚀 Getting Started

**For Developers:**
1. Read the [Quick Reference](./docs/API_QUICK_REFERENCE.md) to learn the API
2. Check the [API Specification](./docs/API_SPECIFICATION.md) for detailed interfaces
3. Review example apps in `src/apps/` (coming soon)

**For Contributors:**
1. Read [Design Decisions](./docs/API_DESIGN_DECISIONS.md) to understand the architecture
2. Check the [Implementation Roadmap](./docs/IMPLEMENTATION_ROADMAP.md) for current status
3. Pick a task from the roadmap and start implementing

## Architecture

WebOS uses a **microkernel architecture**:

```
┌─────────────────────────────────────┐
│           Kernel (Façade)           │
│  - Service Registry                 │
│  - Capabilities                     │
│  - Event Bus                        │
└─────────────────────────────────────┘
         │         │         │
         ▼         ▼         ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Windows  │ │  Files   │ │  Tasks   │
│ Service  │ │ Service  │ │ Service  │
└──────────┘ └──────────┘ └──────────┘
         │         │         │
         ▼         ▼         ▼
┌─────────────────────────────────────┐
│              Apps                   │
│  - Text Editor                      │
│  - File Explorer                    │
│  - Settings                         │
└─────────────────────────────────────┘
```

### Core Concepts

- **Services**: Singleton stores providing OS functionality (windows, files, tasks, etc.)
- **Capabilities**: Permission tokens that control what apps can do
- **Apps**: Svelte components with manifests declaring required capabilities
- **Kernel**: Thin registry managing services and enforcing capabilities

## Example: Creating an App

```typescript
// manifest.ts
export const manifest: AppManifest = {
  id: 'text-editor',
  name: 'Text Editor',
  icon: 'file-text',
  version: '1.0.0',
  component: TextEditor,
  capabilities: [
    'fs:read:/documents/**',
    'fs:write:/documents/**',
    'windows:open',
    'notify:toast'
  ]
};
```

```svelte
<!-- TextEditor.svelte -->
<script lang="ts">
  import { kernel } from '@/core/kernel';
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  interface Props {
    file: string;
  }
  
  let { file }: Props = $props();
  
  const files = kernel.service<FilesService>('files');
  const window = useWindow();
  
  let content = $state('');
  
  $effect(() => {
    files.read(file).then(data => content = data);
  });
  
  async function save() {
    await files.write(file, content);
  }
</script>

<div class="editor">
  <button onclick={save}>Save</button>
  <textarea bind:value={content} />
</div>
```

## Technology Stack

- **Svelte 5** - UI framework with runes for fine-grained reactivity
- **TypeScript** - Type safety and developer experience
- **Vite** - Fast build tool and dev server
- **OPFS** - Origin Private File System for storage
- **Tailwind CSS** - Utility-first styling

## Project Structure

```
webos/
├── src/
│   ├── lib/
│   │   └── core/
│   │       ├── kernel/          # Service registry & capabilities
│   │       ├── services/        # System services
│   │       ├── types/           # TypeScript definitions
│   │       └── contexts/        # Svelte contexts
│   ├── apps/                    # Built-in apps
│   ├── App.svelte               # Root component
│   └── main.ts                  # Entry point
├── docs/                        # Documentation
└── public/                      # Static assets
```

## Development Status

**Current Phase:** Planning & Design ✅  
**Next Phase:** Implementation

See [Implementation Roadmap](./docs/IMPLEMENTATION_ROADMAP.md) for detailed status and timeline.

### Completed

- ✅ Architecture design
- ✅ API specification
- ✅ Type definitions
- ✅ Basic window management (legacy)

### In Progress

- 🚧 Kernel implementation
- 🚧 Service migration

### Planned

- ⏳ File system service (OPFS)
- ⏳ Task management
- ⏳ Notification center
- ⏳ Command palette
- ⏳ Example apps

## Contributing

Contributions are welcome! Please read the [API Documentation](./docs/API_INDEX.md) to understand the architecture before contributing.

### Development Guidelines

1. Follow the [API Specification](./docs/API_SPECIFICATION.md) for consistency
2. Write tests for new services
3. Update documentation when adding features
4. Use Svelte 5 runes patterns (see [Design Decisions](./docs/API_DESIGN_DECISIONS.md#16-svelte-5-runes-integration))

## License

[Your License Here]

## Resources

- [API Documentation Index](./docs/API_INDEX.md)
- [Svelte 5 Documentation](https://svelte-5-preview.vercel.app/)
- [OPFS API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)

---

**Built with** ❤️ **using Svelte 5**
