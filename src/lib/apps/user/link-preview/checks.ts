import type { ImageProbe, RobotsInfo } from "./page";
import type { PageMeta } from "./parse";
import { Platform, PLATFORMS } from "./platforms";

export const Severity = { PASS: "pass", WARN: "warn", FAIL: "fail" } as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

export interface Check {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  fix: string | null;
}

export interface PlatformReport {
  id: Platform;
  will_unfurl: boolean;
  looks_good: boolean;
  score: Record<Severity, number>;
  checks: Check[];
}

export interface CheckInput {
  meta: PageMeta;
  image: ImageProbe | null;
  robots: RobotsInfo | null;
}

const pass = (id: string, title: string, detail = ""): Check => ({ id, severity: Severity.PASS, title, detail, fix: null });
const warn = (id: string, title: string, detail: string, fix: string | null = null): Check => ({ id, severity: Severity.WARN, title, detail, fix });
const fail = (id: string, title: string, detail: string, fix: string | null = null): Check => ({ id, severity: Severity.FAIL, title, detail, fix });
const by_severity = (severity: Severity) => (severity === Severity.FAIL ? fail : warn);

const MB = 1024 * 1024;
const FORMATS: Record<Platform, string[]> = {
  slack: ["jpeg", "jpg", "png", "gif", "webp"],
  twitter: ["jpeg", "jpg", "png", "gif", "webp"],
  facebook: ["jpeg", "jpg", "png", "gif"],
  discord: ["jpeg", "jpg", "png", "gif", "webp"],
  linkedin: ["jpeg", "jpg", "png", "gif"],
  imessage: ["jpeg", "jpg", "png", "gif", "webp", "heic"],
};
const BYTE_LIMITS: Record<Platform, number> = {
  slack: 5 * MB,
  twitter: 5 * MB,
  facebook: 8 * MB,
  discord: 8 * MB,
  linkedin: 5 * MB,
  imessage: 8 * MB,
};

export function header(meta: PageMeta, name: string): string | null {
  return meta.response?.headers[name.toLowerCase()] ?? null;
}

function cache_tokens(meta: PageMeta): Set<string> {
  const tokens = new Set<string>();
  for (const part of (header(meta, "cache-control") ?? "").toLowerCase().split(",")) {
    const token = part.trim().split("=")[0];
    if (token) tokens.add(token);
  }
  return tokens;
}

export function image_format(type: string | null): string | null {
  return type?.toLowerCase().match(/^image\/([a-z0-9+.-]+)/)?.[1] ?? null;
}

