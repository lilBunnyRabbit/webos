export const ItemStatus = { DONE: "done", PARTIAL: "partial", PLANNED: "planned" } as const;
export type ItemStatus = (typeof ItemStatus)[keyof typeof ItemStatus];

export interface RoadmapItem {
  status: ItemStatus;
  text: string;
  depth: number;
}

export interface RoadmapSection {
  group: string;
  title: string;
  items: RoadmapItem[];
}

const MARKS: Record<string, ItemStatus> = { x: ItemStatus.DONE, "-": ItemStatus.PARTIAL, " ": ItemStatus.PLANNED };

/** Markdown inline syntax down to plain words: links keep their label, emphasis and code marks go. */
export function plain(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/~~([^~]*)~~/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** `docs/ROADMAP.md` as sections of checklist items: `##` is the group, `###` the section; lines outside lists are skipped. */
export function parse_roadmap(markdown: string): RoadmapSection[] {
  const sections: RoadmapSection[] = [];
  let group = "";
  let current: RoadmapSection | null = null;

  for (const line of markdown.split("\n")) {
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      const title = plain(heading[2]);
      if (heading[1] === "##") {
        group = title;
        current = { group, title, items: [] };
      } else {
        current = { group, title, items: [] };
      }
      sections.push(current);
      continue;
    }
    const item = /^(\s*)[-*]\s+\[([ x-])\]\s+(.*)$/.exec(line);
    if (item && current) {
      current.items.push({ status: MARKS[item[2]], text: plain(item[3]), depth: Math.floor(item[1].length / 2) });
    }
  }
  return sections.filter((section) => section.items.length > 0);
}

export function count_status(sections: RoadmapSection[]): Record<ItemStatus, number> {
  const counts = { [ItemStatus.DONE]: 0, [ItemStatus.PARTIAL]: 0, [ItemStatus.PLANNED]: 0 };
  for (const section of sections) for (const item of section.items) counts[item.status]++;
  return counts;
}
