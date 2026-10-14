import { z } from "zod";
import type { AppId, AppManifest, AppProps } from "../apps/type";

/** A deep link: `#/app/{id}?{props}` (ADR-010). Only app links exist in v1. */
export interface AppRoute {
  kind: "app";
  id: AppId;
  props: AppProps | undefined;
}
export type Route = AppRoute;

const APP_PREFIX = "#/app/";

/** `null` when the hash isn't a WebOS link. Props come back unvalidated: the app's schema decides. */
export function parse_hash(hash: string): Route | null {
  if (!hash.startsWith(APP_PREFIX)) return null;

  const rest = hash.slice(APP_PREFIX.length);
  const query_at = rest.indexOf("?");
  const raw_id = query_at === -1 ? rest : rest.slice(0, query_at);
  let id: string;
  try {
    id = decodeURIComponent(raw_id);
  } catch {
    return null;
  }
  if (!id || id.includes("/")) return null;

  const params = new URLSearchParams(query_at === -1 ? "" : rest.slice(query_at + 1));
  const props = Object.fromEntries([...params].map(([key, value]) => [key, decode_value(value)]));
  return { kind: "app", id, props: Object.keys(props).length > 0 ? props : undefined };
}

export function serialize_route(route: Route): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(route.props ?? {})) {
    if (value !== undefined) params.set(key, encode_value(value));
  }
  const query = params.size > 0 ? `?${params}` : "";
  return `${APP_PREFIX}${encodeURIComponent(route.id)}${query}`;
}

/** A path prop names a file in the sender's OPFS, which the receiving machine doesn't have. */
export function is_shareable(manifest: Pick<AppManifest, "props">): boolean {
  return !(manifest.props instanceof z.ZodObject && "path" in manifest.props.shape);
}

// Strings stay raw so `?section=about` reads naturally; the cost is that a string like "3" comes back as a number.
function decode_value(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function encode_value(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
