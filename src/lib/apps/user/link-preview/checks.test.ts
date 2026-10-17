import { describe, expect, test } from "vitest";
import { blind_spots, crop_loss, evaluate, image_size, robots_block, Severity, urls_match, type CheckInput, type PlatformReport } from "./checks";
import type { ImageProbe } from "./page";
import { empty_meta, type FetchInfo, type PageMeta } from "./parse";
import { Platform } from "./platforms";

const PAGE = "https://site.test/post";

function good_meta(url = PAGE): PageMeta {
  const meta = empty_meta(url);
  meta.title = "Post";
  meta.description = "About the post";
  meta.theme_color = "#123456";
  Object.assign(meta.open_graph, {
    "og:title": "Post",
    "og:description": "About the post",
    "og:image": "https://site.test/og.png",
    "og:url": url,
    "og:type": "article",
    "og:site_name": "Site",
  });
  meta.twitter["twitter:card"] = "summary_large_image";
  meta.other["fb:app_id"] = "1";
  meta.og_images.push({ url: "https://site.test/og.png", secure_url: null, type: null, width: 1200, height: 630, alt: null });
  Object.assign(meta.derived, { title: "Post", description: "About the post", image: "https://site.test/og.png", image_width: 1200, image_height: 630, card: "summary_large_image" });
  return meta;
}

function image(patch: Partial<ImageProbe> = {}): ImageProbe {
  return { url: "https://site.test/og.png", loaded: true, width: 1200, height: 630, bytes: 120_000, type: "image/png", status: 200, ...patch };
}

function response(patch: Partial<FetchInfo> = {}): FetchInfo {
  return { requested: PAGE, status: 200, status_text: "OK", content_type: "text/html; charset=utf-8", headers: {}, bytes: 1000, ms: 10, ...patch };
}

function report(input: CheckInput, id: Platform): PlatformReport {
  return evaluate(input).find((entry) => entry.id === id)!;
}

function check(input: CheckInput, platform: Platform, id: string) {
  return report(input, platform).checks.find((entry) => entry.id === id);
}

