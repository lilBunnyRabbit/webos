import { describe, expect, test } from "vitest";
import { adopt_cards, archive_photo_name, build_archive, read_archive } from "./archive";
import { CARDS_VERSION, create_card, PhotoSide, type Card, type CardDraft } from "./data";
import { CardFormat } from "./formats";
import { compact_cards, decode_share, encode_share, fits_qr, merge_cards, payload_of, QR_LIMIT, read_compact, review_cards, SHARE_PREFIX } from "./share";

const DRAFTS: CardDraft[] = [
  { name: "Spar", code: "4006381333931", format: CardFormat.EAN_13, color: "success", notes: "" },
  { name: "Knjižnica", code: "LIB-0042", format: CardFormat.CODE_39, color: "info", notes: "PIN 1234\nfamily" },
  { name: "Gym", code: "https://gym.example/m/77", format: CardFormat.QR, color: "accent", notes: "" },
];

let next = 0;
const new_id = () => `id-${++next}`;

function card(draft: CardDraft, patch: Partial<Card> = {}): Card {
  return { ...create_card(draft, new_id(), 1), ...patch };
}

describe("share payload", () => {
  test("round trips name, number, format, colour and notes", async () => {
    const payload = await encode_share(DRAFTS.map((draft) => card(draft, { uses: 9, pinned: true })));
    expect(payload.startsWith(SHARE_PREFIX)).toBe(true);
    expect(payload).toMatch(/^WEBOS-CARDS:1:[A-Za-z0-9_-]+$/);
    expect(await decode_share(payload)).toEqual(DRAFTS);
  });

  test("rejects other text, a bad body and a bad shape", async () => {
    expect(await decode_share("hello")).toBeNull();
    expect(await decode_share(`${SHARE_PREFIX}!!!`)).toBeNull();
    expect(await decode_share(`${SHARE_PREFIX}AAAA`)).toBeNull();
  });

  test("reads the payload out of a share link", async () => {
    const payload = await encode_share([card(DRAFTS[0])]);
    const link = `https://example.com/webos/#/app/cards?import=${encodeURIComponent(payload)}`;
    expect(payload_of(link)).toBe(payload);
    expect(payload_of(` ${payload} `)).toBe(payload);
    expect(payload_of("plain text")).toBe("plain text");
  });

  test("a long list outgrows one QR code", async () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      card({ name: `Store ${i} ${Math.random().toString(36)}`, code: Math.random().toString(36).slice(2), format: CardFormat.CODE_128, color: "primary", notes: "" })
    );
    const payload = await encode_share(many);
    expect(payload.length).toBeGreaterThan(QR_LIMIT);
    expect(fits_qr(payload)).toBe(false);
    expect(fits_qr(await encode_share([many[0]]))).toBe(true);
  });
});

describe("merge_cards", () => {
  test("skips cards with the same number and format, including repeats in the import", () => {
    const existing = [card(DRAFTS[0])];
    const incoming = [
      card(DRAFTS[0]),
      card({ ...DRAFTS[0], format: CardFormat.CODE_128 }),
      card(DRAFTS[1]),
      card({ ...DRAFTS[1], name: "Other name" }),
    ];
    const result = merge_cards(existing, incoming);
    expect(result.skipped).toBe(2);
    expect(result.added.map((entry) => [entry.code, entry.format])).toEqual([
      ["4006381333931", CardFormat.CODE_128],
      ["LIB-0042", CardFormat.CODE_39],
    ]);
    expect(result.cards).toHaveLength(3);
  });
});

describe("archive", () => {
  test("round trips the list and its photos, under fresh ids", async () => {
    const with_photo = card(DRAFTS[0], { photos: { front: true, back: false }, uses: 4 });
    const plain = card(DRAFTS[1]);
    const photo = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
    const zip = await build_archive(
      { version: CARDS_VERSION, cards: [with_photo, plain] },
      new Map([[archive_photo_name(with_photo.id, PhotoSide.FRONT), photo]])
    );

    const read = await read_archive(zip);
    expect(read.cards).toEqual([with_photo, plain]);
    expect([...read.photos.keys()]).toEqual([archive_photo_name(with_photo.id, PhotoSide.FRONT)]);

    const adopted = adopt_cards(read.cards, read.photos, () => "fresh");
    expect(adopted[0].card).toMatchObject({ id: "fresh", uses: 4, photos: { front: true, back: false } });
    expect(new Uint8Array(await adopted[0].photos.front!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(adopted[1].photos).toEqual({});
  });

  test("a photo flag without its file is dropped", () => {
    const flagged = card(DRAFTS[0], { photos: { front: true, back: true } });
    expect(adopt_cards([flagged], new Map(), new_id)[0].card.photos).toEqual({ front: false, back: false });
  });

  test("a zip without cards.json isn't a Cards export", async () => {
    const { write_zip } = await import("$lib/core/utils/zip/write");
    const zip = await write_zip([{ name: "other.txt", data: new Blob(["x"]) }], { method: 0 });
    await expect(read_archive(zip)).rejects.toThrow("isn't a Cards export");
  });
});

describe("review_cards", () => {
  test("new cards, and known ones whose name, colour or notes differ; never a removal", () => {
    const mine = [
      create_card({ name: "Spar", code: "111", format: CardFormat.EAN_13, color: "primary", notes: "" }, "a", 1),
      create_card({ name: "DM", code: "222", format: CardFormat.EAN_13, color: "primary", notes: "" }, "b", 1),
      create_card({ name: "Mine only", code: "333", format: CardFormat.EAN_13, color: "primary", notes: "" }, "c", 1),
    ];
    const drafts = read_compact(
      compact_cards([
        { name: "Spar", code: "111", format: CardFormat.EAN_13, color: "info", notes: "" },
        { name: "DM", code: "222", format: CardFormat.EAN_13, color: "primary", notes: "" },
        { name: "Mercator", code: "444", format: CardFormat.EAN_13, color: "primary", notes: "Pika" },
      ])
    );
    const review = review_cards(mine, drafts);
    expect(review.added.map((draft) => draft.name)).toEqual(["Mercator"]);
    expect(review.changed.map((change) => [change.card.id, change.draft.color])).toEqual([["a", "info"]]);
  });

  test("a payload that isn't a card list is refused", () => {
    expect(() => read_compact({ cards: [] })).toThrow();
  });
});
