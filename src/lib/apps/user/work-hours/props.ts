import { z } from "zod";

export const WORK_HOURS_PROPS = z.object({
  month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/).optional(),
  day: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/).optional(),
});