export function megabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(2)} MB`;
}

export function image_size(input: CheckInput): { width: number; height: number } | null {
  const { derived } = input.meta;
  if (derived.image_width && derived.image_height) return { width: derived.image_width, height: derived.image_height };
  if (input.image?.loaded && input.image.width && input.image.height) return { width: input.image.width, height: input.image.height };
  return null;
}

function path_of(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

export function robots_block(input: CheckInput, bots: string[]): string | null {
  if (!input.robots || !input.meta.url) return null;
  const path = path_of(input.meta.url);
  for (const group of input.robots.groups) {
    if (group.agent !== "*" && !bots.includes(group.agent)) continue;
    if (group.paths.some((rule) => rule === "/" || path.startsWith(rule))) return `User-agent: ${group.agent} disallows ${group.paths.join(", ")}`;
  }
  return null;
}

function has_directive(value: string | null, directive: string): boolean {
  return (value ?? "").toLowerCase().split(/[\s,:]+/).includes(directive);
}

export function urls_match(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  try {
    const left = new URL(a);
    const right = new URL(b);
    const trim = (path: string) => path.replace(/\/$/, "");
    return left.protocol === right.protocol && left.host === right.host && trim(left.pathname) === trim(right.pathname) && left.search === right.search;
  } catch {
    return a === b;
  }
}

function looks_like_auth(url: string): boolean {
  return /\/(login|signin|sign-in|auth|account|register|signup)(\/|$)/.test(path_of(url).toLowerCase());
}

function is_vercel_preview(meta: PageMeta): boolean {
  return /\.vercel\.app$/i.test(meta.host ?? "");
}

function check_response(meta: PageMeta): Check[] {
  const response = meta.response;
  if (!response) return [];
  const checks: Check[] = [];
  if (response.status >= 200 && response.status < 400) checks.push(pass("http-status", `HTTP ${response.status}`));
  else checks.push(fail("http-status", `HTTP ${response.status} ${response.status_text}`.trim(), "The page must answer with a 2xx status before any crawler reads it."));
  if (response.content_type && /^text\/html/i.test(response.content_type)) checks.push(pass("content-type", `Content-Type: ${response.content_type}`));
  else
    checks.push(
      fail("content-type", `Content-Type is "${response.content_type ?? "unset"}"`, "Crawlers expect text/html. PDFs, images and JSON don't unfurl.", "Serve the page with a Content-Type that starts with text/html.")
    );
  return checks;
}

function check_frame(meta: PageMeta): Check[] {
  const value = (header(meta, "x-frame-options") ?? "").toUpperCase();
  if (value !== "DENY" && value !== "SAMEORIGIN") return [];
  return [warn("x-frame", `X-Frame-Options: ${value}`, "Some platforms show the page in an iframe, which this blocks. The preview still works; an embedded click-through may not.")];
}

function check_robots(input: CheckInput, bots: string[], x_robots: Severity): Check[] {
  const { meta } = input;
  const checks: Check[] = [];
  if (has_directive(meta.robots, "noindex"))
    checks.push(warn("meta-robots-noindex", '<meta name="robots" content="noindex">', "Most social crawlers honour meta robots and skip previews for noindex pages.", "Remove noindex if the page should be shareable."));
  if (has_directive(meta.robots, "nosnippet"))
    checks.push(warn("meta-robots-nosnippet", '<meta name="robots" content="nosnippet">', "nosnippet asks crawlers not to use page text, so the description may be dropped."));

  const tag = header(meta, "x-robots-tag");
  if (has_directive(tag, "noindex")) {
    const vercel = is_vercel_preview(meta);
    checks.push(
      by_severity(x_robots)(
        "x-robots-tag-noindex",
        `X-Robots-Tag: ${tag}`,
        (x_robots === Severity.FAIL ? "This crawler respects X-Robots-Tag and won't unfurl noindex pages." : "Some crawlers respect X-Robots-Tag and may skip the preview.") +
          (vercel ? " Vercel adds it on every *.vercel.app preview deployment; your production domain won't have it." : ""),
        vercel ? "Test on the production domain." : "Remove X-Robots-Tag: noindex on this path, or share a different URL."
      )
    );
  }
  if (has_directive(tag, "nosnippet")) checks.push(warn("x-robots-tag-nosnippet", `X-Robots-Tag: ${tag}`, "nosnippet may make platforms drop the description."));

  const blocked = robots_block(input, bots);
  if (blocked) checks.push(fail("robots-txt", "Blocked by robots.txt", `This URL is disallowed: ${blocked}.`, "Allow the crawler in robots.txt for the path you want shareable."));
  return checks;
}

function check_canonical(meta: PageMeta, platform: Platform, severity: Severity): Check[] {
  const checks: Check[] = [];
  const page = meta.url;
  if (!page) return checks;
  if (meta.canonical && !urls_match(meta.canonical, page)) {
    checks.push(
      by_severity(severity)(
        `${platform}-canonical`,
        `Canonical link points elsewhere (${meta.canonical})`,
        `The page names ${meta.canonical} as its real address, but you're sharing ${page}.` +
          (looks_like_auth(meta.canonical)
            ? " That looks like a login page: crawlers treat the shared URL as the login page and show its metadata or nothing."
            : " Crawlers may take their metadata from the canonical URL instead."),
        `Set <link rel="canonical" href="${page}"> on this page.`
      )
    );
  }
  const og_url = meta.open_graph["og:url"];
  if (og_url && !urls_match(og_url, page)) {
    checks.push(
      warn(
        `${platform}-og-url`,
        `og:url points elsewhere (${og_url})`,
        platform === Platform.FACEBOOK
          ? `Facebook keys its preview cache by og:url, so every URL with og:url ${og_url} shares one cached preview.`
          : `og:url is ${og_url} but the page is ${page}. Some platforms treat og:url as the real address and merge previews.`,
        `Set og:url to ${page}.`
      )
    );
  }
  return checks;
}

