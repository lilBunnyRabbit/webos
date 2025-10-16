# WebOS Development Plan

> 📊 **Visual Roadmap:** See [ROADMAP.md](./ROADMAP.md) for Mermaid diagrams and timeline visualization

## Project Overview
A fully-featured web-based operating system built with React, TypeScript, and Vite. The OS provides a window management system, desktop environment, and a platform for hosting various utility apps and games.

## Current State Analysis
- ✅ Core window management system
- ✅ Taskbar and desktop
- ✅ App registration system
- ✅ Settings persistence (Zustand with localStorage)
- ✅ Basic apps: Files, Media Preview, Settings, Test, Tic-Tac-Toe
- 🚧 File system (static files only)
- 🚧 Desktop app management
- ⏳ No comprehensive file system
- ⏳ Limited app ecosystem

---

## Phase 1: Core System Polish & Foundation (Weeks 1-3)

### 1.0 Versioning System Polish
**Priority: HIGH**

- [ ] **Update Notification UI Improvements**
  - Review and improve notification styling/positioning
  - Ensure notification doesn't interfere with desktop/windows
  - Add animation polish (slide-in, fade effects)
  - Test notification timing and auto-dismiss behavior
  - Verify z-index layering with other UI elements
  - Consider toast notification style vs persistent banner

- [ ] **Settings About Section Enhancements**
  - Improve layout and visual hierarchy
  - Add more build information (environment, build type)
  - Better formatting of version details
  - Add copy-to-clipboard for version info
  - Consider adding changelog display
  - Improve update check status indicators

- [ ] **Version Service Refinements**
  - Adjust auto-check interval (currently 5 min, may need tuning)
  - ✅ Check for updates when window/tab comes back into focus
  - ✅ Disable version checking in development mode
  - ✅ Proper service worker cleanup and cache clearing for updates
  - ✅ Loading states during update process
  - ✅ Shared update utility (hardRefresh) used across version service and error recovery
  - Handle network errors gracefully
  - Consider adding retry logic with exponential backoff
  - Add option to disable auto-check in settings
  - Consider user preference for update notifications

- [ ] **Testing & Polish**
  - Test version update flow end-to-end
  - Verify behavior on GitHub Pages deployment
  - Test with service worker caching scenarios
  - Ensure version.json is not cached aggressively
  - Add error handling for missing/invalid version.json
  - Test "Refresh Now" behavior across browsers

- [ ] **Documentation Updates**
  - Add version system to main README
  - Include screenshots of version UI
  - Document deployment process with versioning
  - Add troubleshooting guide

### 1.1 Design System Finalization
**Priority: CRITICAL**

- [ ] **Icon System Standardization**
  - Create/adopt a consistent icon library
  - Design custom icons for system apps (Files, Settings, etc.)
  - Establish icon guidelines (size, style, colors)
  - Add app icon support to app config type
  - Update all existing apps with proper icons

- [ ] **Taskbar Enhancement**
  - Improve taskbar visual design
  - Add system tray area for background apps/notifications
  - Add clock/date display
  - Add quick launch area
  - Improve active window indicator
  - Add context menus for taskbar items

- [ ] **Window System Polish**
  - Finalize window chrome design (title bar, borders)
  - Add window animations (open, close, minimize, maximize)
  - Improve resize handles visibility
  - Add window snapping visual feedback
  - Implement minimize animation to taskbar
  - Add window focus/blur states

- [ ] **Desktop Enhancements**
  - Complete "adding apps to desktop" feature (from TODO)
    - Add apps to desktop via drag-and-drop from start menu
    - Context menu option to add/remove from desktop
    - Persist desktop apps in settings
  - Implement desktop grid system for icon placement
  - Add desktop context menu (right-click)
  - **Add desktop icon multi-selection system** ⭐
    - Marquee selection: Drag rectangle on empty space to select multiple items
    - Ctrl/Cmd+Click to toggle individual items in selection
    - Shift+Click for range selection
    - Visual feedback: Highlight selected items with accent color/outline
    - Selection rectangle visualization (blue semi-transparent box)
    - Click on background clears selection
    - Move multiple selected items together (group drag)
    - Delete multiple selected items at once (Delete key)
    - Ctrl+A to select all desktop items
    - Escape to clear selection
    - Smart drag behavior: clicking selected item preserves multi-selection
  - Add icon auto-arrange functionality
  - Support custom desktop wallpapers
    - Upload image from user's computer
    - Select from preset wallpapers
    - Solid colors, gradients
    - Fit/fill/stretch/tile options
    - Blur/opacity controls
    - Save to settings/IndexedDB

- [ ] **App Configuration & Behavior**
  - Extend app registration system with additional configuration options
  - Single-instance app configuration
    - Flag apps that should only have one instance open at a time
    - When attempting to open an already-open single-instance app:
      - Focus the existing window instead of opening a new one
      - Restore the window if minimized
      - Bring to front (z-index)
    - Examples of single-instance apps:
      - Settings (only one settings window needed)
      - Task Manager (only one instance makes sense)
      - System apps that manage global state
  - Multi-instance app support (default behavior)
    - Most apps can have multiple windows open
    - Examples: Files, Notes, Games, etc.
  - App instance management utilities
    - Helper functions to check if app is already open
    - Focus existing window by app ID
    - Get all windows for a specific app
  - Update app registration type definition
    ```typescript
    interface AppConfig {
      id: string;
      name: string;
      icon: React.ComponentType;
      component: React.ComponentType;
      singleInstance?: boolean; // New flag
      // ... other properties
    }
    ```

### 1.2 File System Implementation
**Priority: CRITICAL**

- [ ] **IndexedDB File System Layer**
  - Design virtual file system schema
  - Implement IndexedDB wrapper/abstraction
  - Create file/folder CRUD operations
  - Implement hierarchical directory structure
  - Add file metadata (created, modified, size, type)
  - Add file permissions system (optional)
  - Integrate with @lilbunnyrabbit/task-manager for large operations

- [ ] **File System API**
  - Create hooks for file operations (`useFileSystem`)
  - Implement file/folder creation, deletion, rename, move
  - Add file content read/write operations
  - Implement file search functionality
  - Add file type detection and MIME type handling
  - Create file path resolver

- [ ] **In-App Navigation (React Router)**
  - Install `react-router-dom`
  - Use `MemoryRouter` for isolated per-window routing
  - Apps with multi-page navigation (Files browser, Settings tabs)
  - Each window maintains independent navigation history
  - Doesn't interfere with OS-level URL routing
  - Back/forward buttons within apps
  - Examples:
    - Files app: Navigate folders with URL-like paths
    - Settings app: Different tabs as routes
    - Series tracker: Show list → detail views

- [ ] **Files App Upgrade**
  - Replace static file list with IndexedDB-backed system
  - Add breadcrumb navigation
  - Add back/forward navigation
  - Implement file upload from user's computer
  - Add drag-and-drop file operations
  - Add file/folder creation dialogs
  - Add context menu (copy, paste, delete, rename)
  - Add file properties dialog
  - Add file sorting and filtering

- [ ] **File System Utilities**
  - Implement file/folder picker dialog component
  - Add file save dialog component
  - Create file association system (file type → app mapping)
  - Add default file handlers for common types

---

## Phase 2: App Ecosystem Development (Weeks 4-8)

### 2.1 Import Existing Projects

- [ ] **static-utils Integration**
  - Audit static-utils for importable tools
  - Create individual apps for each utility:
    - Image combiner/merger app
    - PDF generator app
    - Video trimmer/cropper app
    - Video merger app
    - File download utility (wget-like with progress)
  - Adapt UIs for windowed environment
  - Ensure file system integration

- [ ] **RNG Tools**
  - Import RNG utilities as apps
  - Create dedicated RNG app with multiple generators
  - Add random number, dice roller, coin flip
  - Add list randomizer/shuffler
  - Add random name/password generator

