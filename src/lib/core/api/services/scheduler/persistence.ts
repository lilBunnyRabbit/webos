import { z } from "zod";
import { is_valid_zone, parse_date } from "$lib/core/utils/zoned";
import { JobKind, type Job } from "./type";

export const SCHEDULER_PATH = "/var/lib/scheduler/jobs.json";
const MAX_ACTIONS = 2;

const DateText = z.string().refine((text) => parse_date(text) !== null, "not a YYYY-MM-DD day");
const TimeText = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "not an HH:MM time");
const ZoneText = z.string().refine(is_valid_zone, "not an IANA time zone");

const AtSchema = z.union([
  z.strictObject({ epoch: z.number().finite() }),
  z.strictObject({ date: DateText, time: TimeText, tz: ZoneText }),
]);

const Bounds = { until: DateText.optional(), skip: z.array(DateText).optional() };

const RepeatSchema = z.discriminatedUnion("every", [
  z.object({ every: z.literal("day"), interval: z.number().int().min(1).optional(), ...Bounds }),
  z.object({ every: z.literal("week"), days: z.array(z.number().int().min(0).max(6)).min(1), ...Bounds }),
  z.object({ every: z.literal("month"), day: z.number().int().min(1).max(31), ...Bounds }),
  z.object({ every: z.literal("year"), ...Bounds }),
]);

export const JobSchema = z
  .object({
    id: z.string().min(1),
    app: z.string().min(1),
    title: z.string(),
    message: z.string().optional(),
    at: AtSchema,
    repeat: RepeatSchema.optional(),
    armed: z.boolean(),
    snooze_until: z.number().finite().optional(),
    armed_at: z.number().finite().optional(),
    last_fired: z.number().finite().optional(),
    missed_at: z.number().finite().optional(),
    actions: z.array(z.object({ label: z.string().min(1), command: z.string().min(1) })).max(MAX_ACTIONS).optional(),
    open: z.object({ app: z.string().min(1), props: z.record(z.string(), z.unknown()).optional() }).optional(),
    kind: z.enum([JobKind.ALARM, JobKind.TIMER, JobKind.REMINDER, JobKind.PHASE]),
    silent: z.boolean().optional(),
  })
  .refine((job) => job.id.startsWith(`${job.app}:`) && job.id.length > job.app.length + 1, "id must be {app}:{key}")
  .refine((job) => !job.repeat || !("epoch" in job.at), "a repeating job needs a wall time, not an epoch");

export interface Registry {
  version: 1;
  jobs: Job[];
}

export const EMPTY_REGISTRY: Registry = { version: 1, jobs: [] };

const RegistryShape = z.object({ version: z.literal(1), jobs: z.array(z.unknown()) });

/**
 * Never trusts the stored shape: an unreadable file or another version is an empty registry, and a job that fails
 * the schema is dropped alone (with a warning) so one bad edit doesn't lose every alarm. The next write leaves both out.
 */
export function parse_registry(text: string | null): Registry {
  if (text === null) return structuredClone(EMPTY_REGISTRY);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    console.warn("[SchedulerService] jobs.json isn't JSON; starting empty");
    return structuredClone(EMPTY_REGISTRY);
  }
  const shape = RegistryShape.safeParse(raw);
  if (!shape.success) {
    console.warn("[SchedulerService] jobs.json has an unknown shape; starting empty");
    return structuredClone(EMPTY_REGISTRY);
  }
  const jobs: Job[] = [];
  const seen = new Set<string>();
  for (const entry of shape.data.jobs) {
    const job = JobSchema.safeParse(entry);
    if (!job.success) {
      console.warn("[SchedulerService] Dropped an invalid job:", entry, job.error.issues);
      continue;
    }
    if (seen.has(job.data.id)) continue;
    seen.add(job.data.id);
    jobs.push(job.data as Job);
  }
  return { version: 1, jobs };
}

export function serialize_registry(registry: Registry): string {
  return JSON.stringify(registry, null, 2);
}