function check_absolute(meta: PageMeta, platform: Platform, severity: Severity): Check[] {
  const relative = meta.relative.find((entry) => entry.key === "og:image" || entry.key === "twitter:image");
  if (!relative) return [];
  return [
    by_severity(severity)(
      `${platform}-image-relative`,
      `${relative.key} is a relative URL (${relative.value})`,
      "Crawlers expect an absolute URL. Some resolve it against the page, others drop the image.",
      `Write the full address: <meta property="${relative.key}" content="https://…${relative.value.startsWith("/") ? relative.value : `/${relative.value}`}">.`
    ),
  ];
}

function check_image(input: CheckInput, platform: Platform): Check[] {
  const probe = input.image;
  if (!probe) return [];
  if (probe.status !== null && probe.status >= 400)
    return [fail(`${platform}-image-status`, `Image returned HTTP ${probe.status}`, `Crawlers can't use a broken image at ${probe.url}.`, "Fix the image URL or upload an image at that path.")];
  if (!probe.loaded)
    return [
      fail(
        `${platform}-image-load`,
        "Image didn't load",
        `${probe.url} didn't load as an image here: the address is wrong, it isn't an image, or the server is down.`,
        "Open the image URL in a browser tab and check it shows the picture."
      ),
    ];

  const checks: Check[] = [pass(`${platform}-image-load`, `Image loads (${probe.width}×${probe.height})`)];
  const format = image_format(probe.type);
  if (probe.type !== null && !format)
    checks.push(fail(`${platform}-image-type`, `Image Content-Type is "${probe.type}"`, "Crawlers reject responses that aren't images. A common cause is a redirect to a login page."));
  if (format === "svg+xml") checks.push(warn(`${platform}-image-svg`, "SVG images are unreliable", "Most crawlers refuse SVG. Use a PNG or JPEG for og:image."));
  else if (format && !FORMATS[platform].includes(format))
    checks.push(warn(`${platform}-image-format`, `Image format "${format}" may not be supported`, `${PLATFORMS[platform].name} reliably takes ${FORMATS[platform].join(", ")}.`));
  if (probe.bytes !== null) {
    if (probe.bytes > BYTE_LIMITS[platform])
      checks.push(fail(`${platform}-image-bytes`, `Image is ${megabytes(probe.bytes)}, over the ${megabytes(BYTE_LIMITS[platform])} limit`, "Compress or resize the image."));
    else checks.push(pass(`${platform}-image-bytes`, `Image is ${megabytes(probe.bytes)}`));
  }
  return checks;
}

function check_https(image: string, id: string, severity: Severity, detail: string): Check {
  if (image.startsWith("https://")) return pass(id, "Image is HTTPS");
  return by_severity(severity)(id, "Image URL isn't HTTPS", detail, "Serve preview images from an https:// URL.");
}

