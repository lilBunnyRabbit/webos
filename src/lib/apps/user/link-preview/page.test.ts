import { describe, expect, test } from "vitest";
import { normalize_url, parse_robots } from "./page";

describe("normalize_url", () => {
  test("keeps a full URL", () => {
    expect(normalize_url(" https://a.test/x ")).toBe("https://a.test/x");
  });

  test("adds https to a bare host", () => {
    expect(normalize_url("example.com/page")).toBe("https://example.com/page");
  });

  test("adds http to a local dev server", () => {
    expect(normalize_url("localhost:5173")).toBe("http://localhost:5173");
    expect(normalize_url("127.0.0.1:3000/a")).toBe("http://127.0.0.1:3000/a");
  });
});

describe("parse_robots", () => {
  test("groups disallow rules by agent and ignores comments", () => {
    const groups = parse_robots("# hi\nUser-agent: *\nDisallow: /admin # private\nDisallow:\n\nUser-agent: Twitterbot\nDisallow: /");
    expect(groups).toEqual([
      { agent: "*", paths: ["/admin"] },
      { agent: "twitterbot", paths: ["/"] },
    ]);
  });

  test("consecutive user-agent lines share their rules", () => {
    const groups = parse_robots("User-agent: Slackbot\nUser-agent: LinkedInBot\nDisallow: /private");
    expect(groups.map((group) => [group.agent, group.paths])).toEqual([
      ["slackbot", ["/private"]],
      ["linkedinbot", ["/private"]],
    ]);
  });
});
