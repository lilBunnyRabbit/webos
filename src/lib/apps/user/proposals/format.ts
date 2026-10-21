import {
  ImageDisplay,
  NOTEBOOK_TITLE,
  PROPOSAL_STATUSES,
  ProposalStatus,
  SECTION_IDS,
  SECTIONS,
  UNTITLED,
  is_image,
  new_id,
  normalize_content,
  type Content,
  type Notebook,
  type Proposal,
  type Run,
  type SectionId,
} from "./model";

export const VERSION = 1;
export const EXTENSION = ".proposals.md";

const MARKER = /^<!--\s*proposals:\s*(\d+)\s*-->\s*$/;
const NOTEBOOK_HEADING = /^#[ \t]+(.*?)\s*$/;
const PROPOSAL_HEADING = /^##(?:[ \t]+(.*?))?\s*$/;
const SECTION_HEADING = /^###(?:[ \t]+(.*?))?\s*$/;
const STATUS = /^<!--\s*status:\s*([\w-]+)\s*-->\s*$/;
const DATA_URL = String.raw`data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]*`;
const BLOCK_IMAGE = new RegExp(String.raw`^\s*!\[block\]\((${DATA_URL})\)\s*$`);
const INLINE_IMAGE = new RegExp(String.raw`!\[([^\]\n]*)\]\((${DATA_URL})\)`, "y");
const ESCAPABLE = new Set(["\\", "!", "#", "<"]);

const label_key = (label: string) => label.toLowerCase().replace(/[^a-z]+/g, " ").trim();

const SECTION_KEYS = new Map<string, SectionId>([
  ...SECTION_IDS.map((id) => [label_key(SECTIONS[id].label), id] as const),
  ...SECTION_IDS.map((id) => [id, id] as const),
  ["first version vs later", "scope"],
  ["first version", "scope"],
  ["feel name", "feel"],
  ["feel", "feel"],
  ["name", "feel"],
]);

export function section_of(label: string): SectionId | null {
  return SECTION_KEYS.get(label_key(label)) ?? null;
}

function parse_line(line: string): Run[] {
  const runs: Run[] = [];
  let text = "";
  let at = 0;
  while (at < line.length) {
    const char = line[at];
    if (char === "\\" && ESCAPABLE.has(line[at + 1])) {
      text += line[at + 1];
      at += 2;
      continue;
    }
    if (char === "!" && line[at + 1] === "[") {
      INLINE_IMAGE.lastIndex = at;
      const match = INLINE_IMAGE.exec(line);
      if (match) {
        if (text) runs.push({ text });
        text = "";
        runs.push({ image: match[2], display: ImageDisplay.INLINE });
        at = INLINE_IMAGE.lastIndex;
        continue;
      }
    }
    text += char;
    at++;
  }
  if (text) runs.push({ text });
  return runs;
}

export function parse_content(lines: string[]): Content {
  const runs: Run[] = [];
  let previous_was_text = false;
  for (const line of lines) {
    const block = BLOCK_IMAGE.exec(line);
    if (block) {
      runs.push({ image: block[1], display: ImageDisplay.BLOCK });
      previous_was_text = false;
      continue;
    }
    if (previous_was_text) runs.push({ text: "\n" });
    runs.push(...parse_line(line));
    previous_was_text = true;
  }
  return normalize_content(runs);
}