function slack(input: CheckInput): Check[] {
  const { meta } = input;
  const checks = check_response(meta);
  if (meta.response) {
    const blockers = ["no-store", "no-cache", "private"].filter((token) => cache_tokens(meta).has(token));
    if (blockers.length)
      checks.push(
        warn(
          "slack-cache-control",
          `Cache-Control: ${blockers.join(", ")} turns off Slack's preview cache`,
          "Slack still unfurls the page, but every paste fetches it again instead of using Slack's ~30 minute cache.",
          "For busy share paths, send Cache-Control: public, max-age=300."
        )
      );
    else checks.push(pass("slack-cache-control", "Cache-Control lets Slack cache the preview"));
  }
  checks.push(...check_robots(input, ["slackbot", "slackbot-linkexpanding"], Severity.WARN), ...check_frame(meta));

  const title = meta.open_graph["og:title"] || meta.title;
  if (title) checks.push(pass("slack-title", `Title: "${title}"`));
  else checks.push(fail("slack-title", "No title", "Slack falls back to <title> without og:title, and both are missing.", 'Add <meta property="og:title" content="…"> or at least a <title>.'));

  if (meta.open_graph["og:description"] || meta.description) checks.push(pass("slack-description", "Description present"));
  else checks.push(warn("slack-description", "No description", "Slack shows only the title.", 'Add <meta property="og:description" content="…">.'));

  if (!meta.open_graph["og:image"] && !meta.twitter["twitter:image"]) {
    checks.push(warn("slack-image", "No image", "Without og:image Slack shows a text-only preview.", 'Add <meta property="og:image" content="https://…/preview.png">.'));
  } else {
    checks.push(...check_absolute(meta, Platform.SLACK, Severity.WARN), ...check_image(input, Platform.SLACK));
    const { image_width: width, image_height: height } = meta.derived;
    if (width && height) {
      if (width < 200 || height < 200) checks.push(warn("slack-image-size", `Image is ${width}×${height} (small)`, "Slack shows a small thumbnail under ~200 px. Use 1200×630 for a full-width preview."));
      else checks.push(pass("slack-image-size", `og:image:width/height = ${width}×${height}`));
    } else {
      checks.push(
        warn(
          "slack-image-dims",
          "og:image:width/height not declared",
          "Slack uses them to pick a thumbnail or a large image. Without them it downloads the image and guesses.",
          'Add <meta property="og:image:width" content="1200"> and og:image:height.'
        )
      );
    }
  }

  checks.push(...check_canonical(meta, Platform.SLACK, Severity.WARN));
  const site = meta.open_graph["og:site_name"];
  if (site) checks.push(pass("slack-site-name", `og:site_name = "${site}"`));
  else checks.push(warn("slack-site-name", "og:site_name missing", "Slack shows the site name above the title; without it, the host.", 'Add <meta property="og:site_name" content="Your site">.'));
  return checks;
}

function twitter(input: CheckInput): Check[] {
  const { meta } = input;
  const checks = check_response(meta);
  if (meta.response) {
    const tokens = cache_tokens(meta);
    if (tokens.has("no-store") || tokens.has("private"))
      checks.push(
        warn("twitter-cache-control", `Cache-Control: ${header(meta, "cache-control")}`, "X still shows the card but can't cache it, so every share fetches the page again.", "Send Cache-Control: public, max-age=300 to let X cache it.")
      );
    else checks.push(pass("twitter-cache-control", "Cache-Control lets X cache the card"));
  }
  checks.push(...check_robots(input, ["twitterbot"], Severity.WARN), ...check_canonical(meta, Platform.TWITTER, Severity.WARN), ...check_frame(meta));

  const card = meta.twitter["twitter:card"];
  if (!card)
    checks.push(warn("twitter-card", "twitter:card missing", "Without it X may show a small fallback card or none. og: tags alone aren't always enough.", '<meta name="twitter:card" content="summary_large_image">'));
  else if (!["summary", "summary_large_image", "app", "player"].includes(card))
    checks.push(warn("twitter-card", `twitter:card = "${card}" isn't a known type`, "X knows summary, summary_large_image, app and player."));
  else checks.push(pass("twitter-card", `twitter:card = ${card}`));

  if (meta.twitter["twitter:title"] || meta.open_graph["og:title"] || meta.title) checks.push(pass("twitter-title", "Title present"));
  else checks.push(fail("twitter-title", "No title", "X needs twitter:title or og:title."));
  if (meta.twitter["twitter:description"] || meta.open_graph["og:description"]) checks.push(pass("twitter-description", "Description present"));
  else checks.push(warn("twitter-description", "No description", "The card shows only the title."));

  const image = meta.twitter["twitter:image"] || meta.open_graph["og:image"];
  if (!image) {
    checks.push(fail("twitter-image", "No image", "X needs twitter:image or og:image for a visual card."));
    return checks;
  }
  checks.push(
    check_https(image, "twitter-image-https", Severity.FAIL, "X requires twitter:image over HTTPS."),
    ...check_absolute(meta, Platform.TWITTER, Severity.WARN),
    ...check_image(input, Platform.TWITTER)
  );
  const size = image_size(input);
  if (size && card === "summary_large_image") {
    const { width, height } = size;
    if (width < 300 || height < 157)
      checks.push(fail("twitter-image-size", `Image ${width}×${height} is below the summary_large_image minimum`, "X needs at least 300×157 and recommends 1200×628 (2:1)."));
    else if (width / height < 1.7 || width / height > 2.3)
      checks.push(warn("twitter-image-size", `Image ratio is ${(width / height).toFixed(2)}:1, not the recommended 2:1`, "Large cards crop to about 1.91:1, so the edges get cut."));
    else checks.push(pass("twitter-image-size", `Image ${width}×${height} fits summary_large_image`));
  } else if (size && card === "summary" && (size.width < 144 || size.height < 144)) {
    checks.push(fail("twitter-image-size", `Image ${size.width}×${size.height} is below the summary minimum (144×144)`, "summary shows a small square thumbnail and may drop smaller images."));
  }
  return checks;
}

