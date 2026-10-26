import { JOBS } from "../content/experience";
import { PRINCIPLES } from "../content/principles";
import { PROFILE } from "../content/profile";
import { SKILLS } from "../content/skills";
import { Publication, SocialKind, type Job } from "../content/types";
import { evidence_names } from "./evidence";
import { PACKAGES } from "../content/projects";
import { IN_PROGRESS, PROJECTS, Win } from "./script";
import { studies_of } from "./work-more";

export const HitKind = { JOB: "job", PROJECT: "project", SKILL: "skill", PRINCIPLE: "principle", LINK: "link" } as const;
export type HitKind = (typeof HitKind)[keyof typeof HitKind];

export const HIT_LABELS: Record<HitKind, string> = {
  [HitKind.JOB]: "Work",
  [HitKind.PROJECT]: "Project",
  [HitKind.SKILL]: "Skill",
  [HitKind.PRINCIPLE]: "Principle",
  [HitKind.LINK]: "Contact",
};

export interface Hit {
  key: string;
  kind: HitKind;
  label: string;
  detail: string;
  window?: string;
  principle?: string;
  job?: string;
  project?: string;
  terms: string;
}

const LINKED = new Set<string>([SocialKind.LINKEDIN, SocialKind.GITHUB, SocialKind.X, SocialKind.NPM]);


// A framework names the library under it: work on Next.js is work in React, so a search for React finds that job too.
const IMPLIED: Record<string, string[]> = { React: ["Next.js"] };

const job_text = (job: Job) =>
  [
    job.about?.text ?? "",
    ...(job.highlights?.items ?? []),
    ...job.summary.paragraphs,
    ...(job.engagements ?? []).map((e) => e.client),
    ...studies_of(job).flatMap((study) => study.blocks.flatMap((block) => [block.heading, ...(block.paragraphs ?? []), ...(block.items ?? [])])),
  ].join(" ");

const mentions = (text: string, word: string) => new RegExp(`(^|[^\\w])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\w])`, "i").test(text);

const names_for = (skill: string) => [skill, ...(IMPLIED[skill] ?? [])];

/** The skills a job's text names, directly or through a framework built on them. */
const implied_by = (text: string) => Object.keys(IMPLIED).filter((skill) => IMPLIED[skill].some((name) => mentions(text, name)));

/** A skill opens the work that names it, else the project built with it; one nobody names just answers in the terminal. */
function skill_hit(skill: string, group: string): Hit {
  const job = JOBS.find((candidate) => names_for(skill).some((name) => mentions(job_text(candidate), name)));
  const project = job ? undefined : PROJECTS.find((candidate) => candidate.stack.some((item) => item.toLowerCase() === skill.toLowerCase()));
  return {
    key: `skill-${skill}`,
    kind: HitKind.SKILL,
    label: skill,
    detail: job ? `${group}, at ${job.company}` : project ? `${group}, in ${project.name}` : group,
    window: job ? Win.TIMELINE : project ? Win.PROJECTS : undefined,
    job: job?.id,
    project: project?.id,
    terms: skill,
  };
}

export const HITS: Hit[] = [
  ...JOBS.map((job) => ({
    key: `job-${job.id}`,
    kind: HitKind.JOB,
    label: job.company,
    detail: `${job.title}, ${job.period}`,
    window: Win.TIMELINE,
    job: job.id,
    terms: [job.company, job.title, job.place, ...(job.progression ?? []), job_text(job), ...implied_by(job_text(job))].join(" "),
  })),
  ...[...PROJECTS, ...PACKAGES, ...IN_PROGRESS].map((project) => ({
    key: `project-${project.id}`,
    kind: HitKind.PROJECT,
    label: project.name,
    detail: project.kicker ?? "",
    window: Win.PROJECTS,
    project: project.id,
    terms: [project.name, project.kicker ?? "", project.tagline, ...project.stack].join(" "),
  })),
  ...SKILLS.flatMap((group) => group.items.map((skill) => skill_hit(skill, group.title))),
  ...PRINCIPLES.map((principle) => ({
    key: `principle-${principle.id}`,
    kind: HitKind.PRINCIPLE,
    label: principle.title,
    detail: evidence_names(principle.id).join(", "),
    principle: principle.id,
    terms: [principle.title, principle.line].join(" "),
  })),
  { key: "link-email", kind: HitKind.LINK, label: "Email", detail: PROFILE.email, window: Win.CONTACT, terms: `email mail ${PROFILE.email}` },
  ...PROFILE.socials
    .filter((social) => LINKED.has(social.kind) && social.status === Publication.OK)
    .map((social) => ({
      key: `link-${social.kind}`,
      kind: HitKind.LINK,
      label: social.label,
      detail: social.handle,
      window: Win.CONTACT,
      terms: `${social.label} ${social.handle}`,
    })),
];

function score(hit: Hit, words: string[]): number {
  const label = hit.label.toLowerCase();
  const terms = `${label} ${hit.detail.toLowerCase()} ${hit.terms.toLowerCase()}`;
  if (!words.every((word) => terms.includes(word))) return 0;
  const [first] = words;
  if (label.startsWith(first)) return 3;
  if (label.split(/\s+/).some((word) => word.startsWith(first))) return 2;
  return 1;
}

export function search(query: string, hits: Hit[] = HITS, limit = 6): Hit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return hits.filter((hit) => hit.kind !== HitKind.PRINCIPLE && hit.kind !== HitKind.SKILL).slice(0, limit);
  return hits
    .map((hit, index) => ({ hit, index, score: score(hit, words) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.hit);
}
