import { JOBS } from "../content/experience";
import { LinkKind, type Job, type Link, type Principle } from "../content/types";
import { principles_for_job } from "./evidence";
import { first_clause } from "./identity";
import { engagements_of, first_sentence, overlap, studies_of } from "./work-more";
import { span_of, years_of } from "./work-layouts";

export interface WorkUnit {
  name: string;
  line: string;
  link: { url: string; label: string } | null;
  /** The engagement's own years ("2019–2024"); empty when the CV gives none. */
  years: string;
}

export function as_line(sentence: string): string {
  const clause = first_clause(first_sentence(sentence)).replace(/\.$/, "");
  const own = clause.replace(/^[^,]{0,32},\s+(?=I\s)/, "").replace(/^I\s+(?:also\s+)?/, "");
  return own.charAt(0).toUpperCase() + own.slice(1);
}

export function job_line(job: Job): string {
  return as_line(job.summary.paragraphs[0] ?? "");
}

export function full_years(period: string): string {
  const years = years_of(period);
  if (!years) return period;
  return years.from === years.to ? `${years.from}` : `${years.from}–${years.to}`;
}

function site(links: Link[]): WorkUnit["link"] {
  for (const link of links) if (link.kind !== LinkKind.WEBOS) return { url: link.url, label: link.label ?? link.url };
  return null;
}

// A study's line is the highlight that tells it best, so no sentence is written into the app.
export function units_of(job: Job): WorkUnit[] {
  const clients = engagements_of(job);
  if (clients.length > 0) {
    return clients.map(({ engagement, line }) => ({
      name: engagement.client.split(",")[0].trim(),
      line: line ? as_line(line) : "",
      link: engagement.url ? { url: engagement.url, label: engagement.url_label ?? engagement.client } : null,
      years: engagement.years,
    }));
  }
  const highlights = job.highlights?.items ?? [];
  return studies_of(job)
    .filter((study) => study.org === job.company)
    .map((study) => {
      const told = study.blocks.flatMap((block) => [...(block.paragraphs ?? []), ...(block.items ?? []), block.heading]).join(" ");
      const score = (item: string) => overlap(item, `${study.title} ${told}`);
      const best = [...highlights].sort((a, b) => score(b) - score(a))[0];
      return { name: study.title, line: best ? as_line(best) : "", link: site(study.links), years: "" };
    });
}

// The company's own site, once the entry carries one.
export function site_of(job: Job): string | null {
  return "url" in job && typeof job.url === "string" && job.url !== "" ? job.url : null;
}

export function start_year(years: string): number | null {
  const match = /\d{4}/.exec(years);
  return match ? Number(match[0]) : null;
}

function end_year(years: string): number | null {
  const all = years.match(/\d{4}/g);
  return all ? Number(all[all.length - 1]) : null;
}

// Newest first by start, a longer run before a shorter one from the same year; the CV gives no dates for some units, and those came later.
export function newest_first(units: WorkUnit[]): WorkUnit[] {
  const key = (unit: WorkUnit) => [start_year(unit.years) ?? Infinity, end_year(unit.years) ?? Infinity];
  return [...units].sort((a, b) => {
    const [as, ae] = key(a);
    const [bs, be] = key(b);
    return bs - as || be - ae;
  });
}

export interface UnitEntry {
  job: Job;
  site: string | null;
  line: string;
  years: string;
  units: WorkUnit[];
  proven: Principle[];
}

export const WORK_UNITS: UnitEntry[] = JOBS.map((job) => ({ job, site: site_of(job), line: job_line(job), years: full_years(job.period), units: units_of(job), proven: principles_for_job(job.id) }));

export interface AxisSpan {
  id: string;
  years: number[];
}

// Each calendar year goes to the job that held most of its months, so a hand-over in January doesn't put two jobs on one year.
export function axis_years(jobs: Pick<Job, "id" | "period">[], now?: Date): AxisSpan[] {
  const spans = jobs.flatMap((job) => {
    const span = span_of(job.period, now);
    return span ? [{ id: job.id, ...span }] : [];
  });
  spans.sort((a, b) => a.start - b.start);
  const owned: AxisSpan[] = spans.map(({ id }) => ({ id, years: [] }));
  if (spans.length === 0) return owned;
  const first = Math.floor(spans[0].start / 12);
  const last = Math.floor((Math.max(...spans.map((span) => span.end)) - 1) / 12);
  for (let year = first; year <= last; year++) {
    let best = -1;
    let most = 0;
    spans.forEach((span, s) => {
      const months = Math.min(span.end, (year + 1) * 12) - Math.max(span.start, year * 12);
      if (months >= most && months > 0) [best, most] = [s, months];
    });
    if (best >= 0) owned[best].years.push(year);
  }
  return owned;
}

export const WORK_AXIS: AxisSpan[] = axis_years(JOBS);
