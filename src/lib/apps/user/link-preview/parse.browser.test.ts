import { afterEach, describe, expect, test } from "vitest";
import { probe_image } from "./page";
import { parse_html, suggested_base } from "./parse";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title> The page </title>
  <meta name="description" content="Plain description">
  <meta property="og:title" content="OG title">
  <meta property="og:image" content="/one.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="First">
  <meta property="og:site_name" content="Site">
  <meta property="og:image" content="https://cdn.test/two.png">
  <meta property="og:image:width" content="600">
  <meta property="og:url" content="https://site.test/post">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="img/tw.png">
  <meta name="theme-color" content="#ff0000">
  <meta name="robots" content="noindex">
  <meta name="fb:app_id" content="42">
  <meta http-equiv="refresh" content="5">
  <link rel="canonical" href="https://site.test/post">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" sizes="180x180" href="/touch.png">
  <link rel="alternate" type="application/json+oembed" href="/oembed.json" title="oEmbed">
  <script type="application/ld+json">{"@type":"Article"}</script>
  <script type="application/ld+json">{broken</script>
  <script>window.ran = true</script>
</head>
<body><p>Hi</p></body>
</html>`;

describe("parse_html", () => {
  test("reads tags and resolves URLs against the page", () => {
    const meta = parse_html(HTML, "https://site.test/blog/post");
    expect(meta.title).toBe("The page");
    expect(meta.description).toBe("Plain description");
    expect(meta.language).toBe("en");
    expect(meta.theme_color).toBe("#ff0000");
    expect(meta.robots).toBe("noindex");
    expect(meta.canonical).toBe("https://site.test/post");
    expect(meta.other["fb:app_id"]).toBe("42");
    expect(meta.open_graph["og:image"]).toBe("https://site.test/one.png");
    expect(meta.twitter["twitter:image"]).toBe("https://site.test/blog/img/tw.png");
    expect(meta.relative.map((entry) => entry.key)).toEqual(["og:image", "twitter:image"]);
    expect(meta.derived).toMatchObject({ title: "OG title", description: "Plain description", image: "https://site.test/one.png", image_width: 1200, image_height: 630, card: "summary_large_image", site_name: "Site" });
    expect(meta.favicons.map((icon) => [icon.rel, icon.href])).toEqual([
      ["icon", "https://site.test/favicon.svg"],
      ["apple-touch-icon", "https://site.test/touch.png"],
    ]);
    expect(meta.oembed[0].url).toBe("https://site.test/oembed.json");
    expect(meta.json_ld).toEqual([{ "@type": "Article" }]);
    expect(meta.json_ld_errors).toBe(1);
    expect(meta.raw_meta_tags.find((tag) => tag.attr === "http-equiv")?.key).toBe("refresh");
    expect((window as unknown as { ran?: boolean }).ran).toBeUndefined();
  });

  test("groups og:image:* under the og:image before them", () => {
    const meta = parse_html(HTML, "https://site.test/");
    expect(meta.og_images).toEqual([
      { url: "https://site.test/one.png", secure_url: null, type: null, width: 1200, height: 630, alt: "First" },
      { url: "https://cdn.test/two.png", secure_url: null, type: null, width: 600, height: null, alt: null },
    ]);
  });

  test("leaves relative URLs alone without a base", () => {
    const meta = parse_html(HTML, null);
    expect(meta.open_graph["og:image"]).toBe("/one.png");
    expect(meta.host).toBeNull();
  });

  test("<base href> wins over the page URL", () => {
    const meta = parse_html('<base href="https://cdn.test/assets/"><meta property="og:image" content="a.png">', "https://site.test/");
    expect(meta.open_graph["og:image"]).toBe("https://cdn.test/assets/a.png");
  });

  test("suggests a base from <base>, og:url or canonical", () => {
    expect(suggested_base(parse_html(HTML, null))).toBe("https://site.test/post");
    expect(suggested_base(parse_html("<title>x</title>", null))).toBe("");
  });

  test("falls back to /favicon.ico with a base", () => {
    expect(parse_html("<title>x</title>", "https://a.test/p").favicons[0].href).toBe("https://a.test/favicon.ico");
  });
});

describe("probe_image", () => {
  const urls: string[] = [];
  afterEach(() => {
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
  });

  async function png(width: number, height: number) {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d")!.fillRect(0, 0, width, height);
    const url = URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }));
    urls.push(url);
    return url;
  }

  test("measures a readable image with its bytes and type", async () => {
    const probe = await probe_image(await png(40, 20), new AbortController().signal);
    expect(probe).toMatchObject({ loaded: true, width: 40, height: 20, type: "image/png", status: 200 });
    expect(probe.bytes).toBeGreaterThan(0);
  });

  test("reports something that isn't an image as not loaded", async () => {
    const url = URL.createObjectURL(new Blob(["<html>"], { type: "text/html" }));
    urls.push(url);
    const probe = await probe_image(url, new AbortController().signal);
    expect(probe.loaded).toBe(false);
    expect(probe.type).toBe("text/html");
  });
});
