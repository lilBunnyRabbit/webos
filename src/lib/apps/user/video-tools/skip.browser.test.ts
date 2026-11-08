import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { TasksService } from "$lib/core/api/services/tasks/service.svelte";
import { probe_video } from "$kit/utils/video/capture";
import { WebmEncoder } from "$kit/utils/video/encode";
import { FIXTURE_FPS } from "$kit/utils/video/fixtures";
import { ClipFormat, Output, OutputSize } from "$kit/utils/video/plan";
import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { export_clip, type ClipSettings } from "./jobs";
import { SKIP_SENSITIVITY } from "./skip";

const WIDTH = 1280;
const HEIGHT = 720;

let files: FilesService;
let notifications: NotificationsService;

beforeAll(() => {
  files = new FilesService();
  notifications = new NotificationsService();
  kernel.services.set("files", files);
  kernel.services.set("notifications", notifications);
  kernel.services.set("tasks", new TasksService(kernel));
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(() => {
  notifications.destroy();
  kernel.services.delete("files");
  kernel.services.delete("notifications");
  kernel.services.delete("tasks");
});

interface Screen {
  text: string;
  cursor: boolean;
  clock: string;
  /** Left edge of a window dragged across the screen, or `null`. */
  block: number | null;
  stroke: number;
}

/** Screen-recording-like footage: a dark editor with text, a caret, a clock in the corner and a pen stroke. */
async function footage(frames: number, screen_at: (frame: number) => Screen): Promise<File> {
  const encoder = await WebmEncoder.create({ video: { width: WIDTH, height: HEIGHT, bitrate: 2_000_000, framerate: FIXTURE_FPS } });
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext("2d")!;
  for (let i = 0; i < frames; i++) {
    const screen = screen_at(i);
    context.fillStyle = "rgb(30, 30, 46)";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = "rgb(205, 214, 244)";
    context.font = "14px monospace";
    context.fillText(screen.text, 40, 100);
    if (screen.cursor) context.fillRect(41 + context.measureText(screen.text).width, 86, 2, 16);
    context.fillText(screen.clock, WIDTH - 120, HEIGHT - 20);
    if (screen.block !== null) context.fillRect(screen.block, 200, 240, 240);
    if (screen.stroke > 0) {
      context.strokeStyle = "rgb(243, 139, 168)";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(100, 360);
      context.lineTo(100 + screen.stroke, 360 + screen.stroke / 3);
      context.stroke();
    }
    encoder.encode_frame(canvas, Math.round((i / FIXTURE_FPS) * 1e6));
    await encoder.drained();
  }
  return new File([await encoder.finish((frames / FIXTURE_FPS) * 1000)], "screen.webm", { type: "video/webm" });
}

const STILL: Screen = { text: "const answer = 42;", cursor: true, clock: "12:34:56", block: null, stroke: 0 };

/** Ticks the clock every second and blinks the caret every half second. */
function idle(frame: number): Screen {
  const seconds = 56 + Math.floor(frame / FIXTURE_FPS);
  return { ...STILL, cursor: Math.floor(frame / 15) % 2 === 0, clock: `12:34:${String(seconds % 60).padStart(2, "0")}` };
}

async function run(file: File, settings: ClipSettings, seconds: number) {
  const outcome = await export_clip({
    app_id: "video-tools",
    source: { name: file.name, path: null, file, size: { width: WIDTH, height: HEIGHT } },
    range: { from: 0, to: seconds },
    settings,
  });
  if (!outcome.ok) throw new Error(outcome.error);
  return { ...outcome.result, file: (await files.get_file(outcome.result.path))! };
}

async function gif_frames(file: File) {
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: "image/gif" });
  await decoder.tracks.ready;
  const count = decoder.tracks.selectedTrack!.frameCount;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    total += (image.duration ?? 0) / 1e6;
    image.close();
  }
  decoder.close();
  return { count, total };
}