function facebook(input: CheckInput): Check[] {
  const { meta } = input;
  const checks = check_response(meta);
  if (meta.response) {
    const tokens = cache_tokens(meta);
    if (tokens.has("no-store") || tokens.has("private"))
      checks.push(warn("facebook-cache-control", `Cache-Control: ${header(meta, "cache-control")}`, "Facebook may fetch no-store or private pages again and again, or skip them under load."));
    else checks.push(pass("facebook-cache-control", "Cache-Control is crawler-friendly"));
  }
  checks.push(...check_robots(input, ["facebookexternalhit", "meta-externalagent"], Severity.FAIL), ...check_canonical(meta, Platform.FACEBOOK, Severity.FAIL), ...check_frame(meta));

  if (meta.open_graph["og:title"]) checks.push(pass("facebook-og-title", "og:title present"));
  else if (meta.title || meta.twitter["twitter:title"])
    checks.push(warn("facebook-og-title", "og:title missing, falling back to <title>", "Facebook uses the page title, which is often longer than a share title.", 'Add <meta property="og:title" content="…">.'));
  else checks.push(fail("facebook-og-title", "og:title missing", "Without og:title or <title> Facebook has nothing to show.", 'Add <meta property="og:title" content="…">.'));

  if (meta.open_graph["og:image"]) checks.push(pass("facebook-og-image", "og:image present"));
  else checks.push(fail("facebook-og-image", "og:image missing", "Facebook shows a text-only card or none.", 'Add <meta property="og:image" content="https://…">.'));

  if (meta.open_graph["og:url"]) checks.push(pass("facebook-og-url", "og:url present"));
  else checks.push(warn("facebook-og-url", "og:url missing", "Facebook falls back to the canonical or shared URL. Set it to control the cache key.", 'Add <meta property="og:url" content="…">.'));
  if (meta.open_graph["og:type"]) checks.push(pass("facebook-og-type", "og:type present"));
  else checks.push(warn("facebook-og-type", "og:type missing", 'Facebook defaults to "website".', 'Add <meta property="og:type" content="website">.'));

  if (!meta.open_graph["og:description"]) checks.push(warn("facebook-description", "og:description missing", "Facebook takes a fragment of body text instead, which usually reads badly."));

  const image = meta.open_graph["og:image"];
  if (image) {
    if (!image.startsWith("https://")) checks.push(check_https(image, "facebook-image-https", Severity.FAIL, "Facebook requires HTTPS images. Add og:image:secure_url if an http one must stay."));
    checks.push(...check_absolute(meta, Platform.FACEBOOK, Severity.FAIL), ...check_image(input, Platform.FACEBOOK));
    const size = image_size(input);
    if (size) {
      const { width, height } = size;
      if (width < 200 || height < 200) checks.push(fail("facebook-image-size", `Image ${width}×${height} is below the 200×200 minimum`, "Facebook may not show images under 200×200."));
      else if (width < 600 || height < 315) checks.push(warn("facebook-image-size", `Image ${width}×${height} is below the recommended 1200×630`, "Small images show as a square thumbnail instead of a large card."));
      else if (width / height < 1.7 || width / height > 2.1) checks.push(warn("facebook-image-size", `Image ratio is ${(width / height).toFixed(2)}:1, not 1.91:1`, "Facebook crops to 1.91:1."));
      else checks.push(pass("facebook-image-size", `Image ${width}×${height} fits Facebook's recommendation`));
    }
  }

  if (!meta.other["fb:app_id"]) checks.push(warn("facebook-app-id", "fb:app_id missing", "Optional; links the page to a Facebook app for Insights."));
  return checks;
}

