import type { AppAuthor, AppManifest } from "./type";

export const OWNER: AppAuthor = { name: "lilBunnyRabbit", github: "lilBunnyRabbit" };

export function app_authors(manifest: Pick<AppManifest, "authors">): AppAuthor[] {
  return manifest.authors?.length ? manifest.authors : [OWNER];
}

export function author_link(author: AppAuthor): string | null {
  if (author.github) return `https://github.com/${author.github}`;
  return author.url ?? null;
}

export function author_names(manifest: Pick<AppManifest, "authors">): string {
  return app_authors(manifest)
    .map((author) => author.name)
    .join(", ");
}

export interface Credit {
  author: AppAuthor;
  apps: AppManifest[];
}

/** One entry per author, the owner first, then by app count; apps by name. */
export function credits(manifests: Iterable<AppManifest>): Credit[] {
  const by_key = new Map<string, Credit>();
  for (const manifest of manifests) {
    for (const author of app_authors(manifest)) {
      const key = (author.github ?? author.url ?? author.name).toLowerCase();
      const credit = by_key.get(key) ?? { author, apps: [] };
      credit.apps.push(manifest);
      by_key.set(key, credit);
    }
  }
  const owner = OWNER.github!.toLowerCase();
  return [...by_key.entries()]
    .sort(([a, x], [b, y]) => Number(b === owner) - Number(a === owner) || y.apps.length - x.apps.length || x.author.name.localeCompare(y.author.name))
    .map(([, credit]) => ({ ...credit, apps: credit.apps.sort((a, b) => a.name.localeCompare(b.name)) }));
}
