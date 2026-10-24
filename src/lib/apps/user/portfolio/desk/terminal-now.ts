import { PRINCIPLES } from "../content/principles";
import { ActionKind, parse, summary, TOUR, TOUR_PRINCIPLES, Win } from "./script";
import type { Line } from "./session.svelte";

export const WINDOW_TITLES: Record<string, string> = {
  [Win.IDENTITY]: "Who I am",
  [Win.TIMELINE]: "Work",
  [Win.PROJECTS]: "Projects",
  [Win.HOW]: "How I build",
  [Win.CONTACT]: "Contact",
};

export function title_of(command: string): string | null {
  const action = parse(command);
  if (action.kind === ActionKind.HOW) return WINDOW_TITLES[Win.HOW];
  if (action.kind === ActionKind.OPEN) return WINDOW_TITLES[action.windows[0]] ?? null;
  return null;
}

export const Did = {
  OPENED: "opened",
  LIT: "lit",
  SEARCHED: "searched",
  LISTED: "listed",
  CLOSED: "closed",
  TIDIED: "tidied",
  ERROR: "error",
} as const;
export type Did = (typeof Did)[keyof typeof Did];

export interface Outcome {
  did: Did;
  label: string;
}

export function outcome_of(input: string, lines: Pick<Line, "tone" | "hit" | "principle">[]): Outcome | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const principle = lines.find((line) => line.principle)?.principle;
  if (trimmed.startsWith("/") || lines.some((line) => line.hit)) {
    if (principle) return { did: Did.LIT, label: "lit a principle" };
    return { did: Did.SEARCHED, label: "searched" };
  }
  const action = parse(trimmed);
  switch (action.kind) {
    case ActionKind.OPEN:
      return { did: Did.OPENED, label: `opened ${WINDOW_TITLES[action.windows[0]] ?? "a window"}` };
    case ActionKind.HOW: {
      if (!action.principle) return { did: Did.OPENED, label: `opened ${WINDOW_TITLES[Win.HOW]}` };
      return { did: Did.LIT, label: "lit a principle" };
    }
    case ActionKind.CLOSE:
      return { did: Did.CLOSED, label: "closed" };
    case ActionKind.TIDY:
      return { did: Did.TIDIED, label: "tidied" };
    case ActionKind.HELP:
      return { did: Did.LISTED, label: "listed commands" };
    case ActionKind.LS:
      return { did: Did.LISTED, label: "listed windows" };
    case ActionKind.ERROR:
      return { did: Did.ERROR, label: "not a command" };
    default:
      return null;
  }
}

export const Phase = {
  TYPING: "typing",
  SHOWING: "showing",
  NEXT: "next",
  PAUSED: "paused",
  DONE: "done",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export interface NowInput {
  tour: "playing" | "paused" | "done";
  /** Commands already run: while one is typed, its own index. */
  step: number;
  typed: string;
  beat: string | null;
  lit: string | null;
  cycling: boolean;
}

export interface Now {
  phase: Phase;
  index: number;
  command: string;
  title: string;
  detail?: string;
  principle?: { title: string; at: number; of: number };
}

export function now_of(input: NowInput): Now {
  const at = (index: number): Pick<Now, "command" | "title" | "detail"> => {
    const step = TOUR[Math.max(0, Math.min(index, TOUR.length - 1))];
    const row = summary(parse(step.line), true)[0];
    return { command: step.line, title: title_of(step.line) ?? step.line, detail: row?.detail };
  };
  if (input.tour === "done") return { phase: Phase.DONE, index: TOUR.length, command: "", title: "" };
  if (input.tour === "paused") return { phase: Phase.PAUSED, index: input.step, ...at(input.step) };
  if (input.typed) return { phase: Phase.TYPING, index: input.step, ...at(input.step) };
  if (input.beat) {
    const index = Math.max(0, TOUR.findIndex((step) => step.line === input.beat));
    const lit = input.cycling && input.lit ? TOUR_PRINCIPLES.indexOf(input.lit) : -1;
    const principle = lit >= 0 ? { title: PRINCIPLES.find((p) => p.id === input.lit)?.title ?? "", at: lit + 1, of: TOUR_PRINCIPLES.length } : undefined;
    return { phase: Phase.SHOWING, index, ...at(index), principle };
  }
  return { phase: Phase.NEXT, index: input.step, ...at(input.step) };
}
