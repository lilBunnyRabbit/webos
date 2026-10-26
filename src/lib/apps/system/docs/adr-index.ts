import { plain } from "$kit/utils/roadmap";

export const AdrStatus = {
  IMPLEMENTED: "implemented",
  ACCEPTED: "accepted",
  SUPERSEDED: "superseded",
  CLOSED: "closed",
} as const;
export type AdrStatus = (typeof AdrStatus)[keyof typeof AdrStatus];

export const STATUS_LABELS: Record<AdrStatus, string> = {
  implemented: "Implemented",
  accepted: "Accepted",
  superseded: "Superseded",
  closed: "Rejected or reverted",
};

export const STATUS_TONES: Record<AdrStatus, "success" | "primary" | "warning" | "neutral"> = {
  implemented: "success",
  accepted: "primary",
  superseded: "warning",
  closed: "neutral",
};

export interface AdrEntry {
  number: number;
  id: string;
  title: string;
  date: string;
  status: string;
  kind: AdrStatus;
}

export function status_kind(status: string): AdrStatus {
  const word = plain(status).toLowerCase();
  if (word.startsWith("implemented")) return AdrStatus.IMPLEMENTED;
  if (word.startsWith("superseded")) return AdrStatus.SUPERSEDED;
  if (word.startsWith("accepted") || word.startsWith("proposed")) return AdrStatus.ACCEPTED;
  return AdrStatus.CLOSED;
}

/** The rows of `docs/adrs/README.md`'s index table: `| [047](./047-x.md) | Title | 2026-10-19 | Implemented |`. */
export function parse_adr_index(markdown: string): AdrEntry[] {
  const entries: AdrEntry[] = [];
  for (const line of markdown.split("\n")) {
    const row = /^\|\s*\[(\d+)\]\(\.\/([^)]+?)\.md\)\s*\|(.*?)\|\s*(\d{4}-\d{2}-\d{2})\s*\|(.*?)\|\s*$/.exec(line);
    if (!row) continue;
    const status = plain(row[5]);
    entries.push({ number: Number(row[1]), id: `adrs/${row[2]}`, title: plain(row[3]), date: row[4], status, kind: status_kind(status) });
  }
  return entries;
}

/**
 * Revision notes in one ADR, in the shapes the ADRs use: `> **Revision 2026-10-15: …**`, `## Revision 2026-10-22`,
 * and dated bullets or bold dates under a `## Revisions` heading.
 */
export function count_revisions(markdown: string): number {
  let count = 0;
  let in_list = false;
  for (const line of markdown.split("\n")) {
    if (/^#{2,3}\s+Revisions\s*$/i.test(line)) {
      in_list = true;
      continue;
    }
    if (/^#{1,3}\s/.test(line)) in_list = false;
    if (/^(?:>\s*)?\*\*Revision\b/i.test(line) || /^#{2,4}\s+Revision\s+\d/i.test(line)) count++;
    else if (in_list && /^(?:-\s+)?\*\*\d{4}-\d{2}-\d{2}/.test(line)) count++;
  }
  return count;
}

export function adr_header(markdown: string): { date: string; status: string } | null {
  const date = /^\*\*Date:\*\*\s*(.+)$/m.exec(markdown);
  const status = /^\*\*Status:\*\*\s*(.+)$/m.exec(markdown);
  return date && status ? { date: date[1].trim(), status: plain(status[1]) } : null;
}
