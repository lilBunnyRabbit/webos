import type { AppId, AppProps } from "$lib/core/api/services/apps/type";

/**
 * Where a block stands in the owner's review (cv repo, `portfolio/brief.md` §5). Only approved (`ok`) or awaiting
 * sign-off (`draft`) copy is written into these files; gated and never-publish material stays out of the bundle.
 */
export const Publication = { OK: "ok", DRAFT: "draft" } as const;
export type Publication = (typeof Publication)[keyof typeof Publication];

export interface Text {
  status: Publication;
  text: string;
}

export interface Paragraphs {
  status: Publication;
  paragraphs: string[];
}

export interface Bullets {
  status: Publication;
  items: string[];
}

export const LinkKind = {
  WEBOS: "webos",
  LIVE: "live",
  SOURCE: "source",
  NPM: "npm",
  DOCS: "docs",
  SITE: "site",
} as const;
export type LinkKind = (typeof LinkKind)[keyof typeof LinkKind];

export type Link =
  | { kind: typeof LinkKind.WEBOS; app: AppId; props?: AppProps; label?: string }
  | { kind: Exclude<LinkKind, typeof LinkKind.WEBOS>; url: string; label?: string };

export interface Profile {
  name: string;
  role: string;
  location: string;
  email: string;
  linkedin: string;
  github: string;
  npm: string;
  positioning: Text;
  availability: Text;
  about_short: Text;
  about_long: Paragraphs;
  education: { status: Publication; items: { field: string; school: string; years: string }[] };
  socials: Social[];
}

export interface Engagement {
  client: string;
  /** Empty for internal work with no client dates. */
  years: string;
  url?: string;
  url_label?: string;
}

export interface Job {
  id: string;
  company: string;
  url?: string;
  title: string;
  period: string;
  place: string;
  about?: Text;
  summary: Paragraphs;
  highlights?: Bullets;
  progression?: string[];
  engagements?: Engagement[];
  links: Link[];
}

export interface CaseBlock {
  heading: string;
  status: Publication;
  paragraphs?: string[];
  items?: string[];
}

export interface CaseStudy {
  id: string;
  title: string;
  org: string;
  blocks: CaseBlock[];
  links: Link[];
}

export interface Project {
  id: string;
  name: string;
  kicker?: string;
  status: Publication;
  tagline: string;
  points: string[];
  stack: string[];
  note?: string;
  /** Show `note` only on desktop: a phone-first project says so where it isn't one. */
  note_desktop_only?: boolean;
  shows?: Record<string, string>;
  badge?: string;
  links: Link[];
}

export const SocialKind = {
  LINKEDIN: "linkedin",
  GITHUB: "github",
  X: "x",
  DISCORD: "discord",
  STACK_OVERFLOW: "stack-overflow",
  REDDIT: "reddit",
  TYPEHERO: "typehero",
  NPM: "npm",
  BRAND: "brand",
} as const;
export type SocialKind = (typeof SocialKind)[keyof typeof SocialKind];

export interface Social {
  kind: SocialKind;
  status: Publication;
  label: string;
  handle: string;
  url: string;
}

export interface MoreProject {
  name: string;
  status: Publication;
  line: string;
  badge: string;
  links: Link[];
}

export interface Principle {
  id: string;
  status: Publication;
  title: string;
  line: string;
  proof: string;
  /** File names in docs/adrs, without .md. */
  adrs: string[];
  links: Link[];
}

export interface SkillGroup {
  status: Publication;
  title: string;
  items: string[];
}
