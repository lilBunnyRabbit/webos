import { describe, expect, it } from "vitest";
import {
  avc_codec,
  avc_level,
  ClipFormat,
  OutputSize,
  output_extension,
  Quality,
  scaled_size,
  size_choices,
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
    expect(output_name("trip.mp4", Output.CLIP)).toBe("trip-clip.webm");
    expect(output_name("trip.mp4", Output.GIF)).toBe("trip.gif");
    expect(output_name("trip.mp4", Output.AUDIO)).toBe("trip-audio.webm");
    expect(output_name("trip.webm", Output.CLIP, ClipFormat.MP4)).toBe("trip-clip.mp4");
    expect(output_extension(Output.CLIP, ClipFormat.MP4)).toBe(".mp4");
    expect(output_extension(Output.AUDIO, ClipFormat.MP4)).toBe(".webm");
  });

  it("scales by the short side, keeps the aspect, evens the sides and never upscales", () => {
    expect(scaled_size({ width: 1920, height: 1080 }, OutputSize.P720)).toEqual({ width: 1280, height: 720 });
    expect(scaled_size({ width: 1080, height: 1920 }, OutputSize.P480)).toEqual({ width: 480, height: 854 });
    expect(scaled_size({ width: 2560, height: 1080 }, OutputSize.P480)).toEqual({ width: 1138, height: 480 });
    expect(scaled_size({ width: 1281, height: 721 }, OutputSize.P1080)).toEqual({ width: 1280, height: 720 });
    expect(scaled_size({ width: 1281, height: 721 }, OutputSize.ORIGINAL)).toEqual({ width: 1280, height: 720 });
    expect(size_choices({ width: 1280, height: 720 })).toEqual([OutputSize.ORIGINAL, OutputSize.P480]);
    expect(size_choices({ width: 3840, height: 2160 })).toEqual([
      OutputSize.ORIGINAL,
      OutputSize.P1080,
      OutputSize.P720,
      OutputSize.P480,
    ]);
  });

  it("picks the smallest H.264 level for the size", () => {
    expect(avc_level({ width: 640, height: 480 }, 30)).toBe(0x1e);
    expect(avc_level({ width: 1280, height: 720 }, 30)).toBe(0x1f);
    expect(avc_level({ width: 1920, height: 1080 }, 30)).toBe(0x28);
    expect(avc_level({ width: 3840, height: 2160 }, 30)).toBe(0x33);
    expect(avc_level({ width: 20_000, height: 20_000 }, 30)).toBeNull();
    expect(avc_codec("6400", 0x28)).toBe("avc1.640028");
  });

  it("words the time left", () => {
    expect([0.2, 12.4, 150, Infinity].map(format_eta)).toEqual(["1 s left", "12 s left", "3 min left", ""]);
  });
});
