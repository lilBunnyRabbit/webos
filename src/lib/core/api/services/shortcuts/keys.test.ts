import { describe, expect, it } from "vitest";
import { code_key, event_keys, format_keys, has_command_modifier, normalize } from "./keys";

const event = (code: string, modifiers: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...modifiers,
});

describe("normalize", () => {
  it("orders modifiers and lowercases", () => {
    expect(normalize("Shift+Mod+K")).toBe("mod+shift+k");
    expect(normalize("alt+shift+up")).toBe("alt+shift+up");
  });
});

describe("code_key", () => {
  it("maps letters, digits, arrows and punctuation", () => {
    expect(code_key("KeyW")).toBe("w");
    expect(code_key("Digit3")).toBe("3");
    expect(code_key("ArrowLeft")).toBe("left");
    expect(code_key("Backquote")).toBe("`");
    expect(code_key("Backslash")).toBe("\\");
    expect(code_key("F2")).toBe("f2");
    expect(code_key("ShiftLeft")).toBeNull();
  });
});

describe("event_keys", () => {
  it("treats Cmd as mod on macOS and Ctrl as mod elsewhere", () => {
    expect(event_keys(event("KeyK", { metaKey: true }), true)).toBe("mod+k");
    expect(event_keys(event("KeyK", { ctrlKey: true }), false)).toBe("mod+k");
    expect(event_keys(event("KeyK", { ctrlKey: true }), true)).toBe("ctrl+k");
  });

  it("matches Option+Shift on macOS by code, whatever character it types", () => {
    expect(event_keys(event("KeyW", { altKey: true, shiftKey: true }), true)).toBe("alt+shift+w");
  });

  it("ignores a lone modifier", () => {
    expect(event_keys(event("AltLeft", { altKey: true }), false)).toBeNull();
  });
});

describe("format_keys", () => {
  it("uses symbols on macOS and words elsewhere", () => {
    expect(format_keys("mod+shift+k", true)).toEqual(["⌘", "⇧", "K"]);
    expect(format_keys("alt+shift+up", false)).toEqual(["Alt", "Shift", "↑"]);
  });
});

describe("has_command_modifier", () => {
  it("is false for shift-only and bare keys", () => {
    expect(has_command_modifier("shift+a")).toBe(false);
    expect(has_command_modifier("f2")).toBe(false);
    expect(has_command_modifier("alt+shift+w")).toBe(true);
  });
});
