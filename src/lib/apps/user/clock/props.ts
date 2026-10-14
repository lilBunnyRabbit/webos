import { z } from "zod";

export const ClockTab = { WORLD: "world", ALARMS: "alarms", TIMERS: "timers", STOPWATCH: "stopwatch" } as const;
export type ClockTab = (typeof ClockTab)[keyof typeof ClockTab];

export const ClockFace = { ANALOG: "analog", DIGITAL: "digital" } as const;
export type ClockFace = (typeof ClockFace)[keyof typeof ClockFace];

export const CLOCK_PROPS = z.object({
  tab: z.enum(ClockTab).optional(),
  face: z.enum(ClockFace).optional(),
});
