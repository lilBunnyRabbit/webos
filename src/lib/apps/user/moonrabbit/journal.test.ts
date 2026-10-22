import { describe, expect, it } from "vitest";
import {
  clean_journal_name,
  days_written,
  EntrySchema,
  index_entry,
  matches,
  media_of,
  media_token,
  newest_first,
  prompt_for,
  PROMPTS,
  split_media,
  tags_of,
  title_of,
  words_of,
} from "./journal";
import { generate_phrase, MIN_BITS, phrase_bits, secure_index, Strength, strength_of } from "./passphrase";

const A = "a".repeat(32);
const B = "b".repeat(32);

describe("entries", () => {
  it("reads photos, tags, words and the title out of the body", () => {
    const body = `# Lake day\nSwam with Ana #summer #Friends\n${media_token(A)}\n${media_token(B)}${media_token(A)}`;
    expect(media_of(body)).toEqual([A, B]);
    expect(tags_of(body)).toEqual(["summer", "friends"]);
    expect(words_of(body)).toBe(7);
    expect(title_of(body)).toBe("Lake day");
    expect(title_of(media_token(A))).toBe("Photo");
    expect(title_of("   \n")).toBe("Empty entry");
  });

  it("splits a body into text and photo runs", () => {
    expect(split_media(`one ${media_token(A)} two`)).toEqual([{ text: "one " }, { media: A }, { text: " two" }]);
  });

  it("indexes an entry without its body, keeping mood fields", () => {
    const entry = EntrySchema.parse({ id: A, date: "2026-10-22", created: 1, updated: 2, body: "hello #x", mood: 4, activities: ["walk"], energy: 6, sleep: 7.5 });
    const meta = index_entry(entry);
    expect(meta).toEqual({ id: A, date: "2026-10-22", created: 1, updated: 2, title: "hello #x", tags: ["x"], words: 2, media: [], mood: 4, activities: ["walk"], energy: 6, sleep: 7.5 });
    expect("body" in meta).toBe(false);
  });

  it("sorts newest day first, then newest written", () => {
    const list = [
      { date: "2026-10-01", created: 5 },
      { date: "2026-10-03", created: 1 },
      { date: "2026-10-03", created: 9 },
    ].sort(newest_first);
    expect(list.map((entry) => `${entry.date}/${entry.created}`)).toEqual(["2026-10-03/9", "2026-10-03/1", "2026-10-01/5"]);
  });

  it("counts days written in a month, not entries", () => {
    const entries = [{ date: "2026-10-01" }, { date: "2026-10-01" }, { date: "2026-10-20" }, { date: "2026-09-30" }];
    expect(days_written(entries, "2026-10")).toBe(2);
  });

  it("matches every term, #tags against tags only", () => {
    const entry = { body: "Walked the dog by the river", date: "2026-10-22" };
    expect(matches(entry, ["walks"], "dog river")).toBe(true);
    expect(matches(entry, ["walks"], "dog cat")).toBe(false);
    expect(matches(entry, ["walks"], "#walks")).toBe(true);
    expect(matches(entry, ["walks"], "#dog")).toBe(false);
    expect(matches(entry, [], "2026-10")).toBe(true);
  });

  it("rotates prompts by day and steps on skip", () => {
    expect(prompt_for("2026-10-22")).not.toBe(prompt_for("2026-10-23"));
    expect(prompt_for("2026-10-22", 1)).toBe(prompt_for("2026-10-23"));
    expect(PROMPTS).toContain(prompt_for("1970-01-01", -1));
  });

  it("cleans journal names", () => {
    expect(clean_journal_name("  Dreams/2026 ")).toBe("Dreams2026");
    expect(clean_journal_name(".hidden")).toBeNull();
    expect(clean_journal_name("   ")).toBeNull();
  });
});

describe("passphrases", () => {
  const list = ["acorn", "bubble", "cactus", "dagger", "eclipse", "fable", "gecko", "harbor"];
  const words = new Set(Array.from({ length: 7776 }, (_, i) => (i < list.length ? list[i] : `w${i}`)));

  it("generates five words from the list", () => {
    const phrase = generate_phrase(list);
    expect(phrase.split(" ")).toHaveLength(5);
    expect(phrase.split(" ").every((word) => list.includes(word))).toBe(true);
  });

  it("picks indexes uniformly in range", () => {
    for (let i = 0; i < 500; i++) {
      const index = secure_index(7776);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(7776);
    }
  });

  it("rates a generated phrase strong and short ones weak", () => {
    expect(phrase_bits("acorn bubble cactus dagger eclipse", words)).toBe(65);
    expect(strength_of(65)).toBe(Strength.STRONG);
    expect(strength_of(phrase_bits("password1", words))).toBe(Strength.WEAK);
    expect(phrase_bits("acorn acorn acorn", words)).toBe(13);
    expect(phrase_bits("aaaaaaaaaaaaaaaaaaaa", words)).toBeLessThan(MIN_BITS);
    expect(strength_of(phrase_bits("Tr0ub4dor&3 horse Staple", words))).not.toBe(Strength.WEAK);
  });
});
