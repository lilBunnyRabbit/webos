import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { home_gesture, type HomeGestureOptions } from "./home-gesture";

describe("home_gesture", () => {
  let list: HTMLElement;
  let row: HTMLElement;
  let label: HTMLElement;
  let options: { [K in keyof HomeGestureOptions]: Mock<HomeGestureOptions[K]> };
  let detach: void | (() => void);

  function touch(type: string, y: number, target: HTMLElement = label): TouchEvent {
    const point = new Touch({ identifier: 1, target, clientX: 20, clientY: y });
    const ended = type === "touchend" || type === "touchcancel";
    const event = new TouchEvent(type, { touches: ended ? [] : [point], changedTouches: [point], bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    list = document.createElement("div");
    row = document.createElement("div");
    row.dataset.homeName = "a";
    label = document.createElement("span");
    row.append(label);
    list.append(row);
    document.body.append(list);
    options = {
      hold_ms: vi.fn(() => 450),
      mouse_drags: vi.fn(() => false),
      on_pick: vi.fn<HomeGestureOptions["on_pick"]>(),
      on_move: vi.fn<HomeGestureOptions["on_move"]>(),
      on_drop: vi.fn<HomeGestureOptions["on_drop"]>(),
      on_cancel: vi.fn<HomeGestureOptions["on_cancel"]>(),
      on_menu: vi.fn<HomeGestureOptions["on_menu"]>(),
    };
    detach = home_gesture(options)(list);
  });

  afterEach(() => {
    detach?.();
    list.remove();
    vi.useRealTimers();
  });

  it("holding picks the item up and the same touch drags it", () => {
    touch("touchstart", 100);
    vi.advanceTimersByTime(450);
    expect(options.on_pick).toHaveBeenCalledWith("a", { x: 20, y: 100 });
    expect(touch("touchmove", 160).defaultPrevented).toBe(true);
    expect(options.on_move).toHaveBeenCalledWith({ x: 20, y: 160 });
    expect(touch("touchend", 160).defaultPrevented).toBe(true);
    expect(options.on_drop).toHaveBeenCalledWith({ x: 20, y: 160 });
  });

  it("a drifting finger inside the slop is kept from the browser and still holds", () => {
    touch("touchstart", 100);
    vi.advanceTimersByTime(200);
    expect(touch("touchmove", 108).defaultPrevented).toBe(true);
    vi.advanceTimersByTime(250);
    expect(options.on_pick).toHaveBeenCalledOnce();
    expect(touch("touchmove", 200).defaultPrevented).toBe(true);
    expect(options.on_move).toHaveBeenCalledOnce();
  });

  it("moving past the slop before the hold is a scroll: the browser gets it", () => {
    touch("touchstart", 100);
    vi.advanceTimersByTime(100);
    expect(touch("touchmove", 140).defaultPrevented).toBe(false);
    vi.advanceTimersByTime(500);
    expect(options.on_pick).not.toHaveBeenCalled();
    expect(touch("touchend", 140).defaultPrevented).toBe(false);
  });

  it("a tap leaves the click alone", () => {
    touch("touchstart", 100);
    vi.advanceTimersByTime(100);
    expect(touch("touchend", 100).defaultPrevented).toBe(false);
    expect(options.on_pick).not.toHaveBeenCalled();
  });

  it("keeps the touch when the touched node leaves the list mid-drag", () => {
    touch("touchstart", 100);
    vi.advanceTimersByTime(450);
    label.remove();
    touch("touchmove", 180);
    touch("touchend", 180);
    expect(options.on_move).toHaveBeenCalledOnce();
    expect(options.on_drop).toHaveBeenCalledOnce();
  });

  it("a cancelled touch after the pick cancels the drag", () => {
    touch("touchstart", 100);
    vi.advanceTimersByTime(450);
    touch("touchcancel", 100);
    expect(options.on_cancel).toHaveBeenCalledOnce();
    expect(options.on_drop).not.toHaveBeenCalled();
  });

  it("a touch contextmenu while the hold is pending picks up at once", () => {
    touch("touchstart", 100);
    vi.advanceTimersByTime(300);
    label.dispatchEvent(new PointerEvent("contextmenu", { pointerType: "touch", bubbles: true, cancelable: true }));
    expect(options.on_pick).toHaveBeenCalledOnce();
  });

  it("presses on controls are not the gesture's", () => {
    const control = document.createElement("button");
    control.dataset.homeControl = "";
    row.append(control);
    touch("touchstart", 100, control);
    vi.advanceTimersByTime(600);
    expect(options.on_pick).not.toHaveBeenCalled();
  });
});
