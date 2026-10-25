import { LinkKind, Publication, type MoreProject, type Project } from "./types";

const { OK } = Publication;
const { WEBOS, LIVE, SOURCE, NPM, DOCS, SITE } = LinkKind;

const PAGES = "https://lilbunnyrabbit.github.io";
const REPO = "https://github.com/lilBunnyRabbit";
const NPM_PACKAGE = "https://www.npmjs.com/package/@lilbunnyrabbit";

export const WEBOS_CARD: Project = {
  id: "webos",
  name: "WebOS",
  badge: "PWA",
  kicker: "You're in it",
  status: OK,
  tagline: "A desktop environment in the browser: snapping windows, a private file system, and apps that load on demand.",
  points: [
    "A kernel of services with swappable implementations: the phone shell and single-app links swap in their own instead of branching through the UI.",
    "A real file system on the browser's private storage (OPFS), with /home, /etc and /var.",
    "Apps and their metadata load on demand, and CI holds boot to a size budget.",
    "CI deletes every user app and checks the OS still builds, so the core never depends on an app.",
  ],
  stack: ["Svelte 5", "Vite 7", "Tailwind 4", "Bun", "OPFS", "PWA"],
  links: [
    { kind: LIVE, url: `${PAGES}/webos/` },
    { kind: SOURCE, url: `${REPO}/webos` },
    { kind: DOCS, url: `${REPO}/webos/tree/master/docs/adrs`, label: "Decision records" },
  ],
};