- [ ] **Other Past Projects**
  - Identify other importable projects
  - Prioritize based on utility and complexity
  - Port and integrate into WebOS

### 2.2 Task Manager Integration
**Priority: HIGH** (promotional opportunity + core infrastructure)

- [ ] **@lilbunnyrabbit/task-manager Core Integration**
  - Install and integrate the package as core WebOS infrastructure
  - Create global TaskManager instance for OS-level operations
  - Design task orchestration system for long-running operations
  - Implement background task queue
  - Add task lifecycle management (start, pause, cancel, retry)

- [ ] **Background Operations System**
  - File uploads with progress tracking
  - File downloads with progress tracking
  - Video/image processing tasks (compression, conversion)
  - File system operations (copy, move, batch operations)
  - Search indexing
  - Any async operation that takes >2 seconds

- [ ] **Task Manager App (Visual Interface)**
  - Create dedicated Task Manager app
  - Design beautiful UI showing active/completed/failed tasks
  - Real-time progress bars for each task
  - Task details view (elapsed time, estimated completion)
  - Add keyboard shortcut (Ctrl+Shift+Esc)
  - Cancel/retry/remove task actions
  - Task history and statistics
  - Filter by status (running, completed, failed, cancelled)
  - Export task logs

- [ ] **System Integration**
  - Show task count badge in taskbar (when tasks running)
  - Toast notifications on task completion/failure
  - Integrate with notification system
  - Add task progress to relevant apps (e.g., show upload progress in Files app)

- [ ] **Package Promotion**
  - Link to package documentation
  - Add "About Task Manager" with package info
  - Show real-world usage examples in the app
  - Blog post/documentation on integration
  - Showcase as a reference implementation

**Example Use Cases:**
```typescript
// File upload with progress
const uploadTask = taskManager.create({
  name: 'Upload video.mp4',
  execute: async (progress) => {
    // Upload logic with progress callbacks
    for (let i = 0; i <= 100; i += 10) {
      progress.update({ percent: i });
      await uploadChunk(i);
    }
  }
});

// Video compression pipeline
const compressionGroup = taskManager.createGroup({
  name: 'Compress videos',
  tasks: videos.map(video => ({
    name: `Compress ${video.name}`,
    execute: async (progress) => compressVideo(video, progress)
  }))
});

// With error recovery
const downloadTask = taskManager.create({
  name: 'Download large file',
  execute: downloadFile,
  retry: { maxAttempts: 3, backoff: 'exponential' }
});
```

### 2.3 Color Utility Suite
**Chromatics Revival**

- [ ] **Color Tools App**
  - Color picker with various input formats (HEX, RGB, HSL, HSV)
  - Color palette generator
  - Color harmony calculator (complementary, analogous, triadic)
  - Gradient generator
  - Contrast checker (WCAG compliance)
  - Color blindness simulator
  - Color converter between formats
  - Save/export color palettes to file system
  - Could become npm package later

---

## Phase 3: Game Hub & Entertainment (Weeks 9-12)

### 3.1 Game Hub Application

- [ ] **Game Hub Core**
  - Create main Game Hub app
  - Design game library UI
  - Implement game discovery/browsing
  - Add game categories/tags
  - Add search and filtering
  - Show game thumbnails and descriptions
  - Add "Recently Played" section
  - Track play time per game

- [ ] **Game Launch System**
  - Integrate games as launchable apps
  - Add "Launch Game" functionality from hub
  - Create game-specific configuration
  - Add save game management (localStorage/IndexedDB)

### 3.2 Puzzle Games Implementation

- [ ] **Nonogram (Priority Puzzle)**
  - Classic black & white nonograms
  - Add color support for advanced puzzles
  - User-created nonogram editor
  - Puzzle validation system
  - Hint system
  - Save progress
  - Include starter puzzle pack

- [ ] **Other Logic Puzzles**
  - Kakuro (number grid puzzle)
  - Številska krizanka (number crossword)
  - Maze generator and solver
  - Osmosmerka (word search)
  - Nurikabe (island puzzle)
  - Futoshiki (inequality puzzle)
  - Each with:
    - Multiple difficulty levels
    - Puzzle generator
    - Save/load progress
    - Timer and statistics

### 3.3 Enhanced Tic-Tac-Toe
- [ ] Improve existing tic-tac-toe app
- [ ] Add AI difficulty levels
- [ ] Add 2-player mode
- [ ] Add game statistics

---

## Phase 4: Productivity Apps (Weeks 13-16)

### 4.1 Quick Notes (quno)

- [ ] **Core Note-Taking App**
  - Unorganized, chronological notes
  - Auto-timestamp on creation
  - Markdown support (consider)
  - Quick add via command/shortcut
  - Default checkbox support for tasks
  - Search notes
  - Tag system (optional)
  - Export notes

- [ ] **Command Line Interface (Optional)**
  - Create terminal emulator app (future)
  - Implement `quno` command
  - `quno` - list notes
  - `quno <text>` - create note

### 4.2 Speed Reader

- [ ] **Rewrite in React**
  - Port existing speed-reader app
  - Implement RSVP (Rapid Serial Visual Presentation)
  - Adjustable WPM (words per minute)
  - Text input (paste, upload, file system)
  - Reading progress tracking
  - Bookmarks within text
  - Use MemoryRouter for book navigation

- [ ] **Library Management**
  - IndexedDB-based local library
  - Import from file system
  - Consider Google Drive integration (like work hours)
  - Reading history and stats
  - Markdown support for documents

### 4.3 Work Hours Tracker

- [ ] **Time Tracking App**
  - Time in/time out tracking
  - Description and link fields
  - Timestamps for entries
  - Daily notes section
  - Monthly view
  - Monthly report generation
  - PDF export

- [ ] **Backend (Optional Phase 2)**
  - Consider Google Sheets integration (simple)
  - Or full backend (Remix/AWS SAM) with auth
  - Sync across devices

---

## Phase 5: Media & Entertainment (Weeks 17-20)

### 5.1 Series Tracker

- [ ] **Core Tracking App**
  - Search TV shows via API
  - Track watched episodes
  - Mark series as watching/completed/dropped
  - Episode countdown to next air date
  - Show details (cast, synopsis, ratings)
  - Personal ratings and notes
  - Use MemoryRouter for show list → detail navigation