describe("evaluate", () => {
  test("a complete page unfurls everywhere", () => {
    const reports = evaluate({ meta: good_meta(), image: image(), robots: { url: "", status: 200, groups: [] } });
    expect(reports.map((entry) => entry.id)).toEqual(Object.values(Platform));
    expect(reports.every((entry) => entry.will_unfurl)).toBe(true);
  });

  test("a file skips HTTP checks", () => {
    const input = { meta: good_meta(), image: image(), robots: null };
    expect(check(input, Platform.SLACK, "http-status")).toBeUndefined();
    expect(check(input, Platform.SLACK, "slack-cache-control")).toBeUndefined();
  });

  test("a failing status and non-HTML type fail every platform", () => {
    const meta = good_meta();
    meta.response = response({ status: 404, status_text: "Not Found", content_type: "application/json" });
    const reports = evaluate({ meta, image: image(), robots: null });
    expect(reports.every((entry) => !entry.will_unfurl)).toBe(true);
    expect(reports[0].checks.find((entry) => entry.id === "http-status")?.title).toBe("HTTP 404 Not Found");
  });

  test("no image fails X, Facebook and LinkedIn but only warns Slack", () => {
    const meta = good_meta();
    delete meta.open_graph["og:image"];
    const input = { meta, image: null, robots: null };
    expect(check(input, Platform.TWITTER, "twitter-image")?.severity).toBe(Severity.FAIL);
    expect(check(input, Platform.FACEBOOK, "facebook-og-image")?.severity).toBe(Severity.FAIL);
    expect(check(input, Platform.LINKEDIN, "linkedin-og-image")?.severity).toBe(Severity.FAIL);
    expect(check(input, Platform.SLACK, "slack-image")?.severity).toBe(Severity.WARN);
  });

  test("an http image fails X but warns Discord", () => {
    const meta = good_meta();
    meta.open_graph["og:image"] = "http://site.test/og.png";
    const input = { meta, image: image(), robots: null };
    expect(check(input, Platform.TWITTER, "twitter-image-https")?.severity).toBe(Severity.FAIL);
    expect(check(input, Platform.DISCORD, "discord-image-https")?.severity).toBe(Severity.WARN);
  });

  test("an image that doesn't load fails", () => {
    const input = { meta: good_meta(), image: image({ loaded: false, width: null, height: null, bytes: null, type: null, status: null }), robots: null };
    expect(check(input, Platform.SLACK, "slack-image-load")?.severity).toBe(Severity.FAIL);
  });

  test("a 404 image fails with its status", () => {
    const input = { meta: good_meta(), image: image({ loaded: false, status: 404 }), robots: null };
    expect(check(input, Platform.DISCORD, "discord-image-status")?.title).toBe("Image returned HTTP 404");
  });

  test("an oversized image fails the byte limit per platform", () => {
    const input = { meta: good_meta(), image: image({ bytes: 6 * 1024 * 1024 }), robots: null };
    expect(check(input, Platform.TWITTER, "twitter-image-bytes")?.severity).toBe(Severity.FAIL);
    expect(check(input, Platform.DISCORD, "discord-image-bytes")?.severity).toBe(Severity.PASS);
  });

  test("unknown bytes add no byte check", () => {
    const input = { meta: good_meta(), image: image({ bytes: null, type: null }), robots: null };
    expect(check(input, Platform.SLACK, "slack-image-bytes")).toBeUndefined();
  });

  test("webp warns on Facebook only", () => {
    const input = { meta: good_meta(), image: image({ type: "image/webp" }), robots: null };
    expect(check(input, Platform.FACEBOOK, "facebook-image-format")?.severity).toBe(Severity.WARN);
    expect(check(input, Platform.SLACK, "slack-image-format")).toBeUndefined();
  });

  test("measured size stands in for undeclared dimensions", () => {
    const meta = good_meta();
    Object.assign(meta.derived, { image_width: null, image_height: null });
    const input = { meta, image: image({ width: 400, height: 400 }), robots: null };
    expect(image_size(input)).toEqual({ width: 400, height: 400 });
    expect(check(input, Platform.TWITTER, "twitter-image-size")?.title).toContain("2:1");
    expect(check(input, Platform.SLACK, "slack-image-dims")?.severity).toBe(Severity.WARN);
  });

  test("X summary_large_image below 300×157 fails", () => {
    const meta = good_meta();
    Object.assign(meta.derived, { image_width: 200, image_height: 100 });
    expect(check({ meta, image: null, robots: null }, Platform.TWITTER, "twitter-image-size")?.severity).toBe(Severity.FAIL);
  });

  test("a canonical pointing at a login page fails Facebook and LinkedIn", () => {
    const meta = good_meta();
    meta.canonical = "https://site.test/login";
    const input = { meta, image: image(), robots: null };
    const facebook = check(input, Platform.FACEBOOK, "facebook-canonical");
    expect(facebook?.severity).toBe(Severity.FAIL);
    expect(facebook?.detail).toContain("login");
    expect(check(input, Platform.LINKEDIN, "linkedin-canonical")?.severity).toBe(Severity.FAIL);
    expect(check(input, Platform.SLACK, "slack-canonical")?.severity).toBe(Severity.WARN);
  });

  test("X-Robots-Tag noindex fails Facebook and explains Vercel previews", () => {
    const meta = good_meta("https://app-git-x.vercel.app/");
    meta.response = response({ headers: { "x-robots-tag": "noindex" } });
    const input = { meta, image: image(), robots: null };
    const found = check(input, Platform.FACEBOOK, "x-robots-tag-noindex");
    expect(found?.severity).toBe(Severity.FAIL);
    expect(found?.detail).toContain("vercel.app");
    expect(check(input, Platform.SLACK, "x-robots-tag-noindex")?.severity).toBe(Severity.WARN);
  });

  test("no-store cache warns Slack", () => {
    const meta = good_meta();
    meta.response = response({ headers: { "cache-control": "private, no-store" } });
    expect(check({ meta, image: image(), robots: null }, Platform.SLACK, "slack-cache-control")?.title).toContain("no-store, private");
  });

  test("a relative og:image warns, and fails where crawlers are strict", () => {
    const meta = good_meta();
    meta.relative.push({ key: "og:image", value: "/og.png" });
    const input = { meta, image: image(), robots: null };
    expect(check(input, Platform.SLACK, "slack-image-relative")?.severity).toBe(Severity.WARN);
    expect(check(input, Platform.FACEBOOK, "facebook-image-relative")?.severity).toBe(Severity.FAIL);
  });

  test("several og:images warn iMessage", () => {
    const meta = good_meta();
    meta.og_images.push({ ...meta.og_images[0], url: "https://site.test/square.png" });
    expect(check({ meta, image: image(), robots: null }, Platform.IMESSAGE, "imessage-multiple-images")?.severity).toBe(Severity.WARN);
  });

  test("score counts severities", () => {
    const meta = good_meta();
    delete meta.open_graph["og:site_name"];
    const slack = report({ meta, image: image(), robots: null }, Platform.SLACK);
    expect(slack.score.warn).toBe(1);
    expect(slack.looks_good).toBe(false);
    expect(slack.will_unfurl).toBe(true);
  });
});

describe("robots_block", () => {
  test("matches the bot or the wildcard on a path prefix", () => {
    const input = { meta: good_meta(), image: null, robots: { url: "", status: 200, groups: [{ agent: "twitterbot", paths: ["/post"] }] } };
    expect(robots_block(input, ["twitterbot"])).toContain("twitterbot");
    expect(robots_block(input, ["slackbot"])).toBeNull();
    expect(check(input, Platform.TWITTER, "robots-txt")?.severity).toBe(Severity.FAIL);
  });
});

describe("urls_match", () => {
  test("ignores a trailing slash and the hash", () => {
    expect(urls_match("https://a.test/x/", "https://a.test/x#top")).toBe(true);
    expect(urls_match("https://a.test/x?a=1", "https://a.test/x")).toBe(false);
  });
});

describe("crop_loss", () => {
  test("a close ratio fits", () => {
    expect(crop_loss(1200 / 630, 1.91)).toEqual({ side: null, lost: 0 });
  });

  test("a square in a 2:1 frame loses half its height", () => {
    expect(crop_loss(1, 2)).toEqual({ side: "height", lost: 0.5 });
  });

  test("a wide image in a square frame loses width", () => {
    expect(crop_loss(2, 1)).toEqual({ side: "width", lost: 0.5 });
  });
});

describe("blind_spots", () => {
  test("a file says status and headers aren't checked", () => {
    expect(blind_spots({ meta: good_meta(), image: image(), robots: null }).join(" ")).toContain("HTTP status");
  });

  test("no base URL asks for one", () => {
    expect(blind_spots({ meta: empty_meta(null), image: null, robots: null }).join(" ")).toContain("Base URL");
  });

  test("an image read without CORS has unknown bytes", () => {
    const meta = good_meta();
    meta.response = response();
    expect(blind_spots({ meta, image: image({ bytes: null }), robots: { url: "", status: 200, groups: [] } }).join(" ")).toContain("file size");
  });
});
