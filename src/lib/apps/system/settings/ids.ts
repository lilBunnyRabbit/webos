export const PAGE_IDS = [
  "theme",
  "wallpaper",
  "interface",
  "taskbar",
  "notifications",
  "speech",
  "files",
  "shortcuts",
  "backup",
  "offline",
  "whats-new",
  "roadmap",
  "about",
] as const;

export type Page = (typeof PAGE_IDS)[number];

/** Pages a link or a restored window may still name. Appearance split into Theme, Wallpaper and Text & interface. */
const ALIASES = { appearance: "theme" } as const satisfies Record<string, Page>;

export const SECTION_IDS = [...PAGE_IDS, ...(Object.keys(ALIASES) as (keyof typeof ALIASES)[])];

export type SectionId = (typeof SECTION_IDS)[number];

export function page_of(section: SectionId): Page {
  return section in ALIASES ? ALIASES[section as keyof typeof ALIASES] : (section as Page);
}

export const Subpage = { CREATE: "create", COLOURS: "colours" } as const;
export type Subpage = (typeof Subpage)[keyof typeof Subpage];
