import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Position } from "./type";
import { long_press } from "./long-press";

describe("long_press", () => {
  let element: HTMLElement;
  let on_menu: Mock<(point: Position) => void>;
  let detach: void | (() => void);

  const touch = (type: string) =>
    element.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));

  beforeEach(() => {
    vi.useFakeTimers();
    element = document.createElement("div");
    // A synthetic pointer isn't active, so the real capture throws.
    element.setPointerCapture = () => {};
    document.body.append(element);
    on_menu = vi.fn<(point: Position) => void>();
    detach = long_press({ on_menu })(element);
  });

  afterEach(() => {
    detach?.();
    element.remove();
    vi.useRealTimers();
  });

  it("opens the menu on release after the hold", () => {
    touch("pointerdown");
    vi.advanceTimersByTime(500);
    touch("pointerup");
    expect(on_menu).toHaveBeenCalledOnce();
  });

  it("a touch contextmenu before the timer holds at once", () => {
    touch("pointerdown");
    vi.advanceTimersByTime(300);
    touch("contextmenu");
    touch("pointerup");
    expect(on_menu).toHaveBeenCalledOnce();
  });

  it("a touch contextmenu after the browser cancelled the press still opens the menu", () => {
    touch("pointerdown");
    vi.advanceTimersByTime(300);
    touch("pointercancel");
    touch("contextmenu");
    expect(on_menu).toHaveBeenCalledOnce();
  });

  it("a tap opens nothing", () => {
    touch("pointerdown");
    vi.advanceTimersByTime(100);
    touch("pointerup");
    touch("contextmenu");
    vi.advanceTimersByTime(1000);
    expect(on_menu).not.toHaveBeenCalled();
  });
});
