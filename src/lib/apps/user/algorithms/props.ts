import { z } from "zod";
import { ALGORITHM_IDS } from "./catalog";

export const ALGORITHMS_PROPS = z.object({
  section: z.enum(ALGORITHM_IDS).optional(),
  input: z.union([z.string(), z.number(), z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
  params: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  path: z.string().optional(),
});
export type AlgorithmsProps = z.infer<typeof ALGORITHMS_PROPS>;
