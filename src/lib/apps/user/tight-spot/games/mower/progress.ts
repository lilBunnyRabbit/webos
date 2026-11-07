import { read_levels, track_progress } from "../../core/track";
import type { ProgressSource } from "../define";

export const LEVELS = 12;

export default {
  file: "mower.json",
  read: (save) => track_progress(read_levels(save), LEVELS),
} satisfies ProgressSource;
