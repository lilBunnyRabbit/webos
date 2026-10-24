// ADR-067. boot.ts runs every probe before WebOS loads, so this module must stay small and import nothing.

export const Level = {
  START: "start",
  SHELL: "shell",
  APPS: "apps",
  COSMETIC: "cosmetic",
} as const;
export type Level = (typeof Level)[keyof typeof Level];

export const LEVELS: Level[] = [Level.START, Level.SHELL, Level.APPS, Level.COSMETIC];

export const LEVEL_LABELS: Record<Level, string> = {
  [Level.START]: "Won't start",
  [Level.SHELL]: "Shell",
  [Level.APPS]: "Apps",
  [Level.COSMETIC]: "Cosmetic",
};

// Where the feature works the way WebOS uses it, not where it first appeared; `null` = not shipped.
export interface MinVersions {
  chrome: string | null;
  firefox: string | null;
  safari: string | null;
}

export interface Feature {
  id: string;
  name: string;
  lost: string;
  level: Level;
  // A solo link shows only `start` entries and the ones naming its app.
  apps?: string[];
  min: MinVersions;
  probe(): boolean;
}

const css = (rule: string) => CSS.supports(rule);
const proto = (name: string, key: string) => {
  const type = (globalThis as unknown as Record<string, { prototype?: object } | undefined>)[name];
  return !!type?.prototype && key in type.prototype;
};
const global = (name: string) => name in globalThis;
const min = (chrome: string | null, firefox: string | null, safari: string | null): MinVersions => ({ chrome, firefox, safari });

const canvas = () => {
  const element = document.createElement("canvas");
  element.width = element.height = 1;
  return element;
};

