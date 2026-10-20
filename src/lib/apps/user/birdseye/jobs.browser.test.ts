import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { TasksService } from "$lib/core/api/services/tasks/service.svelte";
import { probe_video } from "$kit/utils/video/capture";
import { make_square_video, square_path } from "./fixtures";
import { export_locked, run_track } from "./jobs";
import { build_path, FrameStatus, splice_track, status_of } from "./path";
import { draw_locked, EdgeFill } from "./render";

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

const fixture = square_path(640, 360, 40);

test("tracks the square in a played webm and saves the locked video beside it", async () => {
  const blob = await make_square_video(2, fixture);
  const start = fixture.at(0);
  const outcome = await run_track({
    app_id: "birdseye",
    name: "square.webm",
    file: blob,
    frame: { width: 640, height: 360 },
    duration: 2,
    box: { x: start.x, y: start.y, width: fixture.side, height: fixture.side },
    from: 0,
    follow_size: false,
  });
  if (!outcome.ok) throw new Error("tracking failed");
  const { points } = outcome;
  expect(points.length).toBeGreaterThan(50);
  const errors = points.map((point) => {
    const truth = fixture.at(point.t);
    return Math.hypot(point.cx - (truth.x + fixture.side / 2), point.cy - (truth.y + fixture.side / 2));
  });
  expect(Math.max(...errors)).toBeLessThan(1.5);
  expect(points.every((point) => status_of(point.conf) !== FrameStatus.LOST)).toBe(true);
  const camera = build_path(points)!;
  const smoothed = points.map((point, i) => {
    const truth = fixture.at(point.t);
    return Math.hypot(camera.cx[i] - (truth.x + fixture.side / 2), camera.cy[i] - (truth.y + fixture.side / 2));
  });
  expect(Math.max(...smoothed)).toBeLessThan(3);

  await files.create_file(await files.get_directory("/home"), "square.webm", { content: blob, overwrite: true });
  const saved = await export_locked({
    app_id: "birdseye",
    name: "square.webm",
    path: "/home/square.webm",
    file: blob,
    frame: { width: 640, height: 360 },
    duration: 2,
    camera,
    settings: { zoom: 2, follow_size: false, fill: EdgeFill.BLACK, color: "" },
  });
  expect(saved?.path).toBe("/home/square-birdseye.webm");
  const info = await probe_video((await files.get_file(saved!.path))!);
  expect(info).toMatchObject({ width: 640, height: 360 });
  expect(info.duration).toBeCloseTo(2, 0);
});

test("marks the frames where the square is gone as lost, and finds it again after", async () => {
  const blob = await make_square_video(2, fixture, { from: 0.8, to: 1.1 });
  const start = fixture.at(0);
  const outcome = await run_track({
    app_id: "birdseye",
    name: "square.webm",
    file: blob,
    frame: { width: 640, height: 360 },
    duration: 2,
    box: { x: start.x, y: start.y, width: fixture.side, height: fixture.side },
    from: 0,
    follow_size: false,
  });
  if (!outcome.ok) throw new Error("tracking failed");
  const lost = outcome.points.filter((point) => status_of(point.conf) === FrameStatus.LOST);
  expect(lost.length).toBeGreaterThan(5);
  expect(lost[0].t).toBeGreaterThanOrEqual(0.79);
  expect(
    outcome.points
      .filter((point) => point.t >= 0.8 && point.t < 1.1)
      .every((point) => status_of(point.conf) === FrameStatus.LOST)
  ).toBe(true);

  const again = 1.2;
  const seen = fixture.at(again);
  const retrack = await run_track({
    app_id: "birdseye",
    name: "square.webm",
    file: blob,
    frame: { width: 640, height: 360 },
    duration: 2,
    box: { x: seen.x, y: seen.y, width: fixture.side, height: fixture.side },
    from: again,
    follow_size: false,
  });
  if (!retrack.ok) throw new Error("re-tracking failed");
  const track = splice_track(outcome.points, again, retrack.points);
  expect(track.filter((point) => point.t >= again).every((point) => status_of(point.conf) !== FrameStatus.LOST)).toBe(
    true
  );
  const last = track.at(-1)!;
  const truth = fixture.at(last.t);
  expect(Math.hypot(last.cx - truth.x - fixture.side / 2, last.cy - truth.y - fixture.side / 2)).toBeLessThan(2);
});

test("draws the camera centre in the middle, filled with the chosen edge", () => {
  const source = new OffscreenCanvas(100, 50);
  const paint = source.getContext("2d")!;
  paint.fillStyle = "rgb(255, 255, 255)";
  paint.fillRect(0, 0, 100, 50);
  paint.fillStyle = "rgb(255, 0, 0)";
  paint.fillRect(80, 10, 10, 10);
  const out = new OffscreenCanvas(100, 50);
  const context = out.getContext("2d", { willReadFrequently: true })!;
  draw_locked(
    context,
    source,
    { width: 100, height: 50 },
    { width: 100, height: 50 },
    { cx: 85, cy: 15, scale: 1 },
    { zoom: 1, follow_size: false, fill: EdgeFill.THEME, color: "rgb(0, 0, 255)" }
  );
  expect([...context.getImageData(50, 25, 1, 1).data]).toEqual([255, 0, 0, 255]);
  expect([...context.getImageData(95, 45, 1, 1).data]).toEqual([0, 0, 255, 255]);
});
