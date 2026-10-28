import { ChangeKind, type Release } from "./type";

const { NEW, IMPROVED, FIXED } = ChangeKind;

/** Hand-written release notes, newest first (ADR-026). The first entry's version equals `package.json`. */
export const CHANGELOG: Release[] = [
  {
    version: "3.79.0",
    date: "2026-10-28",
    title: "A guide for every app",
    changes: [
      {
        kind: IMPROVED,
        text: "An app's guide now opens as a card over the app instead of covering the whole window; tap outside it to close it.",
      },
    ],
  },
  {
    version: "3.78.1",
    date: "2026-10-28",
    title: "Menus that stay put",
    changes: [
      {
        kind: FIXED,
        text: "Right-clicking an app in the start menu no longer closes the start menu, so adding a favourite or pinning an app leaves it open.",
      },
      {
        kind: FIXED,
        apps: ["four-walls"],
        text: "Four Walls: a full row along a wall now clears right into the corners.",
      },
    ],
  },
  {
    version: "3.78.0",
    date: "2026-10-28",
    title: "Favourites, guides and four floors",
    introduces: ["four-walls"],
    changes: [
      {
        kind: NEW,
        apps: ["app-library"],
        text: "Star the apps you use most and they get their own Favourites section at the top of the start menu and the phone's app list, in the order you drag them into, with a Favourites filter in the App Store.",
      },
      {
        kind: NEW,
        apps: ["four-walls"],
        text: "Four Walls: falling blocks on a square where every wall is a floor, each piece heading for the wall the game picks, with a daily game everyone plays with the same pieces.",
      },
      {
        kind: NEW,
        apps: ["plots"],
        text: "Every window has a ? button (or F1) that shows what the app is for and how to use it, and Plots explains its rules the first time you open it.",
      },
    ],
  },
  {
    version: "3.77.1",
    date: "2026-10-28",
    title: "No more endless loading",
    changes: [
      {
        kind: FIXED,
        text: "An app opened while WebOS was still fetching the list of every app could stay on its loading spinner until you reloaded; it now opens.",
      },
    ],
  },
  {
    version: "3.77.0",
    date: "2026-10-28",
    title: "Your own shop",
    changes: [
      {
        kind: NEW,
        apps: ["checkout-challenge"],
        text: "Checkout Challenge becomes a shop you run day after day: warm up on the keypad, type each customer's list and the total, keep your regulars' trust, stay out of jail when the police watch, hire staff, restock the shelves by code, and pick up where you left off.",
      },
    ],
  },
  {
    version: "3.76.1",
    date: "2026-10-28",
    title: "Room to type",
    changes: [
      {
        kind: IMPROVED,
        apps: ["shopping-list"],
        text: "Shopping List's add bar has one camera button that asks whether to read a photo or scan a list, so the field gets its width back on a phone.",
      },
      {
        kind: IMPROVED,
        apps: ["doc-scan"],
        text: "Scanning a page has its Retake, Cancel and Use page buttons together at the bottom.",
      },
    ],
  },
  {
    version: "3.76.0",
    date: "2026-10-28",
    title: "Achievements all round",
    changes: [
      {
        kind: NEW,
        apps: ["alibi", "unsaid", "paint", "hopsprite", "font-maker", "warren", "tape-sketch", "brackets"],
        text: "Alibi, Unsaid, Paint, Hopsprite, Font Maker, Warren, Tape Sketch and Brackets have achievements to earn: close a case, export your first font, measure a room that adds up, crown a champion and more.",
      },
      {
        kind: NEW,
        apps: [
          "blocks",
          "lunar-lander",
          "maze",
          "jigsaw",
          "tic-tac-toe",
          "color-recall",
          "crack-the-code",
          "hex-guess",
          "odd-one-out",
          "gradient-sort",
          "checkout-challenge",
        ],
        text: "Blocks, Lunar Lander, Maze, Jigsaw, Tic-Tac-Toe, Crack the Code, Checkout Challenge and the four colour games now have achievements to earn, a few of them secret.",
      },
      {
        kind: NEW,
        apps: ["sokoban", "nonogram", "kakuro", "futoshiki", "nurikabe", "hutches", "plots", "sun-and-moon", "tunnels", "word-search"],
        text: "Sokoban, Nonogram, Kakuro, Futoshiki, Nurikabe, Hutches, Plots, Sun & Moon, Tunnels and Word Search have achievements to earn, from a first solve and a daily to the biggest boards, plus a secret one each.",
      },
      {
        kind: NEW,
        apps: ["pomodoro", "tea-timer", "speed-reader", "kanban", "doc-scan", "motion-watch", "recorder"],
        text: "Pomodoro, Tea Timer, Speed Reader, Kanban, Doc Scan, Motion Watch and Recorder now have achievements, earned by finishing focus sessions, brewing tea, reading, moving cards to done, scanning pages, catching motion and making recordings.",
      },
      {
        kind: IMPROVED,
        apps: ["shopping-list"],
        text: "Shopping List can scan a list with Doc Scan, next to the camera, in the list, its menus and its widget, and has four achievements to earn, like ticking off a whole list.",
      },
      {
        kind: IMPROVED,
        text: "The update screen shows what's new in full beside the download progress, instead of a cramped list cut short.",
      },
      {
        kind: FIXED,
        apps: ["app-library"],
        text: "Doc Scan and Motion Watch show under New apps in the App Store.",
      },
    ],
  },
  {
    version: "3.75.0",
    date: "2026-10-27",
    title: "Tape Sketch, flat and turnable",
    introduces: ["doc-scan", "motion-watch"],
    changes: [
      {
        kind: NEW,
        apps: ["doc-scan"],
        text: "Doc Scan: photograph pages at any angle, and it finds each page's edges, straightens it, cleans it up in color, gray or black and white, and saves the pages as one PDF.",
      },
      {
        kind: IMPROVED,
        apps: ["shopping-list"],
        text: "Shopping List finds the paper in a photo of your list and straightens it before reading, so a list photographed at an angle reads in full.",
      },
      {
        kind: NEW,
        apps: ["minesweeper", "sudoku", "hop", "snake", "twenty-forty-eight", "solitaire", "doodlehop", "game-hub", "app-library"],
        text: "Games now have achievements: Minesweeper, Sudoku, Hop, Snake, 2048, Solitaire and Doodlehop each have some to earn, a few of them secret, shown on each app's App Store page and in Game Hub's new Trophies tab.",
      },
      {
        kind: NEW,
        apps: ["motion-watch"],
        text: "Motion Watch keeps an eye on your camera and saves a clip of every movement, starting a few seconds before it, with a notification and a timeline of the day.",
      },
      {
        kind: NEW,
        text: "Apps can keep working after you close their window: a dot on the taskbar shows what's running, Activity Monitor can stop it, and after a reload you're offered to resume it.",
      },
      {
        kind: NEW,
        apps: ["tape-sketch"],
        text: "Turn a Tape Sketch with two fingers while you zoom; it settles square near each quarter turn, the numbers stay upright, and the compass button turns it back.",
      },
      {
        kind: NEW,
        apps: ["tape-sketch"],
        text: "Tape Sketch's magnet can snap to 45°, isometric 30° lines, every 15° or angles you type, and Walk gets a direction ring to match.",
      },
      {
        kind: NEW,
        apps: ["tape-sketch"],
        text: "Turn off Check lengths on a shape you drew in 3D by hand, so Tape Sketch stops asking you to fix lengths that were never meant to close flat.",
      },
      { kind: IMPROVED, apps: ["tape-sketch"], text: "Tape Sketch's number keys give a short buzz under your thumb on phones that support it." },
      {
        kind: IMPROVED,
        apps: ["tape-sketch"],
        text: "Tape Sketch drops its 3D view and shape heights to stay simple; a height in an older sketch becomes a note on the shape's first corner.",
      },
    ],
  },
  {
    version: "3.74.3",
    date: "2026-10-27",
    title: "Paste, paste",
    changes: [{ kind: IMPROVED, apps: ["diff"], text: "After you paste into one empty side of Diff, the other side is ready for the next paste without a click." }],
  },
  {
    version: "3.74.2",
    date: "2026-10-27",
    title: "Quieter opens",
    changes: [{ kind: IMPROVED, text: "Opening an app you haven't installed no longer shows a notification about installing it." }],
  },
  {
    version: "3.74.1",
    date: "2026-10-27",
    title: "Paste, then paste again",
    changes: [
      { kind: FIXED, apps: ["diff"], text: "Diff stays at the top after you paste a text, so the other side is right there for the next paste." },
    ],
  },
  {
    version: "3.74.0",
    date: "2026-10-27",
    title: "App Store",
    changes: [
      { kind: NEW, apps: ["app-library"], text: "The App Library is now the App Store: Install an app to keep it, or just Open it without installing." },
      {
        kind: IMPROVED,
        text: "Installed apps download right away and work offline, and they update on their own, with a ring on each app's icon while it downloads.",
      },
      {
        kind: IMPROVED,
        text: "Opening a file or a link with an app you haven't installed opens it without installing it, and offers Install.",
      },
      { kind: IMPROVED, text: "WebOS starts faster: only the apps you installed load at startup." },
      { kind: IMPROVED, apps: ["app-library"], text: "The App Store shows each app's version, the release it last changed in." },
      { kind: IMPROVED, text: "The update screen shows what's new in the version it's installing." },
      {
        kind: NEW,
        apps: ["app-library"],
        text: "The App Store has a new home: featured apps, collections, your library with each app's size, and updates in one place, with Install or Open on every app.",
      },
      {
        kind: NEW,
        apps: ["app-library"],
        text: "WebOS keeps track of how long you've used each app, on this device only: the App Store shows it, sorts your library by it and turns it into goals.",
      },
      { kind: IMPROVED, text: "A fresh WebOS downloads only its core apps; Docs, Kernel and the viewers install when you want them." },
      { kind: NEW, text: "Apps update without restarting WebOS: an open app shows Update when a new version is ready." },
    ],
  },
  {
    version: "3.73.0",
    date: "2026-10-26",
    title: "Paste to open",
    changes: [
      {
        kind: NEW,
        text: "Every Open… can paste: a Paste button shows what's on the clipboard and lets you pick, and Ctrl+V while it's open pastes straight in.",
      },
      {
        kind: IMPROVED,
        text: "Files copied in Explorer paste into any Open…, and the terminal's clip ls shows what's on the clipboard.",
      },
      {
        kind: IMPROVED,
        text: "Ctrl+V works in apps straight after they open, without a click first, in a popped-out window too, and pastes files copied in Explorer.",
      },
      {
        kind: NEW,
        text: "Paste works in more apps: PDF Tools, Video Tools, Birdseye, Music Visualizer, Soundboard, Font Viewer, Metadata, Hex Viewer, Media Preview, PDF Viewer, Nonogram's From an image and the Settings wallpaper.",
      },
    ],
  },
  {
    version: "3.72.0",
    date: "2026-10-26",
    title: "The docs, as an app",
    introduces: ["docs"],
    changes: [
      {
        kind: NEW,
        apps: ["docs"],
        text: "Docs: WebOS's documentation as an app, with a live map of its services, a timeline of its decisions and every app's internals.",
      },
    ],
  },
  {
    version: "3.71.0",
    date: "2026-10-26",
    title: "Read aloud",
    changes: [
      {
        kind: NEW,
        apps: ["ask"],
        text: "Ask can read its answers aloud: turn on the speaker beside Send to hear each answer as it's written, or play any answer later.",
      },
      {
        kind: NEW,
        apps: ["settings"],
        text: "Settings has a Speech page to pick the voice and speed WebOS reads with, and try them out.",
      },
      {
        kind: NEW,
        apps: ["terminal"],
        text: "The terminal can read text and Markdown files aloud with say, and speech stop quiets it.",
      },
    ],
  },
  {
    version: "3.70.1",
    date: "2026-10-26",
    title: "Portfolio, always fresh",
    changes: [
      {
        kind: FIXED,
        text: "The Portfolio link always opens the latest version, instead of saying the link can't open right after an update.",
      },
    ],
  },
  {
    version: "3.70.0",
    date: "2026-10-26",
    title: "Colour, packaged",
    introduces: ["color-tools", "colour-atlas"],
    changes: [
      {
        kind: NEW,
        apps: ["color-tools"],
        text: "Color Tools: pick a colour from the screen, a photo or the camera, see it in 70 colour models, check text contrast, preview it with colour blindness, build harmonies and save palettes as files.",
      },
      {
        kind: NEW,
        apps: ["colour-atlas"],
        text: "Colour Atlas: match a colour with the sliders of a different colour model each round, from HSL to CAM16, in a daily run of five, and collect all 70 models in an atlas.",
      },
      {
        kind: IMPROVED,
        apps: ["color-recall", "odd-one-out", "gradient-sort", "hex-guess"],
        text: "Color Recall, Odd One Out, Gradient Sort and Hex Guess are now apps of their own instead of modes of Color Games, with the same daily puzzles, and old Color Games links, pins, shortcuts and saved windows still open the right game.",
      },
      {
        kind: IMPROVED,
        text: "The Portfolio gets an npm packages section under the featured projects, with the chromatics colour library beside the other packages, and In progress moves to the end.",
      },
    ],
  },
  {
    version: "3.69.1",
    date: "2026-10-25",
    title: "Hold to rearrange",
    changes: [
      {
        kind: IMPROVED,
        text: "On phones, hold anything on the home screen and it starts to jiggle: keep your finger down to drag it to a new spot, tap the minus to remove it, or tap it for more options. Tap Done or empty space when you're finished.",
      },
      {
        kind: IMPROVED,
        text: "While rearranging, the other items slide aside to show where the dragged one will land, the list scrolls when you reach its edge, and widgets get a handle on their corner to change their height.",
      },
      {
        kind: FIXED,
        text: "Holding and dragging home screen items works on Samsung Internet, where the page used to scroll instead.",
      },
    ],
  },
  {
    version: "3.69.0",
    date: "2026-10-25",
    title: "A list for a home",
    changes: [
      {
        kind: NEW,
        text: "On phones the home screen is now a simple list: the time, your recent apps, then your pinned apps and widgets, with All apps at the end to open the App Library.",
      },
      {
        kind: NEW,
        text: "Slide a finger down the letters on the right to see the apps under each one; slide left onto an app and let go to open it, or let go on the letters to see every app around that spot.",
      },
      {
        kind: IMPROVED,
        text: "The full app list on phones has a filter at the top, and Back or Home closes it.",
      },
      {
        kind: IMPROVED,
        text: "Apps you had in the phone dock now sit at the end of your home list.",
      },
      {
        kind: IMPROVED,
        text: "Usage stats now load only after you allow them; until then, and after No thanks, nothing is sent.",
      },
    ],
  },
  {
    version: "3.68.0",
    date: "2026-10-25",
    title: "Counting what gets opened",
    changes: [
      {
        kind: NEW,
        text: "WebOS can share which apps you open, anonymously, if you allow it; change your answer any time in Settings.",
      },
    ],
  },
  {
    version: "3.67.0",
    date: "2026-10-25",
    title: "Up a dimension",
    changes: [
      {
        kind: IMPROVED,
        apps: ["tape-sketch"],
        text: "Tape Sketch draws your measurements in 3D: give any shape a height and turn it around to check it, tapping a line to measure it; the box is gone.",
      },
      {
        kind: FIXED,
        apps: ["tea-timer"],
        text: "Pressing Brew in Tea Timer now shows the new cup and counts down on the tea itself, and the temperature unit no longer wraps onto its own line.",
      },
    ],
  },
  {
    version: "3.66.0",
    date: "2026-10-25",
    title: "The repo behind every session",
    changes: [
      {
        kind: NEW,
        apps: ["portfolio"],
        text: "Portfolio shows hq, the private repo behind every coding session: quests, past fixes, code style rules and the skills that tie them together.",
      },
    ],
  },
  {
    version: "3.65.0",
    date: "2026-10-25",
    title: "Time for tea",
    introduces: ["tea-timer", "tape-sketch"],
    changes: [
      {
        kind: NEW,
        apps: ["tea-timer"],
        text: "Tea Timer knows the right water temperature and steeping time for the common teas: pick a strength, brew several cups at once, and it rings when each is ready and offers the next steep for teas that brew again.",
      },
      {
        kind: NEW,
        apps: ["tape-sketch"],
        text: "Tape Sketch is for measuring around the house: tap the corners of a room, a drawer or a fence, type each length on a big numpad, and it tells you when the numbers don't add up, with area and perimeter for closed shapes.",
      },
      {
        kind: IMPROVED,
        apps: ["portfolio"],
        text: "Portfolio's How I build has a new principle about testing on real browsers and phones, shown in WebOS, Petrace and chrome-safe-inset.",
      },
      {
        kind: IMPROVED,
        text: "A shared app link that can't open now checks for a newer WebOS and offers the update when the link needs it.",
      },
    ],
  },
  {
    version: "3.64.0",
    date: "2026-10-25",
    title: "Open for business",
    introduces: ["checkout-challenge"],
    changes: [
      {
        kind: NEW,
        apps: ["checkout-challenge"],
        text: "Checkout Challenge turns number typing into running a little shop: scan each customer's items, type the total exactly, and keep your customers smiling for a minute-long day.",
      },
    ],
  },
  {
    version: "3.63.0",
    date: "2026-10-25",
    title: "Meet the maker",
    introduces: ["portfolio"],
    changes: [
      {
        kind: NEW,
        apps: ["portfolio"],
        text: "Portfolio introduces the person behind WebOS: a terminal tours their work, projects, how they build and how to get in touch, and you can take over by typing at any point.",
      },
      {
        kind: NEW,
        apps: ["portfolio"],
        text: "Type whoami in the Terminal to see who made WebOS.",
      },
    ],
  },
  {
    version: "3.62.0",
    date: "2026-10-24",
    title: "Sorted lists and theme shades",
    changes: [
      {
        kind: NEW,
        text: "Shopping List sorts items by when they were added or by name, and the item editor shows when an item was added.",
      },
      {
        kind: IMPROVED,
        text: "When an app doesn't load, its window says why in plain words and offers Try again, Reload WebOS or Close, with the technical error tucked under Details.",
      },
      {
        kind: FIXED,
        text: "Near-white themes keep their lighter panels lighter, and pure-black themes tell menus, cards and the taskbar apart from the background.",
      },
      {
        kind: FIXED,
        text: "Themes with dark text on a coloured background, like Red & Black, get light scrollbars and pickers to match.",
      },
    ],
  },
  {
    version: "3.61.0",
    date: "2026-10-24",
    title: "Icons right away",
    changes: [
      {
        kind: IMPROVED,
        text: "App icons and descriptions are there the moment WebOS opens, with no grey squares while they load.",
      },
      {
        kind: FIXED,
        text: "The browser check no longer tells you to update when your browser leaves a feature out on your system, like barcode reading in Chrome on Windows; it says it isn't available there.",
      },
    ],
  },
  {
    version: "3.60.1",
    date: "2026-10-23",
    title: "More browsers",
    changes: [
      {
        kind: FIXED,
        text: "WebOS starts in Safari on the Mac, iPhone and iPad instead of stopping at the loading screen.",
      },
      {
        kind: FIXED,
        text: "Save to disk… works in Firefox and Safari too: a file lands in your downloads. A folder needs a browser with a folder picker, so compress it first there.",
      },
      {
        kind: FIXED,
        apps: ["image-editor"],
        text: "Image Editor keeps brightness, contrast, saturation and the other adjustments in images saved from Safari.",
      },
      {
        kind: FIXED,
        apps: ["cards"],
        text: "Cards scans EAN, UPC, Code 128 and Code 39 barcodes in browsers that can't read them on their own, like Firefox, Safari and Chrome on Windows.",
      },
      {
        kind: FIXED,
        apps: ["birdseye", "image-tools"],
        text: "Birdseye's blurred edges and the soft edge of Image Tools' patches show in Safari too.",
      },
      {
        kind: FIXED,
        apps: ["gif-player", "hopsprite"],
        text: "Where a browser can't step through a GIF's frames, GIF Player says so and Hopsprite imports the first frame instead of failing.",
      },
      {
        kind: FIXED,
        apps: ["paint", "doodlehop", "moonrabbit", "proposals", "font-maker"],
        text: "Drawing in Paint and Doodlehop, dropping a picture into Moonrabbit or Proposals, and picking a letter pair in Font Maker work in older Safari.",
      },
      {
        kind: FIXED,
        apps: ["moonrabbit"],
        text: "Moonrabbit photos added in Safari keep their real picture type, so exported journals show them everywhere.",
      },
      {
        kind: FIXED,
        apps: ["p2p-transfer"],
        text: "P2P Transfer shows Share only where the browser can share, instead of a button that fails.",
      },
    ],
  },
  {
    version: "3.60.0",
    date: "2026-10-23",
    title: "Browser check",
    changes: [
      {
        kind: NEW,
        text: "WebOS now tells you at start-up which features won't work in your browser, and Settings › About shows the full list.",
      },
    ],
  },
  {
    version: "3.59.0",
    date: "2026-10-22",
    title: "Lighter start",
    changes: [
      {
        kind: IMPROVED,
        text: "WebOS starts a little faster: app icons now load only when they're shown.",
      },
    ],
  },
  {
    version: "3.58.0",
    date: "2026-10-22",
    title: "Updates in seconds",
    changes: [
      {
        kind: IMPROVED,
        text: "Updates now finish in seconds: apps load when you open them, and you choose which ones stay ready without a connection in Settings › Offline.",
      },
    ],
  },
  {
    version: "3.57.0",
    date: "2026-10-22",
    title: "Swipe to cancel",
    changes: [
      {
        kind: IMPROVED,
        text: "On a phone, swiping a question like \"Delete this?\" or \"Save changes?\" down now cancels it, the same as tapping Cancel.",
      },
      {
        kind: FIXED,
        apps: ["calendar"],
        text: "Calendar reminders ahead of events late in the month or on 29 February, like a day before rent on the 31st, now work instead of being refused.",
      },
    ],
  },
  {
    version: "3.56.0",
    date: "2026-10-22",
    title: "Fit under a size, convert to anything",
    changes: [
      {
        kind: NEW,
        apps: ["image-tools"],
        text: "Image Tools can make a copy of a picture that fits under an upload limit, like 1 MB, lowering the quality first and shrinking it only when it has to.",
      },
      {
        kind: NEW,
        apps: ["image-tools"],
        text: "Image Tools can convert a picture to every format at once, from PNG, JPEG, WebP, AVIF and JPEG XL to GIF, BMP, ICO, TIFF, QOI, TGA and PPM, and save any of them or all as a zip.",
      },
    ],
  },
  {
    version: "3.55.2",
    date: "2026-10-22",
    title: "Fresher fonts, smoother updates",
    changes: [
      {
        kind: FIXED,
        text: "Fixes to the built-in Burrow font now reach a WebOS that already downloaded it, and updating after WebOS updated itself in the background no longer downloads everything again.",
      },
    ],
  },
  {
    version: "3.55.1",
    date: "2026-10-22",
    title: "Cleaner uninstalls",
    changes: [
      {
        kind: FIXED,
        apps: ["moonrabbit"],
        text: "Uninstalling Moonrabbit with its data now also forgets this device's quick unlock; your journals stay and still open with the phrase.",
      },
      {
        kind: IMPROVED,
        apps: ["moonrabbit"],
        text: "The last step of deleting a journal has a red button, so it's clear there's no way back.",
      },
    ],
  },
  {
    version: "3.55.0",
    date: "2026-10-22",
    title: "See the build pipeline",
    changes: [
      {
        kind: NEW,
        text: "Settings › About shows the latest build run on GitHub with each of its steps, live while it runs, and whether it's the build you're on; the ci status command lists the same steps.",
      },
    ],
  },
  {
    version: "3.54.0",
    date: "2026-10-22",
    title: "Review your writing in Warren",
    changes: [
      {
        kind: NEW,
        apps: ["warren"],
        text: "Warren keeps earlier versions of a saved document as you work: look through them, compare one with what you have now, and bring it back with one click that Undo can take back.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "Switch on Warren's spelling list to see every misspelt word with how often it appears, jump to it, pick a suggestion, ignore it or add it to your own dictionary.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "Comment on any text in Warren, then resolve, reopen or delete comments from the side list; they go along when you export for Word.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "On a desktop with Chrome's built-in AI, Warren can rewrite a selection shorter, clearer, friendlier or more formal, or summarise it, right on your device.",
      },
      {
        kind: IMPROVED,
        apps: ["warren"],
        text: "Warren's toolbar buttons are easier to tap on a phone, and the / menu stays inside the window and never hides the line you're typing.",
      },
    ],
  },
  {
    version: "3.53.0",
    date: "2026-10-22",
    title: "Write faster in Warren",
    changes: [
      {
        kind: NEW,
        apps: ["warren"],
        text: "Warren turns Markdown into formatting as you type: # for headings, - or 1. for lists, [] for a checklist, > for a quote, --- for a line, and **bold**, *italic* and ~~strikethrough~~.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "Open Markdown files in Warren from Open with, and export any document as Markdown, tables and pictures included.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "Type / in Warren to pick a heading, list, table, picture, page break or template from a menu.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "Focus mode in Warren hides the tools, dims everything but the paragraph you're writing and keeps your line in the middle of the screen.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "Show ¶ marks in Warren to see spaces, line breaks and paragraph ends; they never print.",
      },
    ],
  },
  {
    version: "3.52.0",
    date: "2026-10-22",
    title: "Search apps in your own words",
    changes: [
      {
        kind: IMPROVED,
        text: "Search for apps in your own words, like \"tool to make pixel art\": the start menu, the app drawer and the App Library now show related apps below the exact matches.",
      },
      {
        kind: IMPROVED,
        text: "With Chrome's on-device AI, a sentence typed into the start menu or the App Library also gets a few apps the AI suggests, worked out on your device.",
      },
      {
        kind: IMPROVED,
        apps: ["app-library"],
        text: "The App Library keeps the best matches first while you search, instead of sorting them by name.",
      },
      {
        kind: IMPROVED,
        apps: ["terminal", "ask"],
        text: "Type app find and what you want to do in the Terminal to find an app for it, and Ask can answer which app does something.",
      },
    ],
  },
  {
    version: "3.51.0",
    date: "2026-10-22",
    title: "Tables, styles and colour in Warren",
    changes: [
      {
        kind: NEW,
        apps: ["warren"],
        text: "Warren has tables: pick a size, add and remove rows and columns, merge cells, make a header row, drag column borders, hide the borders for a layout, and paste tab-separated text as a table; they come through in Word files both ways and in PDFs.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "A new two-column CV template in Warren puts your contact details and skills beside your experience.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "Warren documents have their own styles for Normal text, Title, Headings and Quote, with size, spacing, line height, colour, alignment and font, saved with the document and carried into Word and PDF.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "Colour text and highlight it in Warren with a swatch or any colour you pick.",
      },
    ],
  },
  {
    version: "3.50.0",
    date: "2026-10-22",
    title: "Journals your way",
    changes: [
      {
        kind: IMPROVED,
        apps: ["moonrabbit"],
        text: "Moonrabbit offers a fingerprint, a hop path or a PIN right after you make a journal or open it with the phrase, so you don't have to type the phrase every time.",
      },
      {
        kind: NEW,
        apps: ["moonrabbit"],
        text: "Rename or delete a Moonrabbit journal from its settings, or straight from the locked screen if you've lost the phrase.",
      },
    ],
  },
  {
    version: "3.49.0",
    date: "2026-10-22",
    title: "More daily puzzles",
    introduces: ["plots"],
    changes: [
      {
        kind: NEW,
        apps: ["plots"],
        text: "Plots, a daily garden puzzle: drag rectangles to split the grid into plots, each holding one clue that gives its size or shape, with hints when you're stuck.",
      },
      {
        kind: NEW,
        apps: ["sudoku", "game-hub"],
        text: "Sudoku comes in a quick 6×6 size with 2×3 boxes and digits 1 to 6, at every difficulty and with its own daily puzzle in Game Hub.",
      },
    ],
  },
  {
    version: "3.48.0",
    date: "2026-10-22",
    title: "A locked journal",
    introduces: ["moonrabbit"],
    changes: [
      {
        kind: NEW,
        apps: ["moonrabbit"],
        text: "Moonrabbit is a journal encrypted on your device: write a line in seconds, add photos and templates, and unlock it with a passphrase, a passkey, a hop through the carrot patch or a PIN.",
      },
      {
        kind: NEW,
        apps: ["moonrabbit"],
        text: "Tap how you feel in Moonrabbit, add activities, energy and sleep, and see it all as a calendar, a year in pixels, a chart over weeks and which activities go with your better days.",
      },
      {
        kind: NEW,
        apps: ["moonrabbit"],
        text: "Add a line or a mood to Moonrabbit without unlocking it, from its widget or the locked screen; it stays sealed until you open the journal.",
      },
      {
        kind: NEW,
        apps: ["moonrabbit"],
        text: "Headings, lists, bold and italic show as you type in Moonrabbit, and On This Day brings back what you wrote on this date before.",
      },
    ],
  },
  {
    version: "3.47.0",
    date: "2026-10-22",
    title: "Swipe sheets away",
    changes: [
      {
        kind: IMPROVED,
        text: "On phones every sheet that slides up, from menus and questions to file pickers, app panels and game statistics, now swipes back down to close, and questions sit at the bottom of the screen within reach of your thumb.",
      },
    ],
  },
  {
    version: "3.46.0",
    date: "2026-10-22",
    title: "Warren writes CVs",
    changes: [
      {
        kind: NEW,
        apps: ["warren"],
        text: "Warren can start a document from a template, a CV, cover letter, letter or report, and save your own documents as templates in the new Templates folder.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "Warren takes pictures: paste, drop, pick or snap one, then size, align and describe it, and it goes along into Word and PDF, and comes in with Word files you open.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "Warren's page setup has margins, landscape pages, page numbers and headers and footers with their own formatting, a logo and page fields, on every page and in every export.",
      },
    ],
  },
  {
    version: "3.45.0",
    date: "2026-10-21",
    title: "A tidier sound editor",
    changes: [
      {
        kind: IMPROVED,
        apps: ["soundboard"],
        text: "Soundboard's sound editor is tidier on phones: zoom sits above the sound, the fine-tune arrows and length below it, and Play, Keep, Delete and Undo share one row, with the tips behind an info button.",
      },
    ],
  },
  {
    version: "3.44.0",
    date: "2026-10-21",
    title: "Daily puzzles",
    introduces: ["hutches", "sun-and-moon", "hop", "tunnels"],
    changes: [
      {
        kind: NEW,
        apps: ["hutches"],
        text: "Hutches is a new daily logic puzzle: place one rabbit per row, column and meadow without two rabbits touching, with hints that explain the next step.",
      },
      {
        kind: NEW,
        apps: ["sun-and-moon"],
        text: "Sun & Moon, a daily logic puzzle: fill the grid with suns and moons, half of each in every row and column, never three alike in a row, and every = and × obeyed, with hints that tell you why.",
      },
      {
        kind: NEW,
        apps: ["tunnels"],
        text: "Tunnels is a new daily word puzzle: trace the hidden words that wind through a grid of letters until every letter belongs to one.",
      },
      {
        kind: NEW,
        apps: ["hop"],
        text: "Hop, a daily path puzzle: draw one line through the numbers in order that fills every cell of the grid, with walls to work around and hints when you're stuck.",
      },
    ],
  },
  {
    version: "3.43.0",
    date: "2026-10-21",
    title: "Warren gets polished",
    changes: [
      {
        kind: NEW,
        apps: ["warren"],
        text: "Warren adds strikethrough, subscript, superscript and clear formatting, horizontal lines, checklists, an outline of your headings to jump around, reading time, selection counts and a word goal per document.",
      },
      {
        kind: NEW,
        apps: ["warren"],
        text: "Warren turns straight quotes into curly ones, -- into a dash and ... into an ellipsis as you type (switch it off in the Text tools), and its spelling underline follows your theme.",
      },
    ],
  },
  {
    version: "3.42.0",
    date: "2026-10-21",
    title: "Quieter in the background",
    changes: [
      {
        kind: IMPROVED,
        text: "WebOS does less in the background when you have no alarms, timers or reminders set, and no longer reports an error when it can't check for updates while you're offline.",
      },
      {
        kind: FIXED,
        text: "A WebOS copy without some apps no longer suggests them: the introduction, the sample files and Getting started only mention apps that are actually there.",
      },
    ],
  },
  {
    version: "3.41.0",
    date: "2026-10-21",
    title: "Zoom in on your sounds",
    changes: [
      {
        kind: IMPROVED,
        text: "Soundboard's sound editor can keep just your selection and drop everything around it, and zooms in like an audio editor: buttons, pinch or Ctrl+scroll, with a time ruler, to trim to the millisecond.",
      },
      {
        kind: IMPROVED,
        text: "Trim points in Soundboard are thin lines you move by tabs below the sound, so your finger never hides the spot, with arrow buttons to nudge them precisely.",
      },
      {
        kind: FIXED,
        text: "Cutting a part out of a Soundboard sound no longer keeps a sliver of sound past the end you trimmed to, and the trim tabs stay on their lines at the very start and end.",
      },
    ],
  },
  {
    version: "3.40.0",
    date: "2026-10-21",
    title: "Soundboard pads from videos",
    changes: [
      {
        kind: NEW,
        text: "Soundboard takes videos: pick the part you want while the picture follows the trim handles, and it becomes a pad.",
      },
    ],
  },
  {
    version: "3.39.0",
    date: "2026-10-21",
    title: "Calendar reminders, always on time",
    changes: [
      {
        kind: IMPROVED,
        text: "Calendar reminders now arrive with Calendar closed and no widget on the desktop, as long as WebOS is open in a tab, and clicking one opens Calendar on that event's day.",
      },
    ],
  },
  {
    version: "3.38.0",
    date: "2026-10-21",
    title: "Pomodoro keeps going",
    changes: [
      {
        kind: IMPROVED,
        text: "Pomodoro counts a finished focus and starts the next phase by itself even with Pomodoro closed, so an automatic break still tells you when it's over.",
      },
      {
        kind: IMPROVED,
        text: "Pomodoro's Sound switch is back: phase ends chime only when it's on, and a button lets you hear the chime first.",
      },
    ],
  },
  {
    version: "3.37.0",
    date: "2026-10-21",
    title: "Settings, easier to find your way",
    changes: [
      {
        kind: IMPROVED,
        text: "Settings is split into smaller pages, grouped in the sidebar: Appearance became Theme, Wallpaper and Text & interface, and creating a theme or editing its colours each get a page of their own.",
      },
      {
        kind: IMPROVED,
        text: "Search Settings by name: pick a result and Settings opens the page and points at the setting. Type settings and a setting's name in the command palette or Terminal to jump straight there.",
      },
      {
        kind: IMPROVED,
        text: "On phones and in narrow windows, Settings, the Style Guide and Activity Monitor show a list of pages first and open one at a time, with Back to return.",
      },
      {
        kind: IMPROVED,
        text: "Reset settings moved to Backup & reset and asks before it resets, saved themes have a menu button for rename, export and delete, and the desktop's Change wallpaper opens the Wallpaper page.",
      },
    ],
  },
  {
    version: "3.36.0",
    date: "2026-10-21",
    title: "Warren, finished",
    changes: [
      {
        kind: NEW,
        text: "Warren opens Word files: a .docx comes in as a new document with its headings, lists and bold, italic and underlined text, and tells you what it had to leave out.",
      },
      {
        kind: NEW,
        text: "Warren documents can have links, kept when you paste and in Word and PDF exports, and one font for the whole document: Inter, Burrow or any font you added in Settings.",
      },
      {
        kind: NEW,
        text: "Warren has find and replace: press Ctrl+F (Cmd+F on a Mac) to step through every match and replace one or all of them.",
      },
      {
        kind: IMPROVED,
        text: "Warren can align paragraphs left, centre, right or justified, and has an underline button; Word and PDF exports keep both.",
      },
    ],
  },
  {
    version: "3.35.0",
    date: "2026-10-21",
    title: "Pomodoro on its own",
    changes: [
      {
        kind: IMPROVED,
        text: "Pomodoro tells you a focus or break is over even with its window closed, with Start and Skip right on the notification, and a phase that ended while WebOS was closed waits paused with the time it ended.",
      },
      {
        kind: IMPROVED,
        text: "Alarms, timers and Pomodoro phases chime in WebOS even with their app closed, once you've clicked anywhere on the page.",
      },
    ],
  },
  {
    version: "3.34.0",
    date: "2026-10-21",
    title: "A mark for AI apps",
    changes: [
      {
        kind: IMPROVED,
        text: "Apps that need on-device AI show a sparkle on their icon.",
      },
    ],
  },
  {
    version: "3.33.1",
    date: "2026-10-21",
    title: "Tidier start",
    changes: [
      {
        kind: FIXED,
        text: "The loading screen says \"Alarms\" while it sets up alarms and reminders, instead of an internal name.",
      },
    ],
  },
  {
    version: "3.33.0",
    date: "2026-10-21",
    title: "Alarms that ring on their own",
    changes: [
      {
        kind: IMPROVED,
        text: "Clock alarms and timers, and Recipe Box timers, ring even with their window closed.",
      },
    ],
  },
  {
    version: "3.32.1",
    date: "2026-10-21",
    title: "Updates found at start",
    changes: [
      {
        kind: FIXED,
        text: "WebOS checks for a new version as soon as it starts, instead of waiting until you switch back to its tab or half an hour passes.",
      },
    ],
  },
  {
    version: "3.32.0",
    date: "2026-10-21",
    title: "Notifications that reach you",
    changes: [
      {
        kind: NEW,
        text: "Settings has a Notifications page that shows whether WebOS may notify you, asks for it, and sends a test, and the Terminal can list and cancel everything scheduled with sched ls and sched rm.",
      },
      {
        kind: FIXED,
        text: "System notifications now show on Android, with their buttons, and clicking one brings you back to WebOS.",
      },
    ],
  },
  {
    version: "3.31.0",
    date: "2026-10-21",
    title: "Italics per weight and kerning",
    changes: [
      {
        kind: NEW,
        text: "Font Maker kerns your font: letter pairs like AV and To move closer on their own, and tapping between two letters in the preview lets you nudge that pair yourself.",
      },
      {
        kind: IMPROVED,
        text: "Font Maker lets you redraw a letter for each italic face, Light Italic and Bold Italic included, and lists every face in the drawing picker.",
      },
      {
        kind: IMPROVED,
        text: "Burrow's light and bold italic a now sits on the same line as the letters around it.",
      },
    ],
  },
  {
    version: "3.30.0",
    date: "2026-10-21",
    title: "Doodlehop",
    changes: [
      {
        kind: NEW,
        text: "Doodlehop: draw six words against the clock while the AI on your computer guesses what you drew, then keep your favourite drawings as pictures.",
      },
    ],
  },
  {
    version: "3.29.0",
    date: "2026-10-21",
    title: "Alibi",
    changes: [
      {
        kind: NEW,
        text: "Alibi: question a suspect played by the AI on your computer in your own words, then catch the one statement the evidence breaks.",
      },
    ],
  },
  {
    version: "3.28.0",
    date: "2026-10-21",
    title: "Unsaid",
    changes: [
      {
        kind: NEW,
        text: "Unsaid: describe a word without saying any of its five banned words, and AI running on your computer tries to guess it in as few clues as you can manage.",
      },
    ],
  },
  {
    version: "3.27.3",
    date: "2026-10-21",
    title: "Search apps right away on phones",
    changes: [
      {
        kind: FIXED,
        text: "On a phone, opening the app drawer puts you straight in its search field with the keyboard up, so you can type an app's name without tapping the field first.",
      },
    ],
  },
  {
    version: "3.27.2",
    date: "2026-10-21",
    title: "Clearer bold ordinals",
    changes: [
      {
        kind: FIXED,
        text: "Burrow's bold ª and º no longer run into their underline.",
      },
    ],
  },
  {
    version: "3.27.1",
    date: "2026-10-21",
    title: "Smoother new-app card",
    changes: [
      {
        kind: FIXED,
        text: "The card that shows new apps after an update opens at its full size instead of jumping when its feature list loads.",
      },
    ],
  },
  {
    version: "3.27.0",
    date: "2026-10-21",
    title: "Burrow",
    changes: [
      {
        kind: NEW,
        text: "Pick the font WebOS uses for text and for code in Settings › Appearance, including Burrow, a rounded font made for WebOS in Font Maker, or any font file you have.",
      },
      {
        kind: NEW,
        text: "Font Maker makes whole families: light, bold and italic from one drawing, letters redrawn per weight, and exports as a font family, single faces or a variable font, or straight into WebOS as its font.",
      },
    ],
  },
  {
    version: "3.26.1",
    date: "2026-10-21",
    title: "Lighter updates",
    changes: [
      {
        kind: FIXED,
        text: "Updates download only the files that changed: a change to WebOS itself used to fetch almost every app again, now it's a handful of files.",
      },
    ],
  },
  {
    version: "3.26.0",
    date: "2026-10-21",
    title: "Warren",
    introduces: ["warren"],
    changes: [
      {
        kind: NEW,
        apps: ["warren"],
        text: "Warren is a word processor for CVs, letters and stories: headings, lists and page breaks on real pages, word counts always in view, one click to change a word everywhere, and Word or PDF when you're done.",
      },
    ],
  },
  {
    version: "3.25.0",
    date: "2026-10-21",
    title: "Files by light",
    changes: [
      {
        kind: NEW,
        text: "P2P Transfer can send a file of up to 2 MB with no network at all: one phone flashes a stream of codes, the other films it, and missed codes only cost a little time.",
      },
    ],
  },
  {
    version: "3.24.0",
    date: "2026-10-21",
    title: "Dodge this",
    changes: [
      {
        kind: NEW,
        text: "The Pew Pew wallpaper has a Dodge mode: a clock in the corner counts how long your cursor goes without being hit, starts over on a hit, and keeps your best time.",
      },
    ],
  },
  {
    version: "3.23.0",
    date: "2026-10-21",
    title: "Battle scars",
    changes: [
      {
        kind: NEW,
        text: "The Pew Pew wallpaper can chip bites out of your windows and widgets where its lasers hit, and Repair everything in its settings mends them.",
      },
    ],
  },
  {
    version: "3.22.0",
    date: "2026-10-21",
    title: "Pitch it",
    changes: [{ kind: NEW, apps: ["settings"], text: "Settings › About has \"Propose an app\", which opens a guided GitHub form with room for sketches and screenshots." }],
  },
  {
    version: "3.21.0",
    date: "2026-10-21",
    title: "Lighter updates",
    changes: [
      {
        kind: IMPROVED,
        text: "Updates download much less: a change to one app now fetches a few hundred kilobytes instead of more than 5 MB, so the update screen is over sooner.",
      },
    ],
  },
  {
    version: "3.20.1",
    date: "2026-10-21",
    title: "True to the pen",
    changes: [{ kind: FIXED, apps: ["font-maker"], text: "Font Maker's letter thumbnails show your strokes' thick and thin parts, the same as the drawing box." }],
  },
  {
    version: "3.20.0",
    date: "2026-10-21",
    title: "Updates you can watch",
    changes: [
      {
        kind: IMPROVED,
        text: "The update screen shows how many files are left and how long it has taken, and when a download drags on you can restart into the new version right away.",
      },
    ],
  },
  {
    version: "3.19.0",
    date: "2026-10-21",
    title: "Pen feel",
    changes: [
      {
        kind: IMPROVED,
        apps: ["font-maker"],
        text: "Font Maker lets you set the line width, thins mouse and finger lines when you draw fast, hides the spacing edges until you want them, and adds an Undo button, two-finger tap to undo, a strip of letters to jump between and a faint letter to trace.",
      },
    ],
  },
  {
    version: "3.18.2",
    date: "2026-10-21",
    title: "Clear edges",
    changes: [{ kind: FIXED, apps: ["clock"], text: "Clock cards stand out from the page in light themes, with readable titles and times." }],
  },
  {
    version: "3.18.1",
    date: "2026-10-21",
    title: "Pencil in",
    changes: [{ kind: FIXED, apps: ["clock"], text: "Clock timer cards show a pencil, so it's clear the name can be changed." }],
  },
  {
    version: "3.18.0",
    date: "2026-10-21",
    title: "Name it",
    changes: [{ kind: IMPROVED, apps: ["clock"], text: "Clock timers can be renamed right on their card, so Dinner and Medication stay apart." }],
  },
  {
    version: "3.17.0",
    date: "2026-10-21",
    title: "Proposals",
    introduces: ["proposals"],
    changes: [
      {
        kind: NEW,
        apps: ["proposals"],
        text: "Proposals keeps your app ideas in one notebook that walks you through the pitch, with screenshots, photos and quick sketches right inside the text, ready to send as one file.",
      },
    ],
  },
  {
    version: "3.16.1",
    date: "2026-10-21",
    title: "Sparks on top",
    changes: [{ kind: IMPROVED, text: "Pew Pew's sparks show on top of windows and widgets when the lasers hit them." }],
  },
  {
    version: "3.16.0",
    date: "2026-10-21",
    title: "All at once",
    changes: [
      { kind: NEW, apps: ["clock"], text: "Clock shows your timers, stopwatch and next alarm together on a new All tab, and its widget lists everything that's running." },
    ],
  },
  {
    version: "3.15.3",
    date: "2026-10-21",
    title: "Eyes on the bird",
    changes: [
      { kind: IMPROVED, apps: ["birdseye"], text: "Birdseye keeps hold of fast, shape-changing subjects like a flapping bird, and finds them again after a miss." },
    ],
  },
  {
    version: "3.15.2",
    date: "2026-10-21",
    title: "Take cover",
    changes: [{ kind: IMPROVED, text: "Pew Pew: windows and widgets shield your cursor, and the lasers hit them instead." }],
  },
  {
    version: "3.15.1",
    date: "2026-10-21",
    title: "Fits your phone",
    changes: [
      { kind: FIXED, apps: ["font-maker"], text: "Font Maker fits a phone screen instead of running off the right edge, and the scan screen keeps its title readable." },
      { kind: FIXED, text: "Crop and box handles are smaller, so small subjects stay visible." },
      { kind: IMPROVED, apps: ["font-maker"], text: "Font Maker on a phone: guide labels no longer cut off, bigger width handles, and the screen doesn't jump after your first stroke." },
    ],
  },
  {
    version: "3.15.0",
    date: "2026-10-21",
    title: "Widgets your way",
    changes: [
      { kind: NEW, text: "Widgets come as a Card, Glass or Clear, which leaves just the content on your wallpaper: right-click a widget, or hold it on a phone, and pick Style." },
    ],
  },
  {
    version: "3.14.0",
    date: "2026-10-21",
    title: "Pew pew",
    changes: [
      { kind: NEW, text: "Live wallpapers on the desktop, starting with Pew Pew, LaxDOTexe's idea: the grid's dots become tiny turrets firing lasers at your cursor, with windows as shields or a Follow mode, three paces and optional sound in Settings › Appearance." },
    ],
  },
  {
    version: "3.13.0",
    date: "2026-10-21",
    title: "Keep the bird still",
    introduces: ["birdseye"],
    changes: [
      { kind: NEW, apps: ["birdseye"], text: "Birdseye: box a moving subject in a video, like a bird in flight, and it stays still in the middle while the world moves around it; save it as a new video." },
    ],
  },
  {
    version: "3.12.0",
    date: "2026-10-21",
    title: "Recent apps",
    changes: [
      { kind: NEW, text: "The start menu and the app drawer show the apps you opened lately at the top: scroll or swipe for more, and right-click or hold one to clear them." },
      { kind: NEW, apps: ["settings"], text: "Settings › About has Request a feature and Report a bug, which open a ready-to-fill issue on GitHub." },
    ],
  },
  {
    version: "3.11.0",
    date: "2026-10-20",
    title: "Pads your way",
    changes: [
      { kind: NEW, apps: ["soundboard"], text: "Soundboard trims sounds: drag the ends or cut a part out of the middle, and the original stays as it was." },
      { kind: IMPROVED, apps: ["soundboard"], text: "Soundboard pads can show a picture and take any colour you pick." },
    ],
  },
  {
    version: "3.10.0",
    date: "2026-10-20",
    title: "Lax wrote it by hand",
    introduces: ["font-maker"],
    changes: [
      {
        kind: NEW,
        apps: ["font-maker"],
        text: "Font Maker turns your handwriting into a font: draw each letter in its box or scan a filled-in sheet, then export a TrueType font.",
      },
    ],
  },
  {
    version: "3.9.1",
    date: "2026-10-20",
    title: "Tall videos fit",
    changes: [{ kind: FIXED, apps: ["media-preview"], text: "Media Preview fits tall videos inside the window instead of cutting off the bottom." }],
  },
  {
    version: "3.9.0",
    date: "2026-10-20",
    title: "Lax asked again",
    changes: [
      { kind: NEW, apps: ["ask"], text: "Ask answers questions about your apps, like \"what's on my shopping list?\": choose what it may read, and it looks there before answering. It only reads." },
      { kind: NEW, apps: ["ask"], text: "Ask shows how full its memory is, and what each app it can read costs." },
      { kind: NEW, text: "Ask from the Terminal: ask what am I doing tomorrow, or pipe text into ask." },
      { kind: FIXED, apps: ["clock"], text: "Clock finds big cities that share a time zone, like Dallas, Mumbai or Munich, and keeps their own name on your list." },
      { kind: IMPROVED, text: "The taskbar clock can show seconds: turn on Show seconds in Settings › Taskbar." },
    ],
  },
  {
    version: "3.8.0",
    date: "2026-10-20",
    title: "Lax asked",
    changes: [
      { kind: IMPROVED, apps: ["ask"], text: "Ask shows answers formatted: bold, lists, headings, tables and code blocks with a copy button." },
      { kind: FIXED, apps: ["ask"], text: "Ask follows a long answer as it's written, so you no longer scroll after every reply." },
      { kind: NEW, apps: ["ask"], text: "Ask shows how to remove Chrome's AI model when you want the disk space back." },
    ],
  },
  {
    version: "3.7.0",
    date: "2026-10-20",
    title: "More room in the store",
    changes: [
      { kind: IMPROVED, apps: ["shopping-list"], text: "Deleting by swipe needs a longer swipe, so scrolling can't delete an item by accident." },
      { kind: IMPROVED, apps: ["shopping-list"], text: "In store mode the add bar folds into one Add button, leaving more room for the list." },
      { kind: IMPROVED, apps: ["shopping-list"], text: "List colours are named by how they look in your theme." },
    ],
  },
  {
    version: "3.6.0",
    date: "2026-10-20",
    title: "Scan, check, keep",
    changes: [
      { kind: NEW, apps: ["shopping-list"], text: "Share lists by QR code: the other phone scans them, sees every change, and keeps only what you tick. No live connection that drops on mobile data." },
      { kind: NEW, apps: ["cards"], text: "Share any number of cards by QR: big lists cycle through a few codes, and the other phone reviews new and changed cards before adding them." },
      { kind: IMPROVED, apps: ["shopping-list"], text: "An open list shows just its name at the top." },
      { kind: IMPROVED, apps: ["shopping-list"], text: "Editing an item opens a sheet over the list, so you stay where you were; Back closes it." },
      { kind: IMPROVED, apps: ["shopping-list"], text: "Clear done can be undone, and in the store the list stays calmer: bigger add bar, no buy-again row, and a tap on an item shows the swipe that ticks it." },
      { kind: IMPROVED, apps: ["shopping-list"], text: "Reading a list from a photo marks the lines that are already on your list." },
    ],
  },
  {
    version: "3.5.0",
    date: "2026-10-20",
    title: "Easier to read",
    changes: [
      { kind: IMPROVED, apps: ["shopping-list"], text: "Shopping List is easier to read: bolder items in a card, a clear amount, and ticked items move down into an In the cart section." },
      { kind: NEW, apps: ["shopping-list"], text: "Set an item's amount and unit (g, kg, ml, l, pak…) with a stepper: tap the item or its amount." },
      { kind: NEW, apps: ["shopping-list"], text: "Swipe an item right to tick it and left to delete it (with Undo), so a stray tap no longer ticks anything." },
      { kind: NEW, apps: ["shopping-list"], text: "Shopping List opens on all your lists, hops between them with one tap, and has an All view with every list at once." },
      { kind: NEW, apps: ["shopping-list"], text: "Give each list a name, colour and icon in its settings." },
      { kind: FIXED, apps: ["shopping-list"], text: "A number at the end of a name stays part of it: \"omega 3\" is no longer three of omega." },
    ],
  },
  {
    version: "3.4.4",
    date: "2026-10-20",
    title: "Hold on",
    changes: [{ kind: FIXED, text: "Holding an icon on the phone's home screen opens its menu again on Samsung phones." }],
  },
  {
    version: "3.4.3",
    date: "2026-10-20",
    title: "Side to side",
    changes: [
      { kind: FIXED, apps: ["terminal"], text: "Wide tables in Terminal keep their first column in place while you scroll sideways, and fade at the edge while more columns are hidden." },
      { kind: FIXED, apps: ["terminal"], text: "A command sent to Terminal from the command palette or a link now runs instead of stopping right away." },
    ],
  },
  {
    version: "3.4.2",
    date: "2026-10-20",
    title: "Way back",
    changes: [
      { kind: FIXED, text: "On a phone, Back now leaves Edit home screen, like Done." },
      { kind: FIXED, apps: ["shopping-list"], text: "Renaming a list renames its widget too." },
    ],
  },
  {
    version: "3.4.1",
    date: "2026-10-19",
    title: "On and off",
    changes: [
      { kind: FIXED, apps: ["shopping-list"], text: "A list's Add to home screen now turns into Remove once its widget is there, instead of adding another copy. Deleting a list removes its widget too." },
    ],
  },
  {
    version: "3.4.0",
    date: "2026-10-19",
    title: "Your home, your way",
    changes: [
      { kind: NEW, text: "On a phone, hold the home screen and pick Edit home screen to drag icons around, between pages and into the dock." },
      { kind: NEW, text: "Widgets now show on the phone's home screen too. Add one from Edit home screen or App Library, and resize it by its corner." },
      { kind: NEW, apps: ["shopping-list"], text: "Shopping List has a widget: add items or snap a photo of a list without opening the app. Add one from a list's menu." },
    ],
  },
  {
    version: "3.3.3",
    date: "2026-10-19",
    title: "Right code, right app",
    changes: [{ kind: FIXED, apps: ["p2p-transfer"], text: "Scanning a Shopping List code in P2P Transfer now says it's from another app instead of failing with an unclear error." }],
  },
  {
    version: "3.3.2",
    date: "2026-10-19",
    title: "One less pop-up",
    changes: [{ kind: FIXED, apps: ["shopping-list"], text: "Reading a photo no longer shows a pop-up on top of the lines it found." }],
  },
  {
    version: "3.3.1",
    date: "2026-10-19",
    title: "Reads your handwriting",
    changes: [
      { kind: IMPROVED, apps: ["shopping-list"], text: "Shopping List reads handwritten lists far better, in two columns too, and straightens a photo taken sideways." },
      { kind: NEW, apps: ["shopping-list"], text: "Before reading a photo, drag a frame around the list, or read all of it." },
      { kind: IMPROVED, apps: ["shopping-list"], text: "Words read from a photo are matched to what you've bought before and to common groceries, so they come out spelled right." },
    ],
  },
  {
    version: "3.3.0",
    date: "2026-10-19",
    title: "Ready for the shop",
    introduces: ["cards", "shopping-list"],
    changes: [
      { kind: NEW, apps: ["cards"], text: "Cards: keep your loyalty cards in one place, scan them once with the camera or a photo, and show the barcode full screen at the checkout." },
      { kind: NEW, apps: ["cards"], text: "Cards reads and draws every common barcode, from EAN and Code 128 to QR, PDF417, Aztec and Data Matrix, and checks the number as you type it." },
      { kind: NEW, apps: ["cards"], text: "Move your cards to another device as a file, or share the list or a single card as a QR code." },
      { kind: NEW, apps: ["shopping-list"], text: "Shopping List: lists made for the store, with big rows to tick, suggestions from what you buy, a list read from a photo, and one list shared live with another phone." },
      { kind: FIXED, apps: ["format-lab"], text: "The \"Settings changed\" label in Format Lab stays on one line instead of spilling out of its box." },
      { kind: IMPROVED, apps: ["format-lab", "media-preview"], text: "AVIF and JPEG XL keep working offline once you've used them." },
      { kind: IMPROVED, apps: ["image-tools"], text: "In Image Tools › Compare, dragging anywhere on the picture moves the divider, like in Format Lab." },
    ],
  },
  {
    version: "3.2.0",
    date: "2026-10-18",
    title: "Pick your format",
    introduces: ["format-lab"],
    changes: [
      { kind: NEW, apps: ["format-lab"], text: "Format Lab: encode one image as JPEG, WebP, AVIF and JPEG XL, then swipe between any two to see what each one costs." },
      { kind: NEW, apps: ["format-lab"], text: "Each format shows its size, its share of the original, how long it took and a quality score, with a heatmap of where detail was lost." },
      { kind: NEW, apps: ["format-lab"], text: "Inspect an AVIF or JPEG XL file to see its size, bit depth, transparency, animation and colour, straight from the file." },
      { kind: NEW, apps: ["format-lab"], text: "The convert command turns images, or every image in a folder, into AVIF, JPEG XL, WebP, JPEG or PNG." },
      { kind: NEW, apps: ["media-preview"], text: "Media Preview now opens JPEG XL images." },
    ],
  },
  {
    version: "3.1.0",
    date: "2026-10-18",
    title: "Know your colours",
    introduces: ["color-recall", "odd-one-out", "gradient-sort", "hex-guess"],
    changes: [
      { kind: NEW, apps: ["color-recall", "odd-one-out", "gradient-sort", "hex-guess"], text: "Color Games: rebuild five colours from memory, spot the tile that's a shade off, sort a scrambled gradient, or guess a colour's hex code in five tries." },
      { kind: NEW, apps: ["color-recall", "odd-one-out", "gradient-sort", "hex-guess"], text: "Each Color Games mode has its own puzzle of the day, plus endless practice, and a result line with a link to challenge a friend on the same puzzle." },
      { kind: IMPROVED, apps: ["game-hub"], text: "Game Hub lists each mode of a game with several dailies as its own row, and opens the game straight on that mode." },
    ],
  },
  {
    version: "3.0.1",
    date: "2026-10-18",
    title: "Back where it belongs",
    changes: [
      { kind: FIXED, text: "In an app opened on its own page, the browser's Back closes the open panel or steps back inside the app instead of leaving the page." },
      { kind: FIXED, apps: ["activity-monitor"], text: "Activity Monitor opens on its first section when a link or command doesn't name one." },
      { kind: FIXED, apps: ["forms", "image-tools", "jigsaw", "image-editor", "icon-pack", "svg-workbench"], text: "Pasting while a panel is open over an app no longer reaches the app behind it." },
      { kind: FIXED, apps: ["app-library"], text: "Section labels in the App Library's Showcase now use the same quiet colour as labels everywhere else." },
    ],
  },
  {
    version: "3.0.0",
    date: "2026-10-18",
    title: "Lighter start",
    changes: [
      { kind: IMPROVED, text: "WebOS starts faster: app descriptions and search words now load right after the desktop appears instead of before it." },
      { kind: FIXED, apps: ["algorithms"], text: "A link to an algorithm Algorithms doesn't have now says which one is missing, then opens the first algorithm." },
      { kind: NEW, apps: ["algorithms"], text: "Red-black trees in Algorithms now delete too, showing each recolouring and rotation that keeps the tree balanced." },
      { kind: NEW, apps: ["algorithms"], text: "B-trees in Algorithms delete keys as well, borrowing from a neighbour or merging two nodes when one runs short." },
      { kind: IMPROVED, apps: ["algorithms"], text: "Boyer–Moore search adds the good-suffix rule, and you can switch each rule off to see how much it saves." },
      { kind: NEW, apps: ["algorithms"], text: "Algorithms adds Bentley–Ottmann, the sweep that keeps crossing segments in order and only ever tests neighbours." },
      { kind: NEW, apps: ["algorithms"], text: "Huffman coding under Compression turns your text into actual bits and bytes, then decodes them back by walking the tree." },
      { kind: NEW, apps: ["algorithms"], text: "Arithmetic coding joins Compression: watch the interval narrow symbol by symbol until the whole message is a single number." },
      { kind: IMPROVED, apps: ["algorithms"], text: "Graphs and points in Algorithms can be drawn from the keyboard: Tab to a node, move it with the arrow keys, press Enter on two nodes to connect them." },
    ],
  },
  {
    version: "2.3.0",
    date: "2026-10-18",
    title: "Watch it think",
    introduces: ["algorithms"],
    changes: [
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms: watch ten sorting algorithms work step by step, each step explained, with the pseudocode lit as it runs and a race between any two.",
      },
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms has fifteen trees to grow and query, from search trees that rotate to stay balanced to B-trees, tries, heaps, k-d trees and Huffman codes.",
      },
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms runs eleven graph algorithms, from breadth-first search and Dijkstra to spanning trees and max flow, on graphs you can type or draw.",
      },
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms has data structures to poke at: stacks, queues, ring buffers, linked lists, hash tables, Bloom filters, an LRU cache, skip lists and consistent hashing.",
      },
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms shows how compression works: run-length, LZ77 with its sliding window and bits, LZ78, LZW, Burrows–Wheeler with move-to-front, and Base64.",
      },
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms searches text five ways, from naive to Knuth–Morris–Pratt and Boyer–Moore, and fills in edit distance and suffix array tables step by step.",
      },
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms covers searching too: linear, binary, interpolation and exponential search, two pointers and a sliding window.",
      },
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms fills dynamic programming tables cell by cell: longest common subsequence, knapsack, coin change, longest increasing subsequence and matrix chain order.",
      },
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms backtracks through puzzles: N-queens, a Sudoku solver, mazes built three ways and solved, and flood fill.",
      },
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms does number tricks: Euclid's GCD, the sieve of Eratosthenes, fast exponentiation, Fisher–Yates, reservoir sampling and CRC32.",
      },
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms draws geometry on points you place: convex hulls two ways, the closest pair, and a line sweep that finds crossing segments.",
      },
      {
        kind: NEW,
        apps: ["algorithms"],
        text: "Algorithms explains operating system ideas: CPU scheduling on a Gantt chart, page replacement policies side by side, and a producer–consumer buffer with semaphores.",
      },
    ],
  },
  {
    version: "2.2.0",
    date: "2026-10-18",
    title: "What every app solves",
    changes: [
      { kind: NEW, apps: ["app-library"], text: "The App Library has a Showcase: every app by category, with the problem it solves and what it does about it." },
      { kind: NEW, apps: ["app-library"], text: "Open any app's story for all its highlights, and copy a link that opens just that app." },
      { kind: NEW, apps: ["app-library"], text: "Share the whole showcase as one link, so someone new can see what WebOS can do." },
    ],
  },
  {
    version: "2.1.1",
    date: "2026-10-18",
    title: "Clearly clickable",
    changes: [
      { kind: FIXED, text: "The interest picks in the introduction look like buttons now." },
      { kind: FIXED, text: "The install icon in the introduction no longer sits on an odd grey square." },
    ],
  },
  {
    version: "2.1.0",
    date: "2026-10-18",
    title: "Just the one app",
    changes: [
      { kind: NEW, text: "Copy a solo link from any window: it opens just that app, full page, with an Open WebOS button to get the rest." },
      { kind: IMPROVED, apps: ["forms"], text: "A shared form opens on its own, so the person filling it sees only the form." },
      { kind: NEW, apps: ["forms"], text: "People send back a short answer code; paste it in Forms or run form answer, and it's saved beside the right form." },
      { kind: NEW, apps: ["forms"], text: "Forms shows every form with its answer count, and a summary of each question's answers." },
    ],
  },
  {
    version: "2.0.2",
    date: "2026-10-18",
    title: "Back to the cog",
    changes: [{ kind: IMPROVED, apps: ["settings"], text: "Settings has a cog icon again." }],
  },
  {
    version: "2.0.1",
    date: "2026-10-18",
    title: "Any picture will do",
    changes: [{ kind: FIXED, apps: ["hopsprite"], text: "Hopsprite opens JPG, WebP and any other picture again." }],
  },
  {
    version: "2.0.0",
    date: "2026-10-18",
    title: "Wave seven",
    changes: [
      { kind: IMPROVED, text: "Every app has its own new icon, drawn for what that app does." },
      {
        kind: NEW,
        apps: ["file-explorer"],
        text: "Open real folders from your disk: they show up under On disk, work in every app, and are remembered after a reload.",
      },
      {
        kind: NEW,
        apps: ["file-explorer"],
        text: "Every Open dialog now also offers files from this device and folders on your disk, picks several files at once, and Upload can copy in a whole folder.",
      },
      {
        kind: NEW,
        apps: ["file-explorer"],
        text: "Rename many files at once with a pattern like trip-{n:3}{ext}, with a live preview that blocks clashes before anything changes.",
      },
      {
        kind: NEW,
        apps: ["activity-monitor"],
        text: "Storage shows a map of what fills your space: tap a folder to look inside, then reveal it in Explorer.",
      },
      {
        kind: NEW,
        apps: ["image-tools"],
        text: "Compare two versions of a picture with a wipe slider, an onion skin or a map of what changed.",
      },
      {
        kind: NEW,
        apps: ["image-tools"],
        text: "Redact hides names, faces and tokens in a screenshot with a box, big pixels or a heavy blur.",
      },
      {
        kind: NEW,
        apps: ["image-tools"],
        text: "Squash saves smaller WebP or JPEG copies of many images at once and shows what each one saves.",
      },
      {
        kind: NEW,
        apps: ["image-tools"],
        text: "Poster print spreads one image over several A4, Letter or A3 sheets as a PDF, with crop marks and a map.",
      },
      {
        kind: NEW,
        apps: ["image-tools"],
        text: "Atlas packs many frames into one sprite sheet with a JSON or CSS map.",
      },
      {
        kind: NEW,
        apps: ["metadata"],
        text: "Metadata shows what a photo or PDF says about itself, GPS included, and saves a clean copy without it.",
      },
      {
        kind: NEW,
        apps: ["api-client"],
        text: "API Client sends web requests, keeps them in .http files, and downloads files into your storage.",
      },
      { kind: NEW, apps: ["dev-tools"], text: "Dev Tools gains JWT, Time, Cron and Certificate tabs." },
      {
        kind: NEW,
        apps: ["icon-pack"],
        text: "Icon Pack turns one logo into a favicon, app icons, a social card and the manifest, all in one zip.",
      },
      {
        kind: NEW,
        apps: ["svg-workbench"],
        text: "SVG Workbench makes SVGs smaller, exports PNGs and turns them into Svelte components.",
      },
      {
        kind: NEW,
        apps: ["qr-studio"],
        text: "QR Studio makes QR codes for links, Wi-Fi, contacts and UPN payments, and shows step by step how they work.",
      },
      {
        kind: NEW,
        apps: ["link-preview"],
        text: "Link Preview shows how a page will look when shared on Slack, X, Facebook, Discord, LinkedIn and iMessage.",
      },
      {
        kind: NEW,
        apps: ["forms"],
        text: "Forms turns a short markdown list into a form you share as a link, and collects the answers that come back.",
      },
      {
        kind: NEW,
        apps: ["recipe-box"],
        text: "Recipe Box keeps your recipes, scales them, draws them as a table and walks you through cooking with timers.",
      },
      {
        kind: NEW,
        apps: ["video-tools"],
        text: "Video Tools trims videos, turns clips into GIFs and pulls out the sound.",
      },
      {
        kind: NEW,
        apps: ["ask"],
        text: "Ask chats about an open file using the AI built into Chrome, privately on your computer.",
      },
      {
        kind: NEW,
        apps: ["hid-lab"],
        text: "Keyboard & HID Lab tests every key on your keyboard and shows what connected devices send.",
      },
      { kind: NEW, apps: ["web-app"], text: "Pin any website as a WebOS app that opens in its own window." },
      {
        kind: NEW,
        apps: ["funky"],
        text: "Funky DSL writes SimplePlanes Funky Trees in a readable language, with a simulator and import from your crafts.",
      },
      {
        kind: NEW,
        apps: ["gw2"],
        text: "GW2 Tracker shows your Guild Wars 2 daily objectives, wallet, crafting goals and a searchable grid of everything you own, with where each item sits.",
      },
      { kind: NEW, apps: ["jigsaw"], text: "Jigsaw turns any picture into a puzzle with real piece shapes." },
      {
        kind: NEW,
        apps: ["crack-the-code"],
        text: "Crack the Code: deduce the secret code from the clues, with a daily case ranked by fewest guesses.",
      },
      {
        kind: NEW,
        apps: ["nonogram"],
        text: "Make a nonogram from any picture in the editor, checked so it has exactly one solution.",
      },
      {
        kind: NEW,
        apps: ["kanban"],
        text: "Kanban can show a folder of markdown files as a board, where moving a card rewrites its status, from the board or the Terminal.",
      },
      {
        kind: NEW,
        text: "New Terminal commands: file, meta, imgdiff, squash, poster, jwt, cron, qr, wget, http, summarize, translate, mount and more.",
      },
      {
        kind: IMPROVED,
        text: "WebOS starts faster: the new icons are lighter, and app commands load the first time you open the Terminal or the command palette.",
      },
      { kind: IMPROVED, apps: ["pdf-tools"], text: "PDF Tools can make A3 pages." },
      {
        kind: FIXED,
        apps: ["pdf-tools"],
        text: "Photos taken sideways no longer come out turned or stretched when made into a PDF.",
      },
    ],
  },
  {
    version: "1.19.1",
    date: "2026-10-17",
    title: "Patch on the go",
    changes: [
      {
        kind: IMPROVED,
        apps: ["image-tools"],
        text: "Patch is easier on a phone: the picture fills the screen, pinch to zoom, settings sit in tabs below, and a tap near a box still picks it.",
      },
      {
        kind: IMPROVED,
        apps: ["image-tools"],
        text: "Zoom in on Patch's preview, or jump straight to a change from the list.",
      },
    ],
  },
  {
    version: "1.19.0",
    date: "2026-10-17",
    title: "Patch it up",
    changes: [
      {
        kind: NEW,
        apps: ["image-tools"],
        text: "Patch in Image Tools removes a mark an editor stamped on your picture by restoring that spot from the original, even when the export was resized or cropped.",
      },
    ],
  },
  {
    version: "1.18.1",
    date: "2026-10-17",
    title: "Room to breathe",
    changes: [
      {
        kind: FIXED,
        text: "The new app card and other tall dialogs no longer run under the phone's status bar or off the top of a short screen.",
      },
    ],
  },
  {
    version: "1.18.0",
    date: "2026-10-17",
    title: "Game night",
    introduces: ["letterer", "sokoban", "blocks", "brackets", "hex-viewer", "font-viewer"],
    changes: [
      {
        kind: NEW,
        apps: ["letterer"],
        text: "Letterer: guess the hidden word in five, six or seven letters, on up to eight boards at once, against a word that dodges you, with equations, or in a survival run, plus a daily word.",
      },
      {
        kind: NEW,
        apps: ["sokoban"],
        text: "Sokoban: push every crate onto a goal in levels made fresh for you at three difficulties, with a daily level.",
      },
      {
        kind: NEW,
        apps: ["blocks"],
        text: "Blocks: the falling-blocks classic with hold, a next queue and a ghost piece, in Marathon, a 40-line sprint and a daily sprint.",
      },
      {
        kind: NEW,
        apps: ["brackets"],
        text: "Brackets: run a knockout, double elimination, round robin or race-points cup for game night, saved as a file in Documents.",
      },
      {
        kind: NEW,
        apps: ["hex-viewer"],
        text: "Hex Viewer shows the bytes of any file, however large, and is in Open with for every file. Type hexdump in the Terminal for a quick look.",
      },
      {
        kind: NEW,
        apps: ["font-viewer"],
        text: "Font Viewer opens .ttf, .otf, .woff and .woff2 fonts with a sample, a size waterfall, the character set and variable-font sliders.",
      },
      {
        kind: NEW,
        apps: ["image-tools"],
        text: "Image Tools makes test images with rulers, corner coordinates and a crosshair for checking crops, up to several gigabytes. Also as testimg in the Terminal.",
      },
      {
        kind: NEW,
        apps: ["pdf-tools"],
        text: "PDF Tools makes test PDFs with numbered, ruled pages in any paper size, or of an exact file size. Also as testpdf in the Terminal.",
      },
      {
        kind: IMPROVED,
        apps: ["archive"],
        text: "How it works in Archive now shows the Huffman step too: how often each symbol appears, its code, the code tree and the bits saved.",
      },
    ],
  },
  {
    version: "1.17.1",
    date: "2026-10-17",
    title: "Lighter on its feet",
    changes: [
      { kind: IMPROVED, text: "Minimizing, restoring and maximizing windows is smoother with many windows open." },
      {
        kind: IMPROVED,
        text: "WebOS saves your windows and settings less often while you work, so clicking around and dragging sliders stays light.",
      },
      { kind: IMPROVED, apps: ["recorder"], text: "The level meter runs more smoothly while recording." },
      { kind: IMPROVED, apps: ["lunar-lander"], text: "The status bar costs less while you fly." },
      {
        kind: FIXED,
        text: "The bottom-right corner of a window resizes it again, instead of clicking the window behind.",
      },
    ],
  },
  {
    version: "1.17.0",
    date: "2026-10-16",
    title: "Make it yours",
    changes: [
      {
        kind: NEW,
        apps: ["settings"],
        text: "Settings › Appearance sets how round corners are, how strong shadows are, the text size, and can turn motion off.",
      },
      {
        kind: NEW,
        apps: ["settings"],
        text: "Export a saved theme to Documents as a .webos-theme file, and open one to preview and import it.",
      },
      {
        kind: FIXED,
        text: "Windows, notifications and the phone's app drawer no longer animate when your device asks for reduced motion.",
      },
    ],
  },
  {
    version: "1.16.0",
    date: "2026-10-16",
    title: "A tidier taskbar",
    changes: [
      {
        kind: NEW,
        text: "Windows of the same app share one taskbar button with a count: click it to pick a window, or right-click to close them all.",
      },
      { kind: NEW, text: "Choose a small, medium or large taskbar in Settings › Taskbar." },
      {
        kind: NEW,
        text: "The taskbar can hide itself to give windows the whole screen, and comes back when you point at the screen edge.",
      },
      {
        kind: NEW,
        apps: ["terminal"],
        text: "Type taskbar position, taskbar size or taskbar autohide in the Terminal to change the taskbar from there.",
      },
    ],
  },
  {
    version: "1.15.0",
    date: "2026-10-16",
    title: "Forward in File Explorer",
    changes: [
      {
        kind: NEW,
        apps: ["file-explorer"],
        text: "File Explorer has a Forward button next to Back, to return to the folder you just left.",
      },
      {
        kind: NEW,
        apps: ["minesweeper", "nurikabe"],
        text: "Type minesweeper daily or nurikabe daily in the Terminal to play today's puzzle, or add a past day.",
      },
      {
        kind: FIXED,
        apps: ["activity-monitor"],
        text: "Activity Monitor shows activity for each open app on phones too, instead of dashes.",
      },
      {
        kind: FIXED,
        apps: ["quick-notes", "time-since"],
        text: "Pinning a note, the todo list or a counter to the desktop from the Terminal a second time no longer adds a copy.",
      },
      {
        kind: FIXED,
        apps: ["pdf-tools"],
        text: "Splitting a short PDF by ranges starts from pages it actually has, instead of an error.",
      },
      {
        kind: FIXED,
        apps: ["media-preview"],
        text: "Media Preview shows the length of recordings made in Recorder, so you can skip around in them.",
      },
    ],
  },
  {
    version: "1.14.1",
    date: "2026-10-16",
    title: "Locked colours stay readable",
    changes: [
      {
        kind: FIXED,
        apps: ["settings"],
        text: "Locking a colour that only works on a light background no longer makes a dark theme you can't read, and the other way round: the generator switches to the mode that fits.",
      },
    ],
  },
  {
    version: "1.14.0",
    date: "2026-10-16",
    title: "Theme generator",
    changes: [
      {
        kind: NEW,
        apps: ["settings"],
        text: "Generate new themes in Settings › Appearance: pick light, dark or either, how the colours relate, how vivid and how contrasty, lock the colours you like, preview, then apply. Your last three stay there to go back to.",
      },
      {
        kind: NEW,
        apps: ["settings"],
        text: "Save the themes you like under a name. They show under Your themes in Appearance, where you can rename or delete them, and theme save and theme set work with them in the Terminal.",
      },
    ],
  },
  {
    version: "1.13.0",
    date: "2026-10-16",
    title: "Lunar Lander",
    introduces: ["lunar-lander"],
    changes: [
      {
        kind: NEW,
        apps: ["lunar-lander"],
        text: "Lunar Lander: fly a lander, twin pods or a heavy shuttle down onto the pad, steering with the engine on each side.",
      },
      {
        kind: NEW,
        apps: ["lunar-lander"],
        text: "Pick Zero-G, Moon, Mars or Earth gravity, add air and wind, or turn on infinite fuel to practise.",
      },
      {
        kind: NEW,
        apps: ["lunar-lander"],
        text: "Every landing gets a score for how soft, level and centred it was and the fuel left, with a best for each ship and setup.",
      },
    ],
  },
  {
    version: "1.12.0",
    date: "2026-10-16",
    title: "Mini windows",
    changes: [
      {
        kind: NEW,
        text: "Pop any window out into a small window that stays on top of your other tabs and apps: use the new button in its title bar, right-click it on the taskbar, press Alt+Shift+P, or type win pop. Close the mini window or type win back to bring it home.",
      },
    ],
  },
  {
    version: "1.11.0",
    date: "2026-10-16",
    title: "Quick launch",
    changes: [
      {
        kind: NEW,
        text: "Pin apps to the taskbar: drag one from the start menu or the App Library, or right-click and pick Pin to taskbar. Drag pinned apps to reorder them, or off the taskbar to unpin.",
      },
      { kind: NEW, text: "Drag an app from the start menu or the App Library onto the desktop to pin it right there." },
      {
        kind: NEW,
        apps: ["settings"],
        text: "Shuffle in Settings › Appearance makes a new theme with colours that go together, keeping light or dark. Type theme random to do it from the Terminal.",
      },
      { kind: IMPROVED, text: "Right-click a window on the taskbar to pin its app or close it." },
    ],
  },
  {
    version: "1.10.0",
    date: "2026-10-16",
    title: "Backups you can watch",
    changes: [
      {
        kind: IMPROVED,
        text: "Backing up and restoring show their progress, can be cancelled, and appear in Activity Monitor's Tasks. Cancelling a restore before it starts replacing leaves your data untouched.",
      },
      {
        kind: IMPROVED,
        apps: ["getting-started"],
        text: "Open the samples in Getting started adds the sample files if this device doesn't have them yet.",
      },
      {
        kind: FIXED,
        text: "Clicking a button on a notification, like What's new, now closes the notification center.",
      },
    ],
  },
  {
    version: "1.9.0",
    date: "2026-10-16",
    title: "Getting started",
    introduces: ["getting-started"],
    changes: [
      {
        kind: NEW,
        apps: ["getting-started"],
        text: "Getting started walks through what WebOS can do, with a Try it button for each part. Type tour in the Terminal or the palette to open it.",
      },
      {
        kind: NEW,
        text: "A new device comes with sample files in Documents › Samples, each opening in a different app.",
      },
      {
        kind: IMPROVED,
        text: "Terminal, File Explorer, Kanban, PDF Tools, Image Tools, Archive, Calendar, Game Hub and Settings show what they do in the App Library.",
      },
      { kind: IMPROVED, text: "WebOS starts a little faster: the release notes load only when they're needed." },
      {
        kind: IMPROVED,
        text: "A new device starts with the core apps, and the introduction installs the apps for the interests you pick.",
      },
    ],
  },
  {
    version: "1.8.0",
    date: "2026-10-16",
    title: "Installed apps",
    changes: [
      {
        kind: NEW,
        text: "Apps can be uninstalled: the start menu, the app drawer and the desktop show the apps you have, and search still finds every other one under Get.",
      },
      {
        kind: NEW,
        apps: ["app-library"],
        text: "The App Library is the store: Get an app, open it, or uninstall it and choose whether its saved data goes too.",
      },
      {
        kind: IMPROVED,
        text: "This update tidies the start menu once: apps you never opened are uninstalled, and Undo in the notification brings them all back.",
      },
      { kind: IMPROVED, text: "The introduction asks what you're into and suggests apps to pin to the desktop." },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-10-16",
    title: "GIF export",
    changes: [
      {
        kind: NEW,
        apps: ["hopsprite"],
        text: "Hopsprite exports GIFs: a single frame or the whole animation, with its timing, loop and transparent pixels.",
      },
    ],
  },
  {
    version: "1.6.3",
    date: "2026-10-16",
    title: "Hopsprite fits phones",
    changes: [
      {
        kind: IMPROVED,
        apps: ["hopsprite"],
        text: "On phones, Hopsprite's brush size, pattern and mirror controls fit the top bar: size opens a slider, pattern switches with a tap, and mirror opens a menu.",
      },
    ],
  },
  {
    version: "1.6.2",
    date: "2026-10-16",
    title: "Zoom at 75%",
    changes: [
      {
        kind: IMPROVED,
        apps: ["hopsprite"],
        text: "Hopsprite zooms to 75%, so large sprites fit small screens without dropping to half size.",
      },
    ],
  },
  {
    version: "1.6.1",
    date: "2026-10-16",
    title: "A roomier Hopsprite",
    changes: [
      {
        kind: IMPROVED,
        apps: ["hopsprite"],
        text: "Hopsprite gives the canvas most of the window: tools in a slim rail, colours and layers in a side panel, and frames in a filmstrip of live thumbnails.",
      },
      {
        kind: IMPROVED,
        apps: ["hopsprite"],
        text: "Drag the edges of the colour panel and the filmstrip to resize them, or double-click to fold them away; Hopsprite remembers the sizes.",
      },
      {
        kind: IMPROVED,
        apps: ["hopsprite"],
        text: "Drawing, switching frames and opening big sprites in Hopsprite are much faster.",
      },
      { kind: FIXED, apps: ["hopsprite"], text: "The brush preview no longer shows outside the sprite." },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-10-16",
    title: "Hopsprite",
    introduces: ["hopsprite"],
    changes: [
      {
        kind: NEW,
        apps: ["hopsprite"],
        text: "Hopsprite is a pixel art editor with animation: layers, a timeline with per-frame timing, tags, playback and onion skin ghosts.",
      },
      {
        kind: NEW,
        apps: ["hopsprite"],
        text: "Draw with a pixel-perfect pencil, shapes, fill, dither patterns and mirror drawing, then select, move, flip and rotate pixels.",
      },
      {
        kind: NEW,
        apps: ["hopsprite"],
        text: "Hopsprite opens PNG and GIF files as sprites, with every GIF frame and its timing.",
      },
      {
        kind: NEW,
        apps: ["hopsprite"],
        text: "Export a frame or a whole animation as SVG; the animation plays anywhere an SVG does.",
      },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-10-16",
    title: "Meet the new apps",
    changes: [
      {
        kind: NEW,
        text: "After an update that adds apps, WebOS introduces each one: what it is, what it does and where to find it, with a button to open it.",
      },
      {
        kind: NEW,
        apps: ["app-library"],
        text: "App Library shows when each app was added and every change since, in a History section of its details.",
      },
      {
        kind: NEW,
        apps: ["app-library"],
        text: "Sort the App Library by Recently added / updated, and spot New and Updated apps after an update.",
      },
      { kind: NEW, text: "The Terminal lists every app and the version that brought it with changelog --apps." },
      {
        kind: NEW,
        apps: ["app-library", "settings"],
        text: "Apps credit who made them: in the App Library, when a new app is introduced, and in a Credits list in Settings › About.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-10-16",
    title: "Shortcuts in Settings",
    changes: [
      { kind: NEW, apps: ["settings"], text: "Settings has a Shortcuts section listing every keyboard shortcut." },
      {
        kind: IMPROVED,
        text: "The search menu shows the shortcut for the shortcuts sheet in its footer; click it to open the sheet.",
      },
    ],
  },
  {
    version: "1.3.1",
    date: "2026-10-16",
    title: "PDF steps",
    changes: [
      {
        kind: IMPROVED,
        apps: ["pdf-tools"],
        text: "PDF Tools jobs show every page, part, PDF or image as its own step in Activity Monitor, with what each one did.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-10-16",
    title: "Background tasks",
    changes: [
      {
        kind: NEW,
        apps: ["file-explorer", "archive", "pdf-tools"],
        text: "Compressing, extracting and PDF jobs now run as background tasks, with a spinner on the taskbar while they run.",
      },
      {
        kind: NEW,
        apps: ["activity-monitor"],
        text: "Activity Monitor has a Tasks section to follow, cancel, retry and clear background tasks, and to open each one to see its steps and their logs.",
      },
      {
        kind: NEW,
        text: "The Terminal can list, cancel, retry and clear background tasks with task list, task cancel, task retry and task clear.",
      },
      {
        kind: NEW,
        apps: ["example"],
        text: "The Example app can start a long demo task, also with example task in the Terminal.",
      },
      { kind: IMPROVED, text: "Progress notifications show their percentage, and their Cancel button is quieter." },
      {
        kind: FIXED,
        text: "Many notifications at once no longer push the taskbar off screen; the stack scrolls instead.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-10-15",
    title: "Image Tools and project themes",
    introduces: ["image-tools"],
    changes: [
      {
        kind: NEW,
        apps: ["image-tools"],
        text: "Image Tools brings Remove background, Join, Trim, Split and Sprites together in one app.",
      },
      {
        kind: NEW,
        apps: ["image-tools"],
        text: "The Terminal can trim, split, join and remove the background of images with image trim, image split, image join and image unbg, and open Image Tools with image tools.",
      },
      { kind: NEW, text: "A While True theme: an orange desktop, white windows and ink-dark text." },
      {
        kind: IMPROVED,
        apps: ["settings"],
        text: "Themes from other projects, Speed Reader and While True, now sit together under Project themes in Settings › Appearance.",
      },
      {
        kind: FIXED,
        text: "When WebOS was updated while open, an app or dialog that fails to load now offers Update and reload instead of only an error.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-10-15",
    title: "Show desktop",
    changes: [
      {
        kind: NEW,
        text: "Show desktop: click the thin strip at the end of the taskbar or press Alt+Shift+D to hide every window, and again to bring them back.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-10-15",
    title: "WebOS 1.0",
    changes: [
      {
        kind: NEW,
        apps: ["settings"],
        text: "Back up your files, settings and app data to a zip on your device, and restore it later from Settings › Backup.",
      },
      {
        kind: NEW,
        apps: ["settings"],
        text: "Pick what goes into a backup: files, settings, app data, or any mix of them.",
      },
      { kind: NEW, text: "The Terminal can make and restore backups too, with backup create and backup restore." },
      {
        kind: IMPROVED,
        text: "WebOS is now 1.0: the way apps are built is settled, so apps made for it keep working through every 1.x release.",
      },
    ],
  },
  {
    version: "0.37.0",
    date: "2026-10-15",
    title: "Faster boot, lighter apps",
    changes: [
      {
        kind: NEW,
        text: "WebOS starts with a loading screen that shows what it's getting ready, and loads much less before your desktop appears.",
      },
      {
        kind: IMPROVED,
        apps: ["file-explorer"],
        text: "File Explorer stays quick in folders with thousands of files, when files change and when you drag to select.",
      },
      { kind: IMPROVED, apps: ["text-editor"], text: "Text Editor keeps up with fast typing in long files." },
      {
        kind: IMPROVED,
        apps: ["paint"],
        text: "Paint's undo uses a fraction of the memory on big canvases, without dropping any steps.",
      },
      {
        kind: IMPROVED,
        apps: ["image-tools", "image-editor"],
        text: "Background Remove and Image Editor follow their sliders and colour picker without stalling.",
      },
      {
        kind: IMPROVED,
        apps: ["nonogram"],
        text: "Nonogram checks puzzles in the background, so big puzzles no longer freeze the screen.",
      },
      {
        kind: IMPROVED,
        text: "Clocks, timers and monitors do less work while their window is hidden, which saves battery.",
      },
      {
        kind: FIXED,
        apps: ["music-visualizer"],
        text: "Music Visualizer no longer leaves the microphone on after you close it.",
      },
      {
        kind: FIXED,
        apps: ["qr-reader", "p2p-transfer"],
        text: "QR Reader and P2P Transfer turn the camera off while their window is hidden.",
      },
      {
        kind: FIXED,
        apps: ["csv-viewer"],
        text: "CSV Viewer opens big files without freezing; Show more adds the next thousand rows.",
      },
      {
        kind: FIXED,
        apps: ["image-tools", "gif-player"],
        text: "Sprite Extractor's preview animation loops again, and GIF Player pauses while hidden.",
      },
      { kind: FIXED, apps: ["terminal"], text: "The Terminal's completion list stays open while you type." },
      { kind: FIXED, apps: ["pdf-tools"], text: "PDF Tools asks before closing with an unsaved signature." },
      {
        kind: FIXED,
        apps: ["futoshiki", "kanban"],
        text: "Futoshiki keeps your time when you close it mid-puzzle, and Kanban card edits no longer save on every key.",
      },
      {
        kind: FIXED,
        apps: ["markdown-pdf"],
        text: "Markdown to PDF no longer loses an edit made while the file changes on disk.",
      },
    ],
  },
  {
    version: "0.36.0",
    date: "2026-10-15",
    title: "PDF Tools, commands for every app",
    introduces: ["pdf-tools", "app-library"],
    changes: [
      {
        kind: NEW,
        apps: ["pdf-tools"],
        text: "PDF Tools: merge, split, reorder, rotate and sign PDFs, turn images into a PDF or pages into images. Everything stays on your device.",
      },
      {
        kind: NEW,
        apps: ["pdf-tools"],
        text: "Draw your signature once in PDF Tools and place it on any PDF; it's saved as a crisp vector image in your Signatures folder.",
      },
      {
        kind: NEW,
        apps: ["pdf-tools", "pdf-viewer"],
        text: "PDF Tools in the Terminal (pdf merge, split, rotate, pages, images, export) and an Edit in PDF Tools button in PDF Viewer.",
      },
      {
        kind: NEW,
        apps: ["app-library"],
        text: "App Library: every app in one place, with categories, filters and details like which files it opens and what it does in the Terminal. Open it from All apps in the start menu.",
      },
      {
        kind: NEW,
        apps: ["settings"],
        text: "Install WebOS as an app from the introduction or Settings › About, so it gets its own window and keeps your files safer.",
      },
      {
        kind: NEW,
        text: "Resize desktop widgets by dragging their bottom-right corner, or with Shift and the arrow keys; each widget rearranges itself to fit.",
      },
      {
        kind: NEW,
        apps: [
          "pomodoro",
          "clock",
          "time-since",
          "work-hours",
          "kanban",
          "calendar",
          "game-hub",
          "solitaire",
          "nonogram",
          "soundboard",
          "recorder",
          "image-editor",
          "archive",
          "diff",
          "markdown-pdf",
        ],
        text: "Terminal commands for the new apps: pomo, alarm, timer, since, wh, kanban, cal, games, solitaire, nonogram, sb, rec, image, zip, unzip, diff and md2pdf.",
      },
      {
        kind: NEW,
        apps: ["file-explorer"],
        text: "File Explorer can Compress a selection into a zip and Extract here.",
      },
      {
        kind: NEW,
        apps: ["soundboard"],
        text: "Soundboard pads restart when pressed again; switch to Overlap to stack them like before.",
      },
      {
        kind: NEW,
        apps: ["activity-monitor"],
        text: "Activity Monitor shows your desktop widgets and how busy each one is.",
      },
      {
        kind: NEW,
        apps: ["settings"],
        text: "Settings has a Roadmap section: what's built, what's in progress and what's planned.",
      },
      {
        kind: IMPROVED,
        text: "Every window can copy a link to itself now, including apps that open files; the link opens the app without the file, which stays on your device.",
      },
      {
        kind: IMPROVED,
        text: "App search matches every word you type, forgives a typo, and knows many more words for each app, so puzzle finds Word Search.",
      },
      { kind: IMPROVED, text: "Live clocks across apps and widgets tick together, on the second." },
      {
        kind: IMPROVED,
        apps: ["time-since"],
        text: "Time Since always shows the seconds ticking, down from years and days, in the app, its widgets and the Terminal.",
      },
      {
        kind: IMPROVED,
        apps: ["pdf-tools"],
        text: "PDF Tools and the fonts now work fully offline once WebOS has loaded.",
      },
      {
        kind: IMPROVED,
        apps: ["file-explorer", "archive"],
        text: "Cancelling an extraction offers to discard the files already written.",
      },
      { kind: FIXED, text: "Widgets no longer blink when you open an app or move something on the desktop." },
      {
        kind: FIXED,
        apps: ["time-since"],
        text: "A new or reset Time Since counter now counts up every second right away, instead of sitting still for up to a minute.",
      },
    ],
  },
  {
    version: "0.35.1",
    date: "2026-10-14",
    title: "A smaller Game Hub widget",
    changes: [
      {
        kind: IMPROVED,
        apps: ["game-hub"],
        text: "The Game Hub widget is smaller: your streak, today's progress and play time, up to three puzzles of the day, and a button to open Game Hub.",
      },
    ],
  },
  {
    version: "0.35.0",
    date: "2026-10-14",
    title: "Game Hub on the desktop",
    changes: [
      {
        kind: NEW,
        apps: ["game-hub"],
        text: "Game Hub now lives on your desktop as a widget: every game one click away, today's puzzles with a tick when solved, and your streak. Remove it any time; it won't come back.",
      },
    ],
  },
  {
    version: "0.34.0",
    date: "2026-10-14",
    title: "Sixteen new apps",
    introduces: [
      "game-hub",
      "solitaire",
      "work-hours",
      "kanban",
      "calendar",
      "pomodoro",
      "clock",
      "time-since",
      "image-editor",
      "recorder",
      "soundboard",
      "archive",
      "diff",
      "markdown-pdf",
    ],
    changes: [
      {
        kind: NEW,
        apps: ["game-hub"],
        text: "Game Hub: all your games in one place with play time, a Today tab with daily puzzles everyone gets the same, and your streak.",
      },
      {
        kind: NEW,
        apps: ["sudoku", "kakuro", "futoshiki", "nurikabe", "word-search", "minesweeper", "nonogram", "solitaire"],
        text: "Daily puzzles in Sudoku, Kakuro, Futoshiki, Nurikabe, Word Search, Minesweeper, Nonogram and Solitaire.",
      },
      {
        kind: NEW,
        apps: ["solitaire"],
        text: "Solitaire: classic Klondike with draw 1 or 3, drag or tap to move, unlimited undo and stats.",
      },
      {
        kind: NEW,
        apps: ["nonogram"],
        text: "Nonogram has colour puzzles, an editor that checks your puzzle has one answer, and .nonogram files you can save and share.",
      },
      {
        kind: NEW,
        apps: ["work-hours"],
        text: "Work Hours: clock in and out, add entries, see your month and print a time sheet.",
      },
      {
        kind: NEW,
        apps: ["kanban"],
        text: "Kanban: a board for your life, with columns, labels, due dates and checklists. Due cards show on its icon.",
      },
      {
        kind: NEW,
        apps: ["calendar"],
        text: "Calendar: month, week and agenda views with reminders, plus your Work Hours days and Kanban due dates.",
      },
      {
        kind: NEW,
        apps: ["pomodoro"],
        text: "Pomodoro: focus and break cycles that tell you when time's up, even in another tab, with daily stats.",
      },
      {
        kind: NEW,
        apps: ["clock"],
        text: "Clock: world times, alarms, timers and a stopwatch, plus a desktop clock widget that keeps your alarms ringing.",
      },
      {
        kind: NEW,
        apps: ["time-since"],
        text: "Time Since: count up from anything, reset it and see the history of every run.",
      },
      {
        kind: NEW,
        apps: ["image-editor"],
        text: "Image Editor: crop, resize, rotate, flip and adjust a picture, then save it as PNG, JPEG or WebP.",
      },
      {
        kind: NEW,
        apps: ["recorder"],
        text: "Recorder: record your voice, your screen or your camera, and take photos. Everything lands in your Recordings folder.",
      },
      {
        kind: NEW,
        apps: ["soundboard"],
        text: "Soundboard: add your own sounds, give them keys and play them over each other.",
      },
      {
        kind: NEW,
        apps: ["archive"],
        text: "Archive: open, create and extract zip files, and see how compression works on your own text.",
      },
      {
        kind: NEW,
        apps: ["diff"],
        text: "Diff: compare two files side by side or in one column, and edit and save either side.",
      },
      {
        kind: NEW,
        apps: ["markdown-pdf"],
        text: "Markdown to PDF: write Markdown, see the printed pages as you type, pick a template and export a PDF.",
      },
      {
        kind: IMPROVED,
        text: "Games, animations and timers pause while their window is minimized or the tab is in the background.",
      },
      { kind: FIXED, apps: ["sudoku"], text: "Sudoku's timer no longer keeps running while the window is minimized." },
    ],
  },
  {
    version: "0.33.0",
    date: "2026-10-14",
    title: "Desktop widgets",
    changes: [
      {
        kind: NEW,
        apps: ["quick-notes"],
        text: "Quick Notes shows how many todos are still open on its icon: on the desktop, in the taskbar, in the app list and on your phone's home screen.",
      },
      {
        kind: IMPROVED,
        apps: ["quick-notes"],
        text: "Quick Notes has a New note button that opens a blank note ready to type in, and its Inbox shows the capture shortcut for your keyboard.",
      },
      {
        kind: NEW,
        apps: ["quick-notes"],
        text: "Widgets: pin a Quick Notes note to the desktop as a sticky you can type in, or pin your todo list and tick things off right there. Drag them by their title strip.",
      },
      {
        kind: NEW,
        apps: ["quick-notes"],
        text: "Right-click a note in Quick Notes to open it, show it as a sticky, mark it ready or done, drop it or delete it. The Add to desktop button shows when a note is already there, and clicking it again takes it off.",
      },
      {
        kind: NEW,
        apps: ["quick-notes"],
        text: "Link notes by typing [[another note]]. Each note lists what it links to and which notes link to it, and a link to a note that doesn't exist yet creates it.",
      },
      {
        kind: IMPROVED,
        apps: ["quick-notes"],
        text: "Adding a todo in Quick Notes now has its own field and Add button at the top of the list.",
      },
      {
        kind: IMPROVED,
        apps: ["quick-notes"],
        text: "Quick Notes' Terminal commands are now quno, like the command-line tool: quno q to jot a note, quno t for todos, quno ls to list, quno cat, done, drop and rm.",
      },
      {
        kind: FIXED,
        apps: ["quick-notes"],
        text: "Typing in a Quick Notes note no longer jumps to a new line when it saves, or loses what you typed while it was saving.",
      },
    ],
  },
  {
    version: "0.32.0",
    date: "2026-10-14",
    title: "Quick Notes",
    introduces: ["quick-notes"],
    changes: [
      {
        kind: NEW,
        apps: ["quick-notes"],
        text: "Quick Notes: press Alt+Shift+Q anywhere to jot down a note or a todo without leaving what you're doing. It remembers which app or file you were in.",
      },
      {
        kind: NEW,
        apps: ["quick-notes"],
        text: "New notes land in an Inbox; mark them Ready, Done or Dropped, filter by #tag, and tick off todos. Everything is plain text in your Notes folder.",
      },
      {
        kind: NEW,
        apps: ["quick-notes"],
        text: "In the Terminal: note, notes and todo capture and list, as in todo call bob or notes | where tags == work.",
      },
    ],
  },
  {
    version: "0.31.2",
    date: "2026-10-14",
    title: "Smoother taskbar",
    changes: [
      {
        kind: IMPROVED,
        text: "The taskbar now glides into place when you maximize, restore or close a window, instead of jumping.",
      },
    ],
  },
  {
    version: "0.31.1",
    date: "2026-10-14",
    title: "Maximized windows",
    changes: [
      {
        kind: IMPROVED,
        text: "A maximized window now meets the taskbar cleanly: the taskbar stretches to the screen edges and joins it.",
      },
    ],
  },
  {
    version: "0.31.0",
    date: "2026-10-14",
    title: "Terminal",
    introduces: ["terminal"],
    changes: [
      {
        kind: NEW,
        apps: ["terminal"],
        text: "Terminal: run commands over your files, windows, apps and settings. Results come out as tables you can click, and | passes them on, as in ls | where size > 1mb | sort -r size.",
      },
      {
        kind: NEW,
        apps: ["terminal"],
        text: "Tab completes commands, options, file paths, apps and windows, and grey text suggests the rest from what you ran before.",
      },
      {
        kind: NEW,
        apps: ["terminal", "file-explorer"],
        text: "Open the Terminal from the taskbar, with Alt+Shift+Enter, from File Explorer (it starts in that folder) or from the desktop's right-click menu.",
      },
      {
        kind: NEW,
        text: "Type > in the app search (Ctrl+K or Cmd+K) to run any command from there, with its keyboard shortcut shown beside it.",
      },
      {
        kind: NEW,
        apps: ["terminal"],
        text: "On phones the Terminal has a row of keys above the keyboard: Tab, Esc, Ctrl, arrows and the symbols commands need.",
      },
    ],
  },
  {
    version: "0.30.0",
    date: "2026-10-14",
    title: "Back stays home",
    changes: [
      {
        kind: NEW,
        text: "Your phone's back gesture now works like WebOS's Back button: it closes menus and sheets, steps back in apps and goes home, instead of leaving WebOS. The browser's Back on a computer closes menus and dialogs.",
      },
      {
        kind: FIXED,
        apps: ["file-explorer"],
        text: "File Explorer no longer renames, deletes, moves or adds files inside system folders, or touches Home, Desktop, Documents and Downloads themselves.",
      },
    ],
  },
  {
    version: "0.29.0",
    date: "2026-10-14",
    title: "Links",
    changes: [
      {
        kind: NEW,
        text: "Links open apps: a link like /webos/#/app/settings?section=about opens Settings on About, after the question about restoring your windows.",
      },
      {
        kind: NEW,
        text: "The link button in a window's title bar copies a link to that app. Apps that open your files don't have one, since the file wouldn't be there for anyone else.",
      },
    ],
  },
  {
    version: "0.28.0",
    date: "2026-10-13",
    title: "Hands off the system",
    changes: [
      {
        kind: IMPROVED,
        text: "System files open read-only, and Save as won't write into system folders. Save as… keeps an editable copy.",
      },
      {
        kind: IMPROVED,
        text: "Apps on the desktop and home screen sit on tiles while files and folders don't, so the shortcut arrows are gone.",
      },
    ],
  },
  {
    version: "0.27.0",
    date: "2026-10-13",
    title: "Wallpapers",
    changes: [
      {
        kind: NEW,
        apps: ["settings"],
        text: "Wallpapers: pick a background that follows your theme, or use your own photo with fill, fit, tile, dim and blur. It shows on the phone's home screen too.",
      },
      {
        kind: NEW,
        apps: ["file-explorer", "media-preview"],
        text: "Right-click an image and choose Set as wallpaper, from the desktop, File Explorer or Media Preview.",
      },
      { kind: NEW, text: "Sort desktop icons by name, kind or date from the desktop's right-click menu." },
      {
        kind: FIXED,
        text: "Picking an option in a switch-style control (like Settings' taskbar position) no longer scrolls the window's contents out of view.",
      },
    ],
  },
  {
    version: "0.26.0",
    date: "2026-10-13",
    title: "More puzzles",
    introduces: ["kakuro", "nurikabe"],
    changes: [
      {
        kind: NEW,
        apps: ["kakuro"],
        text: "Kakuro: a crossword of numbers where each run adds up to its clue, with the possible combinations shown for the cell you're on.",
      },
      {
        kind: NEW,
        apps: ["nurikabe"],
        text: "Nurikabe: shade the sea so every number becomes an island of that size, with no pools and one connected sea.",
      },
      {
        kind: FIXED,
        apps: ["nonogram", "word-search", "futoshiki", "sudoku", "kakuro", "nurikabe"],
        text: "Puzzle games keep the timer and counters readable when the window is narrow.",
      },
    ],
  },
  {
    version: "0.25.1",
    date: "2026-10-13",
    title: "Honest progress",
    changes: [
      {
        kind: FIXED,
        apps: ["p2p-transfer"],
        text: "P2P Transfer only counts a file as sent once the other device confirms it arrived, instead of showing 100% straight away.",
      },
      {
        kind: FIXED,
        apps: ["p2p-transfer"],
        text: "P2P Transfer keeps the screen on during a transfer, and says so when the other device stops responding.",
      },
      {
        kind: FIXED,
        apps: ["p2p-transfer"],
        text: "When two devices can't reach each other, P2P Transfer now stops and suggests the same Wi-Fi or a hotspot instead of waiting forever.",
      },
      {
        kind: IMPROVED,
        apps: ["p2p-transfer"],
        text: "P2P Transfer says in plain words what's happening and what to do next.",
      },
    ],
  },
  {
    version: "0.25.0",
    date: "2026-10-13",
    title: "Puzzle box",
    introduces: ["nonogram", "word-search", "futoshiki", "sudoku"],
    changes: [
      {
        kind: NEW,
        apps: ["nonogram"],
        text: "Nonogram: fill the grid from the number clues to reveal a picture, with endless new puzzles that always have one answer.",
      },
      {
        kind: NEW,
        apps: ["word-search"],
        text: "Word Search: find themed words hidden in a grid of letters, from across-and-down only up to every direction and backwards.",
      },
      {
        kind: NEW,
        apps: ["futoshiki"],
        text: "Futoshiki: fill a Latin square where the signs between cells say which number is bigger.",
      },
      {
        kind: NEW,
        apps: ["sudoku"],
        text: "Sudoku: four difficulties graded by the solving techniques they need, with notes, auto notes and hints that name the technique.",
      },
    ],
  },
  {
    version: "0.24.0",
    date: "2026-10-13",
    title: "Easier handoff",
    changes: [
      {
        kind: FIXED,
        apps: ["p2p-transfer"],
        text: "P2P Transfer no longer gives up while you take your time passing the second code over.",
      },
      {
        kind: FIXED,
        apps: ["p2p-transfer"],
        text: "Scanning the same code twice in P2P Transfer no longer shows an error, and you now see when the code was accepted.",
      },
      {
        kind: IMPROVED,
        apps: ["p2p-transfer"],
        text: "P2P Transfer codes are smaller and easier for a phone camera to read.",
      },
      {
        kind: NEW,
        apps: ["p2p-transfer"],
        text: "Send a P2P Transfer code with the Share button, or scan one from a photo taken with your camera app.",
      },
    ],
  },
  {
    version: "0.23.0",
    date: "2026-10-13",
    title: "Hand it over",
    introduces: ["p2p-transfer"],
    changes: [
      {
        kind: NEW,
        apps: ["p2p-transfer"],
        text: "P2P Transfer sends files straight to another device: scan each other's QR code and the files go directly, never through a server.",
      },
      {
        kind: NEW,
        apps: ["p2p-transfer"],
        text: "If the connection drops, reconnect and the transfer carries on where it stopped.",
      },
    ],
  },
  {
    version: "0.22.0",
    date: "2026-10-13",
    title: "Straight from your device",
    changes: [
      {
        kind: NEW,
        text: "Every app with Open… can now open a file straight from your phone or computer, no upload first.",
      },
    ],
  },
  {
    version: "0.21.0",
    date: "2026-10-13",
    title: "Write it down",
    changes: [
      {
        kind: NEW,
        apps: ["text-editor"],
        text: "Text Viewer is now Text Editor: edit and save text and code files, with syntax highlighting, search and undo.",
      },
      { kind: NEW, apps: ["text-editor"], text: "Markdown files get a live preview, next to the text or on its own." },
      {
        kind: NEW,
        apps: ["text-editor"],
        text: "When a file you have open changes elsewhere, Text Editor reloads it, or asks first if you have unsaved changes.",
      },
      {
        kind: IMPROVED,
        apps: ["text-editor"],
        text: "Text Viewer windows from a saved session don't come back after this update; open the files again in Text Editor.",
      },
    ],
  },
  {
    version: "0.20.2",
    date: "2026-10-13",
    title: "Hold on",
    changes: [
      {
        kind: FIXED,
        text: "Holding a home screen icon on a phone always opens its menu; dragging icons around is switched off for now.",
      },
    ],
  },
  {
    version: "0.20.1",
    date: "2026-10-13",
    title: "Steady hand",
    changes: [
      {
        kind: FIXED,
        text: "Holding an app icon on a phone opens its menu or starts a drag even when your finger shifts a little.",
      },
    ],
  },
  {
    version: "0.20.0",
    date: "2026-10-12",
    title: "Keep it",
    changes: [
      {
        kind: NEW,
        apps: ["paint"],
        text: "Paint asks whether to save before you close it, and its title bar shows the name of the open file.",
      },
      { kind: NEW, text: "Closing or reloading the browser tab warns you when something isn't saved yet." },
      {
        kind: IMPROVED,
        text: "Sliders, toggle buttons, copy buttons and text boxes look and work the same in every app.",
      },
    ],
  },
  {
    version: "0.19.3",
    date: "2026-10-12",
    title: "Fresh start",
    changes: [
      {
        kind: FIXED,
        text: "Update and reload installs the new version even when the old one is still cached, instead of reloading into the same version.",
      },
      { kind: IMPROVED, text: "Updating shows a screen with each step until WebOS restarts." },
    ],
  },
  {
    version: "0.19.2",
    date: "2026-10-12",
    title: "Pocket",
    changes: [
      { kind: FIXED, text: "Samsung Internet on Android phones gets the phone layout instead of the desktop one." },
    ],
  },
  {
    version: "0.19.1",
    date: "2026-10-12",
    title: "Room to read",
    changes: [
      {
        kind: FIXED,
        apps: ["activity-monitor"],
        text: "Activity Monitor shows window names in full instead of cutting them to a letter or two.",
      },
    ],
  },
  {
    version: "0.19.0",
    date: "2026-10-12",
    title: "Full house",
    introduces: [
      "calculator",
      "minesweeper",
      "twenty-forty-eight",
      "snake",
      "maze",
      "paint",
      "speed-reader",
      "music-visualizer",
      "dev-tools",
      "rng-tools",
      "unit-converter",
    ],
    changes: [
      { kind: NEW, apps: ["calculator"], text: "Calculator, with a history you can click to reuse." },
      {
        kind: NEW,
        apps: ["minesweeper", "twenty-forty-eight", "snake", "maze"],
        text: "Four games: Minesweeper, 2048, Snake and Maze, which builds and solves mazes before you race through one.",
      },
      {
        kind: NEW,
        apps: ["paint"],
        text: "Paint: draw, fill, add shapes and text, and save or open images in your files.",
      },
      {
        kind: NEW,
        apps: ["speed-reader"],
        text: "Speed Reader shows a text or file one word at a time at the speed you choose and remembers where you stopped.",
      },
      {
        kind: NEW,
        apps: ["music-visualizer"],
        text: "Music Visualizer plays an audio file as moving bars, a waveform or a ring.",
      },
      {
        kind: NEW,
        apps: ["dev-tools"],
        text: "Dev Tools for Base64, hashes, URLs, UUIDs, regular expressions and JSON.",
      },
      {
        kind: NEW,
        apps: ["rng-tools"],
        text: "RNG Tools for random numbers, dice, coin flips, picking from a list and passwords, plus your own lottery-style draw presets.",
      },
      {
        kind: NEW,
        apps: ["unit-converter"],
        text: "Unit Converter for length, weight, temperature, data size and more.",
      },
    ],
  },
  {
    version: "0.18.0",
    date: "2026-10-12",
    title: "Sorted",
    changes: [
      {
        kind: NEW,
        text: "The start menu and the app drawer group apps into Productivity, Media, Utilities, Developer, Games and System.",
      },
      { kind: IMPROVED, text: "App search also looks at descriptions and categories, and puts the best match first." },
    ],
  },
  {
    version: "0.17.0",
    date: "2026-10-12",
    title: "Drop in",
    changes: [
      {
        kind: NEW,
        apps: ["file-explorer"],
        text: "Drag files and whole folders from your computer onto the desktop, a File Explorer window or a folder to copy them into WebOS.",
      },
      {
        kind: FIXED,
        text: "Items dropped or moved onto the desktop show up right away instead of only after a reload.",
      },
    ],
  },
  {
    version: "0.16.0",
    date: "2026-10-12",
    title: "Lasso",
    changes: [
      {
        kind: NEW,
        apps: ["file-explorer"],
        text: "Drag across the desktop or a File Explorer folder to select several items at once, or use Ctrl+click, Shift+click and Ctrl+A.",
      },
      { kind: NEW, apps: ["file-explorer"], text: "Cut, copy, delete and open every selected item in one go." },
      {
        kind: NEW,
        apps: ["file-explorer"],
        text: "Drag files and folders onto a folder, into another File Explorer window or onto the desktop to move them there.",
      },
      {
        kind: IMPROVED,
        text: "Dragging a group of desktop icons keeps their arrangement, and icons that don't fit take the nearest free spot.",
      },
    ],
  },
  {
    version: "0.15.0",
    date: "2026-10-12",
    title: "Round up",
    changes: [
      {
        kind: FIXED,
        text: "Making the browser smaller no longer leaves windows out of reach: part of every titlebar stays on screen so you can drag it back.",
      },
      {
        kind: NEW,
        text: "Gather windows, from the desktop's right-click menu or Alt+Shift+G, brings every window fully back on screen.",
      },
    ],
  },
  {
    version: "0.14.0",
    date: "2026-10-12",
    title: "Settle in",
    changes: [
      {
        kind: IMPROVED,
        text: "Apps reopen where you last closed them, at the size you left them. A first window opens centred and sized to your screen, and windows never open off screen.",
      },
      {
        kind: IMPROVED,
        text: "A second window of the same app steps down and to the right of the first instead of landing on top of it.",
      },
      {
        kind: NEW,
        text: "Windows fade in and out, minimize into their taskbar button and grow smoothly when maximized or snapped.",
      },
      { kind: NEW, text: "Alt+Shift+T reopens the window you just closed, with everything it had open." },
      {
        kind: FIXED,
        text: "A newly opened window gets the keyboard right away, and apps no longer flash a loading spinner when they open.",
      },
    ],
  },
  {
    version: "0.13.0",
    date: "2026-10-12",
    title: "Inbox",
    changes: [
      {
        kind: NEW,
        text: "Click the clock to see every notification, even after its pop-up is gone. A badge counts the ones you haven't seen.",
      },
      {
        kind: NEW,
        text: "On phones and tablets, notifications are listed above your running apps, and a dot on the running apps button means something new.",
      },
      { kind: NEW, text: "Alt+Shift+N opens notifications." },
      { kind: IMPROVED, text: "Pop-up notifications appear in the corner nearest the clock, wherever the taskbar is." },
    ],
  },
  {
    version: "0.12.0",
    date: "2026-10-12",
    title: "Hotkeys",
    changes: [
      {
        kind: NEW,
        text: "Keyboard shortcuts for windows: Alt+Shift+W closes, arrows maximize, minimize and snap, Alt+` switches back to the previous window.",
      },
      { kind: NEW, text: "Ctrl+K (⌘K on a Mac) opens the app search from anywhere, and Ctrl+, opens Settings." },
      { kind: NEW, text: "Press Ctrl+/ (⌘/ on a Mac) to see every shortcut." },
    ],
  },
  {
    version: "0.11.0",
    date: "2026-10-12",
    title: "Fingertips",
    changes: [
      {
        kind: FIXED,
        apps: ["file-explorer"],
        text: "On phones and tablets, File Explorer opens folders and files with a tap, and holding a file or empty space opens its menu.",
      },
      {
        kind: NEW,
        text: "The Back button steps back through an app's own history first, like returning to the previous folder in File Explorer.",
      },
      { kind: IMPROVED, text: "Menus on phones slide up from the bottom, and buttons are bigger on touch screens." },
      {
        kind: NEW,
        apps: ["media-preview"],
        text: "Pinch to zoom and drag to pan images in Media Preview, and zoomed images now scroll to every edge.",
      },
      {
        kind: NEW,
        apps: ["qr-reader"],
        text: "QR Reader now works on iPhone, iPad and other browsers without built-in barcode scanning.",
      },
      {
        kind: IMPROVED,
        apps: ["image-tools"],
        text: "Sprite Extract works by touch: pinch the sheet, grab lines and handles with a finger, hold a frame to include or exclude it, and hold and drag thumbnails to reorder.",
      },
      {
        kind: IMPROVED,
        apps: ["image-tools", "csv-viewer"],
        text: "Apps fit a phone: toolbars wrap, image tools show one image at a time, and CSV Viewer shows a cell's full value when you tap it.",
      },
      { kind: IMPROVED, text: "Drag icons within the dock to reorder it." },
      { kind: FIXED, text: "Open and Save sheets no longer spill off the side of a phone screen." },
    ],
  },
  {
    version: "0.10.0",
    date: "2026-10-12",
    title: "Pocket",
    changes: [
      {
        kind: NEW,
        text: "Phones and tablets get their own WebOS: apps open fullscreen, and back, home and running apps buttons sit at the bottom.",
      },
      {
        kind: NEW,
        text: "The home screen shows your desktop items as swipeable pages, with a dock for up to four favourites.",
      },
      {
        kind: NEW,
        text: "Hold an icon on the home screen for its menu, or hold and drag to move it or put it in the dock.",
      },
      {
        kind: NEW,
        text: "All your apps are one tap away in a searchable list, and running apps show as live cards you can switch to or flick away.",
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-10-12",
    title: "Contained",
    changes: [
      {
        kind: IMPROVED,
        text: "An app that crashes now shows the error in its own window, with Restart app and Close window, instead of breaking WebOS.",
      },
    ],
  },
  {
    version: "0.8.2",
    date: "2026-10-12",
    title: "In step",
    changes: [
      {
        kind: FIXED,
        apps: ["file-explorer"],
        text: "File Explorer windows update on their own when another window changes the folder they show, including pins to the desktop.",
      },
      {
        kind: FIXED,
        apps: ["file-explorer"],
        text: "If the folder you're looking at is deleted or moved elsewhere, File Explorer takes you to the nearest folder that still exists.",
      },
    ],
  },
  {
    version: "0.8.1",
    date: "2026-10-11",
    title: "One window, one tab",
    changes: [
      {
        kind: FIXED,
        text: "Two windows of the same app no longer switch tabs together. Each keeps its own tab, and restored windows reopen on it.",
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-10-11",
    title: "Welcome",
    changes: [
      {
        kind: NEW,
        apps: ["settings"],
        text: "A full-screen introduction the first time you open WebOS. Replay it from Settings › About.",
      },
      {
        kind: NEW,
        apps: ["settings"],
        text: "After an update, a notification tells you what changed. Every release is listed in Settings › What's new.",
      },
      { kind: NEW, text: "When a new version is ready, a notification offers to update and reload." },
    ],
  },
  {
    version: "0.7.0",
    date: "2026-10-11",
    title: "Online, with tools",
    introduces: ["html-preview", "csv-viewer", "gif-player", "qr-reader", "activity-monitor", "tic-tac-toe"],
    changes: [
      { kind: NEW, text: "WebOS is live on GitHub Pages. Settings and desktop pins from the old version come along." },
      {
        kind: NEW,
        apps: ["html-preview", "csv-viewer"],
        text: "HTML Preview and CSV Viewer open web pages and spreadsheets.",
      },
      {
        kind: NEW,
        apps: ["image-tools", "gif-player", "qr-reader"],
        text: "Image tools: crop, background removal, concatenate, split, sprite extraction, GIF player and QR reader.",
      },
      { kind: NEW, text: "Open with also lists tools that can work on a file, below the apps that open it." },
      {
        kind: NEW,
        apps: ["activity-monitor"],
        text: "Activity Monitor shows windows, frame rate, memory, network and storage, and can end a window.",
      },
      { kind: NEW, apps: ["tic-tac-toe"], text: "Tic-Tac-Toe." },
      {
        kind: NEW,
        apps: ["file-explorer"],
        text: "Save to disk copies a file or a whole folder from WebOS to your computer.",
      },
      { kind: NEW, text: "The file picker can save: pick a folder and a name, and it asks before replacing a file." },
      { kind: FIXED, apps: ["csv-viewer"], text: "CSV Viewer's header lines up with its columns." },
      { kind: FIXED, text: "Selected text in inputs is readable." },
    ],
  },
  {
    version: "0.6.0",
    date: "2026-10-11",
    title: "Right-click everything",
    changes: [
      { kind: IMPROVED, text: "A full design pass: one design system across the shell and every app." },
      {
        kind: NEW,
        apps: ["file-explorer"],
        text: "Context menus on files, folders and the desktop, from the mouse or Shift+F10.",
      },
      { kind: NEW, apps: ["file-explorer"], text: "Rename, Properties and Open with on any file." },
      { kind: NEW, apps: ["file-explorer"], text: "Copy, cut and paste files between folders." },
      { kind: NEW, text: "Questions and file pickers open inside the window that asked, not over the whole screen." },
      {
        kind: NEW,
        apps: ["text-editor", "media-preview", "pdf-viewer"],
        text: "Viewers can open another file with Open…",
      },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-10-11",
    title: "A real file system",
    introduces: ["kernel"],
    changes: [
      {
        kind: NEW,
        apps: ["file-explorer"],
        text: "Folders like a real OS: /home with Desktop, Documents and Downloads. Existing files move into /home.",
      },
      { kind: NEW, text: "The desktop is the /home/Desktop folder. Pin apps to it as shortcuts." },
      { kind: NEW, text: "Open windows are saved, and WebOS offers to restore them on your next visit." },
      { kind: NEW, apps: ["kernel"], text: "The Kernel app shows what every system service is doing." },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-10-11",
    title: "Open your files",
    introduces: ["text-editor", "media-preview", "pdf-viewer"],
    changes: [
      { kind: NEW, text: "Double-click a file to open it in the right app." },
      {
        kind: NEW,
        apps: ["text-editor", "media-preview", "pdf-viewer"],
        text: "Text Viewer, Media Preview and PDF Viewer.",
      },
      { kind: NEW, text: "When several apps can open a file, pick one and optionally always use it." },
      { kind: FIXED, text: "Windows drag, focus and place correctly." },
      { kind: FIXED, text: "The update check no longer reports an update on every visit." },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-10-10",
    title: "lilBunnyRabbit",
    introduces: ["settings"],
    changes: [
      { kind: NEW, text: "The lilBunnyRabbit look: brand colours and icons." },
      { kind: NEW, text: "Notifications, with a history." },
      { kind: IMPROVED, apps: ["settings"], text: "Settings are kept between visits." },
      { kind: IMPROVED, text: "Uploading a file with a name that's taken renames it instead of failing." },
    ],
  },
  {
    version: "0.2.0",
    date: "2025-11-30",
    title: "Desktop and files",
    introduces: ["file-explorer"],
    changes: [
      { kind: NEW, text: "A desktop with icons, a taskbar and a start menu." },
      { kind: NEW, apps: ["file-explorer"], text: "File Explorer, storing files in your browser on this device." },
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
