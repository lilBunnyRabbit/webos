import type { ConvertResult } from "./base64";

export const UrlScope = { COMPONENT: "component", URI: "uri" } as const;
export type UrlScope = (typeof UrlScope)[keyof typeof UrlScope];

export function encode_url(text: string, scope: UrlScope): ConvertResult {
  try {
    return { ok: true, value: scope === UrlScope.COMPONENT ? encodeURIComponent(text) : encodeURI(text) };
  } catch {
    return { ok: false, value: "", error: "The text has an unpaired surrogate and can't be encoded" };
  }
}

export function decode_url(text: string, scope: UrlScope): ConvertResult {
  try {
    return { ok: true, value: scope === UrlScope.COMPONENT ? decodeURIComponent(text) : decodeURI(text) };
  } catch {
    return { ok: false, value: "", error: "Malformed percent-encoding" };
  }
}

export interface UrlPart {
  label: string;
  value: string;
}

export interface ParsedUrl {
  parts: UrlPart[];
  params: [string, string][];
}

export function parse_url(input: string): ParsedUrl | null {
  const url = URL.parse(input.trim());
  if (!url) return null;

  const parts: UrlPart[] = [
    { label: "Protocol", value: url.protocol },
    { label: "Username", value: url.username },
    { label: "Password", value: url.password },
    { label: "Host", value: url.hostname },
    { label: "Port", value: url.port },
    { label: "Path", value: url.pathname },
    { label: "Query", value: url.search },
    { label: "Fragment", value: url.hash },
    { label: "Origin", value: url.origin === "null" ? "" : url.origin },
  ];
  return { parts: parts.filter((part) => part.value !== ""), params: [...url.searchParams] };
}
