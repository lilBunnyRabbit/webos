import { describe, expect, test } from "vitest";
import { ItemType, parse_descriptor, parse_hex, SAMPLES } from "./descriptor";
import { decode_report, report_bytes, ReportKind } from "./report";

const sample = (name: string) => parse_descriptor(parse_hex(SAMPLES.find((entry) => entry.name === name)!.hex)!);

describe("parse_hex", () => {
  test("reads spaced bytes, 0x lists, C arrays with comments and unbroken strings", () => {
    expect(parse_hex("05 01 09 02")).toEqual(new Uint8Array([5, 1, 9, 2]));
    expect(parse_hex("0x05, 0x01, // Usage Page\n0x09, 0x02 /* Mouse */")).toEqual(new Uint8Array([5, 1, 9, 2]));
    expect(parse_hex("05010902")).toEqual(new Uint8Array([5, 1, 9, 2]));
  });

  test("rejects an odd run and nothing at all", () => {
    expect(parse_hex("050")).toBeNull();
    expect(parse_hex("  ")).toBeNull();
  });
});

describe("parse_descriptor", () => {
  test("boot keyboard: items, one application collection, input and output reports", () => {
    const parsed = sample("Boot keyboard");
    expect(parsed.error).toBeNull();
    expect(parsed.items[0]).toMatchObject({ type: ItemType.GLOBAL, text: "Usage Page (Generic Desktop)", depth: 0 });
    expect(parsed.items[1].text).toBe("Usage (Keyboard)");
    expect(parsed.items.find((item) => item.tag === "Usage Minimum")?.text).toBe("Usage Minimum (Left Control)");
    expect(parsed.items.find((item) => item.tag === "Input")?.text).toBe("Input (Data, Variable, Absolute)");
    expect(parsed.collections).toEqual([{ type: 1, usage: 0x10006, children: [] }]);

    const input = parsed.reports.find((report) => report.kind === ReportKind.INPUT)!;
    expect(report_bytes(input)).toBe(8);
    const output = parsed.reports.find((report) => report.kind === ReportKind.OUTPUT)!;
    expect(output.bits).toBe(8);
  });

  test("decodes a keyboard report: modifiers per bit, keys from the array", () => {
    const input = sample("Boot keyboard").reports[0];
    const decoded = decode_report(input, new Uint8Array([0b0000_0010, 0, 0x04, 0x1e, 0, 0, 0, 0]));
    expect(decoded.find((value) => value.label === "Left Shift")?.value).toBe("1");
    expect(decoded.find((value) => value.label === "Left Control")?.value).toBe("0");
    expect(decoded.at(-1)).toEqual({ label: "None … Application", value: "A + 1" });
  });

  test("shows ErrorRollOver, the keyboard's ghosting signal", () => {
    const input = sample("Boot keyboard").reports[0];
    expect(decode_report(input, new Uint8Array([0, 0, 1, 1, 1, 1, 1, 1])).at(-1)?.value).toContain("ErrorRollOver");
  });

  test("mouse: nested collections and signed relative axes", () => {
    const parsed = sample("Boot mouse");
    expect(parsed.collections[0].children).toEqual([{ type: 0, usage: 0x10001, children: [] }]);
    const decoded = decode_report(parsed.reports[0], new Uint8Array([0b101, 0xfb, 3, 0xff]));
    expect(decoded.slice(0, 3).map((value) => value.value)).toEqual(["1", "0", "1"]);
    expect(decoded.slice(3)).toEqual([
      { label: "X", value: "-5" },
      { label: "Y", value: "3" },
      { label: "Wheel", value: "-1" },
    ]);
  });

  test("gamepad: report ID, unsigned 0x00FF maximum, hat switch", () => {
    const input = sample("Gamepad").reports[0];
    expect(input.id).toBe(1);
    expect(input.bits).toBe(56);
    const decoded = decode_report(input, new Uint8Array([0b1, 0, 0x03, 0x80, 0xff, 0, 0x10]));
    expect(decoded.find((value) => value.label === "Hat Switch")?.value).toBe("3");
    expect(decoded.find((value) => value.label === "X")?.value).toBe("128");
    expect(decoded.find((value) => value.label === "Y")?.value).toBe("255");
  });

  test("an item cut short and an unclosed collection report an error and keep what parsed", () => {
    const cut = parse_descriptor(new Uint8Array([0x05, 0x01, 0x09]));
    expect(cut.items).toHaveLength(1);
    expect(cut.error).toMatch(/ends first/);
    expect(parse_descriptor(new Uint8Array([0xa1, 0x01])).error).toMatch(/never closed/);
  });

  test("an extended 4-byte usage carries its own page", () => {
    const parsed = parse_descriptor(new Uint8Array([0x0b, 0x38, 0x02, 0x0c, 0x00]));
    expect(parsed.items[0].text).toBe("Usage (Consumer: AC Pan)");
  });

  test("push and pop restore globals", () => {
    const parsed = parse_descriptor(new Uint8Array([0x75, 0x08, 0x95, 0x01, 0xa4, 0x75, 0x01, 0xb4, 0x81, 0x02]));
    expect(parsed.reports[0].fields[0].size).toBe(8);
  });
});
