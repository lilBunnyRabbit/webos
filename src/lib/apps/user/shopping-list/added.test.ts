import { expect, test } from "vitest";
import { format_added } from "./added";

const at = (year: number, month: number, day: number, hours = 18, minutes = 4) => new Date(year, month - 1, day, hours, minutes).getTime();
const now = at(2026, 10, 24, 12, 0);

test("today and yesterday by calendar day, not 24 hours", () => {
  expect(format_added(at(2026, 10, 24, 0, 5), now)).toBe("Added today, 00:05");
  expect(format_added(at(2026, 10, 23, 23, 59), now)).toBe("Added yesterday, 23:59");
});

test("the weekday within a week", () => {
  expect(format_added(at(2026, 10, 19), now)).toBe("Added Mon, 18:04");
  expect(format_added(at(2026, 10, 18), now)).toBe("Added Sun, 18:04");
  expect(format_added(at(2026, 10, 17), now)).toBe("Added 17 Oct, 18:04");
});

test("the year only when it isn't this one", () => {
  expect(format_added(at(2026, 1, 3, 9, 7), now)).toBe("Added 3 Jan, 09:07");
  expect(format_added(at(2025, 12, 31), now)).toBe("Added 31 Dec 2025, 18:04");
  expect(format_added(at(2025, 9, 19), now)).toBe("Added 19 Sep 2025, 18:04");
});

test("a date ahead of this device's clock shows the date", () => {
  expect(format_added(at(2026, 10, 26), now)).toBe("Added 26 Oct, 18:04");
});