export const FEATURES: Feature[] = [
  {
    id: "opfs",
    name: "Private file storage",
    lost: "WebOS keeps every file and setting here.",
    level: Level.START,
    min: min("86", "111", "15.2"),
    probe: () => !!navigator.storage && "getDirectory" in navigator.storage,
  },
  {
    id: "opfs-write",
    name: "Writing files",
    lost: "Nothing can be saved, and the first start writes a file.",
    level: Level.START,
    apps: ["api-client", "p2p-transfer"],
    min: min("86", "111", "26"),
    probe: () => proto("FileSystemFileHandle", "createWritable"),
  },
  {
    id: "web-locks",
    name: "Web Locks",
    lost: "Alarms and offline apps coordinate open tabs with it at start-up.",
    level: Level.START,
    apps: ["moonrabbit"],
    min: min("69", "96", "15.4"),
    probe: () => "locks" in navigator,
  },
  {
    id: "broadcast-channel",
    name: "Broadcast Channel",
    lost: "Alarms talk between tabs with it at start-up.",
    level: Level.START,
    min: min("54", "38", "15.4"),
    probe: () => global("BroadcastChannel"),
  },
  {
    id: "idle-callback",
    name: "Idle callbacks",
    lost: "Background work at start-up runs on a timer instead of when the browser is idle.",
    level: Level.COSMETIC,
    apps: ["text-editor"],
    min: min("47", "55", null),
    probe: () => global("requestIdleCallback"),
  },
  {
    // The build loads its shared chunk through an import map and resolves lazy chunks with `import.meta.resolve`.
    id: "import-maps",
    name: "Import maps",
    lost: "WebOS's code can't load.",
    level: Level.START,
    min: min("105", "108", "16.4"),
    probe: () => !!HTMLScriptElement.supports?.("importmap") && typeof import.meta.resolve === "function",
  },
  {
    // Tailwind 4's output: cascade layers, `@property` (Firefox 128) and `color-mix()` in OKLCH.
    id: "modern-css",
    name: "Modern CSS",
    lost: "The interface loses colours, spacing and shadows.",
    level: Level.SHELL,
    min: min("111", "128", "16.4"),
    probe: () => css("color: color-mix(in oklch, red, blue)") && "registerProperty" in CSS && global("CSSLayerBlockRule"),
  },
  {
    // iOS before 18.3 has the attribute only in part (MDN); toggle events, `:popover-open` and `popovertarget` are 114/125/17.
    id: "popover",
    name: "Popover",
    lost: "The start menu, notification centre, terminal suggestions and app menus don't open or close properly.",
    level: Level.SHELL,
    apps: ["terminal", "font-maker", "hopsprite", "image-editor", "kanban", "lunar-lander", "markdown-pdf", "moonrabbit", "paint", "quick-notes", "soundboard", "warren", "web-app"],
    min: min("114", "125", "18.3"),
    probe: () => proto("HTMLElement", "showPopover") && css("selector(:popover-open)"),
  },
  {
    // `position-area` is 129: Chrome 125 to 128 called it `inset-area`.
    id: "anchor-positioning",
    name: "Anchor positioning",
    lost: "Menus, dialogs, the start menu and tooltips open in the wrong place.",
    level: Level.SHELL,
    apps: ["terminal", "font-maker", "hopsprite", "image-editor", "lunar-lander", "paint", "soundboard", "warren"],
    min: min("129", "147", "26"),
    probe: () => css("anchor-name: --a") && css("position-area: top") && css("position-try-fallbacks: flip-block"),
  },
  {
    id: "dialog-closedby",
    name: "Dialog light dismiss",
    lost: "Menus and dialogs don't close when you click outside them.",
    level: Level.SHELL,
    min: min("134", "141", null),
    probe: () => proto("HTMLDialogElement", "closedBy"),
  },
  {
    // Relative OKLCH (122 / 128 / 18) and `abs()` (138 / 118 / 15.4) in derived themes.
    id: "relative-colors",
    name: "Relative colours",
    lost: "Themes other than Brand Dark and Brand Light get wrong surface and state colours.",
    level: Level.SHELL,
    apps: ["settings"],
    min: min("138", "128", "18"),
    probe: () => css("color: oklch(from red l c h)") && css("width: abs(-1px)"),
  },
  {
    id: "light-dark",
    name: "light-dark()",
    lost: "Some controls get the wrong colours.",
    level: Level.SHELL,
    min: min("123", "120", "17.5"),
    probe: () => css("color: light-dark(red, blue)"),
  },
  {
    id: "css-nesting",
    name: "CSS nesting",
    lost: "Parts of the taskbar and start menu lose their styles.",
    level: Level.SHELL,
    min: min("120", "117", "17.2"),
    probe: () => css("selector(&)"),
  },
  {
    id: "container-queries",
    name: "Container queries",
    lost: "Windows and apps don't fit their layout to their size.",
    level: Level.SHELL,
    min: min("105", "110", "16"),
    probe: () => css("container-type: inline-size"),
  },
  {
    id: "has-selector",
    name: ":has()",
    lost: "An auto-hidden taskbar doesn't come back; some toggles don't show their state.",
    level: Level.SHELL,
    min: min("105", "121", "15.4"),
    probe: () => css("selector(:has(a))"),
  },
  {
    id: "inert",
    name: "inert",
    lost: "Hidden windows and sheets can still take focus and taps.",
    level: Level.SHELL,
    min: min("102", "112", "15.5"),
    probe: () => proto("HTMLElement", "inert"),
  },
  {
    id: "dynamic-viewport",
    name: "Dynamic viewport units",
    lost: "On phones the desktop and menus can sit under the browser's toolbars.",
    level: Level.SHELL,
    min: min("108", "101", "15.4"),
    probe: () => css("height: 1dvh"),
  },
  {
    id: "mask-image",
    name: "CSS masks",
    lost: "App icons draw as solid squares.",
    level: Level.SHELL,
    min: min("120", "53", "15.4"),
    probe: () => css("mask-image: none"),
  },
  {
    id: "deflate-raw",
    name: "Zip compression",
    lost: "Zip files and backups can't be made or opened.",
    level: Level.SHELL,
    apps: ["archive", "cards", "forms", "p2p-transfer"],
    min: min("103", "113", "16.4"),
    probe: () => {
      try {
        new CompressionStream("deflate-raw");
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    id: "user-activation",
    name: "User activation",
    lost: "Backups and alarm sounds fail with an error.",
    level: Level.SHELL,
    min: min("72", "120", "16.4"),
    probe: () => "userActivation" in navigator,
  },
  {
    id: "check-visibility",
    name: "checkVisibility()",
    lost: "Settings' side list doesn't follow your scrolling.",
    level: Level.SHELL,
    apps: ["settings", "funky"],
    min: min("105", "106", "17.4"),
    probe: () => proto("Element", "checkVisibility"),
  },
  {
    id: "subgrid",
    name: "Subgrid",
    lost: "File list columns don't line up.",
    level: Level.SHELL,
    min: min("117", "71", "16"),
    probe: () => css("grid-template-columns: subgrid"),
  },
  {
    id: "window-zoom",
    name: "CSS zoom",
    lost: "Zooming a window doesn't scale its content.",
    level: Level.SHELL,
    min: min("1", "126", "3.1"),
    probe: () => css("zoom: 2"),
  },
  {
    id: "file-pickers",
    name: "File System Access pickers",
    lost: "Mounting a folder from your device and saving a folder to disk. Files go to your downloads instead.",
    level: Level.SHELL,
    min: min("86", null, null),
    probe: () => global("showSaveFilePicker") && global("showDirectoryPicker"),
  },
  {
    id: "pop-out",
    name: "Document Picture-in-Picture",
    lost: "Popping a window out to stay on top of other programs.",
    level: Level.SHELL,
    min: min("116", "151", null),
    probe: () => global("documentPictureInPicture"),
  },
  {
    id: "notification-actions",
    name: "Notification buttons",
    lost: "Alarm and reminder notifications come without their buttons.",
    level: Level.SHELL,
    apps: ["clock", "pomodoro", "calendar"],
    min: min("53", "152", null),
    probe: () => proto("Notification", "actions"),
  },
  {
    id: "ai-writing",
    name: "On-device AI: summarize and translate",
    lost: "The summarize, translate and language commands.",
    level: Level.SHELL,
    min: min("138", null, null),
    probe: () => global("Summarizer") && global("Translator") && global("LanguageDetector"),
  },
  {
    id: "ai-prompt",
    name: "On-device AI: prompts",
    lost: "AI games and tools don't run; other apps hide their AI parts.",
    level: Level.APPS,
    apps: ["alibi", "ask", "unsaid", "doodlehop", "warren", "shopping-list"],
    min: min("148", null, null),
    probe: () => global("LanguageModel"),
  },
  {
    id: "video-frame-callback",
    name: "Video frame callbacks",
    lost: "Video tracking, frame stepping and camera scanning.",
    level: Level.APPS,
    apps: ["birdseye", "video-tools", "soundboard", "gif-player", "cards", "p2p-transfer", "qr-reader"],
    min: min("83", "132", "15.4"),
    probe: () => proto("HTMLVideoElement", "requestVideoFrameCallback"),
  },
  {
    id: "video-encoder",
    name: "Video encoding",
    lost: "Saving video.",
    level: Level.APPS,
    apps: ["birdseye", "video-tools"],
    min: min("94", "130", "16.4"),
    probe: () => global("VideoEncoder"),
  },
  {
    id: "audio-encoder",
    name: "Audio encoding",
    lost: "Sound in saved video and audio-only export.",
    level: Level.APPS,
    apps: ["birdseye", "video-tools"],
    min: min("94", "130", "26"),
    probe: () => global("AudioEncoder"),
  },
  {
    id: "image-decoder",
    name: "Image decoding",
    lost: "Playing GIFs; Hopsprite imports only a GIF's first frame.",
    level: Level.APPS,
    apps: ["gif-player", "hopsprite", "image-tools"],
    min: min("94", "133", null),
    probe: () => global("ImageDecoder"),
  },
  {
    id: "capture-stream",
    name: "Media capture streams",
    lost: "Taking a sound from a video file.",
    level: Level.APPS,
    apps: ["soundboard"],
    min: min("62", "149", null),
    probe: () => proto("HTMLMediaElement", "captureStream"),
  },
  {
    // Safari has the property but draws without the filter, so this draws once and reads the pixel back.
    id: "canvas-filter",
    name: "Canvas filters",
    lost: "Image Editor, Image Tools and Birdseye apply filters by hand: slower, and Birdseye's blur is softer.",
    level: Level.COSMETIC,
    apps: ["image-editor", "image-tools", "birdseye"],
    min: min("52", "49", null),
    probe: () => {
      const context = canvas().getContext("2d", { willReadFrequently: true });
      if (!context) return false;
      context.filter = "invert(1)";
      context.fillStyle = "#000";
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[0] > 200;
    },
  },
  {
    id: "caret-from-point",
    name: "Caret from point",
    lost: "Picking a kerning pair and dropping a picture where you point.",
    level: Level.APPS,
    apps: ["font-maker", "moonrabbit", "proposals"],
    // `caretRangeFromPoint` stands in where `caretPositionFromPoint` is missing.
    min: min("4", "20", "5"),
    probe: () => "caretPositionFromPoint" in document || "caretRangeFromPoint" in document,
  },
  {
    id: "plaintext-only",
    name: "Plain-text editing",
    lost: "Journal entries and proposal sections can't be edited.",
    level: Level.APPS,
    apps: ["moonrabbit", "proposals"],
    min: min("51", "136", "5"),
    probe: () => {
      const element = document.createElement("div");
      try {
        element.contentEditable = "plaintext-only";
      } catch {
        return false;
      }
      return element.contentEditable === "plaintext-only";
    },
  },
  {
    id: "coalesced-events",
    name: "Coalesced pointer events",
    lost: "Fast strokes in drawing apps are less smooth.",
    level: Level.COSMETIC,
    apps: ["paint", "doodlehop", "font-maker", "hopsprite", "proposals", "pdf-tools"],
    min: min("58", "59", "18.2"),
    probe: () => proto("PointerEvent", "getCoalescedEvents"),
  },
  {
    // `CSS.highlights` is Firefox 140, the `::highlight()` styling 149.
    id: "custom-highlight",
    name: "Custom highlights",
    lost: "Find highlights in Warren and the kerning highlight in Font Maker.",
    level: Level.APPS,
    apps: ["warren", "font-maker"],
    min: min("105", "149", "17.2"),
    probe: () => "highlights" in CSS && css("selector(::highlight(a))"),
  },
  {
    id: "web-share",
    name: "Web Share",
    lost: "Share buttons.",
    level: Level.APPS,
    apps: ["cards", "p2p-transfer", "proposals"],
    min: min("128", null, "12.1"),
    probe: () => "share" in navigator,
  },
  {
    id: "clipboard-image",
    name: "Copying images",
    lost: "Copying an image to the clipboard.",
    level: Level.APPS,
    apps: ["image-tools", "qr-studio"],
    min: min("76", "127", "13.1"),
    probe: () => global("ClipboardItem"),
  },
  {
    // Exposed on macOS, ChromeOS and Android Chrome only; QR codes fall back to a library everywhere.
    id: "barcode-detector",
    name: "Barcode detection",
    lost: "Cards reads EAN, UPC, Code 128 and Code 39 itself; other barcode types need typing. QR codes still work.",
    level: Level.APPS,
    apps: ["cards"],
    min: min("88", null, null),
    probe: () => global("BarcodeDetector"),
  },
  {
    // PRF itself is 116 / 139 / 18; WebOS asks for it through `getClientCapabilities` (133 / 135 / 17.4).
    id: "passkey-prf",
    name: "Passkey encryption (PRF)",
    lost: "Unlocking Moonrabbit with a passkey. PIN, pattern and phrase still work.",
    level: Level.APPS,
    apps: ["moonrabbit"],
    min: min("133", "139", "18"),
    probe: () => global("PublicKeyCredential") && "getClientCapabilities" in PublicKeyCredential,
  },
  {
    id: "webhid",
    name: "WebHID",
    lost: "The HID device inspector.",
    level: Level.APPS,
    apps: ["hid-lab"],
    min: min("89", null, null),
    probe: () => "hid" in navigator,
  },
  {
    id: "eyedropper",
    name: "EyeDropper",
    lost: "Picking a colour from the screen.",
    level: Level.APPS,
    apps: ["paint"],
    min: min("95", null, null),
    probe: () => global("EyeDropper"),
  },
  {
    // iOS keeps the screen awake for a home-screen web app only from 18.4.
    id: "wake-lock",
    name: "Screen Wake Lock",
    lost: "The screen may sleep while you cook, check out or transfer.",
    level: Level.COSMETIC,
    apps: ["recipe-box", "cards", "shopping-list", "p2p-transfer"],
    min: min("84", "126", "18.4"),
    probe: () => "wakeLock" in navigator,
  },
  {
    id: "webp-encode",
    name: "WebP encoding",
    lost: "Pictures are saved as larger PNG files.",
    level: Level.COSMETIC,
    apps: ["cards", "font-maker", "moonrabbit", "proposals", "warren"],
    min: min("17", "96", null),
    probe: () => canvas().toDataURL("image/webp").startsWith("data:image/webp"),
  },
  {
    id: "image-smoothing-quality",
    name: "Image smoothing quality",
    lost: "Shrunk images look rougher.",
    level: Level.COSMETIC,
    apps: ["image-editor", "image-tools", "birdseye", "video-tools", "icon-pack", "nonogram"],
    min: min("54", null, "9.1"),
    probe: () => proto("CanvasRenderingContext2D", "imageSmoothingQuality"),
  },
  {
    id: "field-sizing",
    name: "Auto-growing text boxes",
    lost: "Text boxes don't grow as you type.",
    level: Level.COSMETIC,
    apps: ["alibi", "ask", "kanban", "moonrabbit"],
    min: min("123", "152", "26.2"),
    probe: () => css("field-sizing: content"),
  },
  {
    id: "corner-shape",
    name: "Corner shapes",
    lost: "The squircle icon preview shows a circle.",
    level: Level.COSMETIC,
    apps: ["icon-pack"],
    min: min("139", null, null),
    probe: () => css("corner-shape: squircle"),
  },
  {
    id: "keyboard-map",
    name: "Keyboard map",
    lost: "Key labels for your keyboard layout.",
    level: Level.COSMETIC,
    apps: ["hid-lab"],
    min: min("69", null, null),
    probe: () => "keyboard" in navigator,
  },
  {
    id: "scrollbar-gutter",
    name: "Scrollbar gutter",
    lost: "Week columns don't line up with their headers.",
    level: Level.COSMETIC,
    apps: ["calendar"],
    min: min("94", "97", "18.2"),
    probe: () => css("scrollbar-gutter: stable"),
  },
  {
    id: "fullscreen",
    name: "Fullscreen",
    lost: "Fullscreen visuals. iPhones have none.",
    level: Level.COSMETIC,
    apps: ["music-visualizer"],
    min: min("71", "64", "16.4"),
    probe: () => proto("Element", "requestFullscreen"),
  },
  {
    // Firefox removed it in 129.
    id: "vibration",
    name: "Vibration",
    lost: "Haptic feedback on long-press and in a few apps.",
    level: Level.COSMETIC,
    apps: ["hopsprite", "image-tools", "nurikabe", "shopping-list"],
    min: min("32", null, null),
    probe: () => "vibrate" in navigator,
  },
  {
    id: "view-transitions",
    name: "View transitions",
    lost: "Window and list animations.",
    level: Level.COSMETIC,
    apps: ["shopping-list"],
    min: min("111", "144", "18"),
    probe: () => "startViewTransition" in document,
  },
  {
    id: "base-select",
    name: "Customizable select",
    lost: "Dropdowns use the browser's plain look.",
    level: Level.COSMETIC,
    min: min("135", null, "27"),
    probe: () => css("appearance: base-select"),
  },
  {
    id: "scroll-timeline",
    name: "Scroll-driven animations",
    lost: "Terminal tables don't fade at their scroll edge.",
    level: Level.COSMETIC,
    apps: ["terminal"],
    min: min("115", "159", "26"),
    probe: () => css("animation-timeline: scroll()"),
  },
  {
    id: "text-wrap",
    name: "Balanced text wrapping",
    lost: "Headings wrap less evenly.",
    level: Level.COSMETIC,
    min: min("114", "121", "17.5"),
    probe: () => css("text-wrap: balance"),
  },
  {
    // `scrollbar-width` is Safari 18.2, `scrollbar-color` 26.2.
    id: "scrollbar-styling",
    name: "Scrollbar styling",
    lost: "Scrollbars keep the browser's look.",
    level: Level.COSMETIC,
    min: min("121", "64", "26.2"),
    probe: () => css("scrollbar-color: red blue") && css("scrollbar-width: thin"),
  },
  {
    id: "content-visibility",
    name: "content-visibility",
    lost: "Long lists and hidden windows render slower.",
    level: Level.COSMETIC,
    apps: ["csv-viewer", "gw2"],
    min: min("85", "125", "18"),
    probe: () => css("content-visibility: auto"),
  },
  {
    id: "backdrop-filter",
    name: "Backdrop blur",
    lost: "No frosted-glass blur behind dialogs, docks and widgets.",
    level: Level.COSMETIC,
    min: min("76", "103", "18"),
    probe: () => css("backdrop-filter: blur(1px)"),
  },
  {
    id: "badging",
    name: "App badge",
    lost: "The missed-alarm count on the installed app's icon.",
    level: Level.COSMETIC,
    min: min("81", null, "17"),
    probe: () => "setAppBadge" in navigator,
  },
];
