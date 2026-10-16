import type { AppId } from "./type";

export interface Interest {
  id: string;
  label: string;
  description: string;
  apps: AppId[];
}

/** The intro's "What are you into?" groups (ADR-040): a first boot installs the system apps plus the picked groups. */
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
    apps: ["game-hub", "minesweeper", "sudoku", "solitaire", "nonogram", "twenty-forty-eight"],
  },
  {
    id: "developer",
    label: "Build",
    description: "Dev tools, diffs, randomness and QR codes",
    apps: ["dev-tools", "diff", "rng-tools", "qr-reader"],
  },
];

/** The apps the picked interests install, in group order, without repeats. */
export function interest_apps(picked: Iterable<string>): AppId[] {
  const ids = new Set(picked);
  return [...new Set(INTERESTS.filter((interest) => ids.has(interest.id)).flatMap((interest) => interest.apps))];
}
