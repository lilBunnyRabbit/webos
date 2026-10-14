let context: AudioContext | null = null;

/** Silent when the browser won't play sound yet (nothing on the page was clicked so far). */
export function play_chime(repeats = 3): void {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => {});
    const start = context.currentTime + 0.05;
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const [offset, frequency] of [
        [0, 880],
        [0.18, 1318.5],
      ]) {
        const at = start + repeat * 0.7 + offset;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.2, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.5);
      }
    }
  } catch {
    context = null;
  }
}
