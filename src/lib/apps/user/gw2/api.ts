export const API_ROOT = "https://api.guildwars2.com/v2";

export const BULK_LIMIT = 200;

export const ACCOUNT_MAX_AGE = 5 * 60_000;

export const Scope = {
  ACCOUNT: "account",
  CHARACTERS: "characters",
  INVENTORIES: "inventories",
  PROGRESSION: "progression",
  WALLET: "wallet",
} as const;
export type Scope = (typeof Scope)[keyof typeof Scope];

export const Gw2ErrorKind = {
  NO_KEY: "no-key",
  INVALID_KEY: "invalid-key",
  MISSING_SCOPE: "missing-scope",
  OFFLINE: "offline",
  RATE_LIMIT: "rate-limit",
  NOT_FOUND: "not-found",
  UNAVAILABLE: "unavailable",
  FAILED: "failed",
} as const;
export type Gw2ErrorKind = (typeof Gw2ErrorKind)[keyof typeof Gw2ErrorKind];

export class Gw2Error extends Error {
  readonly kind: Gw2ErrorKind;

  constructor(kind: Gw2ErrorKind, message: string) {
    super(message);
    this.name = "Gw2Error";
    this.kind = kind;
  }
}

export interface TokenInfo {
  id: string;
  name: string;
  permissions: string[];
}

export interface Slot {
  id: number;
  count: number;
}

export interface Character {
  name: string;
  bags?: ({ inventory: (Slot | null)[] } | null)[];
}

export interface VaultObjective {
  id: number;
  title: string;
  track: string;
  acclaim: number;
  progress_current: number;
  progress_complete: number;
  claimed: boolean;
}

export interface VaultProgress {
  meta_progress_current?: number;
  meta_progress_complete?: number;
  meta_reward_astral?: number;
  meta_reward_claimed?: boolean;
  objectives: VaultObjective[];
}

export interface Currency {
  id: number;
  name: string;
  description: string;
  order: number;
  icon: string;
}

export interface WalletEntry {
  id: number;
  value: number;
}

export interface Item {
  id: number;
  name: string;
  icon: string;
  rarity: string;
  type: string;
}

export interface Fetched<T> {
  data: T;
  at: number;
}

export function missing_scopes(permissions: readonly string[], needed: readonly Scope[]): Scope[] {
  return needed.filter((scope) => !permissions.includes(scope));
}

export function looks_like_key(text: string): boolean {
  return /^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{20}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i.test(text.trim());
}

export function classify_status(status: number, text: string): Gw2Error {
  const scope = /requires scope (\w+)/i.exec(text);
  if (scope) return new Gw2Error(Gw2ErrorKind.MISSING_SCOPE, `This key lacks the ${scope[1]} permission.`);
  if (status === 401 || status === 403 || /invalid (access token|key)/i.test(text))
    return new Gw2Error(Gw2ErrorKind.INVALID_KEY, "The API key was rejected. Check it, or make a new one.");
  if (status === 429)
    return new Gw2Error(Gw2ErrorKind.RATE_LIMIT, "Too many requests. The API allows a few hundred a minute; wait a moment and refresh.");
  if (status === 404) return new Gw2Error(Gw2ErrorKind.NOT_FOUND, text || "Not found.");
  if (status >= 500)
    return new Gw2Error(Gw2ErrorKind.UNAVAILABLE, "The Guild Wars 2 API is down or under maintenance. Try again later.");
  return new Gw2Error(Gw2ErrorKind.FAILED, text || `The API answered ${status}.`);
}

// fetch() rejects with a bare TypeError for offline, DNS and CORS alike; onLine is the only hint which.
export function classify_failure(online: boolean): Gw2Error {
  if (!online) return new Gw2Error(Gw2ErrorKind.OFFLINE, "You're offline. Connect and refresh.");
  return new Gw2Error(Gw2ErrorKind.FAILED, "Couldn't reach the Guild Wars 2 API.");
}

/** The key goes in the query, not a header: the API answers no CORS preflight, which an Authorization header triggers. */
export function request_url(path: string, params: Record<string, string> = {}, key?: string): string {
  const url = new URL(API_ROOT + path);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  if (key) url.searchParams.set("access_token", key);
  return url.href;
}

export function chunk<T>(items: readonly T[], size = BULK_LIMIT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetch_json(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw classify_failure(navigator.onLine);
  }
  const text = await response.text();
  if (response.ok) return JSON.parse(text);
  let message = text;
  try {
    message = String((JSON.parse(text) as { text?: unknown }).text ?? text);
  } catch {
    message = text;
  }
  throw classify_status(response.status, message);
}

// In memory only, by the owner's call: answers last until Refresh or reload, and only the key and goals persist.
const cache = new Map<string, Fetched<unknown>>();
const pending = new Map<string, Promise<Fetched<unknown>>>();

interface GetOptions {
  key?: string;
  params?: Record<string, string>;
  max_age?: number;
}

export function gw2_get<T>(path: string, options: GetOptions = {}): Promise<Fetched<T>> {
  const url = request_url(path, options.params, options.key);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < (options.max_age ?? ACCOUNT_MAX_AGE)) return Promise.resolve(hit as Fetched<T>);
  const running = pending.get(url);
  if (running) return running as Promise<Fetched<T>>;

  const request = fetch_json(url)
    .then((data) => {
      const entry = { data, at: Date.now() };
      cache.set(url, entry);
      return entry;
    })
    .finally(() => pending.delete(url));
  pending.set(url, request);
  return request as Promise<Fetched<T>>;
}

export async function get_items(ids: Iterable<number>): Promise<Map<number, Item>> {
  const out = new Map<number, Item>();
  for (const part of chunk([...new Set(ids)].sort((a, b) => a - b))) {
    try {
      const { data } = await gw2_get<Item[]>("/items", { params: { ids: part.join(",") }, max_age: Infinity });
      for (const item of data) out.set(item.id, item);
    } catch (error) {
      if (!(error instanceof Gw2Error && error.kind === Gw2ErrorKind.NOT_FOUND)) throw error;
    }
  }
  return out;
}

export const VaultPeriod = { DAILY: "daily", WEEKLY: "weekly", SPECIAL: "special" } as const;
export type VaultPeriod = (typeof VaultPeriod)[keyof typeof VaultPeriod];

export const token_info = (key: string, max_age?: number) => gw2_get<TokenInfo>("/tokeninfo", { key, max_age });

export const vault = (key: string, period: VaultPeriod, max_age?: number) =>
  gw2_get<VaultProgress>(`/account/wizardsvault/${period}`, { key, max_age });

export const currencies = () => gw2_get<Currency[]>("/currencies", { params: { ids: "all" }, max_age: Infinity });

export const wallet = (key: string, max_age?: number) => gw2_get<WalletEntry[]>("/account/wallet", { key, max_age });

export const world_bosses = () => gw2_get<{ id: string }[]>("/worldbosses", { params: { ids: "all" }, max_age: Infinity });

export const killed_bosses = (key: string, max_age?: number) => gw2_get<string[]>("/account/worldbosses", { key, max_age });
