import { describe, expect, it } from "vitest";
import { day_shift, format_offset, format_utc_offset, is_daytime, search_zones, wall_time, zone_city, zone_offset, zone_region } from "./zones";

const winter = Date.UTC(2026, 0, 15, 23, 30);
const summer = Date.UTC(2026, 6, 15, 12, 0);

describe("zones", () => {
  it("reads the wall clock in a zone", () => {
    expect(wall_time(winter, "Asia/Tokyo")).toEqual({ year: 2026, month: 1, day: 16, hour: 8, minute: 30, second: 0 });
    expect(wall_time(summer, "UTC").hour).toBe(12);
  });

  it("computes offsets, DST included", () => {
    expect(zone_offset(winter, "Europe/Ljubljana")).toBe(60);
    expect(zone_offset(summer, "Europe/Ljubljana")).toBe(120);
    expect(zone_offset(winter, "Asia/Kolkata")).toBe(330);
    expect(zone_offset(summer, "America/St_Johns")).toBe(-150);
  });

  it("formats offsets", () => {
    expect(format_offset(0)).toBe("Same time");
    expect(format_offset(360)).toBe("+6 h");
    expect(format_offset(-270)).toBe("−4 h 30");
    expect(format_offset(30)).toBe("+30 min");
    expect(format_utc_offset(330)).toBe("UTC+5:30");
    expect(format_utc_offset(-180)).toBe("UTC−3");
    expect(format_utc_offset(0)).toBe("UTC");
  });

  it("knows when the date differs", () => {
    expect(day_shift(winter, "Asia/Tokyo", "Europe/London")).toBe(1);
    expect(day_shift(winter, "America/Los_Angeles", "Asia/Tokyo")).toBe(-1);
    expect(day_shift(summer, "Europe/Paris", "Europe/Berlin")).toBe(0);
  });

  it("names zones and finds them", () => {
    expect(zone_city("America/Sao_Paulo")).toBe("Sao Paulo");
    expect(zone_region("America/Argentina/Buenos_Aires")).toBe("America · Argentina");
    expect(zone_region("UTC")).toBe("");
    const zones = ["America/New_York", "Europe/London", "Asia/Tokyo", "America/Sao_Paulo", "Pacific/Tongatapu"];
    expect(search_zones(zones, "new york")).toEqual(["America/New_York"]);
    expect(search_zones(zones, "to")).toEqual(["Asia/Tokyo", "Pacific/Tongatapu"]);
    expect(search_zones(zones, "america")).toEqual(["America/New_York", "America/Sao_Paulo"]);
    expect(search_zones(zones, "", 2)).toHaveLength(2);
  });

  it("calls 6:00 to 17:59 day", () => {
    expect(is_daytime(5)).toBe(false);
    expect(is_daytime(6)).toBe(true);
    expect(is_daytime(17)).toBe(true);
    expect(is_daytime(18)).toBe(false);
  });
});
