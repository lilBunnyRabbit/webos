import { z } from "zod";

export const ALGORITHMS_PROPS = z.object({
  section: z.string().optional(),
  input: z.union([z.string(), z.number(), z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
  params: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  path: z.string().optional(),
});
export type AlgorithmsProps = z.infer<typeof ALGORITHMS_PROPS>;