function discord(input: CheckInput): Check[] {
  const { meta } = input;
  const checks = check_response(meta);
  checks.push(...check_robots(input, ["discordbot"], Severity.WARN), ...check_canonical(meta, Platform.DISCORD, Severity.WARN), ...check_frame(meta));

  const title = meta.open_graph["og:title"] || meta.twitter["twitter:title"] || meta.title;
  if (title) checks.push(pass("discord-title", `Title: "${title}"`));
  else checks.push(fail("discord-title", "No title", "The embed would be empty."));
  if (meta.open_graph["og:description"] || meta.twitter["twitter:description"] || meta.description) checks.push(pass("discord-description", "Description present"));
  else checks.push(warn("discord-description", "No description", "The embed shows only the title."));

  const image = meta.open_graph["og:image"] || meta.twitter["twitter:image"];
  if (image)
    checks.push(
      check_https(image, "discord-image-https", Severity.WARN, "Discord may refuse mixed-content images."),
      ...check_absolute(meta, Platform.DISCORD, Severity.WARN),
      ...check_image(input, Platform.DISCORD)
    );
  else checks.push(warn("discord-image", "No image", "The embed is text-only."));

  if (meta.theme_color) checks.push(pass("discord-theme-color", `theme-color = ${meta.theme_color}`));
  else checks.push(warn("discord-theme-color", "theme-color missing", "Discord colours the embed's side stripe with it; without it the stripe is grey.", '<meta name="theme-color" content="#…">'));
  return checks;
}

function linkedin(input: CheckInput): Check[] {
  const { meta } = input;
  const checks = check_response(meta);
  checks.push(...check_robots(input, ["linkedinbot"], Severity.FAIL), ...check_canonical(meta, Platform.LINKEDIN, Severity.FAIL), ...check_frame(meta));
  if (meta.response) {
    const tokens = cache_tokens(meta);
    if (tokens.has("no-store") || tokens.has("private"))
      checks.push(warn("linkedin-cache-control", `Cache-Control: ${header(meta, "cache-control")}`, "LinkedIn still unfurls and fetches more often. Once it caches a preview, it keeps it about 7 days anyway."));
  }

  if (meta.open_graph["og:title"]) checks.push(pass("linkedin-og-title", "og:title present"));
  else if (meta.title) checks.push(warn("linkedin-og-title", "og:title missing, falling back to <title>", "LinkedIn uses the page title, which usually reads less well."));
  else checks.push(warn("linkedin-og-title", "og:title missing", "Recommended for a good LinkedIn preview."));

  if (meta.open_graph["og:description"]) checks.push(pass("linkedin-og-description", "og:description present"));
  else if (meta.description) checks.push(warn("linkedin-og-description", 'og:description missing, falling back to <meta name="description">', "Fine, but gives you less control."));
  else checks.push(warn("linkedin-og-description", "og:description missing", "Recommended for a good LinkedIn preview."));

  const image = meta.open_graph["og:image"];
  if (!image) {
    checks.push(fail("linkedin-og-image", "og:image missing", "LinkedIn shows a much smaller text-only entry.", 'Add <meta property="og:image" content="https://…/preview.png">.'));
  } else {
    checks.push(pass("linkedin-og-image", "og:image present"));
    if (!image.startsWith("https://")) checks.push(check_https(image, "linkedin-image-https", Severity.FAIL, "LinkedIn requires HTTPS."));
    checks.push(...check_absolute(meta, Platform.LINKEDIN, Severity.FAIL), ...check_image(input, Platform.LINKEDIN));
    const size = image_size(input);
    if (size && (size.width < 1200 || size.height < 627))
      checks.push(warn("linkedin-image-size", `Image ${size.width}×${size.height} is below the recommended 1200×627`, "Smaller images show as a thumbnail on the side instead of a wide card."));
    else if (size) checks.push(pass("linkedin-image-size", `Image ${size.width}×${size.height} meets LinkedIn's recommendation`));
  }

  checks.push(
    warn("linkedin-cache", "LinkedIn keeps previews for about 7 days", "Once a URL is shared, its preview is locked in.", "After changing the tags, refresh it with LinkedIn's Post Inspector.")
  );
  return checks;
}

