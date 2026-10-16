import { afterEach, expect, test, vi } from "vitest";
import { find_duration } from "./duration";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

async function record_webm(ms: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const context = canvas.getContext("2d")!;
  const timer = setInterval(() => context.fillRect(0, 0, Math.random() * 16, 16), 20);
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: "video/webm" });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  const stopped = new Promise((resolve) => (recorder.onstop = resolve));
  recorder.start(100);
  await new Promise((resolve) => setTimeout(resolve, ms));
  recorder.stop();
  await stopped;
  clearInterval(timer);
  return new Blob(chunks, { type: "video/webm" });
}

test("finds the length of a recording without a duration header, then rewinds", async () => {
  const url = URL.createObjectURL(await record_webm(600));
  const video = document.createElement("video");
  video.muted = true;
  video.src = url;
  document.body.append(video);
  cleanups.push(() => (video.remove(), URL.revokeObjectURL(url)));
  const raw = await new Promise<number>((resolve) => video.addEventListener("loadedmetadata", () => resolve(video.duration), { once: true }));
  expect(raw).toBe(Infinity);

  const second = document.createElement("video");
  second.muted = true;
  second.src = url;
  document.body.append(second);
  const detach = find_duration(second);
  cleanups.push(() => (detach?.(), second.remove()));

  await vi.waitFor(() => {
    expect(Number.isFinite(second.duration)).toBe(true);
    expect(second.duration).toBeGreaterThan(0.3);
    expect(second.currentTime).toBe(0);
  }, { timeout: 5000 });
});
