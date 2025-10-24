```
src/
├── apps/                          # ✅ MOSTLY SAME
│   ├── apps.ts
│   ├── file-explorer/
│   │   ├── index.ts              # Config
│   │   └── FileExplorer.svelte   # 🔄 .svelte files
│   └── settings/
│       ├── index.ts
│       └── Settings.svelte
│
├── core/
│   ├── api/                      # ✅ STAYS SAME
│   │   ├── file.ts               # Pure TS, no changes
│   │   ├── file.types.ts
│   │   └── file.queries.ts       # TanStack Query helpers
│   │
│   ├── components/               # 🔄 .svelte files
│   │   ├── window/
│   │   │   ├── Window.svelte
│   │   │   ├── WindowTitle.svelte
│   │   │   └── WindowContent.svelte
│   │   ├── desktop/
│   │   │   ├── Desktop.svelte
│   │   │   └── DesktopItem.svelte
│   │   └── taskbar/
│   │       ├── Taskbar.svelte
│   │       └── TaskbarItem.svelte
│   │
│   ├── stores/                   # 🔄 Runes-based stores
│   │   ├── window-manager.svelte.ts  # ⚠️ .svelte.ts extension!
│   │   ├── desktop.svelte.ts
│   │   ├── settings.svelte.ts
│   │   └── version.svelte.ts
│   │
│   ├── lib/                      # ✅ STAYS SAME
│   │   ├── utils.ts
│   │   ├── windows.ts
│   │   ├── flags.ts
│   │   └── order.ts
│   │
│   ├── types/                    # ✅ STAYS SAME
│   │   └── index.ts
│   │
│   └── ui/                       # 🔄 .svelte files
│       ├── Button.svelte
│       ├── Dialog.svelte
│       └── ContextMenu.svelte
│
├── main.ts                       # Entry point
└── App.svelte
```