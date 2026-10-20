export class PewSynth {
  private context: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  /** Browsers only start audio once the page has had a user gesture, so the context waits for one. */
  public arm(): () => void {
    const start = () => {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume();
    };
    if (navigator.userActivation.hasBeenActive) start();
    const options = { capture: true, passive: true };
    window.addEventListener("pointerdown", start, options);
    window.addEventListener("keydown", start, options);
    return () => {
      window.removeEventListener("pointerdown", start, options);
      window.removeEventListener("keydown", start, options);
    };
  }

  public pew(pitch: number, volume: number): void {
    const context = this.ready();
    if (!context || volume <= 0) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(1400 * pitch * (0.94 + Math.random() * 0.12), now);
    oscillator.frequency.exponentialRampToValueAtTime(220 * pitch, now + 0.13);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08 * volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.15);
  }

  public pop(volume: number): void {
    const context = this.ready();
    if (!context || volume <= 0) return;
    const now = context.currentTime;
    this.noise ??= noise_buffer(context);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noise;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.1);
    gain.gain.setValueAtTime(0.25 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(now);
    source.stop(now + 0.13);
  }

  public close(): void {
    void this.context?.close();
    this.context = null;
    this.noise = null;
  }

  private ready(): AudioContext | null {
    return this.context?.state === "running" ? this.context : null;
  }
}

function noise_buffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.15), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
  return buffer;
}
