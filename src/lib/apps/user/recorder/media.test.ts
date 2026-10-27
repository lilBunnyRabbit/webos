import { describe, expect, it } from "vitest";
import {
  CaptureError,
  classify_error,
  clock_elapsed,
  clock_pause,
  clock_resume,
  clock_start,
  error_copy,
  extension_for,
  is_media_file,
  kind_of_file,
  level_of,
  pick_mime,
  push_level,
  Source,
  take_achievement,
  take_name,
  TakeKind,
} from "./media";

describe("pick_mime", () => {
  it("prefers webm with opus", () => {
    expect(pick_mime("audio", () => true)).toBe("audio/webm;codecs=opus");
    expect(pick_mime("video", () => true)).toBe("video/webm;codecs=vp9,opus");
  });

  it("falls back to mp4 when webm is missing", () => {
    const safari = (type: string) => type.startsWith("audio/mp4") || type.startsWith("video/mp4");
    expect(pick_mime("audio", safari)).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(pick_mime("video", (type) => type === "video/mp4")).toBe("video/mp4");
  });

  it("lets the browser choose when nothing matches", () => {
    expect(pick_mime("audio", () => false)).toBe("");
  });
});

describe("extension_for", () => {
  it("types audio-only containers as audio", () => {
    expect(extension_for("audio/webm;codecs=opus", TakeKind.AUDIO)).toBe(".weba");
    expect(extension_for("audio/mp4", TakeKind.AUDIO)).toBe(".m4a");
    expect(extension_for("audio/ogg;codecs=opus", TakeKind.AUDIO)).toBe(".ogg");
  });

  it("maps video and photos", () => {
    expect(extension_for("video/webm;codecs=vp9,opus", TakeKind.VIDEO)).toBe(".webm");
    expect(extension_for("video/mp4", TakeKind.VIDEO)).toBe(".mp4");
    expect(extension_for("image/png", TakeKind.PHOTO)).toBe(".png");
    expect(extension_for("image/jpeg", TakeKind.PHOTO)).toBe(".jpg");
  });

  it("defaults an unknown or empty type to webm", () => {
    expect(extension_for("", TakeKind.VIDEO)).toBe(".webm");
    expect(extension_for("", TakeKind.AUDIO)).toBe(".weba");
  });
});

describe("take_name", () => {
  const date = new Date(2026, 9, 4, 9, 5, 7);

  it("names by source and local time", () => {
    expect(take_name(Source.MIC, TakeKind.AUDIO, "audio/webm", date)).toBe("Voice 2026-10-04 09-05-07.weba");
    expect(take_name(Source.SCREEN, TakeKind.VIDEO, "video/mp4", date)).toBe("Screen 2026-10-04 09-05-07.mp4");
    expect(take_name(Source.CAMERA, TakeKind.VIDEO, "video/webm", date)).toBe("Video 2026-10-04 09-05-07.webm");
    expect(take_name(Source.CAMERA, TakeKind.PHOTO, "image/jpeg", date)).toBe("Photo 2026-10-04 09-05-07.jpg");
  });

  it("is round-tripped by the file helpers", () => {
    const name = take_name(Source.MIC, TakeKind.AUDIO, "audio/webm", date);
    expect(is_media_file(name)).toBe(true);
    expect(kind_of_file(name)).toBe(TakeKind.AUDIO);
  });
});

describe("file helpers", () => {
  it("recognizes recordings and photos", () => {
    expect(is_media_file("a.WEBM")).toBe(true);
    expect(is_media_file("notes.txt")).toBe(false);
    expect(kind_of_file("a.jpeg")).toBe(TakeKind.PHOTO);
    expect(kind_of_file("a.m4a")).toBe(TakeKind.AUDIO);
    expect(kind_of_file("a.mp4")).toBe(TakeKind.VIDEO);
  });
});

describe("clock", () => {
  it("counts running time only", () => {
    let clock = clock_start(1000);
    expect(clock_elapsed(clock, 4000)).toBe(3000);
    clock = clock_pause(clock, 4000);
    expect(clock_elapsed(clock, 60_000)).toBe(3000);
    clock = clock_resume(clock, 10_000);
    expect(clock_elapsed(clock, 12_500)).toBe(5500);
  });

  it("ignores a double pause or resume", () => {
    const paused = clock_pause(clock_pause(clock_start(0), 100), 900);
    expect(clock_elapsed(paused, 2000)).toBe(100);
    const resumed = clock_resume(clock_resume(paused, 200), 800);
    expect(clock_elapsed(resumed, 300)).toBe(200);
  });
});

describe("levels", () => {
  it("is zero for silence and clamps loud signals", () => {
    expect(level_of(new Uint8Array(64).fill(128))).toBe(0);
    expect(level_of(new Uint8Array(64).fill(255))).toBe(1);
    expect(level_of(new Uint8Array(0))).toBe(0);
  });

  it("keeps a fixed-length history", () => {
    expect(push_level([0.1, 0.2], 0.3, 3)).toEqual([0.1, 0.2, 0.3]);
    expect(push_level([0.1, 0.2, 0.3], 0.4, 3)).toEqual([0.2, 0.3, 0.4]);
  });
});

describe("errors", () => {
  const error = (name: string) => Object.assign(new Error(name), { name });

  it("classifies capture rejections", () => {
    expect(classify_error(error("NotAllowedError"))).toBe(CaptureError.DENIED);
    expect(classify_error(error("NotFoundError"))).toBe(CaptureError.MISSING);
    expect(classify_error(error("NotReadableError"))).toBe(CaptureError.BUSY);
    expect(classify_error(error("TypeError"))).toBe(CaptureError.UNSUPPORTED);
    expect(classify_error("boom")).toBe(CaptureError.OTHER);
  });

  it("words a cancelled screen pick differently from a blocked device", () => {
    expect(error_copy(CaptureError.DENIED, Source.SCREEN).title).toBe("Screen sharing was cancelled");
    expect(error_copy(CaptureError.DENIED, Source.MIC).title).toBe("Microphone access is blocked");
    expect(error_copy(CaptureError.MISSING, Source.CAMERA).title).toBe("No camera found");
  });
});

describe("take_achievement", () => {
  it("names one achievement per kind of recording", () => {
    expect(take_achievement(TakeKind.AUDIO, Source.MIC)).toBe("voice");
    expect(take_achievement(TakeKind.VIDEO, Source.SCREEN)).toBe("screen");
    expect(take_achievement(TakeKind.AUDIO, Source.SCREEN)).toBe("screen");
    expect(take_achievement(TakeKind.VIDEO, Source.CAMERA)).toBe("camera");
    expect(take_achievement(TakeKind.PHOTO, Source.CAMERA)).toBe("photo");
  });
});
