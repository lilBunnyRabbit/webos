import { clamp_scale, type View } from "$kit/utils/view";
import type { Point } from "./model";

/**
 * The canvas turns the sketch by `rotation` (radians, clockwise on screen) before the view's scale and offset, so the
 * labels are placed in screen pixels against the turned lines and stay upright.
 */
export interface Camera {
  view: View;
  rotation: number;
}

const QUARTER = Math.PI / 2;
const TURN = Math.PI * 2;
const ROTATION_SNAP = (8 * Math.PI) / 180;

export function rotate(p: Point, radians: number): Point {
  if (!radians) return { x: p.x, y: p.y };
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

export function to_screen(camera: Camera, p: Point): Point {
  const turned = rotate(p, camera.rotation);
  return { x: turned.x * camera.view.scale + camera.view.offset_x, y: turned.y * camera.view.scale + camera.view.offset_y };
}

export function to_sketch(camera: Camera, p: Point): Point {
  const { view } = camera;
  return rotate({ x: (p.x - view.offset_x) / view.scale, y: (p.y - view.offset_y) / view.scale }, -camera.rotation);
}

function wrap_angle(radians: number): number {
  const wrapped = (((radians + Math.PI) % TURN) + TURN) % TURN - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/** Within 8° of a quarter turn the sketch settles square, so walls drawn straight read straight again. */
export function snap_rotation(radians: number): number {
  const nearest = Math.round(radians / QUARTER) * QUARTER;
  return wrap_angle(Math.abs(radians - nearest) <= ROTATION_SNAP ? nearest : radians);
}

export interface Pinch {
  camera: Camera;
  mid: Point;
  distance: number;
  angle: number;
}

export function pinch_start(camera: Camera, a: Point, b: Point): Pinch {
  return {
    camera,
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.hypot(a.x - b.x, a.y - b.y),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

/** The sketch point under the starting midpoint follows the midpoint, scaled by the spread and turned by the twist. */
export function pinch_camera(start: Pinch, a: Point, b: Point): Camera {
  const now = pinch_start(start.camera, a, b);
  const rotation = snap_rotation(start.camera.rotation + wrap_angle(now.angle - start.angle));
  const scale = clamp_scale(start.camera.view.scale * (now.distance / Math.max(1, start.distance)));
  const anchor = rotate(to_sketch(start.camera, start.mid), rotation);
  return { rotation, view: { scale, offset_x: now.mid.x - anchor.x * scale, offset_y: now.mid.y - anchor.y * scale } };
}

export function turn_camera(camera: Camera, rotation: number, around: Point): Camera {
  const anchor = to_sketch(camera, around);
  const turned = rotate(anchor, rotation);
  const { scale } = camera.view;
  return { rotation, view: { scale, offset_x: around.x - turned.x * scale, offset_y: around.y - turned.y * scale } };
}
