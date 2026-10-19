import { describe, expect, test } from "vitest";
import { create_card, empty_draft, filter_cards, find_card, initial, parse_cards_file, record_use, sort_cards, type Card } from "./data";
import { CardFormat } from "./formats";

function card(id: string, patch: Partial<Card> = {}): Card {
  return { ...create_card({ ...empty_draft("123"), name: id }, id, 0), ...patch };
}

describe("parse_cards_file", () => {
  test("reads a valid file", () => {
    const file = { version: 1, cards: [card("Spar", { uses: 3, used_at: 10, pinned: true })] };
    expect(parse_cards_file(JSON.stringify(file))).toEqual(file);
  });

  test("rejects broken JSON, an unknown version, a bad format or colour, and missing fields", () => {
    const good = card("Spar");
    expect(parse_cards_file("{")).toBeNull();
    expect(parse_cards_file(JSON.stringify({ version: 2, cards: [] }))).toBeNull();
    expect(parse_cards_file(JSON.stringify({ version: 1, cards: [{ ...good, format: "ean_14" }] }))).toBeNull();
    expect(parse_cards_file(JSON.stringify({ version: 1, cards: [{ ...good, color: "red" }] }))).toBeNull();
    const { photos: _photos, ...missing } = good;
    expect(parse_cards_file(JSON.stringify({ version: 1, cards: [missing] }))).toBeNull();
    expect(parse_cards_file(JSON.stringify({ version: 1, cards: [{ ...good, uses: -1 }] }))).toBeNull();
  });
});

describe("drafts and cards", () => {
  test("an empty draft guesses the format from the code", () => {
    expect(empty_draft("4006381333931").format).toBe(CardFormat.EAN_13);
    expect(empty_draft("ABC").format).toBe(CardFormat.CODE_128);
  });

  test("a new card is trimmed, unused and unpinned", () => {
    const created = create_card({ name: " Spar ", code: " 123 ", format: CardFormat.CODE_128, color: "info", notes: " n " }, "a", 5);
    expect(created).toEqual({
      id: "a",
      name: "Spar",
      code: "123",
      format: CardFormat.CODE_128,
      color: "info",
      notes: "n",
      pinned: false,
      uses: 0,
      used_at: null,
      created_at: 5,
      photos: { front: false, back: false },
    });
  });

  test("a use counts and stamps the time", () => {
    expect(record_use(card("a", { uses: 2 }), 99)).toMatchObject({ uses: 3, used_at: 99 });
  });

  test("initial is the first letter or digit", () => {
    expect(initial("spar")).toBe("S");
    expect(initial("  #1 Mercator")).toBe("1");
    expect(initial("čokolada")).toBe("Č");
    expect(initial("")).toBe("#");
  });
});

describe("sort_cards", () => {
  test("pins first, then most used, then most recent, then by name", () => {
    const cards = [
      card("b", { uses: 5 }),
      card("a", { uses: 5 }),
      card("recent", { uses: 5, used_at: 50 }),
      card("pinned", { pinned: true }),
      card("most", { uses: 9 }),
    ];
    expect(sort_cards(cards).map((entry) => entry.id)).toEqual(["pinned", "most", "recent", "a", "b"]);
  });

  test("leaves the input alone", () => {
    const cards = [card("b"), card("a")];
    sort_cards(cards);
    expect(cards.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("filter_cards", () => {
  const cards = [card("Spar", { code: "4006381333931" }), card("Mercator", { notes: "Family card" }), card("Hofer")];

  test("matches name, number and notes, ignoring case", () => {
    expect(filter_cards(cards, "spar").map((entry) => entry.id)).toEqual(["Spar"]);
    expect(filter_cards(cards, "40063").map((entry) => entry.id)).toEqual(["Spar"]);
    expect(filter_cards(cards, "FAMILY").map((entry) => entry.id)).toEqual(["Mercator"]);
    expect(filter_cards(cards, "  ")).toHaveLength(3);
  });
});

describe("find_card", () => {
  const cards = [card("Spar"), card("Spar Plus"), card("Mercator"), card("Hofer", { id: "id-hofer" })];

  test("by id, then exact name ignoring case, then a unique prefix", () => {
    expect(find_card(cards, "id-hofer")?.name).toBe("Hofer");
    expect(find_card(cards, "SPAR")?.name).toBe("Spar");
    expect(find_card(cards, "merc")?.name).toBe("Mercator");
  });

  test("nothing for an ambiguous prefix, an unknown name or blank", () => {
    expect(find_card(cards, "sp")).toBeNull();
    expect(find_card(cards, "lidl")).toBeNull();
    expect(find_card(cards, " ")).toBeNull();
  });
});
