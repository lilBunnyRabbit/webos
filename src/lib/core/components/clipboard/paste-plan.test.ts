import { describe, expect, it } from "vitest";
import { accepts_file, PasteFrom, plan_paste, same_paths } from "./paste-plan";

const base = { files: 0, accepted: 0, text: "", paths: [], editable: false };

describe("same_paths", () => {
  it("matches the newline list, ignoring CRLF and trailing space", () => {
    expect(same_paths("/home/a.png\r\n/home/b.png\n", ["/home/a.png", "/home/b.png"])).toBe(true);
  });
  it("rejects other text and an empty clipboard", () => {
    expect(same_paths("/home/a.png", ["/home/a.png", "/home/b.png"])).toBe(false);
    expect(same_paths("", [])).toBe(false);
  });
});

describe("accepts_file", () => {
  it("takes anything without accept", () => {
    expect(accepts_file(undefined, { name: "a.bin", type: "" })).toBe(true);
    expect(accepts_file([], { name: "a.bin", type: "" })).toBe(true);
  });
  it("matches MIME wildcards and extensions", () => {
    expect(accepts_file(["image/*"], { name: "image.png", type: "image/png" })).toBe(true);
    expect(accepts_file([".pdf"], { name: "doc.PDF", type: "" })).toBe(true);
    expect(accepts_file(["image/*"], { name: "doc.pdf", type: "application/pdf" })).toBe(false);
  });
});

describe("plan_paste", () => {
  it("prefers accepted event files, even in a field", () => {
    expect(plan_paste({ ...base, files: 1, accepted: 1, editable: true, paths: ["/a"] })).toBe(PasteFrom.EVENT);
  });
  it("takes WebOS files when the clipboard text is their paths", () => {
    expect(plan_paste({ ...base, text: "/home/a.png", paths: ["/home/a.png"] })).toBe(PasteFrom.WEBOS);
  });
  it("takes WebOS files when the system clipboard shows nothing", () => {
    expect(plan_paste({ ...base, paths: ["/home/a.png"] })).toBe(PasteFrom.WEBOS);
  });
  it("treats other text as newer than the WebOS copy", () => {
    expect(plan_paste({ ...base, text: "hello", paths: ["/home/a.png"] })).toBe(PasteFrom.TEXT);
  });
  it("leaves a field's paste to the field", () => {
    expect(plan_paste({ ...base, text: "/home/a.png", paths: ["/home/a.png"], editable: true })).toBe(PasteFrom.TEXT);
  });
  it("does nothing with unaccepted files and no text", () => {
    expect(plan_paste({ ...base, files: 1 })).toBe(PasteFrom.NONE);
  });
});
