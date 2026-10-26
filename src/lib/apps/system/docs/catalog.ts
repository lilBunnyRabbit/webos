export const DocGroup = {
  SYSTEM: "system",
  SERVICES: "services",
  SHELL: "shell",
  ADRS: "adrs",
  DESIGN: "design",
  APPS: "apps",
  ROADMAP: "roadmap",
} as const;
export type DocGroup = (typeof DocGroup)[keyof typeof DocGroup];

export const GROUP_LABELS: Record<DocGroup, string> = {
  system: "System",
  services: "Services",
  shell: "Shell",
  adrs: "ADRs",
  design: "Design",
  apps: "Apps",
  roadmap: "Roadmap",
};

export const GROUP_ORDER: DocGroup[] = ["system", "services", "shell", "adrs", "design", "apps", "roadmap"];
// Who claims a short alias first: `shell` and `desktop` mean the services, not the shell pages.
const ALIAS_ORDER: DocGroup[] = ["services", "system", "shell", "design", "apps", "adrs", "roadmap"];

export const REPO_URL = "https://github.com/lilBunnyRabbit/webos/blob/master/";

export const ROADMAP_ID = "ROADMAP";
export const ADR_INDEX_ID = "adrs/README";

const FOLDER_ALIASES: Record<string, string> = {
  system: "system/README",
  adrs: ADR_INDEX_ID,
  adr: ADR_INDEX_ID,
  decisions: ADR_INDEX_ID,
  design: "design/README",
  apps: "apps/README",
  roadmap: ROADMAP_ID,
};

export function page_id(path: string): string {
  return path.replace(/^\/?docs\//, "").replace(/\.md$/, "");
}

export function file_path(id: string): string {
  return `docs/${id}.md`;
}

export function group_of(id: string): DocGroup {
  if (id === ROADMAP_ID) return DocGroup.ROADMAP;
  if (id.startsWith("system/services/")) return DocGroup.SERVICES;
  if (id.startsWith("system/shell/")) return DocGroup.SHELL;
  const top = id.split("/")[0];
  if (top === "adrs" || top === "design" || top === "apps") return top;
  return DocGroup.SYSTEM;
}

export function adr_number(id: string): number | null {
  const match = /^adrs\/(\d+)-/.exec(id);
  return match ? Number(match[1]) : null;
}

export function fallback_title(id: string): string {
  if (id === ROADMAP_ID) return "Roadmap";
  const segments = id.split("/");
  const last = segments.at(-1)!;
  if (last === "README") return id === ADR_INDEX_ID ? "ADR index" : `${GROUP_LABELS[group_of(id)]} overview`;
  const words = last.replace(/^\d+-/, "").replaceAll("-", " ");
  const title = words.charAt(0).toUpperCase() + words.slice(1);
  const number = adr_number(id);
  return number === null ? title : `ADR-${String(number).padStart(3, "0")}: ${title}`;
}

function normalize(topic: string): string {
  return topic
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^\/+/, "")
    .replace(/^docs\//i, "")
    .replace(/\.md$/i, "")
    .replace(/\/+$/, "");
}

export function build_aliases(ids: readonly string[]): Map<string, string> {
  const aliases = new Map<string, string>();
  const claim = (alias: string, id: string) => {
    const key = alias.toLowerCase();
    if (key && !aliases.has(key)) aliases.set(key, id);
  };
  const known = new Set(ids);
  for (const [alias, id] of Object.entries(FOLDER_ALIASES)) if (known.has(id)) claim(alias, id);

  const ordered = [...ids].sort((a, b) => ALIAS_ORDER.indexOf(group_of(a)) - ALIAS_ORDER.indexOf(group_of(b)));
  for (const id of ordered) {
    const number = adr_number(id);
    if (number !== null) {
      claim(`adr ${number}`, id);
      claim(`adr-${String(number).padStart(3, "0")}`, id);
      claim(`adrs/${String(number).padStart(3, "0")}`, id);
    }
  }
  for (const id of ordered) {
    const segments = id.split("/");
    if (segments.at(-1) === "README") continue;
    for (let start = segments.length - 1; start >= 1; start--) claim(segments.slice(start).join("/"), id);
    if (number_free(segments.at(-1)!) !== segments.at(-1)) claim(number_free(segments.at(-1)!), id);
  }
  return aliases;
}

function number_free(name: string): string {
  return name.replace(/^\d+-/, "");
}

export function resolve_page(ids: readonly string[], aliases: Map<string, string>, topic: string): string | null {
  const wanted = normalize(topic);
  if (!wanted) return null;
  const exact = ids.find((id) => id.toLowerCase() === wanted.toLowerCase());
  if (exact) return exact;
  const key = wanted.toLowerCase();
  const number = /^(?:adrs?[\s/-]*)?0*(\d{1,3})$/.exec(key);
  if (number) {
    const id = ids.find((item) => adr_number(item) === Number(number[1]));
    if (id) return id;
  }
  return aliases.get(key) ?? null;
}

export function suggest_pages(ids: readonly string[], aliases: Map<string, string>, topic: string, limit = 3): string[] {
  const needle = normalize(topic).toLowerCase();
  if (!needle) return [];
  const scored = new Map<string, number>();
  const score = (name: string, id: string) => {
    const at = name.indexOf(needle);
    if (at < 0) return;
    const value = (at === 0 ? 0 : 10) + name.length;
    if (!scored.has(id) || value < scored.get(id)!) scored.set(id, value);
  };
  for (const id of ids) score(id.toLowerCase(), id);
  for (const [alias, id] of aliases) score(alias, id);
  return [...scored.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([id]) => id);
}

export function short_name(id: string, aliases: Map<string, string>): string {
  let best = id;
  for (const [alias, target] of aliases) if (target === id && !alias.includes(" ") && alias.length < best.length) best = alias;
  return best;
}

export type LinkTarget = { kind: "doc"; id: string; hash: string } | { kind: "anchor"; hash: string } | { kind: "external"; url: string };

export function resolve_link(from: string, href: string, ids: ReadonlySet<string>): LinkTarget {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: "external", url: href };
  const hash_at = href.indexOf("#");
  const path = hash_at < 0 ? href : href.slice(0, hash_at);
  const hash = hash_at < 0 ? "" : decodeURIComponent(href.slice(hash_at + 1));
  if (!path) return { kind: "anchor", hash };

  const base = file_path(from).split("/").slice(0, -1);
  const parts = path.startsWith("/") ? [] : base;
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  const resolved = parts.join("/");
  if (resolved.startsWith("docs/")) {
    const id = page_id(resolved);
    if (ids.has(id)) return { kind: "doc", id, hash };
    if (ids.has(`${id}/README`)) return { kind: "doc", id: `${id}/README`, hash };
  }
  return { kind: "external", url: REPO_URL + resolved + (hash ? `#${hash}` : "") };
}
