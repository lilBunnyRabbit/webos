import { add_progress, MAX_STARS, read_levels, track_progress } from "../../core/track";
import type { ProgressSource } from "../define";

export const LEVELS = 66;
export const COURSES = 9;

export default {
  file: "parking.json",
  read(save) {
    const extreme = Object.values(read_levels(save, "extreme")).reduce((sum, got) => sum + got, 0);
    const total = COURSES * MAX_STARS;
    return add_progress(track_progress(read_levels(save), LEVELS), { stars: Math.min(total, extreme), total });
  },
} satisfies ProgressSource;
