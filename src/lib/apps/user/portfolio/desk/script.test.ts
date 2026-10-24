import { describe, expect, test } from "vitest";
import { PROFILE } from "../content/profile";
import { ActionKind, help_for, IN_PROGRESS, parse, PROJECTS, reply, RowLayout, suggest, SUGGESTIONS, summary, TOUR, Win, WINDOWS } from "./script";

describe("help_for", () => {
  test("a phone's single column hides the commands that move or list windows", () => {
    const names = help_for(true).map((usage) => usage.name);
    expect(names).not.toContain("tidy");
    expect(names).not.toContain("close");
    expect(names).not.toContain("ls");
    expect(help_for(false).map((usage) => usage.name)).toEqual(expect.arrayContaining(["tidy", "close", "ls"]));
  });
});

describe("suggestions", () => {
  test("every suggestion is a command the terminal understands, or a search", () => {
    for (const suggestion of SUGGESTIONS) {
      const command = suggestion.run ?? suggestion.text;
      if (!command.startsWith("/")) expect(parse(command).kind).not.toBe(ActionKind.ERROR);
    }
  });
});

describe("parse", () => {
  test("the tour opens work and projects before how I build lights them up", () => {
    const kinds = TOUR.map(({ line }) => parse(line));
    expect(kinds.map((action) => action.kind)).toEqual([ActionKind.OPEN, ActionKind.OPEN, ActionKind.OPEN, ActionKind.HOW, ActionKind.OPEN]);
    expect(TOUR.map(({ line }) => line)).toEqual(["whoami", "work --timeline", "projects", "how --i-build", "contact"]);
  });

  test("projects opens the one projects window, focused on a card when named", () => {
    expect(parse("projects")).toEqual({ kind: ActionKind.OPEN, windows: [Win.PROJECTS], project: undefined });
    expect(parse("projects agtc")).toEqual({ kind: ActionKind.OPEN, windows: [Win.PROJECTS], project: "agtc" });
  });

  test("how opens no window; it takes a principle to light", () => {
    expect(parse("how --i-build")).toEqual({ kind: ActionKind.HOW, principle: undefined });
    expect(parse("how --i-build correct")).toEqual({ kind: ActionKind.HOW, principle: "correct" });
    expect(parse("work astra")).toMatchObject({ windows: [Win.TIMELINE], job: "astra" });
    expect(parse("timeline")).toMatchObject({ windows: [Win.TIMELINE] });
  });

  test("an unknown option suggests the closest one", () => {
    expect(parse("work --timline")).toMatchObject({ kind: ActionKind.ERROR, suggest: "work --timeline" });
    expect(parse("projects chromatcs")).toMatchObject({ kind: ActionKind.ERROR, suggest: "projects chromatics" });
  });

  test("an unknown command suggests a close one, through aliases", () => {
    expect(parse("whoamii")).toMatchObject({ kind: ActionKind.ERROR, suggest: "whoami" });
    expect(parse("replya")).toMatchObject({ kind: ActionKind.ERROR, suggest: "tour" });
    expect(parse("zzzz")).toMatchObject({ kind: ActionKind.ERROR, suggest: undefined });
  });

  test("close resolves names and all", () => {
    expect(parse("close all")).toEqual({ kind: ActionKind.CLOSE, windows: WINDOWS });
    expect(parse("close whoami contact")).toEqual({ kind: ActionKind.CLOSE, windows: [Win.IDENTITY, Win.CONTACT] });
    expect(parse("close").kind).toBe(ActionKind.ERROR);
  });

  test("blank input does nothing", () => {
    expect(parse("   ").kind).toBe(ActionKind.NONE);
  });
});

describe("mail", () => {
  test("opens Contact with the subject as typed, quotes off; bare mail is just Contact", () => {
    expect(parse('mail "Frontend role at Acme"')).toEqual({ kind: ActionKind.OPEN, windows: [Win.CONTACT], subject: "Frontend role at Acme" });
    expect(parse("mail")).toEqual({ kind: ActionKind.OPEN, windows: [Win.CONTACT], subject: "" });
  });

  test("is in help and completes", () => {
    expect(help_for(true).map((usage) => usage.name)).toContain("mail");
    expect(suggest("ma")).toEqual([{ line: "mail ", word: "mail", detail: "Write me an email" }]);
  });
});

