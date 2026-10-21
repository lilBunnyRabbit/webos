import { describe, expect, it } from "vitest";
import { capture, probe_tracks, probe_video, record_audio } from "./capture";
import { decode_audio } from "./encode";
import { FIXTURE_FPS, make_video } from "./fixtures";

describe("play and capture", () => {
  it("muxes a webm Chrome plays, with its duration, size and sound", async () => {
    const blob = await make_video(2, { audio: true });
    const info = await probe_video(blob);
    expect(info).toMatchObject({ width: 160, height: 120 });
    expect(info.duration).toBeCloseTo(2, 1);
    const audio = await decode_audio(blob);
    expect(audio!.duration).toBeCloseTo(2, 1);
  });

  it("has no sound to decode in a silent video", async () => {
    expect(await decode_audio(await make_video(0.5))).toBeNull();
  });

  it("captures every frame between in and out, in order, starting on the in frame", async () => {
    const levels: number[] = [];
    const times: number[] = [];
    const context = new OffscreenCanvas(4, 4).getContext("2d", { willReadFrequently: true })!;
    const result = await capture({
      file: await make_video(2),
      from: 0.5,
      to: 1.5,
      signal: new AbortController().signal,
      on_frame(video, time) {
        times.push(time);
        context.drawImage(video, 0, 0, 4, 4);
        levels.push(context.getImageData(1, 1, 1, 1).data[0]);
      },
    });
    expect(result).toEqual({ frames: FIXTURE_FPS, end: 1.5 });
    expect(times[0]).toBe(0.5);
    expect(times.every((time, i) => i === 0 || time > times[i - 1])).toBe(true);
    expect(levels.slice(0, 3)).toEqual([120, 128, 136]);
  });

  it("holds playback while on_frame works and still sees every frame", async () => {
    let frames = 0;
    const result = await capture({
      file: await make_video(1),
      from: 0,
      to: 0.5,
      signal: new AbortController().signal,
      on_frame: () => {
        frames++;
        return new Promise((resolve) => setTimeout(resolve, 40));
      },
    });
    expect(result.frames).toBe(15);
    expect(frames).toBe(15);
  });

  it("stops at the video's end when out is past it", async () => {
    const result = await capture({
      file: await make_video(1),
      from: 0.5,
      to: 5,
      signal: new AbortController().signal,
      on_frame: () => {},
    });
    expect(result.end).toBe(1);
    expect(result.frames).toBe(15);
  });

  it("rejects with the abort reason on cancel", async () => {
    const controller = new AbortController();
    const run = capture({ file: await make_video(2), from: 0, to: 2, signal: controller.signal, on_frame: () => {} });
    setTimeout(() => controller.abort(new Error("stop")), 200);
    await expect(run).rejects.toThrow("stop");
  });
});

describe("sound from a video", () => {
  it("tells a video with sound from a silent one", async () => {
    expect(await probe_tracks(await make_video(0.5, { audio: true }))).toMatchObject({ picture: true, audio: true });
    const silent = await probe_tracks(await make_video(0.5));
    expect(silent).toMatchObject({ picture: true, audio: false });
    expect(silent.duration).toBeCloseTo(0.5, 1);
  });

  it("records the whole sound by playing it", async () => {
    const seen: number[] = [];
    const blob = await record_audio({
      file: await make_video(1, { audio: true }),
      signal: new AbortController().signal,
      on_progress: (time) => seen.push(time),
    });
    const audio = await decode_audio(blob);
    expect(audio!.duration).toBeGreaterThan(0.8);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("refuses a silent video", async () => {
    await expect(record_audio({ file: await make_video(0.5), signal: new AbortController().signal })).rejects.toThrow("no sound");
  });
});
