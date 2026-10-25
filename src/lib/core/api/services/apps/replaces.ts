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

/** A stored id and props as they open today: a known id as is, a replaced one resolved, an unknown one left for the store's own check. */
export function current_target(manifests: Iterable<AppManifest>, id: AppId, props: AppProps | undefined, known: (id: AppId) => boolean): ReplacedTarget {
  return known(id) ? { id, props } : (resolve_replaced(manifests, id, props) ?? { id, props });
}

/** A list of single launch targets (pins, recents): each replaced id becomes the app a bare launch opens, once. */
export function current_list(manifests: Iterable<AppManifest>, ids: Iterable<AppId>, known: (id: AppId) => boolean): AppId[] {
  const list = [...manifests];
  return [...new Set([...ids].map((id) => current_target(list, id, undefined, known).id))];
}

/** Per-app records (window frames): a replaced id's value goes to every replacing app that has none of its own. */
export function current_records<T>(manifests: Iterable<AppManifest>, records: Record<AppId, T>, known: (id: AppId) => boolean): Record<AppId, T> {
  const list = [...manifests];
  const result: Record<AppId, T> = {};
  for (const [id, value] of Object.entries(records)) if (known(id)) result[id] = value;
  for (const [id, value] of Object.entries(records)) {
    if (known(id)) continue;
    const targets = replacing_apps(list, id);
    if (targets.length === 0) result[id] = value;
    for (const target of targets) if (!(target in result)) result[target] = value;
  }
  return result;
}
