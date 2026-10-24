import type { AppId, AppProps } from "$lib/core/api/services/apps/type";
import { LinkKind, type Link } from "./content/types";

const LABELS: Record<LinkKind, string> = {
  [LinkKind.WEBOS]: "Open in WebOS",
  [LinkKind.LIVE]: "Live",
  [LinkKind.SOURCE]: "Source",
  [LinkKind.NPM]: "npm",
  [LinkKind.DOCS]: "Docs",
  [LinkKind.SITE]: "Website",
};

export function link_label(link: Link): string {
  if (!link.label) return LABELS[link.kind];
  if (link.kind === LinkKind.SOURCE || link.kind === LinkKind.NPM) return `${LABELS[link.kind]}: ${link.label}`;
  return link.label;
}

/**
 * The app link (ADR-010) a solo window opens in a new tab: solo can't launch a second app. Strings stay raw, the way the
 * router reads `?section=tasks`; anything else is JSON, which it parses back.
 */
export function app_href(app: AppId, props?: AppProps): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value !== undefined) params.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return `#/app/${encodeURIComponent(app)}${params.size > 0 ? `?${params}` : ""}`;
}
