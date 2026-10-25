import type { AppId, AppManifest, AppProps } from "./type";

export interface ReplacedTarget {
  id: AppId;
  props: AppProps | undefined;
}

const matches = (wanted: AppProps, props: AppProps | undefined) =>
  Object.entries(wanted).every(([key, value]) => props !== undefined && props[key] === value);

// The entry naming most matching props wins; one without props catches the rest, so a bare old link still lands (ADR-071).
export function resolve_replaced(manifests: Iterable<AppManifest>, id: AppId, props: AppProps | undefined): ReplacedTarget | null {
  let best: { id: AppId; wanted: AppProps } | null = null;
  for (const manifest of manifests) {
    for (const entry of manifest.replaces ?? []) {
      const wanted = entry.props ?? {};
      if (entry.app !== id || !matches(wanted, props)) continue;
      if (!best || Object.keys(wanted).length > Object.keys(best.wanted).length) best = { id: manifest.id, wanted };
    }
  }
  if (!best) return null;
  const wanted = best.wanted;
  const rest = props && Object.fromEntries(Object.entries(props).filter(([key]) => !(key in wanted)));
  return { id: best.id, props: rest && Object.keys(rest).length > 0 ? rest : undefined };
}

export function replacing_apps(manifests: Iterable<AppManifest>, id: AppId): AppId[] {
  return [...manifests].filter((manifest) => manifest.replaces?.some((entry) => entry.app === id)).map((manifest) => manifest.id);
}

export function current_ids(manifests: Iterable<AppManifest>, ids: Iterable<AppId>, known: (id: AppId) => boolean): AppId[] {
  const list = [...manifests];
  return [...new Set([...ids].flatMap((id) => (known(id) ? [id] : replacing_apps(list, id))))];
}
