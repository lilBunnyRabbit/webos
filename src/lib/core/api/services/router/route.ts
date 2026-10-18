import { z } from "zod";
import type { AppId, AppManifest, AppProps } from "../apps/type";
import { SOLO_PREFIX } from "../../kernel/mode";

export const RouteKind = {
  /** `#/app/{id}?{props}`: the app inside the OS (ADR-010). */
  APP: "app",
  /** `#/solo/{id}?{props}`: the app alone, full page (ADR-047). */
  SOLO: "solo",
} as const;
export type RouteKind = (typeof RouteKind)[keyof typeof RouteKind];

export interface Route {
  kind: RouteKind;
  id: AppId;
  props: AppProps | undefined;
}

const PREFIXES: Record<RouteKind, string> = { [RouteKind.APP]: "#/app/", [RouteKind.SOLO]: SOLO_PREFIX };

/** `null` when the hash isn't a WebOS link. Props come back unvalidated: the app's schema decides. */
export function parse_hash(hash: string): Route | null {
  const kind = Object.values(RouteKind).find((candidate) => hash.startsWith(PREFIXES[candidate]));
  if (!kind) return null;

  const rest = hash.slice(PREFIXES[kind].length);
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
  return { kind, id, props: Object.keys(props).length > 0 ? props : undefined };
}

export function serialize_route(route: Route): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(route.props ?? {})) {
    if (value !== undefined) params.set(key, encode_value(value));
  }
  const query = params.size > 0 ? `?${params}` : "";
  return `${PREFIXES[route.kind]}${encodeURIComponent(route.id)}${query}`;
}

/** The full URL of a route on this deployment. */
export function route_url(route: Route): string {
  return `${location.origin}${location.pathname}${serialize_route(route)}`;
}

const DEVICE_PROPS = new Set(["path", "paths", "left", "right"]);

const is_device_path = (value: unknown): boolean =>
  (typeof value === "string" && value.startsWith("/")) || (Array.isArray(value) && value.length > 0 && value.every(is_device_path));

/**
 * The props a link can carry. Paths name files in the sender's OPFS, which the receiving machine doesn't have, so they
 * are left out (owner, 2026-10-15: every window gets Copy link; a file window links to its app without the file).
 */
export function shareable_props(props: AppProps | undefined): { props: AppProps | undefined; dropped: boolean } {
  if (!props) return { props, dropped: false };
  const kept = Object.fromEntries(Object.entries(props).filter(([key, value]) => !DEVICE_PROPS.has(key) && !is_device_path(value)));
  const dropped = Object.keys(kept).length !== Object.keys(props).length;
  return { props: Object.keys(kept).length ? kept : undefined, dropped };
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
