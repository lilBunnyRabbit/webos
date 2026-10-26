import { JOBS } from "../content/experience";
import { PRINCIPLES } from "../content/principles";
import { FEATURED, MORE, PACKAGES, WEBOS_CARD } from "../content/projects";
import { Publication, type CaseBlock, type Principle, type Project } from "../content/types";
import { CASE_STUDIES } from "../content/work";

export const PROJECTS = [WEBOS_CARD, ...FEATURED];
export const PROVING: Project[] = [...PROJECTS, ...PACKAGES, ...MORE];

export interface Evidence {
  jobs: string[];
  projects: string[];
}

/** At most this many principles are labelled on one job or project; a longer row reads as a tag cloud of claims. */
export const SHOWN_MAX = 3;

// Six at a readable beat would outlast the rest of the tour; these three light a job, a project and both, and `how`
// cycles all six.
export const TOUR_PRINCIPLES: string[] = ["decisions", "team", "feel"];

export interface WorkProof {
  job: string;
  study: string;
  heading: string;
}

// Draft mapping: the work case-study block that shows a principle in practice, so the job proves it with its own story.
export const WORK_PROOF: Record<string, WorkProof> = {
  team: { job: "astra", study: "astra-engineering", heading: "Engineering knowledge for agents" },
  feel: { job: "astra", study: "astra-engineering", heading: "AI tutor chat" },
};

export function case_block(study: string, heading: string): CaseBlock | null {
  const block = CASE_STUDIES.find((candidate) => candidate.id === study)?.blocks.find((candidate) => candidate.heading === heading);
  return block ?? null;
}

export function work_block(principle: string, job: string): CaseBlock | null {
  const proof = WORK_PROOF[principle];
  return proof && proof.job === job ? case_block(proof.study, proof.heading) : null;
}

/** A principle shows in a project when its proof names the project, or the project's own `shows` says how. */
export const shows_in = (principle: Principle, project: Project) => principle.proof.includes(project.name) || project.shows?.[principle.id] !== undefined;

// Draft mapping: a principle proves a job when its proof text names it, or a case study of the job shows it.
export function evidence_of(principle: Principle): Evidence {
  return {
    jobs: JOBS.filter((job) => principle.proof.includes(job.company) || work_block(principle.id, job.id) !== null).map((job) => job.id),
    projects: PROVING.filter((project) => shows_in(principle, project)).map((project) => project.id),
  };
}

export const EVIDENCE: Record<string, Evidence> = Object.fromEntries(PRINCIPLES.map((principle) => [principle.id, evidence_of(principle)]));

const proves_job = (job: string) => PRINCIPLES.filter((principle) => EVIDENCE[principle.id].jobs.includes(job));
const proves_project = (project: string) => PRINCIPLES.filter((principle) => EVIDENCE[principle.id].projects.includes(project));

/** The tour's principles first, so what the tour lights is always labelled; then the rest in their own order. */
function strongest(principles: Principle[]): Principle[] {
  const rank = (principle: Principle) => {
    const tour = TOUR_PRINCIPLES.indexOf(principle.id);
    return tour >= 0 ? tour : TOUR_PRINCIPLES.length + PRINCIPLES.indexOf(principle);
  };
  const kept = new Set([...principles].sort((a, b) => rank(a) - rank(b)).slice(0, SHOWN_MAX).map((principle) => principle.id));
  return principles.filter((principle) => kept.has(principle.id));
}

export const principles_for_job = (job: string) => strongest(proves_job(job));
export const principles_for_project = (project: string) => strongest(proves_project(project));

/** What lights for a principle: only the jobs and projects that label it, so a glow never lands on a card that doesn't say why. */
export const SHOWN: Record<string, Evidence> = Object.fromEntries(
  PRINCIPLES.map((principle) => [
    principle.id,
    {
      jobs: JOBS.filter((job) => principles_for_job(job.id).includes(principle)).map((job) => job.id),
      projects: PROVING.filter((project) => principles_for_project(project.id).includes(principle)).map((project) => project.id),
    },
  ])
);

export function evidence_names(id: string): string[] {
  const evidence = EVIDENCE[id];
  if (!evidence) return [];
  return [
    ...JOBS.filter((job) => evidence.jobs.includes(job.id)).map((job) => job.company),
    ...PROVING.filter((project) => evidence.projects.includes(project.id)).map((project) => project.name),
  ];
}

/**
 * The one place that tells a lit principle's proof on the desktop, beside its evidence: a project first, since a card is
 * where the eye lands, then a job. Only a place that labels the principle and has its own part of the proof.
 */
export function proof_place(id: string): string | null {
  const principle = PRINCIPLES.find((candidate) => candidate.id === id);
  const shown = SHOWN[id];
  if (!principle || !shown) return null;
  const names = [
    ...PROVING.filter((project) => shown.projects.includes(project.id)).map((project) => project.name),
    ...JOBS.filter((job) => shown.jobs.includes(job.id)).map((job) => job.company),
  ];
  return names.find((name) => proof_for(principle, name) !== null) ?? null;
}

/**
 * The part of a principle's proof about one job or project. A sentence that names a target starts that target's part;
 * the sentences after it, naming nothing, carry on with it. A proof that names nothing else is all about this one.
 */
export function proof_for(principle: Principle, name: string): string | null {
  const shown = PROVING.find((project) => project.name === name)?.shows?.[principle.id];
  if (shown) return shown;
  const names = [...JOBS.map((job) => job.company), ...PROVING.map((project) => project.name)];
  const sentences = principle.proof.match(/[^.!?]+[.!?]+(\s+|$)/g)?.map((sentence) => sentence.trim()) ?? [principle.proof];
  let owner: string | null = null;
  const mine: string[] = [];
  for (const sentence of sentences) {
    const named = names.find((candidate) => sentence.includes(candidate));
    if (named) owner = named;
    if (owner === name) mine.push(sentence);
  }
  return mine.length > 0 ? mine.join(" ") : null;
}

/** A job tells a principle through its own case-study block when one is mapped, else through its part of the proof. */
export function how_for(principle: Principle, name: string): { text: string; status: Publication } | null {
  const job = JOBS.find((candidate) => candidate.company === name);
  const block = job ? work_block(principle.id, job.id) : null;
  const text = block ? [...(block.paragraphs ?? []), ...(block.items ?? [])].join(" ") : proof_for(principle, name);
  const project = PROVING.find((candidate) => candidate.name === name && candidate.shows?.[principle.id]);
  return text ? { text, status: block ? block.status : project ? project.status : principle.status } : null;
}
