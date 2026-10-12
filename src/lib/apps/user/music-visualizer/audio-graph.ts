import { analyser_smoothing } from "./spectrum";

// The mic never reaches the speakers, so it can't feed back. Volume sits beside the analyser, not before it, so the
// picture doesn't shrink when the music is turned down.
export class AudioGraph {
  readonly context = new AudioContext();
  readonly analyser = this.context.createAnalyser();
  readonly #gain = this.context.createGain();
  readonly #element: MediaElementAudioSourceNode;
  #mic: { stream: MediaStream; source: MediaStreamAudioSourceNode } | null = null;

  constructor(element: HTMLMediaElement) {
    this.analyser.fftSize = 2048;
    this.#element = this.context.createMediaElementSource(element);
    this.#element.connect(this.analyser);
    this.#element.connect(this.#gain).connect(this.context.destination);
  }

  get using_mic(): boolean {
    return this.#mic !== null;
  }

  set volume(value: number) {
    this.#gain.gain.value = value;
  }

  set smoothing(amount: number) {
    this.analyser.smoothingTimeConstant = analyser_smoothing(amount);
  }

  async resume(): Promise<void> {
    if (this.context.state === "suspended") await this.context.resume();
  }

  async start_mic(): Promise<void> {
    if (this.#mic) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.context.createMediaStreamSource(stream);
    this.#element.disconnect(this.analyser);
    source.connect(this.analyser);
    this.#mic = { stream, source };
    await this.resume();
  }

  stop_mic(): void {
    if (!this.#mic) return;
    this.#mic.source.disconnect();
    for (const track of this.#mic.stream.getTracks()) track.stop();
    this.#mic = null;
    this.#element.connect(this.analyser);
  }

  close(): void {
    this.stop_mic();
    void this.context.close();
  }
}
