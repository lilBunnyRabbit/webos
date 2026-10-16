import type { AppId } from "./type";

export interface Interest {
  id: string;
  label: string;
  description: string;
  apps: AppId[];
}

/** Suggestions on the intro's "What are you into?" page (ADR-040). Every app is installed anyway; these are the ones shown. */
export const INTERESTS: Interest[] = [
  {
    id: "create",
    label: "Create",
    description: "Pixel art, painting, photos and sound",
    apps: ["hopsprite", "paint", "image-tools", "image-editor", "recorder", "soundboard"],
  },
  {
    id: "productivity",
    label: "Get things done",
    description: "Boards, calendar, focus timer and PDFs",
    apps: ["kanban", "calendar", "pomodoro", "pdf-tools", "markdown-pdf", "work-hours", "time-since"],
  },
  {
    id: "games",
    label: "Play",
    description: "Puzzles and classics, with a daily challenge",
    apps: ["minesweeper", "sudoku", "solitaire", "nonogram", "twenty-forty-eight"],
  },
  {
    id: "developer",
    label: "Build",
    description: "Dev tools, diffs, randomness and QR codes",
    apps: ["dev-tools", "diff", "rng-tools", "qr-reader"],
  },
];

/** The apps the picked interests suggest, in group order, without repeats. */
export function interest_apps(picked: Iterable<string>): AppId[] {
  const ids = new Set(picked);
  return [...new Set(INTERESTS.filter((interest) => ids.has(interest.id)).flatMap((interest) => interest.apps))];
}