describe("suggest", () => {
  test("a prefix lists the commands it can become, with what each does", () => {
    expect(suggest("c").map((hit) => hit.word)).toEqual(["contact", "close", "clear"]);
    expect(suggest("who")).toEqual([{ line: "whoami ", word: "whoami", detail: "Who I am" }]);
  });

  test("a phone isn't offered the commands that move windows", () => {
    expect(suggest("c", true).map((hit) => hit.word)).toEqual(["contact", "clear"]);
  });

  test("after a command, its arguments, aliases included", () => {
    expect(suggest("work --")).toEqual([{ line: "work --timeline ", word: "--timeline", detail: "Both jobs" }]);
    expect(suggest("projects ta")[0]).toEqual({ line: "projects task-manager ", word: "task-manager", detail: "Task Manager" });
    expect(suggest("principles --")[0].line).toBe("principles --i-build ");
    expect(suggest("work ").map((hit) => hit.word)).toEqual(["--timeline", "astra", "while-true"]);
  });

  test("nothing for a finished word, a search or an unknown command", () => {
    expect(suggest("whoami")).toEqual([]);
    expect(suggest("/react")).toEqual([]);
    expect(suggest("zzz ")).toEqual([]);
    expect(suggest("close all ").map((hit) => hit.word)).not.toContain("all");
  });
});

describe("reply", () => {
  test("projects names every card, or the one asked for", () => {
    expect(reply(parse("projects")).map((row) => row.text)).toEqual([...PROJECTS, ...IN_PROGRESS].map((p) => p.name));
    expect(reply(parse("projects animot"))).toEqual([{ text: "Animot", detail: "In progress", run: "projects animot", layout: RowLayout.BELOW }]);
    const agtc = PROJECTS.find((p) => p.id === "agtc")!;
    expect(reply(parse("projects agtc"))).toEqual([{ text: agtc.name, detail: agtc.kicker, run: "projects agtc", layout: RowLayout.BELOW }]);
  });

  test("work lists companies with their periods as two columns", () => {
    const rows = reply(parse("work --timeline"));
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row) => row.detail && row.run?.startsWith("work "))).toBe(true);
  });

  test("errors get no reply", () => {
    expect(reply(parse("nope"))).toEqual([]);
  });
});

describe("summary", () => {
  test("the tour prints one line per command, never the window's contents", () => {
    for (const { line } of TOUR) expect(summary(parse(line))).toHaveLength(1);
  });

  test("whoami answers with the name, the handle after it and the role under", () => {
    const [row] = summary(parse("whoami"));
    expect(row.text).toContain(PROFILE.name);
    expect(row.detail).toBe(PROFILE.role);
    expect(row.text).toContain(PROFILE.socials.find((social) => social.label === "GitHub")?.handle);
  });

  test("the tour's principle note says how many it plays and where all of them are", () => {
    const [row] = summary(parse("how --i-build"));
    expect(row.detail).toBe("6 principles, 3 on the tour");
    expect(row.detail).not.toMatch(/of 6/);
  });

  test("work names the employers and the span they cover", () => {
    expect(summary(parse("work --timeline"))[0].detail).toMatch(/^Astra AI and While True, Nov 2019 – /);
  });

  test("every tour note has phone copy short enough for the prompt line at 360px", () => {
    for (const { line } of TOUR) for (const row of summary(parse(line))) expect((row.short ?? row.text).length).toBeLessThanOrEqual(28);
    expect(summary(parse("work --timeline"))[0].short).toMatch(/^Work: 2019–\d{4}$/);
  });

  test("an unknown word is flagged as unknown so the terminal can search for it", () => {
    expect(parse("react")).toMatchObject({ kind: ActionKind.ERROR, unknown: true, suggest: undefined });
    expect(parse("work --timline")).not.toHaveProperty("unknown");
  });

  test("the Try list uses the plain commands", () => {
    expect(SUGGESTIONS.map((suggestion) => suggestion.run)).toContain("how");
    expect(SUGGESTIONS.some((suggestion) => suggestion.run?.includes("--"))).toBe(false);
  });
});
