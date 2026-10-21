export const ProposalStatus = { DRAFT: "draft", SENT: "sent", SHIPPED: "shipped" } as const;
export type ProposalStatus = (typeof ProposalStatus)[keyof typeof ProposalStatus];
export const PROPOSAL_STATUSES: ProposalStatus[] = Object.values(ProposalStatus);

export const STATUS_LABELS: Record<ProposalStatus, string> = { draft: "Draft", sent: "Sent", shipped: "Shipped" };

export const SECTION_IDS = ["problem", "does", "picture", "files", "example", "scope", "phone", "feel"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const ImageDisplay = { INLINE: "inline", BLOCK: "block" } as const;
export type ImageDisplay = (typeof ImageDisplay)[keyof typeof ImageDisplay];

export interface TextRun {
  text: string;
}

export interface ImageRun {
  image: string;
  display: ImageDisplay;
}

export type Run = TextRun | ImageRun;

/** Text runs carry their own line breaks; a block image is a line of its own. */
export type Content = Run[];

export interface Proposal {
  /** Session-only key for the list; not written to the file. */
  id: string;
  title: string;
  status: ProposalStatus;
  sections: Partial<Record<SectionId, Content>>;
}

export interface Notebook {
  title: string;
  proposals: Proposal[];
}

export interface SectionInfo {
  label: string;
  question: string;
}

export const SECTIONS: Record<SectionId, SectionInfo> = {
  problem: { label: "Problem", question: "What's annoying or missing today?" },
  does: { label: "What it does", question: "The core action, in one sentence." },
  picture: { label: "Picture", question: "A sketch, a screenshot, or the tool it's like." },
  files: { label: "Files", question: "Does it open, make or save files? Which formats?" },
  example: { label: "Real example", question: "One concrete time you'd use it." },
  scope: { label: "First vs later", question: "The smallest useful version, and what can wait." },
  phone: { label: "Phone", question: "Does it matter on a phone? How does touch work?" },
  feel: { label: "Feel and name", question: "The mood, the vibe, a name idea." },
};

export const NOTEBOOK_TITLE = "Proposals";
export const UNTITLED = "Untitled proposal";

export const is_image = (run: Run): run is ImageRun => "image" in run;

export function new_id(): string {
  return crypto.randomUUID();
}

export function create_proposal(title = ""): Proposal {
  return { id: new_id(), title, status: ProposalStatus.DRAFT, sections: {} };
}

export function create_notebook(): Notebook {
  return { title: NOTEBOOK_TITLE, proposals: [] };
}

/** The canonical form: adjacent text merged, empty text dropped, whitespace trimmed at both ends. */
export function normalize_content(content: Content): Content {
  const merged: Run[] = [];
  for (const run of content) {
    const last = merged.at(-1);
    if (!is_image(run) && last && !is_image(last)) merged[merged.length - 1] = { text: last.text + run.text };
    else merged.push(is_image(run) ? { image: run.image, display: run.display } : { text: run.text });
  }
  const first = merged[0];
  if (first && !is_image(first)) merged[0] = { text: first.text.trimStart() };
  const end = merged.at(-1);
  if (end && !is_image(end)) merged[merged.length - 1] = { text: end.text.trimEnd() };
  return merged.filter((run) => is_image(run) || run.text !== "");
}

export function is_empty(content: Content | undefined): boolean {
  return !content?.some((run) => is_image(run) || run.text.trim() !== "");
}

export function filled_count(proposal: Proposal): number {
  return SECTION_IDS.filter((id) => !is_empty(proposal.sections[id])).length;
}

export function title_of(proposal: Proposal): string {
  return proposal.title.trim() || UNTITLED;
}

export function add_proposal(notebook: Notebook, proposal: Proposal): Notebook {
  return { ...notebook, proposals: [...notebook.proposals, proposal] };
}

export function update_proposal(notebook: Notebook, id: string, change: (proposal: Proposal) => Proposal): Notebook {
  let changed = false;
  const proposals = notebook.proposals.map((proposal) => {
    if (proposal.id !== id) return proposal;
    const next = change(proposal);
    changed ||= next !== proposal;
    return next;
  });
  return changed ? { ...notebook, proposals } : notebook;
}

export function remove_proposal(notebook: Notebook, id: string): Notebook {
  return { ...notebook, proposals: notebook.proposals.filter((proposal) => proposal.id !== id) };
}

export function set_section(proposal: Proposal, id: SectionId, content: Content): Proposal {
  return { ...proposal, sections: { ...proposal.sections, [id]: content } };
}

export function only(notebook: Notebook, id: string): Notebook {
  return { ...notebook, proposals: notebook.proposals.filter((proposal) => proposal.id === id) };
}

export type StatusFilter = ProposalStatus | "all";

export function filter_proposals(proposals: Proposal[], filter: StatusFilter): Proposal[] {
  return filter === "all" ? proposals : proposals.filter((proposal) => proposal.status === filter);
}
