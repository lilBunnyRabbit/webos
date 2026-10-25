export const SECTION_IDS = ["who", "work", "projects", "how", "contact"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
