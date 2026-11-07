import { clamp_notch as clamp_on, nearest_notch } from "$kit/games/play2d/lever";

/** The single lever's notches, astern to ahead: power as a share of full, the sign the gear. */
export const DETENTS = [-1, -0.6, -0.3, 0, 0.3, 0.6, 1] as const;
export const NEUTRAL = 3;
export const DETENT_NAMES = ["Full astern", "Half astern", "Slow astern", "Neutral", "Slow ahead", "Half ahead", "Full ahead"] as const;
export const SHORT_NAMES = ["Full ast", "Half ast", "Slow ast", "N", "Slow", "Half", "Full"] as const;
export const LEVER_LABELS = ["Full", "Half", "Slow", "N", "Slow", "Half", "Full"] as const;
export const LEVER_ENDS = { top: "Ahead", bottom: "Astern" } as const;
/** Hold-to-thrust gives half ahead or astern while W or S is down. */
export const HOLD_POWER = 0.6;

export const ThrottleMode = { LEVER: "lever", HOLD: "hold" } as const;
export type ThrottleMode = (typeof ThrottleMode)[keyof typeof ThrottleMode];

export function clamp_notch(notch: number): number {
  return clamp_on(notch, DETENTS.length);
}

/** The notch nearest a lever position from −1 to 1. */
export function notch_at(value: number): number {
  return nearest_notch(DETENTS, value, NEUTRAL);
}
