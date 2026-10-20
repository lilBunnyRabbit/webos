import { describe, expect, test } from "vitest";
import { FeedbackKind, issue_url } from "./feedback";

const INFO = { version: "3.12.0", commit: "abc1234" };

describe("issue_url", () => {
  test("opens the feature form with the version filled in", () => {
    const url = new URL(issue_url(FeedbackKind.FEATURE, INFO, "desktop"));
    expect(url.pathname).toBe("/lilbunnyrabbit/webos/issues/new");
    expect(url.searchParams.get("template")).toBe("feature.yml");
    expect(url.searchParams.get("version")).toBe("3.12.0 (abc1234)");
    expect(url.searchParams.has("platform")).toBe(false);
  });

  test("adds the platform to a bug report", () => {
    const url = new URL(issue_url(FeedbackKind.BUG, INFO, "mobile · Chrome"));
    expect(url.searchParams.get("template")).toBe("bug.yml");
    expect(url.searchParams.get("platform")).toBe("mobile · Chrome");
  });
});
