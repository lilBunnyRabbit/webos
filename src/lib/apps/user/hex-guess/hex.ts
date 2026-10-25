import { create_rng, random_int } from "$lib/core/utils/random";
import { z } from "zod";
import { hsb_hex } from "../color-recall/color";

export const HEX_GUESSES = 5;
export const HEX_LENGTH = 6;
export const HEX_DIGITS = "0123456789ABCDEF";

export const Hint = { UP: "up", DOWN: "down", EXACT: "exact" } as const;
export type Hint = (typeof Hint)[keyof typeof Hint];

export const HexStatus = { PLAYING: "playing", WON: "won", LOST: "lost" } as const;
export type HexStatus = (typeof HexStatus)[keyof typeof HexStatus];

/** Six uppercase digits, no `#`. */
export function hex_target(seed: number): string {
  const rng = create_rng(seed);
  const hsb = { h: random_int(0, 359, rng), s: random_int(15, 100, rng), b: random_int(15, 100, rng) };
  return hsb_hex(hsb).slice(1).toUpperCase();
}

/** Per digit: `up` when the answer's digit is higher than the guess's, `down` when lower. */
export function hex_hints(guess: string, target: string): Hint[] {
  return [...target].map((digit, index) => {
    const want = parseInt(digit, 16);
    const got = parseInt(guess[index] ?? "", 16);
    if (want === got) return Hint.EXACT;
    return want > got ? Hint.UP : Hint.DOWN;
  });
}

export function hex_status(guesses: readonly string[], target: string): HexStatus {
  if (guesses.includes(target)) return HexStatus.WON;
  return guesses.length >= HEX_GUESSES ? HexStatus.LOST : HexStatus.PLAYING;
}

export function is_hex_digit(key: string): boolean {
  return key.length === 1 && HEX_DIGITS.includes(key.toUpperCase());
}

export const hex_state_schema = z.object({
  guesses: z.array(z.string().regex(/^[0-9A-F]{6}$/)).max(HEX_GUESSES),
  ms: z.number().nonnegative(),
});
export type HexState = z.infer<typeof hex_state_schema>;