export const FEATURED: Project[] = [
  {
    id: "chromatics",
    name: "Chromatics",
    badge: "Web",
    kicker: "Colour as code",
    status: OK,
    tagline: "Build a palette from a short colour script, test its contrast, and preview it in a real interface.",
    points: [
      "Grew from learning every colour model by defining it myself into a small language my own theme is built with.",
      "Its own small language, with autocomplete, hover docs and inline diagnostics in CodeMirror.",
      "Colours are stored once in OKLCH; every other model (about 100) is a lazy view through one registry.",
      "WCAG 2 and APCA contrast, colour-vision-deficiency simulation, ΔE metrics, CMYK coverage for print.",
      "Design decisions are kept in an ADR-style vault in the repo.",
    ],
    stack: ["SvelteKit", "Svelte 5", "CodeMirror 6", "acorn", "culori", "Tailwind 4"],
    shows: {
      decisions: "Chromatics keeps its design decisions in an ADR-style vault in the repo.",
      performance: "Chromatics stores a colour once, in OKLCH; every other model is a lazy view through one registry.",
      feel: "Chromatics' editor answers as you type: autocomplete, hover docs and inline diagnostics.",
    },
    links: [
      { kind: LIVE, url: `${PAGES}/chromatics/` },
      { kind: SOURCE, url: `${REPO}/chromatics` },
    ],
  },
  {
    id: "agtc",
    name: "AGTC",
    badge: "Terminal",
    kicker: "Agent Traffic Control",
    status: OK,
    tagline: "A tmux dashboard for my Claude Code and Codex sessions: who is busy, who needs input, what each one changed.",
    points: [
      "Reads each tool's own transcripts and process state; shows status, worktree, diff stats and subagent tree.",
      "Runs as a tmux sidebar.",
      "Can pair a session with a read-only reviewer agent and route review comments back.",
      "Worktree cleanup checks the remote, because squash merges leave nothing in local history for git branch --merged to find.",
      "Zero runtime dependencies. CI and release workflows. A VS Code sidebar counterpart is in progress.",
    ],
    stack: ["Bun", "TypeScript", "tmux"],
    shows: {
      lightest: "AGTC has zero runtime dependencies; it reads each tool's own transcripts and process state.",
      correct: "AGTC's worktree cleanup checks the remote, because squash merges leave nothing in local history for git branch --merged to find.",
    },
    note: "Requires macOS and Bun.",
    links: [
      { kind: SOURCE, url: `${REPO}/agtc` },
      { kind: NPM, url: `${NPM_PACKAGE}/agtc` },
    ],
  },
  {
    id: "task-manager",
    name: "Task Manager",
    badge: "npm",
    kicker: "@lilbunnyrabbit/task-manager",
    status: OK,
    tagline: "Compose TypeScript tasks, run them in sequence or in parallel, and track their progress.",
    points: [
      "Task, TaskGroup and TaskManager building blocks.",
      "Published with Changesets and versioned TypeDoc docs.",
      "WebOS's background-task service runs on it: zips, backups, PDF Tools, video and image jobs.",
    ],
    stack: ["TypeScript", "Changesets", "TypeDoc"],
    shows: {
      team: "Task Manager ships versioned TypeDoc docs and a changelog, so using it never means reading the source.",
      lightest: "Task Manager is three small building blocks, Task, TaskGroup and TaskManager, instead of a framework. WebOS's background jobs run on it.",
    },
    links: [
      { kind: WEBOS, app: "activity-monitor", props: { section: "tasks" }, label: "See it run in WebOS" },
      { kind: SITE, url: `${PAGES}/task-manager/` },
      { kind: SOURCE, url: `${REPO}/task-manager` },
      { kind: NPM, url: `${NPM_PACKAGE}/task-manager` },
    ],
  },
  {
    id: "petrace",
    name: "Petrace",
    badge: "PWA",
    kicker: "Trace from your phone",
    status: OK,
    tagline: "Place a see-through reference over your phone's camera and trace the image onto paper.",
    points: [
      "Pinch, twist and perspective-tilt gestures through a CSS transform pipeline.",
      "On-device Sobel edge detection turns photos into line art.",
      "Hardware features are detected before their controls appear.",
      "Architecture written down as a module contract.",
      "Offline PWA.",
    ],
    stack: ["Svelte 5", "Vite", "Vitest", "PWA"],
    shows: {
      decisions: "Petrace's architecture is written down as a module contract.",
      lightest: "Petrace detects edges on the device and works offline as a PWA, with no server.",
      feel: "In Petrace, pinch, twist and tilt follow your fingers; controls appear only when the hardware supports them.",
    },
    note: "Made for phones: open it on one.",
    note_desktop_only: true,
    links: [
      { kind: LIVE, url: `${PAGES}/petrace/` },
      { kind: SOURCE, url: `${REPO}/petrace` },
    ],
  },
  {
    id: "series-tracker",
    name: "Series Tracker",
    badge: "PWA",
    kicker: "No backend",
    status: OK,
    tagline: "Track shows episode by episode, keep a watch diary and see what's next. Your data stays in the browser.",
    points: [
      "No backend: IndexedDB for all state.",
      "Activity log with undo, iCal export, Web Share Target, bracket and spin pickers.",
    ],
    stack: ["SvelteKit", "Svelte 5", "Tailwind 4", "IndexedDB", "PWA"],
    shows: {
      lightest: "Series Tracker has no backend: everything lives in the browser's IndexedDB.",
      feel: "Series Tracker puts every action in an activity log you can undo.",
    },
    note: "Needs your own free TMDB API key.",
    links: [
      { kind: LIVE, url: `${PAGES}/series-tracker/` },
      { kind: SOURCE, url: `${REPO}/series-tracker` },
    ],
  },
  {
    id: "hq-quests",
    name: "hq",
    badge: "Go CLI",
    kicker: "Track it, then run it",
    status: OK,
    tagline: "Every idea is a quest: one markdown file whose status is its phase. hq ls tracks them across projects, and hq start opens a coding session that clarifies, investigates, decides and builds, writing each step back into the file.",
    points: [
      "hq q captures from any shell and files the idea under the project whose repo you're in.",
      "hq parse turns raw notes into briefs with scope, entry points in the code and a done-when.",
      "hq start asks the route: implement, investigate, record a decision, or write a proposal for the team.",
      "hq resume reopens the exact session a quest was worked in.",
      "A Bubble Tea terminal UI lists quests, todos and projects, and starts any quest with Enter.",
    ],
    stack: ["Go", "Bubble Tea", "Markdown", "Obsidian"],
    shows: {
      decisions: "In hq a decision is a section of the quest it settles, with the options passed over and why.",
      lightest: "hq's quest is one markdown file whose status is its phase: no tracker, no database.",
    },
    note: "Private repo, so there's no link.",
    links: [],
  },
  {
    id: "hq-loop",
    name: "hq",
    badge: "Go CLI",
    kicker: "The repo behind every session",
    status: OK,
    tagline: "hq is where my work lives: the quests I track and run, the lessons every agent reads before it starts, how I write code as rules with reasons, and the skills that tie them together. Every session reads from it and writes back.",
    points: [
      "A lesson is stored once: after a non-obvious fix, /learn adds one line to a knowledge index, and later sessions in any repo find it from the symptom alone.",
      "Code style corrections become rules with their reason, so the next session writes code the way I would.",
      "A retrieval eval checks that a fresh session, given only the symptom, finds the stored lesson and applies it.",
      "Skills Claude Code and Codex both run: triage notes into briefs, start a quest, save a lesson, save a rule, re-read the vault for stale lines.",
      "The hq CLI, in Go: capture, a Bubble Tea terminal UI, and sessions started on a quest in the right repo.",
    ],
    stack: ["Go", "Bubble Tea", "Markdown", "Obsidian", "Claude Code", "Codex"],
    shows: {
      decisions: "In hq a decision is a section of the quest it settles, with the options passed over and why.",
      team: "hq stores each lesson and each code style rule once, and every coding agent in every repo reads them before it starts.",
      lightest: "hq is markdown files in git: no database, no server.",
    },
    note: "Private repo, so there's no link.",
    links: [],
  },
  {
    id: "hq-tree",
    name: "hq",
    badge: "Go CLI",
    kicker: "How I work, in one repo",
    status: OK,
    tagline: "One git repo holds how I work: quests from idea to done, lessons found once and never debugged again, my code style as rules with reasons, and the skills and Go CLI that run it all.",
    points: [
      "quests/: one markdown file per idea, carried from a one-line capture to a brief, an investigation, a decision record and what landed.",
      "knowledge/: lessons as one line each, written as the symptom and then the fix.",
      "AGENTS.md: my code style, each rule with why, read by Claude Code and Codex alike.",
      "skills/: steps any agent can run, from triaging notes to saving a lesson.",
      "tool/: the hq CLI in Go, with a Bubble Tea terminal UI.",
    ],
    stack: ["Go", "Bubble Tea", "Markdown", "Obsidian", "Claude Code", "Codex"],
    shows: {
      team: "hq stores each lesson and each code style rule once, and every coding agent in every repo reads them before it starts.",
      lightest: "hq is markdown files in git: no database, no server.",
    },
    note: "Private repo, so there's no link.",
    links: [],
  },
  {
    id: "hq-session",
    name: "hq",
    badge: "Go CLI",
    kicker: "Every session starts where the last one ended",
    status: OK,
    tagline: "Before a coding agent touches a repo it reads the quest, the lessons that match and my code style rules. When it's done it writes back what it found, a new lesson or rule if it learned one, and the quest's status.",
    points: [
      "Lessons are found from the symptom alone, and a retrieval eval checks that they are.",
      "Code style corrections become rules with their reason.",
      "The quest file holds the brief, the investigation, the decision and the findings.",
    ],
    stack: ["Go", "Markdown", "Claude Code", "Codex"],
    shows: {
      team: "hq stores each lesson and each code style rule once, and every coding agent in every repo reads them before it starts.",
      decisions: "In hq a decision is a section of the quest it settles, with the options passed over and why.",
    },
    note: "Private repo, so there's no link.",
    links: [],
  },
];

