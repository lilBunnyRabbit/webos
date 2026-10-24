import { JOBS } from "../content/experience";
import { PRINCIPLES } from "../content/principles";
import { PROFILE } from "../content/profile";
import { ALSO, IN_PROGRESS, MORE } from "../content/projects";
import { tile_count } from "./project-more";
import { SocialKind } from "../content/types";
import { subject_of } from "./contact";
import { PROJECTS, TOUR_PRINCIPLES } from "./evidence";

export { IN_PROGRESS, PROJECTS, TOUR_PRINCIPLES };

export const Win = {
  IDENTITY: "identity",
  HOW: "how",
  TIMELINE: "timeline",
  PROJECTS: "projects",
  CONTACT: "contact",
} as const;

export const WINDOWS: string[] = [Win.IDENTITY, Win.TIMELINE, Win.PROJECTS, Win.HOW, Win.CONTACT];

export const COMMAND_OF: Record<string, string> = {
  [Win.IDENTITY]: "whoami",
  [Win.HOW]: "how --i-build",
  [Win.TIMELINE]: "work --timeline",
  [Win.PROJECTS]: "projects",
  [Win.CONTACT]: "contact",
};

export interface TourStep {
  line: string;
  hold: number;
}

export const PRINCIPLE_BEAT = 3400;
/** A phone tells each principle in place, without the evidence to look across at, so its beat is shorter. */
export const PHONE_PRINCIPLE_BEAT = 3200;

export const PROJECTS_LINGER = 700;

// The projects hold is a fallback; the app sets the real one from the graphics' durations.
export const TOUR: TourStep[] = [
  { line: "whoami", hold: 2800 },
  { line: "work --timeline", hold: 3000 },
  { line: "projects", hold: 5000 + PROJECTS_LINGER },
  { line: "how --i-build", hold: TOUR_PRINCIPLES.length * PRINCIPLE_BEAT + 300 },
  { line: "contact", hold: 0 },
];

export const ActionKind = {
  OPEN: "open",
  HOW: "how",
  TOUR: "tour",
  TIDY: "tidy",
  CLOSE: "close",
  CLEAR: "clear",
  HELP: "help",
  LS: "ls",
  NONE: "none",
  ERROR: "error",
} as const;
export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];

export type Action =
  | { kind: typeof ActionKind.OPEN; windows: string[]; job?: string; project?: string; subject?: string }
  | { kind: typeof ActionKind.HOW; principle?: string }
  | { kind: typeof ActionKind.CLOSE; windows: string[] }
  | { kind: typeof ActionKind.TOUR | typeof ActionKind.TIDY | typeof ActionKind.CLEAR | typeof ActionKind.HELP | typeof ActionKind.LS | typeof ActionKind.NONE }
  | { kind: typeof ActionKind.ERROR; text: string; suggest?: string; unknown?: boolean };

export interface Usage {
  name: string;
  args: string;
  about: string;
  /** Moves or lists windows, which a phone's single column doesn't have. */
  desktop?: boolean;
}

export const HELP: Usage[] = [
  { name: "whoami", args: "", about: "Who I am" },
  { name: "work", args: "--timeline", about: "Where I've worked" },
  { name: "projects", args: "", about: "Projects" },
  { name: "how", args: "--i-build", about: "How I build" },
  { name: "contact", args: "", about: "How to reach me" },
  { name: "mail", args: '"subject"', about: "Write me an email" },
  { name: "tour", args: "", about: "Replay the tour" },
  { name: "tidy", args: "", about: "Put windows back", desktop: true },
  { name: "close", args: "<window>", about: "Close a window", desktop: true },
  { name: "ls", args: "", about: "List the windows", desktop: true },
  { name: "clear", args: "", about: "Clear the terminal" },
];

export const help_for = (stacked: boolean): Usage[] => HELP.filter((usage) => !(stacked && usage.desktop));

const ALIASES: Record<string, string> = { principles: "how", timeline: "work", experience: "work", replay: "tour", email: "contact", "?": "help" };
const COMMANDS = HELP.map((usage) => usage.name).concat("help");

const PRINCIPLE_IDS = PRINCIPLES.map((p) => p.id);
const JOB_IDS = JOBS.map((job) => job.id);
const PROJECT_IDS = [...PROJECTS, ...IN_PROGRESS, ...MORE].map((p) => p.id);

const CLOSE_NAMES: Record<string, string[]> = {
  all: WINDOWS,
  whoami: [Win.IDENTITY],
  identity: [Win.IDENTITY],
  how: [Win.HOW],
  principles: [Win.HOW],
  work:[Win.TIMELINE],
  timeline: [Win.TIMELINE],
  projects: [Win.PROJECTS],
  contact: [Win.CONTACT],
};