- [ ] **API Integration**
  - Primary: [TMDB API](https://developer.themoviedb.org/)
  - Fallback: TVMaze, OMDB, Trakt, etc.
  - Fetch show metadata, artwork, episodes
  - Cache data in IndexedDB

- [ ] **Advanced Features (Optional)**
  - Backend with AWS SAM + DynamoDB
  - Discord auth integration
  - Discord bot for notifications
  - Share watchlists with friends
  - Sync across devices

### 5.2 Gifski Wrapper

- [ ] **GIF Converter App**
  - WebAssembly integration of gifski
  - Convert video to high-quality GIF
  - Adjustable quality settings
  - Frame rate control
  - Resize options
  - Preview before conversion
  - Save to file system
  - Use @lilbunnyrabbit/task-manager for conversion progress

### 5.3 Media Tools

- [ ] **Image Editor (Basic)**
  - Crop, resize, rotate images
  - Basic filters
  - Format conversion
  - Compression

- [ ] **Video Tools**
  - Video trimmer
  - Video merger
  - Simple video editor (cut, splice)
  - Extract audio from video

---

## Phase 6: Advanced Features (Weeks 21-24)

### 6.1 Compression Tools Suite

- [ ] **Compression App**
  - Implement DEFLATE algorithm
  - LZ77 compression
  - Huffman encoding
  - Compress/decompress files
  - Show compression ratio
  - Use @lilbunnyrabbit/task-manager for large file operations

- [ ] **WebAssembly Implementation** ⚡
  - Rewrite compression algorithms in Rust
  - Compile to WebAssembly with wasm-bindgen
  - 10-100x performance improvement for large files
  - Fallback to JS implementation if WASM not supported
  - Benchmark comparison tool
  - Learning opportunity for Rust + WASM

**Other WebAssembly Candidates:**
- Image processing (resize, filters, format conversion)
- Video encoding helpers
- Cryptography (file encryption/decryption)
- Game physics engines
- Audio processing (pitch shift, effects)
- PDF parsing/generation
- OCR (optical character recognition)

### 6.2 File Transfer (P2P)

- [ ] **File Sharing App**
  - WebRTC peer-to-peer file transfer
  - Generate shareable codes
  - QR code support
  - Progress tracking via @lilbunnyrabbit/task-manager
  - Resume interrupted transfers (if possible)
  - Multiple simultaneous transfers

- [ ] **Signaling Server**
  - Simple WebSocket server for peer discovery
  - Deploy on free tier (Railway, Render, etc.)
  - Keep server logic minimal

### 6.3 Terminal Emulator

- [ ] **Virtual Terminal**
  - Create terminal emulator app
  - Implement basic shell commands
  - File system integration
  - Command history
  - Support for custom commands (quno, etc.)
  - ANSI color support

---

## Phase 7: System Enhancements (Weeks 25-28)

### 7.1 URL Share System (Deep Linking)
**Priority: HIGH** (killer feature for web OS)

- [ ] **Core URL Router**
  - Implement URL-based routing system
  - Support hash-based routing (#/) or query params
  - Parse and serialize app states to URL
  - Handle URL changes (browser back/forward)
  - URL validation and sanitization

- [ ] **App Deep Linking**
  - Open specific apps via URL
  - Examples:
    - `#/app/files` - Open Files app
    - `#/app/settings?tab=theme` - Open Settings to theme tab
    - `#/app/tic-tac-toe?mode=ai&difficulty=hard` - Start game with config
    - `#/app/color-tools?color=%23FF5733` - Open color tool with specific color
  - Support multiple apps open simultaneously
  - App state restoration from URL

- [ ] **File System Links**
  - Share links to specific files/folders
  - Examples:
    - `#/file/documents/resume.pdf` - Open specific file
    - `#/folder/projects/webos` - Navigate to folder
    - `#/files?path=/images&view=grid` - Folder with view mode
  - Generate shareable file links
  - Handle file not found gracefully

- [ ] **Workspace State Sharing**
  - Serialize entire desktop state
  - Save window positions, sizes, states
  - Open multiple apps with specific configs
  - Example: `#/workspace/demo` loads a preset demo configuration
  - Export/import workspace layouts

- [ ] **Demo Mode Links**
  - Create curated demo experiences
  - Examples:
    - `#/demo/task-manager` - Showcase task manager with sample tasks
    - `#/demo/games` - Open game hub with featured games
    - `#/demo/productivity` - Open notes + files + task manager
  - Auto-run demos with fake data
  - Perfect for portfolio/showcase

- [ ] **Share Dialog Component**
  - "Share" button in apps/windows
  - Generate shareable URL
  - Copy to clipboard
  - QR code generation for mobile sharing
  - Social media sharing (Twitter, LinkedIn with preview)
  - Embed code generation for blogs

- [ ] **Embed/iFrame Support**
  - Allow apps to run in embedded mode
  - Remove OS chrome (taskbar, desktop) for embeds
  - `?embed=true` parameter
  - Communicate with parent window via postMessage
  - Responsive sizing for embeds
  - Example: Embed tic-tac-toe game in blog post

- [ ] **URL Shortener Integration (Optional)**
  - Shorten long URLs for easier sharing
  - Custom short URLs for common demos
  - Analytics on shared links (optional)

- [ ] **Tutorial/Onboarding Links**
  - Guided tours via URL
  - Step-by-step feature introductions
  - Interactive tutorials
  - Examples:
    - `#/tour/getting-started` - First-time user tour
    - `#/tour/task-manager` - Task manager feature tour

**Technical Implementation:**
- Use `window.location.hash` for routing (SPA-friendly)
- State serialization with `JSON.stringify()` + `btoa()` for complex states
- Query params with `URLSearchParams` for simple key-value pairs
- Listen to `hashchange` event for browser back/forward
- Validate/sanitize params to prevent XSS
- Consider `history.pushState()` for cleaner URLs (optional)

**Example Use Cases:**
```
Portfolio/Resume:
  yourwebos.com/#/demo/all-features
  → Opens curated workspace showing all capabilities

Blog Post:
  "Check out this color palette: yourwebos.com/#/app/color-tools?palette=ocean"
  → Opens color tool with specific palette loaded

Support/Documentation:
  "Go to Settings > Theme: yourwebos.com/#/app/settings?tab=theme"
  → Direct link to relevant setting

Sharing Work:
  "Here's the video I edited: yourwebos.com/#/file/videos/final-cut.mp4"
  → Opens file in media preview

Tutorial:
  "Learn about task manager: yourwebos.com/#/tour/task-manager?auto=true"
  → Starts interactive tutorial

Complex State (Workspace):
  yourwebos.com/#/workspace?state=eyJ3aW5kb3dzIjpbey...
  → Encoded JSON with multiple windows, positions, etc.
```

### 7.2 App Store / App Manager

- [ ] **App Marketplace**
  - Browsable app catalog
  - App descriptions, screenshots
  - Install/uninstall apps
  - App update system
  - Featured apps section

- [ ] **App Sandboxing (Optional)**
  - Isolated app contexts
  - Permission system
  - Resource limits

### 7.3 Notifications System

- [ ] **Notification Center**
  - Toast notifications
  - Notification history
  - Action buttons in notifications
  - Desktop notifications API integration
  - Per-app notification settings

### 7.3.5 Profiler App (Developer Tool)
**Priority: MEDIUM** (useful for development & showcasing)

- [ ] **Core Profiler App**
  - Toggle-able system profiler (dev tool)
  - When profiler is active, wraps all windows with profiling component
  - Show real-time performance metrics per window/app
  - Non-intrusive overlay or sidebar display
  - Keyboard shortcut to toggle (Ctrl+Shift+P or F12)

- [ ] **Performance Metrics**
  - Component render count (per window)
  - Render time / FPS for each window
  - Memory usage estimation (if available)
  - Re-render frequency
  - Props/state change tracking
  - Identify performance bottlenecks

- [ ] **Window Information**
  - Window ID and app name
  - Current state (position, size, z-index)
  - Props passed to window
  - Number of child components
  - Event listeners count
  - Last update timestamp

- [ ] **System Overview**
  - Total windows open
  - Total apps running
  - Global state size
  - Event listener count
  - IndexedDB usage
  - LocalStorage usage
  - Cache statistics

- [ ] **React DevTools Integration**
  - Show component tree for selected window
  - Props inspector
  - State inspector
  - Hooks inspector (if using)
  - Performance flamegraph

- [ ] **Profiler Controls**
  - Start/Stop profiling
  - Clear recorded data
  - Export profile data (JSON)
  - Filter by window/app
  - Toggle between simple/detailed view
  - Highlight slow renders (>16ms)
  - Record timeline of renders

- [ ] **Visual Features**
  - Color-coded performance indicators (green/yellow/red)
  - Mini stats overlay on window title bars (when enabled)
  - Detailed panel (dockable sidebar or separate window)
  - Performance warnings/alerts
  - Render highlighting (flash on render)
  - FPS counter overlay

- [ ] **Use Cases**
  - Debug performance issues during development
  - Identify unnecessary re-renders
  - Monitor app behavior in production
  - Demonstrate architecture to employers/collaborators
  - Educational tool for React optimization
  - Portfolio showcase ("I built profiling into my OS!")

**Technical Implementation:**
```typescript
// Profiler wrapper component
function ProfilerWrapper({ children, windowId, appName }: Props) {
  const [renderCount, setRenderCount] = useState(0);
  const [renderTime, setRenderTime] = useState(0);
  const { profilerEnabled } = useProfiler();
  
  const onRender = useCallback((
    id: string,
    phase: "mount" | "update",
    actualDuration: number,
  ) => {
    setRenderCount(prev => prev + 1);
    setRenderTime(actualDuration);
    
    // Log to profiler store
    profilerStore.recordRender({
      windowId,
      appName,
      phase,
      duration: actualDuration,
      timestamp: Date.now(),
    });
  }, [windowId, appName]);
  
  if (!profilerEnabled) {
    return children;
  }
  
  return (
    <React.Profiler id={windowId} onRender={onRender}>
      <ProfilerOverlay
        renderCount={renderCount}
        renderTime={renderTime}
        windowId={windowId}
      >
        {children}
      </ProfilerOverlay>
    </React.Profiler>
  );
}

// In window component
function Window({ appId, windowId }: Props) {
  const app = useApp(appId);
  const { profilerEnabled } = useProfiler();
  
  return (
    <ProfilerWrapper 
      windowId={windowId} 
      appName={app.name}
    >
      <WindowContent>
        <app.component />
      </WindowContent>
    </ProfilerWrapper>
  );
}
```

**Profiler App UI:**
- Main profiler window shows list of all open windows
- Click window to see detailed metrics
- Timeline view of render events
- Performance graph (FPS over time)
- Memory usage chart
- Export report button
- Settings (what to track, overlay style, etc.)

### 7.4 Context Menus & Shortcuts

- [ ] **Global Context Menus**
  - Desktop right-click menu
  - Taskbar context menus
  - Window title bar context menu

- [ ] **Keyboard Shortcuts Implementation**
  - Document all shortcuts
  - Customizable shortcuts (settings)
  - Shortcut cheat sheet app/dialog
  - Show shortcuts in tooltips/menus
  - Shortcut conflict detection
  - Export/import custom shortcuts
  - See detailed shortcuts list below ⬇️

---

## Keyboard Shortcuts Reference

> **Implementation Note**: Support both Windows and Mac modifiers
> - Windows: `Ctrl`, `Alt`, `Win`, `Shift`
> - Mac: `⌘ Cmd`, `⌥ Option`, `⌃ Control`, `⇧ Shift`
> - Auto-detect OS and show appropriate shortcuts

### 1. Window Management

| Shortcut (Win) | Shortcut (Mac) | Action | Priority |
|----------------|----------------|--------|----------|
| `Alt + F4` | `⌘ + Q` | Close active window | HIGH |
| `Alt + Tab` | `⌘ + Tab` | Switch between windows | HIGH |
| `Alt + Shift + Tab` | `⌘ + Shift + Tab` | Switch windows (reverse) | MEDIUM |
| `Win + ↑` | `⌃ + ⌘ + F` | Maximize window | HIGH |
| `Win + ↓` | `⌘ + M` | Minimize window | HIGH |
| `Win + ←` | `⌃ + ⌘ + ←` | Snap window to left | MEDIUM |
| `Win + →` | `⌃ + ⌘ + →` | Snap window to right | MEDIUM |
| `Alt + Space` | `⌘ + Space` | Show window menu | LOW |
| `F11` | `⌘ + ⌃ + F` | Toggle fullscreen | MEDIUM |
| `Ctrl + W` | `⌘ + W` | Close current window/tab | HIGH |
| `Ctrl + Shift + T` | `⌘ + Shift + T` | Reopen last closed window | MEDIUM |
| `Alt + F5` | - | Restore window | LOW |
| `Win + D` | `⌘ + F3` | Show Desktop (minimize all) | HIGH |
| `Win + M` | `⌘ + Option + M` | Minimize all windows | MEDIUM |

### 2. System & Apps

| Shortcut (Win) | Shortcut (Mac) | Action | Priority |
|----------------|----------------|--------|----------|
| `Ctrl + Shift + Esc` | `⌘ + Option + Esc` | Open Task Manager | HIGH |
| `Win + E` | `⌘ + Space` (then "Files") | Open Files app | HIGH |
| `Win + R` | `⌘ + Space` | Open Run dialog / Spotlight | MEDIUM |
| `Win + S` | `⌘ + Space` | Open Search | MEDIUM |
| `Win + I` | `⌘ + ,` | Open Settings | HIGH |
| `Win + L` | `⌃ + ⌘ + Q` | Lock screen | LOW |
| `Win + X` | - | Quick access menu | LOW |
| `F1` | `⌘ + /` | Help / Show shortcuts | MEDIUM |
| `Win + Tab` | - | Task view / App switcher | MEDIUM |
| `Ctrl + Shift + N` | `⌘ + Shift + N` | New window/app instance | MEDIUM |
| `Alt + Enter` | `⌘ + I` | Open properties | LOW |

### 3. File Operations (in Files app)

| Shortcut (Win) | Shortcut (Mac) | Action | Priority |
|----------------|----------------|--------|----------|
| `Ctrl + N` | `⌘ + N` | New file/folder dialog | HIGH |
| `Ctrl + Shift + N` | `⌘ + Shift + N` | New folder | HIGH |
| `Ctrl + O` | `⌘ + O` | Open file | HIGH |
| `Ctrl + S` | `⌘ + S` | Save file | HIGH |
| `Ctrl + Shift + S` | `⌘ + Shift + S` | Save as | MEDIUM |
| `Ctrl + C` | `⌘ + C` | Copy | HIGH |
| `Ctrl + X` | `⌘ + X` | Cut | HIGH |
| `Ctrl + V` | `⌘ + V` | Paste | HIGH |
| `Ctrl + Z` | `⌘ + Z` | Undo | HIGH |
| `Ctrl + Y` / `Ctrl + Shift + Z` | `⌘ + Shift + Z` | Redo | HIGH |
| `Delete` | `⌫ Delete` | Delete selected file(s) | HIGH |
| `Shift + Delete` | `⌘ + ⌫ Delete` | Permanently delete | MEDIUM |
| `Ctrl + D` | `⌘ + D` | Duplicate file | MEDIUM |
| `F2` | `Enter` | Rename file | HIGH |
| `Ctrl + A` | `⌘ + A` | Select all | HIGH |
| `Ctrl + Shift + A` | `⌘ + Shift + A` | Deselect all | LOW |
| `Ctrl + I` | `⌘ + I` | Invert selection | LOW |
| `Alt + ↑` | `⌘ + ↑` | Go to parent folder | MEDIUM |
| `Alt + ←` | `⌘ + [` | Back | HIGH |
| `Alt + →` | `⌘ + ]` | Forward | HIGH |
| `F5` / `Ctrl + R` | `⌘ + R` | Refresh | MEDIUM |
| `Ctrl + F` | `⌘ + F` | Search in folder | HIGH |
| `Ctrl + Shift + C` | `⌘ + Option + C` | Copy path | LOW |

### 4. Text Editing (in text editors/inputs)

| Shortcut (Win) | Shortcut (Mac) | Action | Priority |
|----------------|----------------|--------|----------|
| `Ctrl + A` | `⌘ + A` | Select all text | HIGH |
| `Ctrl + C` | `⌘ + C` | Copy text | HIGH |
| `Ctrl + X` | `⌘ + X` | Cut text | HIGH |
| `Ctrl + V` | `⌘ + V` | Paste text | HIGH |
| `Ctrl + Z` | `⌘ + Z` | Undo | HIGH |
| `Ctrl + Y` | `⌘ + Shift + Z` | Redo | HIGH |
| `Ctrl + B` | `⌘ + B` | Bold (if rich text) | MEDIUM |
| `Ctrl + I` | `⌘ + I` | Italic (if rich text) | MEDIUM |
| `Ctrl + U` | `⌘ + U` | Underline (if rich text) | MEDIUM |
| `Ctrl + F` | `⌘ + F` | Find in document | HIGH |
| `Ctrl + H` | `⌘ + Option + F` | Find and replace | MEDIUM |
| `Ctrl + G` / `F3` | `⌘ + G` | Find next | MEDIUM |
| `Ctrl + Shift + G` / `Shift + F3` | `⌘ + Shift + G` | Find previous | MEDIUM |
| `Ctrl + Home` | `⌘ + ↑` | Go to start | MEDIUM |
| `Ctrl + End` | `⌘ + ↓` | Go to end | MEDIUM |
| `Ctrl + ←` | `⌥ + ←` | Jump word left | HIGH |
| `Ctrl + →` | `⌥ + →` | Jump word right | HIGH |
| `Ctrl + Backspace` | `⌥ + ⌫` | Delete word left | MEDIUM |
| `Ctrl + Delete` | `⌥ + Delete` | Delete word right | MEDIUM |
| `Shift + ←/→/↑/↓` | `Shift + ←/→/↑/↓` | Extend selection | HIGH |
| `Ctrl + Shift + ←/→` | `⌥ + Shift + ←/→` | Select word | HIGH |
| `Home` | `⌘ + ←` | Go to line start | HIGH |
| `End` | `⌘ + →` | Go to line end | HIGH |

### 5. Selection & Navigation

| Shortcut (Win) | Shortcut (Mac) | Action | Priority |
|----------------|----------------|--------|----------|
| `Ctrl + Click` | `⌘ + Click` | Multi-select items | HIGH |
| `Shift + Click` | `Shift + Click` | Range select | HIGH |
| `Ctrl + A` | `⌘ + A` | Select all | HIGH |
| `Escape` | `Escape` | Deselect / Cancel | HIGH |
| `Tab` | `Tab` | Focus next element | HIGH |
| `Shift + Tab` | `Shift + Tab` | Focus previous element | HIGH |
| `Enter` | `Enter` / `Return` | Activate/Open | HIGH |
| `Space` | `Space` | Toggle selection | MEDIUM |
| `↑/↓/←/→` | `↑/↓/←/→` | Navigate items | HIGH |
| `Page Up` | `Fn + ↑` | Scroll up one page | MEDIUM |
| `Page Down` | `Fn + ↓` | Scroll down one page | MEDIUM |

### 6. Browser/View Controls

| Shortcut (Win) | Shortcut (Mac) | Action | Priority |
|----------------|----------------|--------|----------|
| `Ctrl + +` | `⌘ + +` | Zoom in | MEDIUM |
| `Ctrl + -` | `⌘ + -` | Zoom out | MEDIUM |
| `Ctrl + 0` | `⌘ + 0` | Reset zoom | MEDIUM |
| `Ctrl + Scroll` | `⌘ + Scroll` | Zoom in/out | MEDIUM |
| `F5` | `⌘ + R` | Refresh/Reload | MEDIUM |
| `Ctrl + F5` | `⌘ + Shift + R` | Hard refresh | LOW |
| `Ctrl + P` | `⌘ + P` | Print | LOW |
| `Ctrl + T` | `⌘ + T` | New tab (if applicable) | MEDIUM |
| `Ctrl + Tab` | `⌃ + Tab` | Next tab | MEDIUM |
| `Ctrl + Shift + Tab` | `⌃ + Shift + Tab` | Previous tab | MEDIUM |
| `Ctrl + 1-9` | `⌘ + 1-9` | Jump to tab number | LOW |

### 7. Quick Actions & Utilities

| Shortcut (Win) | Shortcut (Mac) | Action | Priority |
|----------------|----------------|--------|----------|
| `Ctrl + /` | `⌘ + /` | Show keyboard shortcuts | HIGH |
| `Ctrl + ,` | `⌘ + ,` | Open preferences/settings | HIGH |
| `Ctrl + K` | `⌘ + K` | Command palette / Quick actions | HIGH |
| `Ctrl + Shift + P` | `⌘ + Shift + P` | Command palette | MEDIUM |
| `Print Screen` | `⌘ + Shift + 3` | Screenshot full screen | MEDIUM |
| `Alt + Print Screen` | `⌘ + Shift + 4` | Screenshot region | MEDIUM |
| `Win + V` | - | Clipboard history | LOW |
| `Win + .` | `⌘ + ⌃ + Space` | Emoji picker | LOW |
| `Ctrl + Space` | `⌘ + Space` | Quick launcher / Spotlight | HIGH |

### 8. Media Controls (in Media apps)

| Shortcut (Win) | Shortcut (Mac) | Action | Priority |
|----------------|----------------|--------|----------|
| `Space` | `Space` | Play/Pause | HIGH |
| `K` | `K` | Play/Pause (alternative) | MEDIUM |
| `←` | `←` | Rewind 5s | HIGH |
| `→` | `→` | Forward 5s | HIGH |
| `J` | `J` | Rewind 10s | MEDIUM |
| `L` | `L` | Forward 10s | MEDIUM |
| `↑` | `↑` | Volume up | HIGH |
| `↓` | `↓` | Volume down | HIGH |
| `M` | `M` | Mute/Unmute | HIGH |
| `F` | `F` | Toggle fullscreen | HIGH |
| `0-9` | `0-9` | Jump to % (0=0%, 5=50%, 9=90%) | MEDIUM |
| `,` | `,` | Previous frame | LOW |
| `.` | `.` | Next frame | LOW |
| `Home` | `Home` | Jump to start | MEDIUM |
| `End` | `End` | Jump to end | MEDIUM |

### 9. App-Specific Shortcuts

#### Files App
| Shortcut (Win) | Shortcut (Mac) | Action |
|----------------|----------------|--------|
| `Ctrl + 1` | `⌘ + 1` | List view |
| `Ctrl + 2` | `⌘ + 2` | Grid view |
| `Ctrl + 3` | `⌘ + 3` | Column view |
| `Ctrl + L` | `⌘ + L` | Focus address bar |
| `Ctrl + Shift + F` | `⌘ + Shift + F` | Global file search |

#### Settings App
| Shortcut (Win) | Shortcut (Mac) | Action |
|----------------|----------------|--------|
| `Ctrl + Tab` | `⌃ + Tab` | Next settings tab |
| `Ctrl + Shift + Tab` | `⌃ + Shift + Tab` | Previous settings tab |
| `Ctrl + F` | `⌘ + F` | Search settings |

#### Task Manager App
| Shortcut (Win) | Shortcut (Mac) | Action |
|----------------|----------------|--------|
| `Ctrl + Shift + Esc` | `⌘ + Option + Esc` | Open Task Manager |
| `Delete` | `⌘ + Delete` | End/Cancel selected task |
| `Ctrl + R` | `⌘ + R` | Retry failed task |

#### Text Editor/Notes App (quno)
| Shortcut (Win) | Shortcut (Mac) | Action |
|----------------|----------------|--------|
| `Ctrl + N` | `⌘ + N` | New note |
| `Ctrl + S` | `⌘ + S` | Save note |
| `Ctrl + Shift + S` | `⌘ + Shift + S` | Save as |
| `Ctrl + E` | `⌘ + E` | Export note |
| `Ctrl + /` | `⌘ + /` | Toggle checkbox |

#### Game Shortcuts (Tic-Tac-Toe, etc.)
| Shortcut (Win) | Shortcut (Mac) | Action |
|----------------|----------------|--------|
| `Ctrl + N` | `⌘ + N` | New game |
| `Ctrl + Z` | `⌘ + Z` | Undo move |
| `R` | `R` | Restart game |
| `H` | `H` | Hint |
| `Escape` | `Escape` | Pause/Menu |

### 10. Accessibility Shortcuts

| Shortcut (Win) | Shortcut (Mac) | Action | Priority |
|----------------|----------------|--------|----------|
| `Ctrl + +` / `-` | `⌘ + +` / `-` | Increase/decrease text size | MEDIUM |
| `Ctrl + Shift + H` | `⌘ + Option + H` | Toggle high contrast | LOW |
| `Alt + Shift + K` | `⌃ + ⌥ + ⌘ + K` | Show accessibility options | LOW |

### 11. Developer Shortcuts (optional)

| Shortcut (Win) | Shortcut (Mac) | Action | Priority |
|----------------|----------------|--------|----------|
| `Ctrl + Shift + P` | `⌘ + Shift + P` | Toggle Profiler app | MEDIUM |
| `F12` | `⌘ + Option + I` | Open DevTools | LOW |
| `Ctrl + Shift + I` | `⌘ + Option + I` | Open DevTools | LOW |
| `Ctrl + Shift + J` | `⌘ + Option + J` | Open Console | LOW |
| `Ctrl + Shift + C` | `⌘ + Option + C` | Inspect element | LOW |
| `Ctrl + Alt + R` | `⌘ + Option + R` | Toggle render highlighting | LOW |
| `Ctrl + Alt + F` | `⌘ + Option + F` | Show FPS overlay | LOW |

---

### Implementation Priorities

**Phase 1 (MVP)** - HIGH Priority:
- Basic window management (close, minimize, maximize, snap)
- File operations (copy, paste, cut, delete, rename)
- Text editing basics (undo, redo, select all)
- Navigation (tab, enter, escape, arrows)
- Window switching (Alt+Tab)
- Core app launchers (Ctrl+Shift+Esc, Win+E, Win+I)

**Phase 2** - MEDIUM Priority:
- Advanced window management (Alt+Space menu, restore)
- Media controls
- Search and find operations
- Tab navigation
- View controls (zoom)
- Advanced file operations (properties, back/forward)

**Phase 3** - LOW Priority:
- System utilities (lock screen, clipboard history)
- Accessibility shortcuts
- Developer tools
- Emoji picker
- Screenshot tools
- App-specific advanced shortcuts

### Technical Implementation Notes

```typescript
// Example: Keyboard shortcut system
interface Shortcut {
  id: string;
  keys: string[]; // e.g., ['ctrl', 'shift', 'esc']
  macKeys?: string[]; // e.g., ['cmd', 'option', 'esc']
  action: () => void;
  description: string;
  category: 'window' | 'file' | 'system' | 'text' | 'app';
  enabled: boolean;
  global: boolean; // Works even when window not focused
  priority: 'high' | 'medium' | 'low';
}

// Keyboard event handler
const handleKeyDown = (e: KeyboardEvent) => {
  const keys = [
    e.ctrlKey && 'ctrl',
    e.altKey && 'alt',
    e.shiftKey && 'shift',
    e.metaKey && 'meta',
    e.key.toLowerCase()
  ].filter(Boolean);
  
  const shortcut = findMatchingShortcut(keys);
  if (shortcut && shortcut.enabled) {
    e.preventDefault();
    shortcut.action();
  }
};

// Settings integration
interface ShortcutSettings {
  customShortcuts: Record<string, string[]>;
  disabledShortcuts: string[];
  showShortcutHints: boolean;
}
```

### Shortcut Conflicts Resolution
- System shortcuts (Ctrl+C, Ctrl+V) always take precedence
- App-specific shortcuts only work when app is focused
- Global shortcuts (Alt+Tab) work everywhere
- Allow users to customize non-system shortcuts
- Warn on conflicts when customizing
- Provide "Reset to defaults" option

### Keyboard Shortcut Discovery
- [ ] Show shortcuts in context menus (e.g., "Copy    Ctrl+C")
- [ ] Tooltips show relevant shortcuts
- [ ] Press `Ctrl+/` or `F1` to show shortcut cheat sheet
- [ ] First-time tutorial highlights key shortcuts
- [ ] Search shortcuts in settings
- [ ] Group shortcuts by category in help dialog

### 7.6 Personalization & Customization

- [ ] **Appearance Customization**
  - Custom background images
    - Upload from computer
    - Choose from preset library
    - Unsplash integration (optional)
    - Store in IndexedDB
  - Background effects
    - Blur intensity
    - Overlay opacity
    - Tint color
  - Window appearance
    - Animation speed
    - Shadow intensity
    - Border styles
    - Transparency (if supported)
  - Desktop icon settings
    - Size (small, medium, large)
    - Label visibility
    - Grid spacing
  - Taskbar customization
    - Position (top, bottom, left, right) ✅ already in settings
    - Size/height
    - Auto-hide
    - Transparency
  - Sound effects (optional)
    - Window open/close sounds
    - Notification sounds
    - System sounds
    - Upload custom sounds
  - Export/import themes
    - Save entire theme as JSON
    - Share themes via URL
    - Community theme gallery (future)

### 7.7 SEO & Social Media Meta Tags

- [ ] **Open Graph Tags**
  - Dynamic OG tags based on URL
  - App-specific preview images
  - Demo mode previews

- [ ] **Twitter Cards**
  - Generate preview cards for shared links
  - App screenshots for demos

- [ ] **Meta Tags**
  - Dynamic titles/descriptions per route
  - Proper SEO for demo pages

### 7.8 Multi-Monitor Support (Stretch)

- [ ] **Window Spanning**
  - Detect monitor boundaries
  - Allow windows across virtual monitors
  - Per-monitor DPI settings

---

## Phase 8: Polish & Optimization (Weeks 29-32)

### 8.1 Performance Optimization

- [ ] **Code Splitting**
  - Lazy load apps
  - Dynamic imports for heavy features
  - Bundle size optimization

- [ ] **Rendering Optimization**
  - Virtual scrolling for large lists
  - Memoization of expensive components
  - Debounce/throttle user interactions

- [ ] **IndexedDB Optimization**
  - Add indexing for fast queries
  - Implement pagination for large datasets
  - Cache frequently accessed data

- [ ] **Service Worker Implementation** 🚀
  - Install service worker for PWA
  - Cache app shell and core resources
  - Offline mode - work without internet
  - Cache strategy:
    - Network-first for API calls
    - Cache-first for static assets
    - Stale-while-revalidate for app resources
  - Background sync for file operations
  - Pre-cache demo data for instant loading
  - Intercept requests for virtual file system
  - Push notifications (when appropriate)
  - Update notifications (new version available)
  - Workbox integration for easier management

**Service Worker Use Cases:**
- Make entire OS work offline
- Faster subsequent loads
- Background file downloads
- Sync notes/data when online
- Handle file:// protocol for virtual FS
- Cache app bundles
- Update check on startup

### 8.2 Accessibility

- [ ] **WCAG Compliance**
  - Keyboard navigation for all features
  - ARIA labels and roles
  - Focus management
  - Screen reader testing
  - High contrast mode

### 8.3 Mobile Support

- [ ] **Responsive Design**
  - Adapt layout for tablets
  - Mobile-friendly touch gestures
  - Virtual keyboard handling
  - Simplified UI for small screens

### 8.4 Testing

- [ ] **Unit Tests**
  - Test core utilities
  - Test file system operations
  - Test window management logic

- [ ] **Integration Tests**
  - Test app launching
  - Test file operations
  - Test settings persistence

- [ ] **E2E Tests**
  - User workflows (Playwright/Cypress)
  - Cross-browser testing

---

## Phase 9: Documentation & Deployment (Weeks 33-36)

### 9.1 Documentation

- [ ] **Update README**
  - Project description
  - Features list
  - Installation instructions
  - Development setup
  - Architecture overview

- [ ] **Developer Documentation**
  - How to create new apps
  - API documentation
  - File system usage
  - Context/hooks documentation
  - Contributing guidelines

- [ ] **User Documentation**
  - User guide for OS features
  - App-specific help
  - Keyboard shortcuts
  - Troubleshooting

### 9.2 Deployment

- [ ] **Production Build & PWA**
  - Optimize build configuration
  - Environment variables
  - PWA manifest (already configured via vite-plugin-pwa)
  - Service worker registration
  - Asset optimization
  - Install prompts for "Add to Home Screen"
  - App icons for all platforms (already generated)
  - Full offline capability
  - App shortcuts in manifest (quick access to apps)

- [ ] **Hosting**
  - Deploy to Vercel/Netlify/GitHub Pages
  - Custom domain setup
  - CDN configuration
  - Analytics setup (optional)

- [ ] **CI/CD**
  - GitHub Actions for builds
  - Automated testing
  - Automated deployments
  - Version tagging

---

## Priority Matrix

### Must Have (MVP)
1. ✅ Window management
2. ✅ Taskbar & Desktop
3. 🚧 IndexedDB file system
4. 🚧 Desktop app management
5. ⏳ Enhanced Files app
6. ⏳ Task Manager integration
7. ⏳ Game Hub with 2-3 games

### Should Have
1. URL share system / deep linking
2. Color utility tools
3. Speed reader
4. Quick notes (quno)
5. Series tracker
6. Static-utils imports
7. Notification system
8. Better icons/design
9. Profiler app (developer tool)

### Nice to Have
1. Work hours tracker
2. All puzzle games
3. Compression tools
4. File transfer (P2P)
5. Terminal emulator
6. Gifski wrapper
7. Multi-monitor support

### Future Considerations
1. App Store/Marketplace
2. Backend services
3. Mobile app version
4. Electron wrapper for desktop
5. Plugin/extension system
6. Multi-user support
7. Cloud sync

---

## Technology Stack Recommendations

### Current Stack
- ✅ React 19 + TypeScript
- ✅ Vite
- ✅ Tailwind CSS 4
- ✅ Zustand (state management)
- ✅ Radix UI (components)
- ✅ Lucide Icons

### Core Infrastructure (Phase 2)
- **@lilbunnyrabbit/task-manager** (task orchestration) - YOUR PACKAGE! 🎯
  - Use for all async operations >2s
  - Progress tracking, error recovery, composable workflows
  - Foundation for file operations, media processing, downloads

### Additional Libraries to Consider
- **IndexedDB**: `idb` (Jake Archibald's wrapper)
- **WebRTC**: `simple-peer` or native WebRTC APIs
- **Routing**: `react-router-dom` with `MemoryRouter` for in-app navigation
- **WebAssembly**: `wasm-bindgen` (Rust), `wasm-pack` (build tool)
- **Service Workers**: `workbox` (Google's SW toolkit)
- **Video Processing**: `ffmpeg.wasm`
- **Image Processing**: Canvas APIs, `pica` (resize), WebAssembly for heavy ops
- **PDF Generation**: `jsPDF`, `pdfkit`, `pdf-lib`
- **Markdown**: `react-markdown`, `marked`
- **QR Codes**: `qrcode` (for share feature)
- **Compression**: Native implementation + WebAssembly for performance
- **Testing**: `vitest`, `@testing-library/react`, `playwright`

---

## Implementation Strategy

### Development Approach
1. **Incremental Development**: Complete one phase before moving to next
2. **Vertical Slices**: Build features end-to-end (UI → logic → storage)
3. **Iterative Polish**: Basic implementation first, polish later
4. **User Feedback**: Test with users after each major phase

### Code Organization
- **Apps**: Each app in its own directory under `src/apps/`
- **Shared Components**: Reusable UI in `src/components/`
- **Utilities**: Helper functions in `src/lib/`
- **Types**: Shared types in `src/types/`
- **Hooks**: Custom hooks in `src/hooks/`
- **Stores**: Zustand stores in `src/stores/`

### Git Workflow
- **main**: Production-ready code
- **develop**: Integration branch
- **feature/***: Individual features
- **fix/***: Bug fixes

### Versioning
- Follow semantic versioning (MAJOR.MINOR.PATCH)
- Tag releases in Git
- Maintain CHANGELOG.md

---

## Success Metrics

### Technical
- [ ] <100ms window interaction latency
- [ ] <3s initial load time
- [ ] Support 50+ concurrent windows
- [ ] <5MB core bundle size
- [ ] 100% keyboard accessible
- [ ] Works in Chrome, Firefox, Safari, Edge

### Feature Completeness
- [ ] 20+ functional apps
- [ ] Full file system implementation
- [ ] All existing projects ported
- [ ] Game hub with 10+ games
- [ ] Complete documentation

### User Experience
- [ ] Intuitive desktop environment
- [ ] Consistent design language
- [ ] Responsive and smooth interactions
- [ ] Mobile-friendly interface
- [ ] Clear user guidance

---

## Timeline Summary

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 1 | 3 weeks | Core System Polish |
| Phase 2 | 4 weeks | App Ecosystem |
| Phase 3 | 4 weeks | Games |
| Phase 4 | 4 weeks | Productivity |
| Phase 5 | 4 weeks | Media |
| Phase 6 | 4 weeks | Advanced Features |
| Phase 7 | 4 weeks | System Enhancements |
| Phase 8 | 4 weeks | Polish & Optimization |
| Phase 9 | 4 weeks | Documentation & Deployment |
| **Total** | **~9 months** | Full Implementation |

**MVP Timeline**: Phases 1-3 (~11 weeks / 3 months)

---

## Next Steps (Immediate)

1. ✅ Review and approve this plan
2. ⏳ Start Phase 1.1: Design System Finalization
3. ⏳ Create icon library/system
4. ⏳ Start Phase 1.2: IndexedDB file system design
5. ⏳ Set up project tracking (GitHub Projects, Linear, etc.)
6. ⏳ Consider early implementation of URL routing (Phase 7.1) as foundation

---

## Portfolio & Showcase Strategy

The URL share system makes this project **incredibly portfolio-friendly**:

### 1. **Resume Links**
```
yourwebos.com/#/demo/showcase
→ Curated demo showing all your best work
→ Impressive interactive portfolio piece
```

### 2. **Project Demos**
Each feature gets its own shareable link:
- `#/demo/task-manager` - Show off your npm package
- `#/demo/games` - Game development skills
- `#/demo/productivity` - Full-stack capabilities
- `#/demo/media-tools` - Video/image processing

### 3. **Blog/Social Media**
Every feature you build is instantly shareable:
- "Built a nonogram game in React" → Share playable link
- "My task orchestration package in action" → Live demo
- "Web-based OS with file system" → Direct link to feature

### 4. **Interview Showcases**
```
In interview: "Let me show you my work..."
→ Share screen and open: yourwebos.com/#/demo/technical
→ Pre-configured to show code quality, architecture, features
```

### 5. **Documentation**
- Embed live demos in docs
- Interactive tutorials visitors can try
- No deployment complexity - just URLs

---

## Notes

- This plan is ambitious but achievable with consistent effort
- Prioritize features based on personal interest and utility
- Don't be afraid to skip or defer "Nice to Have" items
- Some features may be combined or split as needed
- User feedback should guide priority adjustments
- Consider open-sourcing after MVP for community contributions
- **URL sharing system makes this perfect for job applications/portfolio**

**Remember**: The goal is to create a functional, polished web OS that showcases your skills and provides genuine utility. Focus on quality over quantity.

---

## 💡 Additional Ideas & Brainstorming

### WebAssembly Use Cases 🦀

#### **High Priority (Performance Critical)**
1. **Compression Algorithms**
   - DEFLATE, LZ77, Huffman encoding
   - 10-100x faster than JS for large files
   - Great learning project for Rust + WASM

2. **Image Processing**
   - Resize/crop with high quality (better than canvas)
   - Format conversion (PNG → WebP, etc.)
   - Filters (blur, sharpen, color adjustments)
   - Batch operations on multiple images

3. **Cryptography**
   - File encryption/decryption for secure storage
   - Password hashing
   - Secure file sharing with encryption

#### **Medium Priority**
4. **Video Processing Helpers**
   - Frame extraction
   - Metadata parsing
   - Thumbnail generation
   - Simple filters

5. **Game Physics Engines**
   - For more complex games (platformers, physics puzzles)
   - Collision detection
   - Particle systems

6. **Audio Processing**
   - Audio effects (reverb, echo, pitch shift)
   - Waveform generation
   - Audio analysis (beat detection, frequency analysis)
   - Music visualizer

#### **Advanced/Future**
7. **PDF Manipulation**
   - Parse PDF structure
   - Merge/split PDFs
   - Extract text/images
   - Generate PDFs from scratch

8. **OCR (Optical Character Recognition)**
   - Extract text from images
   - Document scanning
   - Receipt parsing

9. **Machine Learning Models**
   - Image classification
   - Style transfer
   - Simple predictions

10. **Data Processing**
    - Large dataset parsing (CSV, JSON)
    - Statistical calculations
    - Data visualization backends

#### **Implementation Notes**
- Use `wasm-bindgen` for Rust ↔ JS interop
- Use `wasm-pack` for easy builds
- Implement JS fallbacks for unsupported browsers
- Add "WASM vs JS" benchmark app to showcase performance
- Blog about the experience (great content)

---

### Service Worker Opportunities 🔧

#### **Core Features (Must Have)**
1. **Offline Mode**
   - Cache entire OS shell
   - Work without internet after first load
   - Offline indicator in UI
   - Queue operations for when back online

2. **App Caching**
   - Lazy-loaded apps cached after first use
   - Instant subsequent loads
   - Update apps in background

3. **Asset Optimization**
   - Cache images, fonts, icons
   - Compress responses
   - Serve from cache when available

#### **Enhanced Features**
4. **Background Sync**
   - Queue file uploads when offline
   - Sync notes/data when connection restored
   - Background downloads
   - Series tracker updates

5. **Update Management**
   - Detect new version available
   - Show update notification
   - Smooth update without page reload
   - Version migration handling

6. **Virtual File System Integration**
   - Intercept file:// requests
   - Serve files from IndexedDB
   - Cache frequently accessed files
   - Pre-load file thumbnails

#### **Advanced Features**
7. **Push Notifications**
   - Task completion notifications (even when tab closed)
   - Series tracker episode reminders
   - Update notifications
   - Background sync completion

8. **Smart Caching Strategies**
   - Network-first for API calls (fresh data)
   - Cache-first for static assets (fast)
   - Stale-while-revalidate for app resources (best of both)
   - Time-based cache invalidation

9. **Analytics & Performance**
   - Track offline usage
   - Cache hit rates
   - Performance metrics
   - Error logging

10. **Demo Data Pre-caching**
    - Pre-load demo mode data
    - Instant demo experiences
    - Perfect for portfolio showcases

#### **Implementation with Workbox**
```typescript
// Example: workbox-config.js
module.exports = {
  globDirectory: 'dist/',
  globPatterns: ['**/*.{html,js,css,png,svg,jpg,webp,woff2}'],
  swDest: 'dist/sw.js',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\./,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: { maxEntries: 50, maxAgeSeconds: 300 }
      }
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: { maxEntries: 100, maxAgeSeconds: 2592000 }
      }
    }
  ]
};
```

---

### React Router (MemoryRouter) Architecture 🧭

#### **Why MemoryRouter?**
- Doesn't affect browser URL (perfect for windows)
- Each window has independent navigation state
- No conflicts with OS-level URL routing
- Back/forward buttons work per-window
- Clean separation of concerns

#### **Implementation Pattern**
```typescript
// In window component
function FilesBrowserApp() {
  return (
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<FilesList />} />
        <Route path="/folder/:path" element={<FolderView />} />
        <Route path="/file/:id" element={<FilePreview />} />
        <Route path="/search" element={<SearchResults />} />
      </Routes>
    </MemoryRouter>
  );
}
```

#### **Apps That Benefit**
1. **Files Browser** ⭐
   - Navigate folder hierarchy
   - Breadcrumb navigation
   - Back/forward buttons
   - Search results

2. **Settings App** ⭐
   - Different tabs as routes
   - Deep links to specific settings
   - Clean URL structure

3. **Series Tracker**
   - List view → Detail view
   - Episode pages
   - Search results

4. **Speed Reader**
   - Library → Book → Chapter
   - Navigation between books
   - Bookmarks

5. **Game Hub**
   - Game list → Game detail
   - Category browsing
   - Search results

6. **Color Tools**
   - Different tools as routes
   - Tool-specific settings
   - History navigation

#### **Best Practices**
- Use `<Link>` components for navigation
- Implement back/forward buttons in window chrome
- Show current "path" in window title or breadcrumb
- Persist navigation state with window state
- Handle navigation on window minimize/restore

---

### Customization Features Expansion 🎨

#### **Background Options**
1. **Static Images**
   - Upload custom images
   - Preset wallpaper library (landscapes, abstract, minimal)
   - Unsplash integration (random, search)
   - Bing daily wallpaper

2. **Dynamic Backgrounds**
   - Animated gradients
   - Particle effects
   - Time-based (different at night/day)
   - Weather-based (if location permission)
   - Ambient video backgrounds

3. **Effects**
   - Blur intensity (glassmorphism)
   - Overlay tint/opacity
   - Vignette effect
   - Parallax scrolling
   - Zoom level

#### **Sound Design**
- Window open/close sounds
- Notification sounds (various tones)
- Typing sounds (mechanical keyboard simulation)
- Ambient background music
- Sound themes (nature, office, retro, sci-fi)
- Volume controls per sound type
- Upload custom sound packs

#### **Theme System**
1. **Preset Themes**
   - Dark/Light mode
   - High contrast
   - Retro (Windows 95, Mac Classic)
   - Modern (Material, Fluent, macOS-like)
   - Custom brand colors

2. **Theme Sharing**
   - Export theme as JSON
   - Share via URL: `#/theme/import?data=...`
   - Community theme gallery
   - Theme voting/ratings
   - Featured themes

