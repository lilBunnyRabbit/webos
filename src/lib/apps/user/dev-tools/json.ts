import { error_message } from "$lib/core/utils";
export const JsonIndent = { TWO: "2", FOUR: "4", TAB: "tab" } as const;
export type JsonIndent = (typeof JsonIndent)[keyof typeof JsonIndent];

export interface JsonErrorPosition {
  offset: number;
  line: number;
  column: number;
}

export type JsonResult = { ok: true; value: string } | { ok: false; error: string; position: JsonErrorPosition | null };

export function offset_to_position(text: string, offset: number): JsonErrorPosition {
  const before = text.slice(0, offset);
  return { offset, line: before.split("\n").length, column: offset - (before.lastIndexOf("\n") + 1) + 1 };
}

// V8 reports the offset in the message ("… at position 7 (line 1 column 8)"); there is no structured field for it.
function error_position(text: string, message: string): JsonErrorPosition | null {
  const at = /at position (\d+)/.exec(message);
  if (at) return offset_to_position(text, Number(at[1]));
  if (/Unexpected end of JSON input/i.test(message)) return offset_to_position(text, text.length);
  return null;
}

type Parsed = { ok: true; data: unknown } | { ok: false; error: string; position: JsonErrorPosition | null };

function parse(text: string): Parsed {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (reason) {
    const message = error_message(reason);
    return {
      ok: false,
      error: message.replace(/\s*\(line \d+ column \d+\)$/, ""),
      position: error_position(text, message),
    };
  }
}

export function format_json(text: string, indent: JsonIndent): JsonResult {
  const result = parse(text);
  if (!result.ok) return result;
  return { ok: true, value: JSON.stringify(result.data, null, indent === JsonIndent.TAB ? "\t" : Number(indent)) };
}

export function minify_json(text: string): JsonResult {
  const result = parse(text);
  if (!result.ok) return result;
  return { ok: true, value: JSON.stringify(result.data) };
}
