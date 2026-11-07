import { read_levels, track_progress } from "../../core/track";
import type { ProgressSource } from "../define";

export const LEVELS = 16;

export default {
  file: "forklift.json",
  read: (save) => track_progress(read_levels(save), LEVELS),
} satisfies ProgressSource;
