import { expect, test } from "vitest";
import { wav_blob } from "$kit/utils/audio";
import { make_video } from "$kit/utils/video/fixtures";
import { SoundEditor } from "./editor.svelte";

function tone(seconds: number, rate = 8000): File {
  const channel = Float32Array.from({ length: seconds * rate }, (_, i) => Math.sin(i / 4) * 0.25);
  return new File([wav_blob({ sample_rate: rate, channels: [channel] })], "tone.wav", { type: "audio/wav" });
}

test("trims, deletes a middle span and renders a shorter WAV", async () => {
  const editor = new SoundEditor();
  try {
    await editor.load(tone(1));
    const full = editor.duration;
    expect(full).toBeCloseTo(1, 1);
    expect(editor.changed).toBe(false);
    expect(editor.render()).toBeNull();

    editor.start = 0.1;
    editor.selection = { start: 0.4, end: 0.6 };
    editor.delete_selection();
    expect(editor.selection).toBeNull();
    expect(editor.duration).toBeCloseTo(full - 0.2 - 0.01, 2);
    expect(editor.end).toBeCloseTo(editor.duration, 5);

    const blob = editor.render()!;
    const decoded = await new OfflineAudioContext(1, 1, 8000).decodeAudioData(await blob.arrayBuffer());
    expect(decoded.duration).toBeCloseTo(editor.end - editor.start, 1);

    editor.reset();
    expect(editor.duration).toBeCloseTo(full, 5);
    expect(editor.changed).toBe(false);
  } finally {
    editor.dispose();
  }
});

test("cuts the part of a video's sound and maps the edit back to the video", async () => {
  const video = new File([await make_video(2, { audio: true })], "clip.webm", { type: "video/webm" });
  const editor = new SoundEditor();
  try {
    await editor.load(video);
    expect(editor.duration).toBeCloseTo(2, 1);
    expect(editor.render(true)).not.toBeNull();

    editor.selection = { start: 0.2, end: 0.6 };
    editor.delete_selection();
    expect(editor.source_time(0.1)).toBeCloseTo(0.1, 5);
    expect(editor.source_time(0.5)).toBeCloseTo(0.9, 1);

    editor.start = 0.5;
    editor.end = 1.3;
    const decoded = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(await editor.render(true)!.arrayBuffer());
    expect(decoded.duration).toBeCloseTo(0.8, 2);
  } finally {
    editor.dispose();
  }
});
