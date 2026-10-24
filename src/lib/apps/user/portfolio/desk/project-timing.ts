import { PROJECTS } from "./evidence";
import { PALETTE_DURATION, SEASONS_DURATION, SESSIONS_DURATION, TASKS_DURATION, TRACE_DURATION, WEBOS_DURATION } from "./project-scenes";

export const STAGGER = 250;
export const SLIDE_MS = 400;
export const CARD_LINGER = 250;
export const CARD_CAP = 1300;

export const DURATIONS: Record<string, number> = {
  webos: WEBOS_DURATION,
  chromatics: PALETTE_DURATION,
  "task-manager": TASKS_DURATION,
  petrace: TRACE_DURATION,
  "series-tracker": SEASONS_DURATION,
  agtc: SESSIONS_DURATION,
};

export const PROJECTS_PLAY_MS = Math.max(...PROJECTS.map((project, index) => (DURATIONS[project.id] ?? 0) + index * STAGGER));

export const card_hold = (id: string) => Math.min(CARD_CAP, (DURATIONS[id] ?? 0) + CARD_LINGER);

export const PROJECTS_CAROUSEL_MS = PROJECTS.reduce((sum, project) => sum + card_hold(project.id), 0) + SLIDE_MS * (PROJECTS.length - 1);
