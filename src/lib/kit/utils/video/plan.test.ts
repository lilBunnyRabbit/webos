import { describe, expect, it } from "vitest";
import {
  Quality,
  clamp_range,
  estimate_gif_bytes,
  even_size,
  format_eta,
  format_time,
  gif_frame_count,
  gif_playback_rate,
  gif_size,
  Output,
  output_name,
  parse_time,
  video_bitrate,
} from "./plan";

describe("plan", () => {
  it("parses seconds, m:ss and h:mm:ss", () => {
    expect(["90", "1:30", "1:30.5", "1:01:30", " 2 "].map(parse_time)).toEqual([90, 90, 90.5, 3690, 2]);
    expect(["", "soon", "-1", "1:2:3:4", "1:"].map(parse_time)).toEqual([null, null, null, null, null]);
  });

  it("formats times with and without fractions", () => {
    expect(format_time(65.256)).toBe("1:05.26");
    expect(format_time(5, 0)).toBe("0:05");
    expect(format_time(3725.5, 1)).toBe("1:02:05.5");
    expect(format_time(-3)).toBe("0:00.00");
  });

  it("keeps the range inside the video", () => {
    expect(clamp_range({ from: -1, to: 20 }, 10)).toEqual({ from: 0, to: 10 });
    expect(clamp_range({ from: 8, to: 3 }, 10)).toEqual({ from: 8, to: 8 });
  });

  it("sizes GIFs to the width asked without upscaling", () => {
    expect(gif_size({ width: 1920, height: 1080 }, 480)).toEqual({ width: 480, height: 270 });
    expect(gif_size({ width: 320, height: 240 }, 640)).toEqual({ width: 320, height: 240 });
  });

  it("counts GIF frames and estimates their size", () => {
    expect(gif_frame_count({ from: 1, to: 2 }, 10)).toBe(10);
    expect(gif_frame_count({ from: 0, to: 0.01 }, 10)).toBe(1);
    expect(estimate_gif_bytes({ width: 100, height: 100 }, 10, true)).toBeGreaterThan(
      estimate_gif_bytes({ width: 100, height: 100 }, 10, false)
    );
  });

  it("plays faster for low GIF frame rates, up to 4×", () => {
    expect([30, 15, 12, 10, 5].map(gif_playback_rate)).toEqual([1, 2, 2, 3, 4]);
  });

  it("evens out sides and scales bitrate with quality", () => {
    expect(even_size({ width: 641, height: 361 })).toEqual({ width: 640, height: 360 });
    const size = { width: 1280, height: 720 };
    expect(video_bitrate(size, Quality.HIGH)).toBeGreaterThan(video_bitrate(size, Quality.MEDIUM));
    expect(video_bitrate({ width: 16, height: 16 }, Quality.LOW)).toBe(250_000);
  });

  it("names outputs after the source", () => {
    expect(output_name("trip.mp4", Output.WEBM)).toBe("trip-clip.webm");
    expect(output_name("trip.mp4", Output.GIF)).toBe("trip.gif");
    expect(output_name("trip.mp4", Output.AUDIO)).toBe("trip-audio.webm");
  });

  it("words the time left", () => {
    expect([0.2, 12.4, 150, Infinity].map(format_eta)).toEqual(["1 s left", "12 s left", "3 min left", ""]);
  });
});