export const MORE: Project[] = [
  {
    id: "brand",
    name: "brand",
    badge: "Web",
    status: OK,
    tagline: "A one-page brand guide generated from config: drop in an SVG or edit the palette and the whole guide updates.",
    points: ["OKLCH palette rules.", "Asset pack zipped in the browser.", "SVG rendering at build time with resvg."],
    stack: ["SvelteKit", "Svelte 5", "Tailwind 4", "culori", "resvg"],
    shows: {
      decisions: "brand is one config as the source of truth: the palette, the guide and the asset pack all come from it.",
    },
    links: [
      { kind: LIVE, url: `${PAGES}/brand/` },
      { kind: SOURCE, url: `${REPO}/brand` },
    ],
  },
  {
    id: "chrome-safe-inset",
    name: "chrome-safe-inset",
    badge: "CLI",
    status: OK,
    tagline: "Test safe-area-inset-* layouts in desktop Chrome, no phone or simulator needed.",
    points: ["Drives Chrome's experimental DevTools Protocol override."],
    stack: ["Bun", "Chrome DevTools Protocol"],
    links: [{ kind: SOURCE, url: `${REPO}/chrome-safe-inset` }],
  },
  {
    id: "packages",
    name: "TypeScript packages",
    badge: "npm",
    kicker: "optional, event-emitter, utils",
    status: OK,
    tagline: "Small typed utilities I reuse across projects; Task Manager is built on them.",
    points: [
      "optional: Java's Optional<T> for TypeScript, returning null instead of throwing when a value is missing.",
      "event-emitter: a lightweight, type-safe event emitter.",
      "utils: the helper classes and functions my other packages share.",
      "service-observer: observe and react to events inside a service or an application.",
    ],
    stack: ["TypeScript", "Changesets"],
    shows: {
      team: "My TypeScript packages hold the helpers my other projects share, so a fix lands once.",
    },
    links: [
      { kind: NPM, url: `${NPM_PACKAGE}/optional`, label: "optional" },
      { kind: NPM, url: `${NPM_PACKAGE}/event-emitter`, label: "event-emitter" },
      { kind: NPM, url: `${NPM_PACKAGE}/utils`, label: "utils" },
      { kind: NPM, url: `${NPM_PACKAGE}/service-observer`, label: "service-observer" },
      { kind: SOURCE, url: `${REPO}/optional`, label: "optional" },
      { kind: SOURCE, url: `${REPO}/event-emitter`, label: "event-emitter" },
      { kind: SOURCE, url: `${REPO}/typescript-utils`, label: "utils" },
      { kind: SOURCE, url: `${REPO}/service-observer`, label: "service-observer" },
      { kind: DOCS, url: `${PAGES}/optional/`, label: "optional" },
      { kind: DOCS, url: `${PAGES}/typescript-utils/api/`, label: "utils" },
    ],
  },
];

