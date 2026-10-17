export const MetaAttr = {
  NAME: "name",
  PROPERTY: "property",
  ITEMPROP: "itemprop",
  HTTP_EQUIV: "http-equiv",
  CHARSET: "charset",
} as const;
export type MetaAttr = (typeof MetaAttr)[keyof typeof MetaAttr];

export const Orientation = { LANDSCAPE: "landscape", PORTRAIT: "portrait", SQUARE: "square" } as const;
export type Orientation = (typeof Orientation)[keyof typeof Orientation];

export interface RawMetaTag {
  key: string;
  attr: MetaAttr;
  value: string;
}

export interface Favicon {
  href: string;
  rel: string;
  sizes: string | null;
  type: string | null;
}

export interface OgImage {
  url: string;
  secure_url: string | null;
  type: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
}

export interface Oembed {
  url: string;
  type: string;
  title: string | null;
}

export interface FetchInfo {
  requested: string;
  status: number;
  status_text: string;
  content_type: string | null;
  /** Only the headers the server exposes to other sites (CORS), lowercased. */
  headers: Record<string, string>;
  bytes: number;
  ms: number;
}

export interface Derived {
  title: string | null;
  description: string | null;
  image: string | null;
  image_alt: string | null;
  site_name: string | null;
  card: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  twitter_image: string | null;
  image_width: number | null;
  image_height: number | null;
}

export interface PageMeta {
  url: string | null;
  host: string | null;
  response: FetchInfo | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  base_href: string | null;
  theme_color: string | null;
  language: string | null;
  robots: string | null;
  manifest: string | null;
  favicons: Favicon[];
  open_graph: Record<string, string>;
  og_images: OgImage[];
  twitter: Record<string, string>;
  other: Record<string, string>;
  oembed: Oembed[];
  json_ld: unknown[];
  json_ld_errors: number;
  raw_meta_tags: RawMetaTag[];
  relative: { key: string; value: string }[];
  derived: Derived;
}

const NAME_ATTRS = [MetaAttr.NAME, MetaAttr.PROPERTY, MetaAttr.ITEMPROP] as const;

export function empty_meta(url: string | null = null): PageMeta {
  return {
    url,
    host: host_of(url),
    response: null,
    title: null,
    description: null,
    canonical: null,
    base_href: null,
    theme_color: null,
    language: null,
    robots: null,
    manifest: null,
    favicons: [],
    open_graph: {},
    og_images: [],
    twitter: {},
    other: {},
    oembed: [],
    json_ld: [],
    json_ld_errors: 0,
    raw_meta_tags: [],
    relative: [],
    derived: derive({}, {}, null, null),
  };
}