3. **Advanced Customization**
   - Font family/size
   - Window border radius
   - Shadow styles
   - Animation curves/durations
   - Icon pack selection

---

### Integration Ideas 🔌

#### **External Services**
- **Unsplash** - Wallpapers
- **Google Drive** - Cloud file storage
- **Dropbox** - File sync
- **GitHub Gists** - Code snippets storage
- **Pastebin** - Quick sharing
- **OpenAI** - AI assistant app
- **Weather API** - Desktop widget
- **News APIs** - News reader app

#### **Social Features**
- Share desktop layouts with friends
- Collaborative whiteboard app
- Shared file system (with permissions)
- Multiplayer games
- Chat app (WebRTC or WebSocket)

---

### Performance Targets 🎯

| Metric | Target | Stretch Goal |
|--------|--------|--------------|
| Initial Load | <3s | <1s |
| Window Open | <100ms | <50ms |
| App Launch | <200ms | <100ms |
| File Operation | <500ms | <200ms |
| Search Query | <300ms | <100ms |
| Theme Switch | Instant | Instant |
| Offline Load | <1s | <500ms |
| 50+ Windows | Smooth | No lag |

---

### Future Platform Expansion 🚀

1. **Electron Wrapper**
   - Desktop app version
   - Native file system access
   - System tray integration
   - Auto-updates

2. **Mobile Apps**
   - React Native version
   - Touch-optimized UI
   - Mobile-specific features

3. **Browser Extension**
   - Quick access from any website
   - Screenshot tool
   - Bookmark manager

4. **VS Code Extension**
   - Integrate tools into VS Code
   - Productivity utilities
   - Code snippets manager

