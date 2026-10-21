import { describe, expect, test } from "vitest";
import {
  clamp_scroll,
  dragged_time,
  edge_speed,
  follow,
  max_zoom,
  nudge_step,
  pinch_zoom,
  tick_label,
  tick_step,
  ticks,
  visible_span,
  zoom_at,
  zoom_to,
} from "./zoom";

const view = { zoom: 1, scroll: 0, width: 400, duration: 10 };

describe("visible_span", () => {
  test("the whole sound at fit", () => expect(visible_span(view)).toEqual({ start: 0, end: 10 }));

  test("a quarter of it at 4×, scrolled one viewport in", () => {
    expect(visible_span({ ...view, zoom: 4, scroll: 400 })).toEqual({ start: 2.5, end: 5 });
  });
});

describe("zoom_at", () => {
  test("keeps the moment under the anchor in place", () => {
    const next = zoom_at(view, 4, 100, 100);
    expect(next.zoom).toBe(4);
    const after = visible_span({ ...view, ...next });
    const under = after.start + (100 / 400) * (after.end - after.start);
    expect(under).toBeCloseTo(2.5, 6);
  });

  test("zooming out to fit scrolls back to the start", () => {
    expect(zoom_at({ ...view, zoom: 4, scroll: 800 }, 1, 200, 100)).toEqual({ zoom: 1, scroll: 0 });
  });

  test("stops at the limit and never below fit", () => {
    expect(zoom_at(view, 500, 0, 50).zoom).toBe(50);
    expect(zoom_at(view, 0.2, 0, 50).zoom).toBe(1);
  });

  test("an anchor at the right edge keeps the end in view", () => {
    const next = zoom_at(view, 2, 400, 100);
    expect(next.scroll).toBe(400);
  });
});

describe("zoom_to", () => {
  test("fills the viewport with the span", () => {
    const next = zoom_to({ start: 2, end: 4 }, 400, 10, 100);
    expect(next.zoom).toBe(5);
    expect(visible_span({ ...view, ...next })).toEqual({ start: 2, end: 4 });
  });

  test("a span shorter than the limit allows stays as wide as the limit, centred", () => {
    const next = zoom_to({ start: 5, end: 5.002 }, 400, 10, 20);
    expect(next.zoom).toBe(20);
    const shown = visible_span({ ...view, ...next });
    expect((shown.start + shown.end) / 2).toBeCloseTo(5.001, 6);
  });

  test("leaves the margin either side so the edge tabs stay in view", () => {
    const next = zoom_to({ start: 2, end: 4 }, 400, 10, 100, 50);
    expect(next.zoom).toBe(3.75);
    const pps = (400 * next.zoom) / 10;
    expect(2 * pps - next.scroll).toBeCloseTo(50, 6);
    expect(4 * pps - next.scroll).toBeCloseTo(350, 6);
  });

  test("a margin never takes more than half the viewport", () => {
    expect(zoom_to({ start: 2, end: 4 }, 100, 10, 100, 80).zoom).toBe(2.5);
  });
});

describe("pinch_zoom", () => {
  test("spreading the fingers twice as wide doubles the zoom around their midpoint", () => {
    const next = pinch_zoom({ zoom: 1, scroll: 0, mid: 200, distance: 100 }, 200, 200, 400, 10, 100);
    expect(next.zoom).toBe(2);
    expect(visible_span({ ...view, ...next })).toEqual({ start: 2.5, end: 7.5 });
  });

  test("moving the midpoint pans with it", () => {
    const next = pinch_zoom({ zoom: 2, scroll: 200, mid: 200, distance: 100 }, 100, 100, 400, 10, 100);
    expect(next).toEqual({ zoom: 2, scroll: 300 });
  });
});

describe("max_zoom", () => {
  test("one pixel per sample", () => expect(max_zoom(2, 400, 8000)).toBe(40));
  test("capped by the widest layout", () => expect(max_zoom(3600, 400, 48_000)).toBe(40_000));
  test("never below fit", () => expect(max_zoom(0.001, 400, 8000)).toBe(1));
});

describe("ticks", () => {
  test("labels stay at least min_px apart", () => {
    expect(tick_step(40, 64)).toBe(2);
    expect(tick_step(400, 64)).toBe(0.2);
    expect(tick_step(100_000, 64)).toBe(0.001);
  });

  test("whole multiples of the step inside the span", () => {
    expect(ticks({ start: 0.15, end: 0.75 }, 0.2)).toEqual([0.2, 0.4, 0.6]);
    expect(ticks({ start: 0, end: 1 }, 0.5)).toEqual([0, 0.5, 1]);
  });

  test("labels follow the step: whole seconds, tenths, milliseconds", () => {
    expect(tick_label(3, 1, false)).toBe("3");
    expect(tick_label(1.5, 0.5, false)).toBe("1.5");
    expect(tick_label(1.234, 0.002, false)).toBe("1.234");
  });

  test("minutes once the sound is a minute long", () => {
    expect(tick_label(65, 5, true)).toBe("1:05");
    expect(tick_label(65.5, 0.5, true)).toBe("1:05.5");
    expect(tick_label(5, 1, true)).toBe("0:05");
  });
});

describe("scrolling while dragging and playing", () => {
  test("edge_speed ramps up toward each side", () => {
    expect(edge_speed(200, 400, 40)).toBe(0);
    expect(edge_speed(0, 400, 40)).toBe(-16);
    expect(edge_speed(380, 400, 40)).toBe(8);
  });

  test("follow turns the page once the playhead leaves the screen", () => {
    const zoomed = { ...view, zoom: 4, scroll: 0 };
    expect(follow(zoomed, 2)).toBeNull();
    expect(follow(zoomed, 2.6)).toBeCloseTo(2.6 * 160 - 20, 6);
    expect(follow(zoomed, 9.99)).toBe(clamp_scroll(Infinity, 400, 4));
  });
});

describe("fine control", () => {
  test("nudge_step shrinks with the visible span", () => {
    expect(nudge_step(10)).toBe(0.2);
    expect(nudge_step(1.83)).toBe(0.02);
    expect(nudge_step(0.5)).toBe(0.01);
    expect(nudge_step(0.008)).toBe(0.001);
  });

  test("a tab drag moves the marker by the travel, not to the finger", () => {
    expect(dragged_time(3, 40, 400, 10)).toBe(4);
    expect(dragged_time(3, -40, 1600, 10)).toBe(2.75);
    expect(dragged_time(3, 40, 0, 10)).toBe(3);
  });
});
