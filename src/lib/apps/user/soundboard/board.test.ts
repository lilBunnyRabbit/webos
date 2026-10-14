import { describe, expect, test } from "vitest";
import {
  BoardFileSchema,
  create_pad,
  EMPTY_FILE,
  free_keys,
  is_audio,
  label_from_file,
  move_pad,
  next_color,
  next_key,
  PAD_COLORS,
  sound_in_use,
  sounds_freed_by_board,
  unique_board_name,
  type BoardFile,
  type Pad,
} from "./board";

const pad = (id: string, key: string | null = null, sound = `${id}.wav`): Pad => ({
  id,
  label: id,
  sound,
  color: "primary",
  volume: 1,
  key,
  loop: false,
});

describe("is_audio", () => {
  test("trusts an audio MIME type", () => expect(is_audio("x.bin", "audio/mpeg")).toBe(true));
  test("falls back to the extension without a type", () => {
    expect(is_audio("horn.MP3")).toBe(true);
    expect(is_audio("notes.txt")).toBe(false);
    expect(is_audio("wav")).toBe(false);
  });
  test("rejects other known types", () => expect(is_audio("cover.mp3", "image/png")).toBe(false));
});

describe("label_from_file", () => {
  test("strips the extension and separators", () => expect(label_from_file("air-horn_02.mp3")).toBe("air horn 02"));
  test("never empty", () => expect(label_from_file(".wav")).toBe(".wav"));
  test("caps the length", () => expect(label_from_file(`${"a".repeat(60)}.wav`)).toHaveLength(40));
});

describe("keys", () => {
  test("next_key takes the first free digit", () => {
    expect(next_key([])).toBe("1");
    expect(next_key([pad("a", "1"), pad("b", "3")])).toBe("2");
  });
  test("next_key never picks a letter", () => {
    const pads = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((key) => pad(key, key));
    expect(next_key(pads)).toBeNull();
  });
  test("free_keys keeps the pad's own key", () => {
    const pads = [pad("a", "1"), pad("b", "2")];
    const keys = free_keys(pads, "a");
    expect(keys).toContain("1");
    expect(keys).not.toContain("2");
    expect(keys).toContain("z");
  });
});

describe("create_pad", () => {
  test("labels from the file and cycles colours", () => {
    const first = create_pad([], "horn.wav", "horn.wav", "p1");
    expect(first).toMatchObject({ label: "horn", sound: "horn.wav", key: "1", loop: false, volume: 1, color: PAD_COLORS[0] });
    expect(next_color(Array.from({ length: PAD_COLORS.length }, (_, i) => pad(String(i))))).toBe(PAD_COLORS[0]);
  });
});

describe("move_pad", () => {
  const pads = [pad("a"), pad("b"), pad("c")];
  test("moves forward and back", () => {
    expect(move_pad(pads, "a", 2).map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(move_pad(pads, "c", 0).map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
  test("clamps and ignores unknown ids", () => {
    expect(move_pad(pads, "b", 99).map((p) => p.id)).toEqual(["a", "c", "b"]);
    expect(move_pad(pads, "x", 0).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});

describe("sounds", () => {
  const file: BoardFile = {
    version: 1,
    boards: [
      { id: "one", name: "One", pads: [pad("a", null, "shared.wav"), pad("b", null, "only-one.wav")] },
      { id: "two", name: "Two", pads: [pad("c", null, "shared.wav")] },
    ],
  };
  test("sound_in_use ignores the pad being deleted", () => {
    expect(sound_in_use(file, "only-one.wav", "b")).toBe(false);
    expect(sound_in_use(file, "shared.wav", "a")).toBe(true);
  });
  test("sounds_freed_by_board keeps sounds other boards use", () => {
    expect(sounds_freed_by_board(file, "one")).toEqual(["only-one.wav"]);
    expect(sounds_freed_by_board(file, "missing")).toEqual([]);
  });
});

describe("schema", () => {
  test("accepts the empty file", () => expect(BoardFileSchema.safeParse(EMPTY_FILE).success).toBe(true));
  test("rejects unknown keys and colours", () => {
    const bad = (patch: Partial<Pad>) => BoardFileSchema.safeParse({ version: 1, boards: [{ id: "b", name: "B", pads: [{ ...pad("a"), ...patch }] }] }).success;
    expect(bad({ key: "f1" })).toBe(false);
    expect(bad({ color: "error" as Pad["color"] })).toBe(false);
    expect(bad({ key: "q" })).toBe(true);
  });
  test("needs at least one board", () => expect(BoardFileSchema.safeParse({ version: 1, boards: [] }).success).toBe(false));
});

test("unique_board_name", () => {
  const boards = [{ id: "a", name: "My board", pads: [] }, { id: "b", name: "My board 2", pads: [] }];
  expect(unique_board_name(boards, "My board")).toBe("My board 3");
  expect(unique_board_name(boards, "Party")).toBe("Party");
});
