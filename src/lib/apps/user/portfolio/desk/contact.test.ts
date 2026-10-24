import { describe, expect, test } from "vitest";
import { local_time, mailto, subject_of, until_next_minute, ZONE } from "./contact";

describe("mailto", () => {
  test("an empty draft sends just the address", () => {
    expect(mailto("a@b.co", { subject: "", message: "  " })).toBe("mailto:a@b.co");
  });

  test("subject and body are URL-encoded, line breaks as CRLF", () => {
    expect(mailto("a@b.co", { subject: "Hi & hello?", message: "Line one\nLine two" })).toBe("mailto:a@b.co?subject=Hi%20%26%20hello%3F&body=Line%20one%0D%0ALine%20two");
  });

  test("either field alone", () => {
    expect(mailto("a@b.co", { subject: " Role ", message: "" })).toBe("mailto:a@b.co?subject=Role");
    expect(mailto("a@b.co", { subject: "", message: "Hej" })).toBe("mailto:a@b.co?body=Hej");
  });
});

describe("local time", () => {
  test("a 24-hour clock on Ljubljana time, in Ig, whatever the visitor's zone", () => {
    expect(ZONE).toBe("Europe/Ljubljana");
    expect(local_time(new Date("2026-01-15T13:05:00Z"))).toBe("14:05 in Ig");
    expect(local_time(new Date("2026-07-15T22:30:00Z"))).toBe("00:30 in Ig");
  });

  test("ticks on the minute", () => {
    expect(until_next_minute(new Date("2026-01-15T13:05:20.500Z"))).toBe(39_500);
    expect(until_next_minute(new Date("2026-01-15T13:05:00Z"))).toBe(60_000);
  });
});

describe("subject_of", () => {
  test("drops the command and the quotes", () => {
    expect(subject_of('mail "Frontend role at Acme"')).toBe("Frontend role at Acme");
    expect(subject_of("mail Hello There")).toBe("Hello There");
    expect(subject_of("mail")).toBe("");
  });
});
