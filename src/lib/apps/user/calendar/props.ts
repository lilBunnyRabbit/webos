import { z } from "zod";

export const View = { MONTH: "month", WEEK: "week", AGENDA: "agenda" } as const;
export type View = (typeof View)[keyof typeof View];

export const DAY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

export const CALENDAR_PROPS = z.object({
  day: z.string().regex(DAY).optional(),
  view: z.enum(View).optional(),
});
