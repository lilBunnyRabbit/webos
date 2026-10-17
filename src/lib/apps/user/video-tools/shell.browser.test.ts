import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { TasksService } from "$lib/core/api/services/tasks/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { probe_video } from "./capture";
import { decode_audio } from "./encode";
import { make_video } from "./fixtures";
import { audio, gif, trim } from "./shell";

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

function context<T>(args: T, signal = new AbortController().signal) {
  return {
    args,
    input: (async function* () {})(),
    piped: false,
    session: { cwd: "/home" },
    signal,
    elevated: false,
  } as unknown as CommandContext<T>;
}

async function seed(name: string, blob: Blob) {
  await files.create_file(await files.get_directory("/home"), name, { content: blob, overwrite: true });
}

async function gif_frames(path: string) {
  const decoder = new ImageDecoder({ data: await (await files.get_file(path))!.arrayBuffer(), type: "image/gif" });
  await decoder.tracks.ready;
  const track = decoder.tracks.selectedTrack!;
  let total = 0;
  for (let i = 0; i < track.frameCount; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    total += (image.duration ?? 0) / 1000;
    image.close();
  }
  const { image } = await decoder.decode({ frameIndex: 0 });
  const size = { width: image.displayWidth, height: image.displayHeight };
  image.close();
  decoder.close();
  return { count: track.frameCount, total, size };
}

test("video trim writes a playable clip of the part, with sound, next to the video", async () => {
  await seed("clip.webm", await make_video(3, { audio: true }));
  const value = await trim(
    context({ path: "clip.webm", from: "0.5", to: "2", quality: "medium" as const, mute: false })
  );
  expect(value.path).toBe("/home/clip-clip.webm");
  const file = (await files.get_file(value.path))!;
  const info = await probe_video(file);
  expect(info).toMatchObject({ width: 160, height: 120 });
  expect(info.duration).toBeCloseTo(1.5, 1);
  expect((await decode_audio(file))!.duration).toBeCloseTo(1.5, 1);
});

test("video trim --mute leaves the sound out and -o names the file", async () => {
  await seed("clip.webm", await make_video(1, { audio: true }));
  const value = await trim(context({ path: "clip.webm", quality: "low" as const, mute: true, out: "short" }));
  expect(value.path).toBe("/home/short.webm");
  expect(await decode_audio((await files.get_file(value.path))!)).toBeNull();
});

test("video gif writes a GIF at the fps and width asked, as long as the part", async () => {
  await seed("clip.webm", await make_video(3));
  const value = await gif(context({ path: "clip.webm", from: "1", to: "2", fps: 10, width: 80, plain: false }));
  expect(value.path).toBe("/home/clip.gif");
  const frames = await gif_frames(value.path);
  expect(frames.size).toEqual({ width: 80, height: 60 });
  expect(frames.count).toBe(10);
  expect(frames.total).toBe(1000);
});

test("video gif never upscales", async () => {
  await seed("clip.webm", await make_video(0.5));
  const value = await gif(context({ path: "clip.webm", fps: 5, width: 640, plain: true }));
  expect((await gif_frames(value.path)).size).toEqual({ width: 160, height: 120 });
});

test("video audio saves the sound alone", async () => {
  await seed("clip.webm", await make_video(2, { audio: true }));
  const value = await audio(context({ path: "clip.webm", from: "1" }));
  expect(value.path).toBe("/home/clip-audio.webm");
  expect((await decode_audio((await files.get_file(value.path))!))!.duration).toBeCloseTo(1, 1);
});

test("video audio says so when there's no sound", async () => {
  await seed("clip.webm", await make_video(0.5));
  await expect(audio(context({ path: "clip.webm" }))).rejects.toThrow("no sound");
});

test("bad times and non-videos fail with a message", async () => {
  await seed("clip.webm", await make_video(0.5));
  await seed("note.txt", new Blob(["hi"]));
  await expect(
    trim(context({ path: "clip.webm", from: "soon", quality: "low" as const, mute: false }))
  ).rejects.toThrow("--from soon");
  await expect(trim(context({ path: "clip.webm", from: "3", quality: "low" as const, mute: false }))).rejects.toThrow(
    "nothing between"
  );
  await expect(trim(context({ path: "note.txt", quality: "low" as const, mute: false }))).rejects.toThrow(
    "not a video"
  );
});

test("Ctrl+C stops a trim and writes nothing", async () => {
  await seed("clip.webm", await make_video(3));
  const controller = new AbortController();
  const run = trim(context({ path: "clip.webm", quality: "low" as const, mute: true }, controller.signal));
  setTimeout(() => controller.abort(), 400);
  await expect(run).rejects.toThrow("stopped");
  expect(await files.get_file("/home/clip-clip.webm")).toBeNull();
});
