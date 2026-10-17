import { substitute, type HttpRequest, type Pair } from "./http-file";

export const BodyKind = { NONE: "none", JSON: "json", TEXT: "text", FORM: "form" } as const;
export type BodyKind = (typeof BodyKind)[keyof typeof BodyKind];

const CONTENT_TYPES: Record<Exclude<BodyKind, "none">, string> = {
  [BodyKind.JSON]: "application/json",
  [BodyKind.TEXT]: "text/plain",
  [BodyKind.FORM]: "application/x-www-form-urlencoded",
};

const decode = (text: string) => {
  try {
    return decodeURIComponent(text.replaceAll("+", " "));
  } catch {
    return text;
  }
};

export function parse_pairs(query: string): Pair[] {
  if (query === "") return [];
  return query.split("&").map((part) => {
    const at = part.indexOf("=");
    return at === -1 ? { name: decode(part), value: "" } : { name: decode(part.slice(0, at)), value: decode(part.slice(at + 1)) };
  });
}

export function format_pairs(pairs: Pair[]): string {
  return pairs.map((pair) => `${encodeURIComponent(pair.name)}=${encodeURIComponent(pair.value)}`).join("&");
}

function split_url(url: string): { base: string; query: string; hash: string } {
  const hash_at = url.indexOf("#");
  const without_hash = hash_at === -1 ? url : url.slice(0, hash_at);
  const hash = hash_at === -1 ? "" : url.slice(hash_at);
  const query_at = without_hash.indexOf("?");
  if (query_at === -1) return { base: without_hash, query: "", hash };
  return { base: without_hash.slice(0, query_at), query: without_hash.slice(query_at + 1), hash };
}

export function query_params(url: string): Pair[] {
  return parse_pairs(split_url(url).query);
}

export function with_query(url: string, params: Pair[]): string {
  const { base, hash } = split_url(url);
  return params.length === 0 ? base + hash : `${base}?${format_pairs(params)}${hash}`;
}

export function header_value(headers: Pair[], name: string): string | undefined {
  const lower = name.toLowerCase();
  return headers.find((header) => header.name.trim().toLowerCase() === lower)?.value;
}

export function body_kind(request: Pick<HttpRequest, "headers" | "body">): BodyKind {
  const type = header_value(request.headers, "content-type")?.toLowerCase() ?? "";
  if (type.includes("json")) return BodyKind.JSON;
  if (type.includes("x-www-form-urlencoded")) return BodyKind.FORM;
  if (type === "" && request.body === "") return BodyKind.NONE;
  return BodyKind.TEXT;
}

// The kind lives in Content-Type because `.http` files have no field for it.
export function with_body_kind(request: HttpRequest, kind: BodyKind): HttpRequest {
  const headers = request.headers.filter((header) => header.name.trim().toLowerCase() !== "content-type");
  if (kind === BodyKind.NONE) return { ...request, headers, body: "" };
  return { ...request, headers: [...headers, { name: "Content-Type", value: CONTENT_TYPES[kind] }] };
}

export function parse_header(text: string): Pair | null {
  const at = text.indexOf(":");
  if (at <= 0) return null;
  return { name: text.slice(0, at).trim(), value: text.slice(at + 1).trim() };
}

export function normalize_url(url: string): string {
  const trimmed = url.trim();
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export interface Prepared {
  url: string;
  init: RequestInit & { method: string; headers: [string, string][] };
}

export function prepare(request: HttpRequest, variables: Pair[] = []): Prepared {
  const raw = substitute(request.url, variables).trim();
  if (raw === "") throw new Error("Enter a URL");
  const url = normalize_url(raw);
  try {
    new URL(url);
  } catch {
    throw new Error(`“${raw}” isn't a URL`);
  }
  const method = request.method.trim().toUpperCase() || "GET";
  const headers = request.headers
    .filter((header) => header.name.trim() !== "")
    .map((header): [string, string] => [header.name.trim(), substitute(header.value, variables)]);
  const body = method === "GET" || method === "HEAD" || request.body === "" ? undefined : substitute(request.body, variables);
  return { url, init: { method, headers, body } };
}

export interface FetchProblem {
  title: string;
  detail: string;
}

// fetch() rejects with a bare TypeError for CORS, mixed content, DNS and offline alike; the browser hides which on purpose.
export function explain_fetch_error(error: unknown, url: string, page: { online: boolean; protocol: string }): FetchProblem {
  const message = error instanceof Error ? error.message : String(error);
  if (!(error instanceof TypeError)) return { title: "The request failed", detail: message };
  if (!page.online) return { title: "You're offline", detail: "Connect to the internet and send it again." };
  if (page.protocol === "https:" && url.startsWith("http:"))
    return {
      title: "Blocked: mixed content",
      detail: "This page is served over https, so the browser refuses plain http requests. Use the https:// address if the server has one.",
    };
  return {
    title: "The browser blocked the request or couldn't reach the server",
    detail:
      "It doesn't say which. Most often the server doesn't allow requests from other sites (CORS): it has to send Access-Control-Allow-Origin. Otherwise the address is wrong or the server is down. Check the browser's console for the reason.",
  };
}

const REASONS: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  206: "Partial Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  410: "Gone",
  415: "Unsupported Media Type",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

// HTTP/2 has no reason phrase, so statusText is usually empty.
export function status_line(status: number, status_text: string): string {
  const reason = status_text || REASONS[status] || "";
  return reason ? `${status} ${reason}` : String(status);
}

export const ResponseKind = { JSON: "json", IMAGE: "image", TEXT: "text", BINARY: "binary" } as const;
export type ResponseKind = (typeof ResponseKind)[keyof typeof ResponseKind];

const TEXT_TYPES = /^text\/|[+/](json|xml|javascript|ecmascript|x-www-form-urlencoded|yaml|csv|graphql)\b|^application\/(xml|javascript|x-ndjson|problem)/;

export function response_kind(content_type: string, head: Uint8Array): ResponseKind {
  const type = content_type.toLowerCase().split(";")[0].trim();
  if (type.startsWith("image/")) return ResponseKind.IMAGE;
  if (type.includes("json")) return ResponseKind.JSON;
  if (TEXT_TYPES.test(type)) return ResponseKind.TEXT;
  if (type === "" && !head.includes(0)) return ResponseKind.TEXT;
  return ResponseKind.BINARY;
}

const EXTENSIONS: Record<string, string> = {
  "application/json": ".json",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/xml": ".xml",
  "text/html": ".html",
  "text/plain": ".txt",
  "text/css": ".css",
  "text/csv": ".csv",
  "text/javascript": ".js",
  "application/javascript": ".js",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

function clean_name(name: string): string {
  return name.replace(/[/\\\u0000-\u001f]/g, "_").replace(/^\.+$/, "").trim();
}

function disposition_name(header: string): string | null {
  const extended = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header);
  if (extended) return decode(extended[1].trim().replace(/^"|"$/g, ""));
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  return plain ? (plain[2] ?? plain[1]).trim() : null;
}

export function download_name(url: string, disposition: string | null, content_type: string | null): string {
  let name = disposition ? clean_name(disposition_name(disposition) ?? "") : "";
  if (!name) {
    let path = "";
    try {
      path = new URL(url).pathname;
    } catch {
      path = split_url(url).base;
    }
    name = clean_name(decode(path.split("/").filter(Boolean).at(-1) ?? ""));
  }
  if (!name) name = "download";
  const extension = EXTENSIONS[(content_type ?? "").toLowerCase().split(";")[0].trim()];
  if (!name.includes(".") && extension) name += extension;
  return name;
}
