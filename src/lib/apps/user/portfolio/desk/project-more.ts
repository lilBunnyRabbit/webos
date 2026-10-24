import type { Link, MoreProject, Project } from "../content/types";

export const MoreLayout = { ICONS: "icons", LABELLED: "labelled", GROUPED: "grouped" } as const;
export type MoreLayout = (typeof MoreLayout)[keyof typeof MoreLayout];

export interface MoreRow {
  id: string;
  name: string;
  status: Project["status"];
  line: string;
  note?: string;
  badge?: string;
  layout: MoreLayout;
  links: Link[];
  groups: { name: string; line?: string; links: Link[] }[];
}

export function line_for(points: string[], name: string): string | undefined {
  const line = points.find((point) => point.startsWith(`${name}:`))?.slice(name.length + 1).trim();
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : undefined;
}

export function now_of(project: Project): string | undefined {
  return project.points.find((point) => point.startsWith("Now:"))?.slice(4).trim();
}

/**
 * Links that share a label belong to one thing (a package with an npm page and a repo), so they become a sub-row per
 * label. Unique labels name different destinations and stay written out; unlabelled links collapse to icons.
 */
export function more_row(project: Project | MoreProject, desktop: boolean): MoreRow {
  const id = "id" in project ? project.id : project.name;
  const line = "tagline" in project ? project.tagline : project.line;
  const note = "note" in project && !(project.note_desktop_only && !desktop) ? project.note : undefined;
  const labels = project.links.map((link) => link.label);
  const base = { id, name: project.name, status: project.status, line, note, badge: project.badge, links: project.links, groups: [] };

  if (labels.some((label) => label === undefined)) return { ...base, layout: MoreLayout.ICONS };
  const unique = [...new Set(labels as string[])];
  if (unique.length === labels.length) return { ...base, layout: MoreLayout.LABELLED };
  return {
    ...base,
    layout: MoreLayout.GROUPED,
    groups: unique.map((name) => ({
      name,
      line: line_for("points" in project ? project.points : [], name),
      links: project.links.filter((link) => link.label === name).map((link) => ({ ...link, label: undefined })),
    })),
  };
}

/** One tile per small project, and one per package for a project that groups several. */
export function tile_count(projects: (Project | MoreProject)[]): number {
  return projects.reduce((count, project) => count + Math.max(1, more_row(project, true).groups.length), 0);
}
