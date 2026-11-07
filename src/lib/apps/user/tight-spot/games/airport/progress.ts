import { add_progress, read_levels, track_progress } from "../../core/track";
import type { ProgressSource } from "../define";

export const LEVELS = { pushback: 18, baggage: 8, tow: 11, turnaround: 8 } as const;

export default {
  file: "airport.json",
  read(save) {
    const levels = typeof save === "object" && save !== null ? (save as Record<string, unknown>).levels : undefined;
    return add_progress(...Object.entries(LEVELS).map(([job, count]) => track_progress(read_levels(levels, job), count)));
  },
} satisfies ProgressSource;
