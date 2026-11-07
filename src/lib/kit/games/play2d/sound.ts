export class GameSounds {
  protected context: AudioContext | null = null;

  constructor(private readonly enabled: () => boolean) {}

  protected audio(): AudioContext | null {
    if (!this.enabled()) return null;
    if (!this.context) {
      try {
        this.context = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }

  protected noise(audio: AudioContext, seconds: number): AudioBuffer {
    const buffer = audio.createBuffer(1, Math.round(audio.sampleRate * seconds), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  quiet(): void {}

  close() {
    this.quiet();
    void this.context?.close();
    this.context = null;
  }
}
