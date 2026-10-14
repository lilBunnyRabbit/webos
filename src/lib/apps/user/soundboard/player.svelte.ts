import kernel, { type FilesService } from "$lib/core/api";
import { SvelteMap } from "svelte/reactivity";
import { play_action, PlayAction, PlayMode, PLAY_MODES, type Pad } from "./board";
import { APP_ID, read_sound } from "./store";

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

const RESUME_TIMEOUT = 1000;

export class SoundPlayer {
  readonly playing = new SvelteMap<string, PlayState>();
  mode: PlayMode = PlayMode.RESTART;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private voices = new Map<string, Set<Voice>>();
  private volume = 1;
  private pending = 0;

  constructor(
    private readonly read: (sound: string) => Promise<File | null>,
    private readonly on_idle?: () => void
  ) {}

  get idle(): boolean {
    return this.voices.size === 0 && this.pending === 0;
  }

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

  /** For callers outside a click: `resume()` never settles while the page lacks a user gesture, so it gets a deadline. */
  async unlock(): Promise<void> {
    const { context } = this.ensure();
    if (context.state === "running") return;
    await Promise.race([context.resume(), new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT))]);
    if ((context.state as AudioContextState) !== "running") throw new Error("The browser blocked sound. Click anywhere on the page, then try again.");
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
    const action = play_action(this.mode, pad.loop, this.playing.has(pad.id));
    if (action === PlayAction.STOP) return this.stop(pad.id);
    const { context, master } = this.ensure();
    if (context.state === "suspended") void context.resume();
    this.pending++;
    let buffer: AudioBuffer;
    try {
      buffer = await this.buffer(context, pad.sound);
    } finally {
      this.pending--;
    }
    if (action === PlayAction.RESTART) this.stop(pad.id);

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
    // A restart stops the old voice and starts the new one in the same task; checking later doesn't see a gap.
    if (this.voices.size === 0 && this.on_idle) queueMicrotask(() => this.idle && this.on_idle?.());
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

function stored<T>(key: string, valid: (value: unknown) => value is T, fallback: T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`app.${APP_ID}.${key}`) ?? "null");
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

const is_volume = (value: unknown): value is number => typeof value === "number" && value >= 0 && value <= 1;
const is_mode = (value: unknown): value is PlayMode => PLAY_MODES.includes(value as PlayMode);

// One per page, shared by every window and the shell, so sounds started anywhere show and stop everywhere. With no
// window holding it, it closes once the last sound ends; closing the last window stops every sound, as before.
let shared: SoundPlayer | null = null;
let refs = 0;

export function sound_player(): SoundPlayer {
  if (shared) return shared;
  const player: SoundPlayer = new SoundPlayer(
    (sound) => read_sound(kernel.service<FilesService>("files"), sound),
    () => {
      if (refs > 0 || shared !== player) return;
      player.close();
      shared = null;
    }
  );
  player.set_volume(stored("volume", is_volume, 0.8));
  player.mode = stored("mode", is_mode, PlayMode.RESTART);
  shared = player;
  return player;
}

export function stop_everything(): number {
  if (!shared) return 0;
  const count = [...shared.playing.values()].reduce((sum, state) => sum + state.count, 0);
  shared.stop_all();
  return count;
}

export function acquire_player(): { player: SoundPlayer; release: () => void } {
  const player = sound_player();
  refs++;
  let released = false;
  return {
    player,
    release() {
      if (released) return;
      released = true;
      if (--refs > 0) return;
      player.close();
      if (shared === player) shared = null;
    },
  };
}