const ARGS: Record<string, string[]> = {
  how: ["--i-build", ...PRINCIPLE_IDS],
  work: ["--timeline", ...JOB_IDS],
  projects: PROJECT_IDS,
  close: Object.keys(CLOSE_NAMES),
};

export function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const kept = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = kept;
    }
  }
  return row[b.length];
}

function closest(word: string, options: string[]): string | undefined {
  const ranked = options.map((option) => ({ option, cost: distance(word, option) })).sort((a, b) => a.cost - b.cost);
  const best = ranked[0];
  return best && best.cost <= Math.max(1, Math.floor(word.length / 3)) ? best.option : undefined;
}

export function parse(input: string): Action {
  const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { kind: ActionKind.NONE };
  const [head, ...rest] = words;
  const name = ALIASES[head] ?? head;
  const flags = rest.filter((word) => word.startsWith("-"));
  const args = rest.filter((word) => !word.startsWith("-"));
  const unknown = (arg: string, options: string[]): Action => ({
    kind: ActionKind.ERROR,
    text: `${name}: no such option ${arg}`,
    suggest: closest(arg, options) ? `${name} ${closest(arg, options)}` : undefined,
  });

  switch (name) {
    case "whoami":
      return { kind: ActionKind.OPEN, windows: [Win.IDENTITY] };
    case "how": {
      const bad = flags.find((flag) => flag !== "--i-build") ?? args.find((arg) => !PRINCIPLE_IDS.includes(arg));
      if (bad) return unknown(bad, ARGS.how);
      return { kind: ActionKind.HOW, principle: args[0] };
    }
    case "work": {
      const bad = flags.find((flag) => flag !== "--timeline") ?? args.find((arg) => !JOB_IDS.includes(arg));
      if (bad) return unknown(bad, ARGS.work);
      return { kind: ActionKind.OPEN, windows: [Win.TIMELINE], job: args[0] };
    }
    case "projects": {
      const bad = flags[0] ?? args.find((arg) => !PROJECT_IDS.includes(arg));
      if (bad) return unknown(bad, ARGS.projects);
      return { kind: ActionKind.OPEN, windows: [Win.PROJECTS], project: args[0] };
    }
    case "contact":
      return { kind: ActionKind.OPEN, windows: [Win.CONTACT] };
    case "mail":
      return { kind: ActionKind.OPEN, windows: [Win.CONTACT], subject: subject_of(input) };
    case "close": {
      if (args.length === 0) return { kind: ActionKind.ERROR, text: "close: name a window, or all", suggest: "close all" };
      const bad = args.find((arg) => !CLOSE_NAMES[arg]);
      if (bad) return unknown(bad, ARGS.close);
      return { kind: ActionKind.CLOSE, windows: [...new Set(args.flatMap((arg) => CLOSE_NAMES[arg]))] };
    }
    case "tour":
    case "tidy":
    case "clear":
    case "help":
    case "ls":
      return { kind: name };
    default: {
      const suggest = closest(head, [...COMMANDS, ...Object.keys(ALIASES)]);
      return { kind: ActionKind.ERROR, text: `command not found: ${head}`, suggest: suggest ? ALIASES[suggest] ?? suggest : undefined, unknown: true };
    }
  }
}

export interface Suggestion {
  /** The whole line once it's taken, with a trailing space so the next word can follow. */
  line: string;
  word: string;
  detail: string;
}

const WINDOW_TITLES: Record<string, string> = {
  [Win.IDENTITY]: "Who I am",
  [Win.HOW]: "How I build",
  [Win.TIMELINE]: "Work",
  [Win.PROJECTS]: "Projects",
  [Win.CONTACT]: "Contact",
};

const ARG_DETAILS: Record<string, Record<string, string>> = {
  how: { "--i-build": "Every principle", ...Object.fromEntries(PRINCIPLES.map((p) => [p.id, p.title])) },
  work: { "--timeline": "Both jobs", ...Object.fromEntries(JOBS.map((job) => [job.id, job.company])) },
  projects: Object.fromEntries([...PROJECTS, ...IN_PROGRESS, ...MORE].map((p) => [p.id, p.name])),
  close: Object.fromEntries(Object.entries(CLOSE_NAMES).map(([name, wins]) => [name, name === "all" ? "Every window" : WINDOW_TITLES[wins[0]]])),
};

export const SUGGEST_MAX = 6;

