import { expect, test } from "vitest";
import { page_points, scan_name } from "./layout";

test("scan_name is the date and time to the minute", () => {
  expect(scan_name(new Date(2026, 9, 7, 9, 5))).toBe("Scan 2026-10-07 09.05.pdf");
});

test("page_points prints at A4 width, as long as the page is", () => {
  expect(page_points(1000, 2000)).toEqual({ width: 595.28, height: 1190.56 });
  expect(page_points(2000, 1000)).toEqual({ width: 1190.56, height: 595.28 });
});
