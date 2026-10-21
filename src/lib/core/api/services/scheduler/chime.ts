import { JobKind } from "./type";

interface Tone {
  at: number;
  frequency: number;
  peak: number;
  length: number;
}

const TONES: Partial<Record<JobKind, Tone[]>> = {
  [JobKind.ALARM]: call(3),
  [JobKind.TIMER]: call(3),
  [JobKind.PHASE]: [
    { at: 0, frequency: 659.25, peak: 0.12, length: 1.4 },
    { at: 0.22, frequency: 987.77, peak: 0.12, length: 1.4 },
  ],
};

function call(repeats: number): Tone[] {
  return Array.from({ length: repeats }, (_, repeat) => [
    { at: repeat * 0.7, frequency: 880, peak: 0.2, length: 0.45 },
    { at: repeat * 0.7 + 0.18, frequency: 1318.5, peak: 0.2, length: 0.45 },
  ]).flat();
}

let context: AudioContext | null = null;

/** Silent when the browser won't play sound yet (nothing on the page was clicked so far). */
export function play_chime(kind: JobKind): void {
  const tones = TONES[kind];
  if (!tones) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => {});
    const start = context.currentTime + 0.05;
    for (const tone of tones) {
      const at = start + tone.at;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = tone.frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(tone.peak, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + tone.length + 0.05);
    }
  } catch {
    context = null;
  }
}
