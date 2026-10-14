import { SvelteMap } from "svelte/reactivity";
import type { Pad } from "./board";

export interface PlayState {
  count: number;
  started: number;
  duration: number;
  loop: boolean;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class SoundPlayer {
  readonly playing = new SvelteMap<string, PlayState>();
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private voices = new Map<string, Set<Voice>>();
  private volume = 1;

  constructor(private readonly read: (sound: string) => Promise<File | null>) {}

  set_volume(volume: number): void {
    this.volume = volume;
    if (this.master) this.master.gain.value = volume;
  }

  // Built on first play: an AudioContext made without a user gesture starts suspended.
  private ensure(): { context: AudioContext; master: GainNode } {
    if (!this.context || !this.master) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    return { context: this.context, master: this.master };
  }

  private buffer(context: AudioContext, sound: string): Promise<AudioBuffer> {
    let pending = this.buffers.get(sound);
    if (!pending) {
      pending = (async () => {
        const file = await this.read(sound);
        if (!file) throw new Error("The sound file is missing.");
        return context.decodeAudioData(await file.arrayBuffer());
      })();
      this.buffers.set(sound, pending);
      pending.catch(() => this.buffers.delete(sound));
    }
    return pending;
  }

  async trigger(pad: Pad): Promise<void> {
    if (pad.loop && this.playing.has(pad.id)) return this.stop(pad.id);
    const { context, master } = this.ensure();
    if (context.state === "suspended") void context.resume();
    const buffer = await this.buffer(context, pad.sound);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = pad.loop;
    const gain = context.createGain();
    gain.gain.value = pad.volume;
    source.connect(gain).connect(master);

    const voice: Voice = { source, gain };
    const set = this.voices.get(pad.id) ?? new Set();
    set.add(voice);
    this.voices.set(pad.id, set);
    source.onended = () => this.ended(pad.id, voice);
    source.start();
    this.playing.set(pad.id, { count: set.size, started: performance.now(), duration: buffer.duration, loop: pad.loop });
  }

  private ended(pad_id: string, voice: Voice): void {
    voice.gain.disconnect();
    const set = this.voices.get(pad_id);
    if (!set?.delete(voice)) return;
    if (set.size === 0) {
      this.voices.delete(pad_id);
      this.playing.delete(pad_id);
    } else {
      const state = this.playing.get(pad_id);
      if (state) this.playing.set(pad_id, { ...state, count: set.size });
    }
  }

  /** Turning loop off lets the sounding voices finish their current pass. */
  set_loop(pad_id: string, loop: boolean): void {
    for (const voice of this.voices.get(pad_id) ?? []) voice.source.loop = loop;
    const state = this.playing.get(pad_id);
    if (state) this.playing.set(pad_id, { ...state, loop });
  }

  stop(pad_id: string): void {
    for (const voice of [...(this.voices.get(pad_id) ?? [])]) {
      voice.source.stop();
      this.ended(pad_id, voice);
    }
  }

  stop_all(): void {
    for (const pad_id of [...this.voices.keys()]) this.stop(pad_id);
  }

  forget(sound: string): void {
    this.buffers.delete(sound);
  }

  close(): void {
    this.stop_all();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.buffers.clear();
  }
}
