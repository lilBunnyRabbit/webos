import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { swipe_dismiss } from "./swipe-dismiss";

describe("swipe_dismiss", () => {
  let sheet: HTMLElement;
  let scroller: HTMLElement;
  let on_dismiss: Mock<() => void>;
  let detach: void | (() => void);

  function touch(type: string, target: HTMLElement, y: number, x = 100) {
    const point = new Touch({ identifier: 1, target, clientX: x, clientY: y });
    const ended = type === "touchend" || type === "touchcancel";
    target.dispatchEvent(
      new TouchEvent(type, { touches: ended ? [] : [point], changedTouches: [point], bubbles: true, cancelable: true })
    );
  }

  async function drag(to: number, { target = sheet, ms = 16, steps = 10 } = {}) {
    touch("touchstart", target, 100);
    for (let step = 1; step <= steps; step++) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      touch("touchmove", target, 100 + ((to - 100) * step) / steps);
    }
    touch("touchend", target, to);
  }

  function attach(dismissible = true) {
    detach?.();
    detach = swipe_dismiss({ on_dismiss, dismissible })(sheet);
  }

  beforeEach(() => {
    document.documentElement.dataset.motion = "off";
    sheet = document.createElement("div");
    sheet.style.cssText = "position: fixed; bottom: 0; left: 0; width: 300px; height: 400px; display: flex; flex-direction: column";
    scroller = document.createElement("div");
    scroller.style.cssText = "overflow-y: auto; flex: 1; min-height: 0";
    scroller.innerHTML = `<div style="height: 2000px"></div>`;
    sheet.append(scroller);
    document.body.append(sheet);
    on_dismiss = vi.fn<() => void>();
    attach();
  });

  afterEach(() => {
    detach?.();
    sheet.remove();
    delete document.documentElement.dataset.motion;
  });

  it("follows the finger down while dragging", () => {
    touch("touchstart", sheet, 100);
    touch("touchmove", sheet, 160);
    expect(sheet.style.translate).toBe("0px 60px");
    touch("touchend", sheet, 160);
  });

  it("dismisses past a quarter of the height", async () => {
    await drag(220, { ms: 60 });
    expect(on_dismiss).toHaveBeenCalledOnce();
  });

  it("springs back from a short, slow pull", async () => {
    await drag(150, { ms: 60 });
    expect(on_dismiss).not.toHaveBeenCalled();
    expect(sheet.style.translate).toBe("");
  });

  it("dismisses on a fast flick however short", async () => {
    await drag(150, { ms: 4 });
    expect(on_dismiss).toHaveBeenCalledOnce();
  });

  it("leaves the drag to an inner scroller that isn't at its top", async () => {
    scroller.scrollTop = 200;
    await drag(300, { target: scroller.firstElementChild as HTMLElement, ms: 60 });
    expect(on_dismiss).not.toHaveBeenCalled();
    expect(sheet.style.translate).toBe("");
  });

  it("takes the drag from an inner scroller at its top", async () => {
    await drag(300, { target: scroller.firstElementChild as HTMLElement, ms: 60 });
    expect(on_dismiss).toHaveBeenCalledOnce();
  });

  it("leaves a drag that starts upward to the page", () => {
    touch("touchstart", sheet, 100);
    touch("touchmove", sheet, 80);
    touch("touchmove", sheet, 300);
    expect(sheet.style.translate).toBe("");
    touch("touchend", sheet, 300);
    expect(on_dismiss).not.toHaveBeenCalled();
  });

  it("only rubber-bands when it can't be dismissed", () => {
    attach(false);
    touch("touchstart", sheet, 100);
    touch("touchmove", sheet, 400);
    const offset = parseFloat(sheet.style.translate.split(" ")[1]);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(60);
    touch("touchend", sheet, 400);
    expect(on_dismiss).not.toHaveBeenCalled();
  });

  it("ignores an element laid out in flow", async () => {
    sheet.style.position = "static";
    await drag(300, { ms: 60 });
    expect(on_dismiss).not.toHaveBeenCalled();
  });

  it("ignores an empty box whose content escaped with fixed", async () => {
    sheet.style.height = "0";
    scroller.remove();
    await drag(300, { ms: 60 });
    expect(on_dismiss).not.toHaveBeenCalled();
  });
});