/** Not shipped yet: shown as work in progress, never as finished projects. */
export const IN_PROGRESS: Project[] = [
  {
    id: "animot",
    name: "Animot",
    kicker: "In progress",
    status: OK,
    tagline: "Short stories performed word by word, with the author setting the pace and the feeling.",
    points: [
      "Grew out of Speed Reader, a word-at-a-time reader that also runs here in WebOS.",
      "Now: planning the MVP and prototyping how a directed reading feels.",
    ],
    stack: ["SvelteKit", "Svelte 5", "TypeScript"],
    links: [{ kind: WEBOS, app: "speed-reader", label: "Try Speed Reader" }],
  },
  {
    id: "threadbridge",
    name: "Threadbridge",
    kicker: "In progress",
    status: OK,
    tagline: "Handing work between coding agents across a team: a frontend and a backend developer's sessions, each in its own repo, pass tasks to each other.",
    points: ["Builds on AGTC's session messaging.", "Now: writing the MVP spec."],
    stack: ["TypeScript"],
    links: [],
  },
];

export const ALSO: MoreProject[] = [
  {
    name: "Logo Proof",
    badge: "Web",
    status: OK,
    line: "See a logo across 116 real-world mockups, from favicons to business cards.",
    links: [
      { kind: LIVE, url: `${PAGES}/logo-proof/` },
      { kind: SOURCE, url: `${REPO}/logo-proof` },
    ],
  },
  {
    name: "Time Since",
    badge: "PWA",
    status: OK,
    line: "Count-up timers with a history of every reset.",
    links: [
      { kind: WEBOS, app: "time-since" },
      { kind: LIVE, url: `${PAGES}/time-since/` },
    ],
  },
  {
    name: "Work Hours",
    badge: "Web",
    status: OK,
    line: "Clock in and out, see your hours per day, week and month, and print a time sheet.",
    links: [
      { kind: WEBOS, app: "work-hours" },
      { kind: LIVE, url: `${PAGES}/work-hours/` },
    ],
  },
  {
    name: "game-clip",
    badge: "Desktop",
    status: OK,
    line: "Rust screen recorder that saves the last few seconds as a GIF on a hotkey.",
    links: [{ kind: SOURCE, url: `${REPO}/game-clip` }],
  },
  {
    name: "quno",
    badge: "Terminal",
    status: OK,
    line: "Terminal notes and todos where any note can be handed to Claude Code to investigate, propose or implement. Now part of my private HQ.",
    links: [{ kind: SOURCE, url: `${REPO}/quno` }],
  },
  {
    name: "Polymorphic component",
    badge: "Gist",
    status: OK,
    line: "A typed “as” prop for React: props follow the element, a mismatch won't compile.",
    links: [{ kind: SOURCE, url: "https://gist.github.com/lilBunnyRabbit/f410653edcacec1b12cb44af346caddb" }],
  },
];
