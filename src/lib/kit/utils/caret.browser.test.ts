import { afterEach, expect, test } from "vitest";
import { caret_at_point, caret_range_at_point } from "./caret";

const native = document.caretPositionFromPoint;

afterEach(() => {
  document.caretPositionFromPoint = native;
  document.body.replaceChildren();
});

function line(): { text: Text; x: number; y: number } {
  const element = document.createElement("p");
  element.style.cssText = "font: 20px monospace; margin: 0; position: fixed; inset: 0 auto auto 0";
  element.textContent = "abcdef";
  document.body.append(element);
  const box = element.getBoundingClientRect();
  return { text: element.firstChild as Text, x: box.left + (box.width / 6) * 2.2, y: box.top + box.height / 2 };
}

test("finds the offset under a point", () => {
  const { text, x, y } = line();
  expect(caret_at_point(x, y)).toEqual({ node: text, offset: 2 });
});

test("falls back to caretRangeFromPoint without caretPositionFromPoint", () => {
  const { text, x, y } = line();
  Object.defineProperty(document, "caretPositionFromPoint", { value: undefined, configurable: true, writable: true });
  expect(caret_at_point(x, y)).toEqual({ node: text, offset: 2 });
  const range = caret_range_at_point(x, y);
  expect(range?.collapsed).toBe(true);
  expect(range?.startOffset).toBe(2);
});
