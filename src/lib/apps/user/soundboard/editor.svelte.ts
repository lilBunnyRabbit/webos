import type { Span } from "$kit/components/waveform";
import { cut_regions, pcm_length, pcm_of, subtract_regions, wav_blob, type Pcm } from "$kit/utils/audio";

export class SoundEditor {
  pcm = $state.raw<Pcm | null>(null);
  start = $state(0);
  end = $state(0);
  selection = $state<Span | null>(null);
  playhead = $state<number | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);
  private spliced = $state(false);
  private original: Pcm | null = null;
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private frame = 0;

  get duration(): number {
    return this.pcm ? pcm_length(this.pcm) / this.pcm.sample_rate : 0;
  }

  get changed(): boolean {
    return this.spliced || this.start > 0 || this.end < this.duration;
  }

  get playing(): boolean {
    return this.playhead !== null;
  }

  private audio(): AudioContext {
    this.context ??= new AudioContext();
    return this.context;
  }

  async load(file: File): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const buffer = await this.audio().decodeAudioData(await file.arrayBuffer());
      this.original = pcm_of(buffer);
      this.reset();
    } catch (reason) {
      this.error = "This sound can't be decoded for editing.";
      throw reason;
    } finally {
      this.loading = false;
    }
  }

  reset(): void {
    this.stop();
    this.pcm = this.original;
    this.spliced = false;
    this.selection = null;
    this.start = 0;
    this.end = this.duration;
  }

  delete_selection(): void {
    const { pcm, selection } = this;
    if (!pcm || !selection) return;
    this.stop();
    const length = pcm_length(pcm);
    const rate = pcm.sample_rate;
    const at_end = this.end >= this.duration;
    this.pcm = cut_regions(
      pcm,
      subtract_regions(
        { start: 0, end: length },
        [{ start: selection.start * rate, end: selection.end * rate }],
        length
      )
    );
    this.spliced = true;
    this.selection = null;
    this.end = at_end ? this.duration : Math.min(this.duration, this.end - (selection.end - selection.start));
    this.start = Math.min(this.start, this.end);
  }

  play(): void {
    const { pcm } = this;
    if (!pcm) return;
    this.stop();
    const span = this.selection ?? { start: this.start, end: this.end };
    const part = cut_regions(pcm, [{ start: span.start * pcm.sample_rate, end: span.end * pcm.sample_rate }]);
    const frames = pcm_length(part);
    if (!frames) return;
    const context = this.audio();
    void context.resume();
    const buffer = context.createBuffer(part.channels.length, frames, part.sample_rate);
    part.channels.forEach((channel, index) => buffer.copyToChannel(channel as Float32Array<ArrayBuffer>, index));
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const began = context.currentTime;
    source.onended = () => {
      if (this.source === source) this.stop();
    };
    source.start();
    this.source = source;
    const tick = () => {
      this.playhead = Math.min(span.end, span.start + (context.currentTime - began));
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    const source = this.source;
    this.source = null;
    source?.stop();
    source?.disconnect();
    this.playhead = null;
  }

  render(): Blob | null {
    const { pcm } = this;
    if (!pcm || !this.changed) return null;
    return wav_blob(cut_regions(pcm, [{ start: this.start * pcm.sample_rate, end: this.end * pcm.sample_rate }]));
  }

  dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
  }
}
