import { format_json, JsonIndent } from "../dev-tools/json";
import type { Pair } from "./http-file";
import { response_kind, ResponseKind, type Prepared } from "./request";

export const TEXT_LIMIT = 4 * 1024 * 1024;

export interface ApiResponse {
  url: string;
  status: number;
  status_text: string;
  redirected: boolean;
  headers: Pair[];
  content_type: string;
  blob: Blob;
  kind: ResponseKind;
  text: string | null;
  ms: number;
}

export async function send(request: Prepared, signal: AbortSignal): Promise<ApiResponse> {
  const started = performance.now();
  const response = await fetch(request.url, { ...request.init, signal, redirect: "follow" });
  const blob = await response.blob();
  const ms = performance.now() - started;
  const content_type = response.headers.get("content-type") ?? "";
  const kind = response_kind(content_type, new Uint8Array(await blob.slice(0, 1024).arrayBuffer()));
  const readable = (kind === ResponseKind.JSON || kind === ResponseKind.TEXT) && blob.size <= TEXT_LIMIT;
  return {
    url: response.url || request.url,
    status: response.status,
    status_text: response.statusText,
    redirected: response.redirected,
    headers: [...response.headers].map(([name, value]) => ({ name, value })),
    content_type,
    blob,
    kind,
    text: readable ? await blob.text() : null,
    ms,
  };
}

export function pretty_json(text: string): string | null {
  const result = format_json(text, JsonIndent.TWO);
  return result.ok ? result.value : null;
}
