const STEP_MS = 1000 / 120;
const MAX_FRAME_MS = 100;

export function frame_loop(run: (steps: number, dt: number) => void, render: (dt: number) => void, going: () => boolean): () => void {
  let last = performance.now();
  let frame_id = requestAnimationFrame(function tick(now) {
    // Steps split each frame's own time: fixed steps against a 120 Hz screen land 0, 1 or 2 to a frame, and the car shakes.
    // A frame's timestamp is when it started, so the first one can come before the effect's `performance.now()`.
    const elapsed = Math.max(0, Math.min(now - last, MAX_FRAME_MS));
    last = Math.max(last, now);
    if (elapsed > 0) {
      const steps = Math.ceil(elapsed / STEP_MS);
      run(steps, elapsed / steps / 1000);
    }
    render(elapsed / 1000);
    if (going()) frame_id = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(frame_id);
}
