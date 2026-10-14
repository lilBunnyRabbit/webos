import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import type { Pad } from "./board";
import { SoundPlayer } from "./player.svelte";
import { delete_sound, import_sound, read_sound, SOUNDS_DIR } from "./store";

function wav(seconds = 0.2, rate = 8000): File {
  const samples = Math.round(seconds * rate);
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i / 4) * 8000, true);
  return new File([view.buffer], "beep.wav", { type: "audio/wav" });
}

const pad = (patch: Partial<Pad> = {}): Pad => ({ id: "p", label: "Beep", sound: "beep.wav", color: "primary", volume: 1, key: null, loop: false, ...patch });

let files: FilesService;
let player: SoundPlayer | null = null;

beforeEach(async () => {
  await clear_opfs();
  files = new FilesService();
  await files.init();
});

afterEach(() => {
  player?.close();
  player = null;
});

describe("store", () => {
  test("copies into the sounds folder under a free name and deletes", async () => {
    const first = await import_sound(files, wav());
    const second = await import_sound(files, wav());
    expect(first).toBe("beep.wav");
    expect(second).toBe("beep (1).wav");
    expect((await read_sound(files, second))?.size).toBeGreaterThan(44);

    await delete_sound(files, first);
    expect(await files.get_file(`${SOUNDS_DIR}/${first}`)).toBeNull();
    await delete_sound(files, "missing.wav");
  });
});

describe("SoundPlayer", () => {
  test("overlaps voices, toggles loops and stops all", async () => {
    const sound = await import_sound(files, wav(2));
    player = new SoundPlayer((name) => read_sound(files, name));

    await player.trigger(pad({ sound }));
    await player.trigger(pad({ sound }));
    expect(player.playing.get("p")?.count).toBe(2);

    await player.trigger(pad({ id: "l", sound, loop: true }));
    expect(player.playing.get("l")?.loop).toBe(true);
    await player.trigger(pad({ id: "l", sound, loop: true }));
    expect(player.playing.has("l")).toBe(false);

    player.stop_all();
    expect(player.playing.size).toBe(0);
  });

  test("a missing sound rejects and isn't cached", async () => {
    player = new SoundPlayer((name) => read_sound(files, name));
    await expect(player.trigger(pad({ sound: "gone.wav" }))).rejects.toThrow("missing");
    expect(player.playing.size).toBe(0);
  });
});