function imessage(input: CheckInput): Check[] {
  const { meta } = input;
  const checks = check_response(meta);
  checks.push(...check_robots(input, [], Severity.WARN), ...check_canonical(meta, Platform.IMESSAGE, Severity.WARN), ...check_frame(meta));

  const title = meta.open_graph["og:title"] || meta.twitter["twitter:title"] || meta.title;
  if (title) checks.push(pass("imessage-title", `Title: "${title}"`));
  else checks.push(fail("imessage-title", "No title", "The bubble falls back to the bare URL."));

  const image = meta.open_graph["og:image"] || meta.twitter["twitter:image"];
  if (image) {
    checks.push(pass("imessage-image", "og:image or twitter:image present"));
    if (!image.startsWith("https://")) checks.push(check_https(image, "imessage-image-https", Severity.WARN, "iMessage may not load http images."));
    checks.push(...check_absolute(meta, Platform.IMESSAGE, Severity.WARN), ...check_image(input, Platform.IMESSAGE));
  } else if (meta.favicons.some((icon) => icon.rel.includes("apple-touch-icon"))) {
    checks.push(warn("imessage-image", "Falling back to apple-touch-icon", "No og:image, so iMessage uses the apple-touch-icon as a small thumbnail."));
  } else {
    checks.push(warn("imessage-image", "No image and no apple-touch-icon", "The bubble is text-only.", 'Add og:image or <link rel="apple-touch-icon" href="…">.'));
  }

  if (meta.open_graph["og:description"] || meta.description) checks.push(pass("imessage-description", "Description present"));
  else checks.push(warn("imessage-description", "No description", "iMessage shows only the title under the image."));

  if (meta.og_images.length > 1)
    checks.push(
      warn(
        "imessage-multiple-images",
        `${meta.og_images.length} og:image tags: iMessage stitches them together`,
        "Since iOS 16, iMessage shows every og:image side by side in one bubble instead of picking one. Other platforms take the first.",
        "Ship one og:image. A single 1200×1200 square works everywhere: landscape platforms crop it to 1.91:1."
      )
    );
  return checks;
}

const EVALUATORS: Record<Platform, (input: CheckInput) => Check[]> = { slack, twitter, facebook, discord, linkedin, imessage };

export function evaluate(input: CheckInput): PlatformReport[] {
  return Object.values(Platform).map((id) => {
    const checks = EVALUATORS[id](input);
    const score: Record<Severity, number> = { pass: 0, warn: 0, fail: 0 };
    for (const check of checks) score[check.severity]++;
    return { id, will_unfurl: score.fail === 0, looks_good: score.fail === 0 && score.warn === 0, score, checks };
  });
}

export function blind_spots(input: CheckInput): string[] {
  const { meta } = input;
  const notes: string[] = [];
  if (!meta.response)
    notes.push("Opened from a file or pasted HTML, so the HTTP status and headers a crawler would get (Cache-Control, X-Robots-Tag) aren't checked. Fetch the live URL to check them.");
  else if (!header(meta, "x-robots-tag") && !header(meta, "x-frame-options"))
    notes.push("The browser only sees headers a server exposes to other sites, so X-Robots-Tag and X-Frame-Options can't be checked here.");
  if (!meta.url) notes.push("No base URL: relative image and icon links can't be resolved, and canonical and og:url can't be compared with the page. Fill in Base URL.");
  else if (meta.url && !input.robots) notes.push("robots.txt couldn't be read (its server doesn't allow other sites), so crawler blocks there aren't checked.");
  if (input.image?.loaded && input.image.bytes === null) notes.push("The image's file size and type are unknown: its server doesn't let other sites read it. Its pixel size is measured.");
  return notes;
}

export interface Crop {
  side: "width" | "height" | null;
  lost: number;
}

export function crop_loss(ratio: number, target: number): Crop {
  if (Math.abs(ratio / target - 1) < 0.03) return { side: null, lost: 0 };
  return ratio > target ? { side: "width", lost: 1 - target / ratio } : { side: "height", lost: 1 - ratio / target };
}
