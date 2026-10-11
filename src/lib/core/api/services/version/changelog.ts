import { ChangeKind, type Release } from "./type";

const { NEW, IMPROVED, FIXED } = ChangeKind;

/** Hand-written release notes, newest first (ADR-026). The first entry's version equals `package.json`. */
export const CHANGELOG: Release[] = [
  {
    version: "0.8.2",
    date: "2026-10-12",
    title: "In step",
    changes: [
      { kind: FIXED, text: "File Explorer windows update on their own when another window changes the folder they show, including pins to the desktop." },
      { kind: FIXED, text: "If the folder you're looking at is deleted or moved elsewhere, File Explorer takes you to the nearest folder that still exists." },
    ],
  },
  {
    version: "0.8.1",
    date: "2026-10-11",
    title: "One window, one tab",
    changes: [
      { kind: FIXED, text: "Two windows of the same app no longer switch tabs together. Each keeps its own tab, and restored windows reopen on it." },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-10-11",
    title: "Welcome",
    changes: [
      { kind: NEW, text: "A full-screen introduction the first time you open WebOS. Replay it from Settings › About." },
      { kind: NEW, text: "After an update, a notification tells you what changed. Every release is listed in Settings › What's new." },
      { kind: NEW, text: "When a new version is ready, a notification offers to update and reload." },
    ],
  },
  {
    version: "0.7.0",
    date: "2026-10-11",
    title: "Online, with tools",
    changes: [
      { kind: NEW, text: "WebOS is live on GitHub Pages. Settings and desktop pins from the old version come along." },
      { kind: NEW, text: "HTML Preview and CSV Viewer open web pages and spreadsheets." },
      { kind: NEW, text: "Image tools: crop, background removal, concatenate, split, sprite extraction, GIF player and QR reader." },
      { kind: NEW, text: "Open with also lists tools that can work on a file, below the apps that open it." },
      { kind: NEW, text: "Activity Monitor shows windows, frame rate, memory, network and storage, and can end a window." },
      { kind: NEW, text: "Tic-Tac-Toe." },
      { kind: NEW, text: "Save to disk copies a file or a whole folder from WebOS to your computer." },
      { kind: NEW, text: "The file picker can save: pick a folder and a name, and it asks before replacing a file." },
      { kind: FIXED, text: "CSV Viewer's header lines up with its columns." },
      { kind: FIXED, text: "Selected text in inputs is readable." },
    ],
  },
  {
    version: "0.6.0",
    date: "2026-10-11",
    title: "Right-click everything",
    changes: [
      { kind: IMPROVED, text: "A full design pass: one design system across the shell and every app." },
      { kind: NEW, text: "Context menus on files, folders and the desktop, from the mouse or Shift+F10." },
      { kind: NEW, text: "Rename, Properties and Open with on any file." },
      { kind: NEW, text: "Copy, cut and paste files between folders." },
      { kind: NEW, text: "Questions and file pickers open inside the window that asked, not over the whole screen." },
      { kind: NEW, text: "Viewers can open another file with Open…" },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-10-11",
    title: "A real file system",
    changes: [
      { kind: NEW, text: "Folders like a real OS: /home with Desktop, Documents and Downloads. Existing files move into /home." },
      { kind: NEW, text: "The desktop is the /home/Desktop folder. Pin apps to it as shortcuts." },
      { kind: NEW, text: "Open windows are saved, and WebOS offers to restore them on your next visit." },
      { kind: NEW, text: "The Kernel app shows what every system service is doing." },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-10-11",
    title: "Open your files",
    changes: [
      { kind: NEW, text: "Double-click a file to open it in the right app." },
      { kind: NEW, text: "Text Viewer, Media Preview and PDF Viewer." },
      { kind: NEW, text: "When several apps can open a file, pick one and optionally always use it." },
      { kind: FIXED, text: "Windows drag, focus and place correctly." },
      { kind: FIXED, text: "The update check no longer reports an update on every visit." },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-10-10",
    title: "lilBunnyRabbit",
    changes: [
      { kind: NEW, text: "The lilBunnyRabbit look: brand colours and icons." },
      { kind: NEW, text: "Notifications, with a history." },
      { kind: IMPROVED, text: "Settings are kept between visits." },
      { kind: IMPROVED, text: "Uploading a file with a name that's taken renames it instead of failing." },
    ],
  },
  {
    version: "0.2.0",
    date: "2025-11-30",
    title: "Desktop and files",
    changes: [
      { kind: NEW, text: "A desktop with icons, a taskbar and a start menu." },
      { kind: NEW, text: "File Explorer, storing files in your browser on this device." },
    ],
  },
  {
    version: "0.1.0",
    date: "2025-10-27",
    title: "Windows",
    changes: [
      { kind: NEW, text: "Windows you can move, resize, maximise and minimise." },
      { kind: NEW, text: "Drop a window on a screen edge to snap it to a half, or on a corner for a quarter." },
    ],
  },
];