function escape_piece(piece: string, line_start: boolean): string {
  let escaped = piece.replace(/\\(?=[\\!#<]|$)/g, "\\\\").replace(/!\[/g, "\\![");
  if (line_start && (escaped.startsWith("#") || escaped.startsWith("<!--"))) escaped = `\\${escaped}`;
  return escaped;
}

export function serialize_content(content: Content): string {
  let out = "";
  let previous: "none" | "text" | "block" = "none";
  for (const run of normalize_content(content)) {
    if (is_image(run) && run.display === ImageDisplay.BLOCK) {
      if (previous !== "none") out += "\n";
      out += `![block](${run.image})`;
      previous = "block";
      continue;
    }
    if (previous === "block") out += "\n";
    if (is_image(run)) out += `![](${run.image})`;
    else {
      out += run.text
        .split("\n")
        .map((piece, index) => escape_piece(piece, index > 0 || out === "" || out.endsWith("\n")))
        .join("\n");
    }
    previous = "text";
  }
  return out;
}

interface Draft {
  title: string;
  status: ProposalStatus;
  section: SectionId | null;
  pending: string[];
  lines: Map<SectionId, string[]>;
}

const has_text = (lines: string[]) => lines.some((line) => line.trim() !== "");

function draft(title: string): Draft {
  return { title, status: ProposalStatus.DRAFT, section: null, pending: [], lines: new Map() };
}

function append(target: Draft, id: SectionId, lines: string[]) {
  const existing = target.lines.get(id);
  target.lines.set(id, existing && has_text(existing) ? [...existing, "", ...lines] : lines);
}

function finish(target: Draft): Proposal {
  if (has_text(target.pending)) {
    const first = target.lines.get("problem");
    target.lines.set("problem", [...target.pending, ...(first ? ["", ...first] : [])]);
  }
  const sections: Proposal["sections"] = {};
  for (const id of SECTION_IDS) {
    const lines = target.lines.get(id);
    if (!lines) continue;
    const content = parse_content(lines);
    if (content.length) sections[id] = content;
  }
  return { id: new_id(), title: target.title, status: target.status, sections };
}

/**
 * Reads a `.proposals.md` file. Hand edits are welcome: an unknown `###` heading becomes a line of the section it sits
 * in, text before the first known section joins the next one (Problem if none follows), and text before the first
 * `##` becomes an untitled proposal.
 */
export function parse_notebook(source: string): Notebook {
  let title: string | null = null;
  const proposals: Proposal[] = [];
  let current: Draft | null = null;

  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const marker = MARKER.exec(line);
    if (marker) {
      const version = Number(marker[1]);
      if (version > VERSION) throw new Error(`This file was made by a newer Proposals (format ${version})`);
      continue;
    }

    const proposal = PROPOSAL_HEADING.exec(line);
    if (proposal) {
      if (current) proposals.push(finish(current));
      current = draft(proposal[1] ?? "");
      continue;
    }

    if (!current) {
      const heading: RegExpExecArray | null = title === null ? NOTEBOOK_HEADING.exec(line) : null;
      if (heading) {
        title = heading[1];
        continue;
      }
      if (line.trim() === "") continue;
      current = draft(UNTITLED);
    }

    const status = STATUS.exec(line);
    if (status) {
      const value = status[1].toLowerCase() as ProposalStatus;
      if (PROPOSAL_STATUSES.includes(value)) current.status = value;
      continue;
    }

    const section_heading: RegExpExecArray | null = SECTION_HEADING.exec(line);
    const section = section_heading ? section_of(section_heading[1] ?? "") : null;
    if (section) {
      append(current, section, current.section === null && has_text(current.pending) ? current.pending : []);
      current.pending = [];
      current.section = section;
      continue;
    }

    const text = section_heading ? (section_heading[1] ?? "") : line;
    if (current.section) current.lines.get(current.section)!.push(text);
    else current.pending.push(text);
  }
  if (current) proposals.push(finish(current));
  return { title: title || NOTEBOOK_TITLE, proposals };
}

export function serialize_notebook(notebook: Notebook): string {
  const out = [`<!-- proposals: ${VERSION} -->`, `# ${notebook.title.trim() || NOTEBOOK_TITLE}`, ""];
  for (const proposal of notebook.proposals) {
    out.push(`## ${proposal.title.replace(/\s+/g, " ").trim() || UNTITLED}`, `<!-- status: ${proposal.status} -->`, "");
    for (const id of SECTION_IDS) {
      const content = proposal.sections[id];
      const body = content ? serialize_content(content) : "";
      if (!body) continue;
      out.push(`### ${SECTIONS[id].label}`, body, "");
    }
  }
  return out.join("\n");
}
