import { expect, test } from "vitest";
import { round_mm, type_key } from "./keys";

test("numpad keys build a number", () => {
  let text = "";
  for (const key of ["0", "2", ".", "5", ".", "back", "7"]) text = type_key(text, key);
  expect(text).toBe("2.7");
  expect(type_key("", ".")).toBe("0.");
  expect(type_key("123456789", "1")).toBe("123456789");
  expect(round_mm(802.456)).toBe(802.46);
});
