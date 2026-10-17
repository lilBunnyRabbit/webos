import { describe, expect, test } from "vitest";
import { field_text, file_name_for, fill_template, format_scalar, note_title, parse_frontmatter, set_field } from "./frontmatter";

const QUEST = `---
id: faf50e2
project: astra
status: investigating
created: 2026-08-13
repo: ~/dev/orgs/astra-ai/astra-ai-platform
session:
related: ["[[exam-prep-back-to-origin]]", "[[navbar-redirect-table]]"]
---

# global back navigation ("just use window.back")

> Hub: [[Home]]
`;

describe("parse_frontmatter", () => {
  test("reads a quest", () => {
    const { fields, body } = parse_frontmatter(QUEST);
    expect(fields).toEqual({
      id: "faf50e2",
      project: "astra",
      status: "investigating",
      created: "2026-08-13",
      repo: "~/dev/orgs/astra-ai/astra-ai-platform",
      session: "",
      related: ["[[exam-prep-back-to-origin]]", "[[navbar-redirect-table]]"],
    });
    expect(body.startsWith("\n# global back navigation")).toBe(true);
  });

  test("block lists, quotes, comments and nested maps", () => {
    const { fields } = parse_frontmatter(
      "---\ntags:\n  - a\n  - 'b c'\n- d\ntitle: \"Hi: there\"\nnote: plain # a comment\nhash: a#b\nmeta:\n  nested: 1\nlong: |\n  one\n  two\n---\nbody"
    );
    expect(fields.tags).toEqual(["a", "b c", "d"]);
    expect(fields.title).toBe("Hi: there");
    expect(fields.note).toBe("plain");
    expect(fields.hash).toBe("a#b");
    expect(fields.meta).toBe("nested: 1");
    expect(fields.long).toBe("one\ntwo");
  });

  test("no frontmatter, or an unclosed one, is all body", () => {
    expect(parse_frontmatter("# Hi\n")).toEqual({ fields: {}, body: "# Hi\n" });
    expect(parse_frontmatter("---\nstatus: raw\n").fields).toEqual({});
  });

  test("CRLF files", () => {
    const { fields, body } = parse_frontmatter("---\r\nstatus: raw\r\n---\r\nbody");
    expect(fields.status).toBe("raw");
    expect(body).toBe("body");
  });

  test("field_text takes a list's first item", () => {
    expect(field_text({ a: ["x", "y"], b: "z" }, "a")).toBe("x");
    expect(field_text({}, "missing")).toBe("");
  });
});

describe("set_field", () => {
  test("changes only the value on that line", () => {
    const next = set_field(QUEST, "status", "done");
    expect(next).toBe(QUEST.replace("status: investigating", "status: done"));
  });

  test("an empty value becomes a value", () => {
    expect(set_field(QUEST, "session", "abc")).toBe(QUEST.replace("session:\n", "session: abc\n"));
  });

  test("keeps the spacing after the colon and a trailing comment", () => {
    expect(set_field("---\nstatus:   raw # flow\n---\n", "status", "ready")).toBe("---\nstatus:   ready # flow\n---\n");
  });

  test("replaces a block list under the key", () => {
    expect(set_field("---\nstatus:\n  - a\n  - b\nnext: 1\n---\n", "status", "ready")).toBe("---\nstatus: ready\nnext: 1\n---\n");
  });

  test("adds a missing key as the last line", () => {
    expect(set_field("---\nid: 1\n---\n# T\n", "status", "raw")).toBe("---\nid: 1\nstatus: raw\n---\n# T\n");
    expect(set_field("---\n---\n# T\n", "status", "raw")).toBe("---\nstatus: raw\n---\n# T\n");
  });

  test("adds frontmatter to a file without one", () => {
    expect(set_field("# T\n", "status", "raw")).toBe("---\nstatus: raw\n---\n# T\n");
  });

  test("keeps CRLF", () => {
    expect(set_field("---\r\nstatus: raw\r\nid: 1\r\n---\r\nbody\r\n", "status", "done")).toBe("---\r\nstatus: done\r\nid: 1\r\n---\r\nbody\r\n");
    expect(set_field("---\r\nid: 1\r\n---\r\n", "status", "done")).toBe("---\r\nid: 1\r\nstatus: done\r\n---\r\n");
  });

  test("an empty value clears the key", () => {
    expect(set_field("---\nstatus: raw\n---\n", "status", "")).toBe("---\nstatus:\n---\n");
  });

  test("the last line without a line break", () => {
    expect(set_field("---\nstatus: raw\n---", "status", "done")).toBe("---\nstatus: done\n---");
  });

  test("matches the key exactly", () => {
    expect(set_field("---\nstatus_old: raw\nstatus: raw\n---\n", "status", "done")).toBe("---\nstatus_old: raw\nstatus: done\n---\n");
  });

  test("round-trips through parse", () => {
    for (const value of ["in-progress", "a: b", "yes", "42", "#tag", " padded", 'say "hi"']) {
      expect(parse_frontmatter(set_field(QUEST, "status", value)).fields.status).toBe(value);
    }
  });
});

describe("format_scalar", () => {
  test("plain when safe", () => {
    expect(format_scalar("in-progress")).toBe("in-progress");
    expect(format_scalar("2026-10-17")).toBe("2026-10-17");
    expect(format_scalar("true")).toBe('"true"');
    expect(format_scalar("- x")).toBe('"- x"');
  });
});

describe("note_title", () => {
  test("frontmatter title, then first heading, then the file name", () => {
    expect(note_title({ title: "From front" }, "# Heading", "a.md")).toBe("From front");
    expect(note_title({}, "intro\n\n## Second level ##\n# Later", "a.md")).toBe("Second level");
    expect(note_title({}, "no heading", "my-quest.md")).toBe("my-quest");
  });
});

describe("templates and names", () => {
  test("fills Obsidian variables", () => {
    const now = new Date(2026, 9, 17, 9, 5, 3);
    expect(fill_template("# {{title}}\n{{date}} {{time}} {{date:YYYY-MM-DD HH:mm}} {{ date : DD.MM.YYYY }}", "Quest", now)).toBe(
      "# Quest\n2026-10-17 09:05 2026-10-17 09:05 17.10.2026"
    );
    expect(fill_template("{{unknown}}", "x")).toBe("{{unknown}}");
  });

  test("slugs a title into a free file name", () => {
    expect(file_name_for("Global back navigation!", new Set())).toBe("global-back-navigation.md");
    expect(file_name_for("Čevapi", new Set(["cevapi.md"]))).toBe("cevapi-2.md");
    expect(file_name_for("???", new Set())).toBe("untitled.md");
  });
});