/** What the word being typed can become: commands first, then the arguments of the command typed. */
export function suggest(line: string, stacked = false): Suggestion[] {
  if (!line.trim() || line.startsWith("/")) return [];
  const ends_with_space = /\s$/.test(line);
  const words = line.trimStart().split(/\s+/);
  if (words.length <= 1 && !ends_with_space) {
    const word = words[0].toLowerCase();
    return [...help_for(stacked), { name: "help", args: "", about: "Every command" }]
      .filter((usage) => usage.name.startsWith(word) && usage.name !== word)
      .slice(0, SUGGEST_MAX)
      .map((usage) => ({ line: `${usage.name} `, word: usage.name, detail: usage.about }));
  }
  const head = ALIASES[words[0].toLowerCase()] ?? words[0].toLowerCase();
  const details = ARG_DETAILS[head];
  if (!details || (stacked && head === "close")) return [];
  const typed = ends_with_space ? "" : (words.at(-1) ?? "").toLowerCase();
  const before = ends_with_space ? line : line.slice(0, line.length - typed.length);
  const taken = new Set(words.slice(1, ends_with_space ? undefined : -1).map((word) => word.toLowerCase()));
  return Object.entries(details)
    .filter(([option]) => option.startsWith(typed) && option !== typed && !taken.has(option))
    .slice(0, SUGGEST_MAX)
    .map(([option, detail]) => ({ line: `${before}${option} `, word: option, detail }));
}

export const RowLayout = { INLINE: "inline", BELOW: "below", COLUMNS: "columns" } as const;
export type RowLayout = (typeof RowLayout)[keyof typeof RowLayout];

export interface Row {
  text: string;
  detail?: string;
  /** A phone shows the tour's note in its one prompt line, so it gets copy that fits there whole. */
  short?: string;
  run?: string;
  /** Short pairs share a line; a long detail gets a line of its own instead of wrapping or being cut. */
  layout?: RowLayout;
}

const SPAN = `${JOBS.at(-1)?.period.split(" – ")[0]} – ${JOBS[0]?.period.split(" – ").at(-1)}`;

const YEARS = SPAN.replace(/[A-Z][a-z]{2} /g, "").replace(" – ", "–");
const EMPLOYERS = JOBS.map((job) => job.company.split(",")[0]).join(" and ");
// `whoami` answers with the name, the handle after it and the role under: the first line read in the terminal is who this is.
const HANDLE = PROFILE.socials.find((social) => social.kind === SocialKind.GITHUB)?.handle ?? "";
const SMALLER = tile_count([...MORE, ...ALSO]);

const { INLINE, BELOW } = RowLayout;

/** `tour`: the tour lights only its own few principles, so its note says so and where the rest are. */
export function summary(action: Action, tour = true): Row[] {
  if (action.kind === ActionKind.HOW) {
    if (!tour) return [{ text: "How I build", detail: `${PRINCIPLES.length} principles`, short: `How I build: ${PRINCIPLES.length}`, layout: INLINE }];
    return [{ text: "How I build", detail: `${PRINCIPLES.length} principles, ${TOUR_PRINCIPLES.length} on the tour`, short: `How I build: ${PRINCIPLES.length}`, layout: INLINE }];
  }
  if (action.kind !== ActionKind.OPEN) return [];
  const [first] = action.windows;
  if (first === Win.IDENTITY) return [{ text: HANDLE ? `${PROFILE.name} (${HANDLE})` : PROFILE.name, detail: PROFILE.role, short: PROFILE.name, layout: BELOW }];
  if (first === Win.TIMELINE) return [{ text: "Work", detail: `${EMPLOYERS}, ${SPAN}`, short: `Work: ${YEARS}`, layout: INLINE }];
  if (first === Win.CONTACT) return [{ text: "Contact", detail: PROFILE.email, short: "Contact: email and links", layout: INLINE }];
  return [{ text: "Projects", detail: `${PROJECTS.length} featured, ${SMALLER} smaller`, short: `Projects: ${PROJECTS.length} + ${SMALLER} more`, layout: INLINE }];
}

export function reply(action: Action): Row[] {
  if (action.kind !== ActionKind.OPEN) return [];
  const [first] = action.windows;
  if (first === Win.IDENTITY || first === Win.CONTACT) return summary(action);
  if (first === Win.TIMELINE) {
    const picked = JOBS.filter((job) => !action.job || job.id === action.job);
    return picked.map((job) => ({ text: job.company, detail: `${job.title}, ${job.period}`, run: `work ${job.id}`, layout: BELOW }));
  }
  const picked = action.project ? [...PROJECTS, ...IN_PROGRESS, ...MORE].filter((p) => p.id === action.project) : [...PROJECTS, ...IN_PROGRESS];
  return picked.map((p) => ({ text: p.name, detail: p.kicker, run: `projects ${p.id}`, layout: BELOW }));
}

/** Clickable next steps under the desktop log: one per kind of thing the terminal can do beyond the tour. */
export const SUGGESTIONS: Row[] = [
  { text: "how", detail: "How I build", run: "how" },
  { text: `work ${JOBS[0].id}`, detail: JOBS[0].company, run: `work ${JOBS[0].id}` },
  { text: `projects ${PROJECTS[1].id}`, detail: PROJECTS[1].name, run: `projects ${PROJECTS[1].id}` },
  { text: "/react", detail: "Search", run: "/react" },
  { text: "help", detail: "Every command", run: "help" },
];