const gif = (skip?: number): ClipSettings => ({ output: Output.GIF, fps: 30, width: 160, dither: false, skip });

test("a clip that skips pauses drops a still stretch but keeps the motion around it", async () => {
  // 1 s of a window dragged across, 2 s of an idle editor, 1 s of changes again.
  const file = await footage(120, (i) => (i < 30 || i >= 90 ? { ...idle(i), block: (i % 30) * 36 } : idle(i)));
  const result = await run(
    file,
    { output: Output.CLIP, format: ClipFormat.WEBM, size: OutputSize.ORIGINAL, quality: "medium", audio: true, skip: SKIP_SENSITIVITY.DEFAULT },
    4
  );
  expect(result.length!.source).toBeCloseTo(4, 1);
  expect(result.length!.output).toBeGreaterThan(1.8);
  expect(result.length!.output).toBeLessThan(2.4);
  const info = await probe_video(result.file);
  expect(info).toMatchObject({ width: WIDTH, height: HEIGHT });
  expect(info.duration).toBeCloseTo(result.length!.output, 1);
});

test("an MP4 that skips pauses and is scaled down runs on the same output clock", async () => {
  const file = await footage(90, (i) => (i < 30 || i >= 60 ? { ...STILL, block: (i % 30) * 36 } : STILL));
  const result = await run(
    file,
    { output: Output.CLIP, format: ClipFormat.MP4, size: OutputSize.P480, quality: "low", audio: false, skip: SKIP_SENSITIVITY.DEFAULT },
    3
  );
  const input = new Input({ source: new BlobSource(result.file), formats: ALL_FORMATS });
  const video = (await input.getPrimaryVideoTrack())!;
  expect({ width: video.displayWidth, height: video.displayHeight }).toEqual({ width: 854, height: 480 });
  expect(await input.computeDuration()).toBeCloseTo(result.length!.output, 1);
  expect(result.length!.output).toBeLessThan(2.4);
  input.dispose();
});

test("a GIF that skips pauses writes no frames for the still part and times the rest on the output clock", async () => {
  const file = await footage(90, (i) => (i < 30 || i >= 60 ? { ...STILL, block: (i % 30) * 36 } : STILL));
  const result = await run(file, gif(SKIP_SENSITIVITY.DEFAULT), 3);
  const frames = await gif_frames(result.file);
  expect(frames.total).toBeCloseTo(result.length!.output, 1);
  expect(frames.total).toBeGreaterThan(1.8);
  expect(frames.total).toBeLessThan(2.4);
});

test("a blinking caret and a ticking clock count as still at the default sensitivity, but not at the highest", async () => {
  const file = await footage(90, idle);
  const quiet = await gif_frames((await run(file, gif(SKIP_SENSITIVITY.DEFAULT), 3)).file);
  expect(quiet.count).toBeLessThanOrEqual(2);
  const keen = await gif_frames((await run(file, gif(SKIP_SENSITIVITY.MAX), 3)).file);
  expect(keen.count).toBeGreaterThanOrEqual(5);
});

test("typing and drawing are kept at the default sensitivity", async () => {
  const typed = "function skip_pauses(frames) { return frames; }";
  const file = await footage(90, (i) =>
    i < 45 ? { ...idle(i), text: typed.slice(0, Math.floor(i / 3)) } : { ...idle(i), text: typed.slice(0, 15), stroke: (i - 45) * 6 }
  );
  const frames = await gif_frames((await run(file, gif(SKIP_SENSITIVITY.DEFAULT), 3)).file);
  expect(frames.count).toBeGreaterThanOrEqual(5);
});

test("without skipping, every frame stays and the clip keeps its length", async () => {
  const file = await footage(60, idle);
  const result = await run(file, gif(), 2);
  expect(result.length).toBeUndefined();
  const frames = await gif_frames(result.file);
  expect(frames.count).toBeGreaterThan(30);
  expect(frames.total).toBeCloseTo(2, 1);
});
