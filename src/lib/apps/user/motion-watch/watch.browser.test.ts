import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { spawn } from "$kit/utils/worker";
import { probe_video } from "$kit/utils/video/capture";
import { day_of, parse_events } from "./events";
import { ALL_ZONES, detect_config } from "./settings";
import { clip_path, list_days, prune_days, read_day, save_clip } from "./storage";
import type { Clip, WatchApi, WatchEvent } from "./watch.worker";
import WatchWorker from "./watch.worker?worker";

let files: FilesService;

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(() => {
  kernel.services.delete("files");
});

const FPS = 15;
const FRAME_US = 1_000_000 / FPS;

function frames(seconds: number, moving: (second: number) => boolean): ReadableStream<VideoFrame> {
  const canvas = new OffscreenCanvas(320, 240);
  const context = canvas.getContext("2d")!;
  let index = 0;
  return new ReadableStream<VideoFrame>({
    pull(controller) {
      if (index >= seconds * FPS) return controller.close();
      const second = index / FPS;
      context.fillStyle = "rgb(60, 70, 80)";
      context.fillRect(0, 0, 320, 240);
      if (moving(second)) {
        context.fillStyle = "rgb(240, 230, 200)";
        context.fillRect(40 + (index % 30) * 6, 80, 60, 60);
      }
      controller.enqueue(new VideoFrame(canvas, { timestamp: index * FRAME_US }));
      index++;
    },
  });
}

describe("the watch worker", () => {
  test("cuts a playable clip with pre-roll around a burst of motion", async () => {
    const events: WatchEvent[] = [];
    const worker = spawn<WatchApi, WatchEvent>(WatchWorker, { on_event: (event) => events.push(event) });
    const readable = frames(16, (second) => second >= 7 && second < 8);
    await expect(worker.call("watch", { readable, config: detect_config({ sensitivity: 50, zones: ALL_ZONES }) }, { transfer: [readable] })).rejects.toThrow(
      "The camera stopped"
    );
    worker.terminate();
    expect(events.filter((event) => event.kind === "motion")).toHaveLength(1);
    const clips = events.flatMap((event) => (event.kind === "clip" ? [event.clip] : []));
    expect(clips).toHaveLength(1);
    const info = await probe_video(clips[0].blob);
    // From a keyframe 5–7 s before the motion to 5 s after it, cut short by the stream's end at 16 s.
    expect(info.duration).toBeGreaterThan(9);
    expect(info.duration).toBeLessThan(15);
    expect(clips[0].peak).toBeGreaterThan(0);
  }, 60_000);

  test("finish hands over the clip in progress", async () => {
    const events: WatchEvent[] = [];
    const worker = spawn<WatchApi, WatchEvent>(WatchWorker, { on_event: (event) => events.push(event) });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const source = frames(6, (second) => second >= 3);
    const reader = source.getReader();
    let sent = 0;
    const readable = new ReadableStream<VideoFrame>({
      async pull(controller) {
        if (sent >= 6 * FPS) await gate;
        const { value, done } = await reader.read();
        if (done) return;
        sent++;
        controller.enqueue(value);
      },
    });
    const watching = worker.call("watch", { readable, config: detect_config({ sensitivity: 50, zones: ALL_ZONES }) }, { transfer: [readable] });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await worker.call("finish", null);
    release();
    await expect(watching).resolves.toBeNull();
    worker.terminate();
    expect(events.some((event) => event.kind === "clip")).toBe(true);
  }, 60_000);
});

describe("storage", () => {
  const clip = (at: number): Clip => ({ blob: new Blob(["webm"], { type: "video/webm" }), at, end: at + 4000, peak: 0.2, cells: [5] });

  test("saves clips by day with an events.json per day", async () => {
    const at = new Date(2026, 9, 27, 14, 3, 9).getTime();
    const [one, two] = await Promise.all([save_clip(clip(at)), save_clip(clip(at + 1000))]);
    expect(one.clip).toBe("14-03-09.webm");
    expect(two.clip).toBe("14-03-10.webm");
    expect((await read_day("2026-10-27")).map((event) => event.clip)).toEqual(["14-03-09.webm", "14-03-10.webm"]);
    expect(await (await files.get_file(clip_path("2026-10-27", "14-03-09.webm")))!.text()).toBe("webm");
    const index = await files.get_file("/home/Videos/Motion/2026-10-27/events.json");
    expect(parse_events(await index!.text())).toHaveLength(2);
  });

  test("a clip saved in the same second keeps both", async () => {
    const at = new Date(2026, 9, 27, 9, 0, 0).getTime();
    await save_clip(clip(at));
    const second = await save_clip(clip(at));
    expect(second.clip).toBe("09-00-00 (1).webm");
  });

  test("days past the retention are deleted", async () => {
    const now = new Date(2026, 9, 27, 12).getTime();
    await save_clip(clip(new Date(2026, 9, 18, 12).getTime()));
    await save_clip(clip(now));
    expect(await prune_days(7, now)).toEqual(["2026-10-18"]);
    expect(await list_days()).toEqual([day_of(now)]);
  });
});
