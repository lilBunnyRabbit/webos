import { expect, test } from "vitest";
import { parse_month } from "./parse";

test.each([
  ["", "2026-10"],
  ["this", "2026-10"],
  ["last", "2026-09"],
  ["prev", "2026-09"],
  ["next", "2026-11"],
  ["-10", "2025-12"],
  ["+3", "2027-01"],
  ["2025-03", "2025-03"],
  ["2025-3", "2025-03"],
  ["4", "2026-04"],
  ["12", "2026-12"],
])("parse_month(%j)", (text, month) => expect(parse_month(text, "2026-10")).toBe(month));

test.each(["13", "0", "2025-13", "october", "2025-10-01"])("parse_month rejects %j", (text) => expect(parse_month(text, "2026-10")).toBeNull());
