/** Held keys move the stick at a hand's pace: a tap is a nudge, a 1.5 s hold at cruise pulls about 2 g. */
export const STICK_RATE = 0.7;
export const STICK_RETURN = 5;

/** Expo: fine near the centre, the full throw still at the end. Every input goes through it: keys, pad and mouse. */
export function expo(stick: number): number {
  return 0.6 * stick ** 3 + 0.4 * stick;
}

export function key_step(stick: number, goal: number, dt: number): number {
  const returning = goal === 0 || (stick !== 0 && Math.sign(goal) !== Math.sign(stick));
  const rate = returning ? STICK_RETURN : STICK_RATE;
  return stick < goal ? Math.min(goal, stick + rate * dt) : Math.max(goal, stick - rate * dt);
}