export function host_of(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

export function is_absolute(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

export function absolutize(href: string, base: string | null): string {
  try {
    return new URL(href, base ?? undefined).toString();
  } catch {
    return href;
  }
}

function is_url_key(key: string): boolean {
  return [":url", ":image", ":secure_url", ":video", ":audio"].some((end) => key.endsWith(end)) || key === "twitter:image" || key === "twitter:player";
}

function number_or_null(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function derive(og: Record<string, string>, tw: Record<string, string>, title: string | null, description: string | null): Derived {
  return {
    title: og["og:title"] || tw["twitter:title"] || title,
    description: og["og:description"] || tw["twitter:description"] || description,
    image: og["og:image:secure_url"] || og["og:image"] || tw["twitter:image"] || null,
    image_alt: og["og:image:alt"] || tw["twitter:image:alt"] || null,
    site_name: og["og:site_name"] || null,
    card: tw["twitter:card"] || null,
    twitter_title: tw["twitter:title"] || null,
    twitter_description: tw["twitter:description"] || null,
    twitter_image: tw["twitter:image"] || null,
    image_width: number_or_null(og["og:image:width"]),
    image_height: number_or_null(og["og:image:height"]),
  };
}

export function aspect(width: number | null, height: number | null): number | null {
  return width && height ? width / height : null;
}

export function orientation(ratio: number | null): Orientation | null {
  if (ratio === null) return null;
  if (ratio > 1.1) return Orientation.LANDSCAPE;
  if (ratio < 0.9) return Orientation.PORTRAIT;
  return Orientation.SQUARE;
}

// DOMParser builds an inert document: no scripts run, nothing loads.
export function parse_html(html: string, url: string | null, response: FetchInfo | null = null): PageMeta {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base_href = doc.querySelector("base[href]")?.getAttribute("href")?.trim() || null;
  const base = base_href ? absolutize(base_href, url) : url;
  const resolvable = base !== null && is_absolute(base) ? base : null;
  const meta = empty_meta(url);
  meta.response = response;
  meta.base_href = base_href;
  meta.title = doc.querySelector("title")?.textContent?.trim() || null;

  const og = meta.open_graph;
  const tw = meta.twitter;
  let image: OgImage | null = null;
  const flush = () => {
    if (image) meta.og_images.push(image);
    image = null;
  };

  for (const tag of doc.querySelectorAll("meta")) {
    const charset = tag.getAttribute("charset");
    if (charset) {
      meta.raw_meta_tags.push({ key: "charset", attr: MetaAttr.CHARSET, value: charset });
      continue;
    }
    const content = tag.getAttribute("content") ?? "";
    const http_equiv = tag.getAttribute("http-equiv");
    if (http_equiv) meta.raw_meta_tags.push({ key: http_equiv.toLowerCase(), attr: MetaAttr.HTTP_EQUIV, value: content });

    const attr = NAME_ATTRS.find((name) => tag.getAttribute(name)?.trim());
    if (!attr) continue;
    const key = tag.getAttribute(attr)!.trim().toLowerCase();
    meta.raw_meta_tags.push({ key, attr, value: content });
    const value = content.trim();
    if (!value) continue;

    // og:image starts a new image; the og:image:* tags after it describe that one, until another og: tag.
    if (key === "og:image" || key === "og:image:url") {
      flush();
      image = { url: value, secure_url: null, type: null, width: null, height: null, alt: null };
    } else if (image && key.startsWith("og:image:")) {
      const field = key.slice("og:image:".length);
      if (field === "secure_url") image.secure_url = value;
      else if (field === "type") image.type = value;
      else if (field === "width") image.width = number_or_null(value);
      else if (field === "height") image.height = number_or_null(value);
      else if (field === "alt") image.alt = value;
    } else if (key.startsWith("og:")) {
      flush();
    }

    if (key.startsWith("og:") || key.startsWith("article:") || key.startsWith("product:")) og[key === "og:image:url" ? "og:image" : key] ??= value;
    else if (key.startsWith("twitter:")) tw[key] ??= value;
    else if (key === "description") meta.description ??= value;
    else if (key === "robots") meta.robots = value;
    else if (key === "theme-color") meta.theme_color ??= value;
    else meta.other[key] = value;
  }
  flush();

  const link = (rel: string) => doc.querySelector(`link[rel="${rel}" i][href]`)?.getAttribute("href")?.trim() || null;
  meta.canonical = link("canonical");
  const manifest = link("manifest");
  meta.manifest = manifest ? absolutize(manifest, resolvable) : null;
  meta.language = doc.documentElement.getAttribute("lang")?.trim() || null;

  for (const element of doc.querySelectorAll("link[href]")) {
    const rel = element.getAttribute("rel")?.toLowerCase().trim() ?? "";
    const href = element.getAttribute("href")!.trim();
    if (rel.split(/\s+/).some((token) => token === "icon" || token === "apple-touch-icon" || token === "mask-icon" || token === "apple-touch-icon-precomposed")) {
      meta.favicons.push({ href: absolutize(href, resolvable), rel, sizes: element.getAttribute("sizes"), type: element.getAttribute("type") });
    } else if (rel === "alternate" && (element.getAttribute("type") ?? "").toLowerCase().includes("oembed")) {
      meta.oembed.push({ url: absolutize(href, resolvable), type: element.getAttribute("type")!.toLowerCase(), title: element.getAttribute("title") });
    }
  }
  if (meta.favicons.length === 0 && resolvable) meta.favicons.push({ href: absolutize("/favicon.ico", resolvable), rel: "icon (default)", sizes: null, type: null });

  for (const script of doc.querySelectorAll('script[type="application/ld+json" i]')) {
    try {
      meta.json_ld.push(JSON.parse(script.textContent ?? ""));
    } catch {
      meta.json_ld_errors++;
    }
  }

  for (const record of [og, tw]) {
    for (const key of Object.keys(record)) {
      if (!is_url_key(key)) continue;
      if (!is_absolute(record[key])) meta.relative.push({ key, value: record[key] });
      record[key] = absolutize(record[key], resolvable);
    }
  }
  for (const entry of meta.og_images) {
    entry.url = absolutize(entry.url, resolvable);
    if (entry.secure_url) entry.secure_url = absolutize(entry.secure_url, resolvable);
  }

  meta.derived = derive(og, tw, meta.title, meta.description);
  return meta;
}

export function suggested_base(meta: PageMeta): string {
  for (const candidate of [meta.base_href, meta.open_graph["og:url"], meta.canonical]) {
    if (candidate && /^https?:\/\//i.test(candidate)) return candidate;
  }
  return "";
}
