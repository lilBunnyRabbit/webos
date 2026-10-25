import { engagement_line } from "../content/experience";
import type { Engagement, Job } from "../content/types";
import { CASE_STUDIES } from "../content/work";

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []);

/** Share of `a`'s longer words that `b` also uses: a case-study block that mostly restates a highlight adds nothing. */
export function overlap(a: string, b: string): number {
  const mine = words(a);
  if (mine.size === 0) return 0;
  const theirs = words(b);
  return [...mine].filter((word) => theirs.has(word)).length / mine.size;
}

export function first_sentence(text: string): string {
  return text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text;
}

/** Case studies written about this job: its own, or a client's of it ("Blurb, a While True client"). */
export function studies_of(job: Job) {
  const name = job.company.replace(/,.*$/, "");
  return CASE_STUDIES.filter((study) => study.org === job.company || study.org.endsWith(`a ${name} client`));
}

export interface EngagementEntry {
  engagement: Engagement;
  line: string | null;
}

export function engagements_of(job: Job): EngagementEntry[] {
  return (job.engagements ?? []).map((engagement) => ({ engagement, line: engagement_line(job, engagement) }));
}
