import { Engine as EngineKind } from "./plane";

const VOLUME = 0.06;

interface Engine {
  low: OscillatorNode;
  high: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  wind: AudioBufferSourceNode;
  wind_filter: BiquadFilterNode;
  wind_gain: GainNode;
  horn: OscillatorNode;
  horn_gain: GainNode;
  rumble_filter: BiquadFilterNode;
  rumble_gain: GainNode;
}

export class Sounds {
  private context: AudioContext | null = null;
  private engine: Engine | null = null;

  constructor(private readonly enabled: () => boolean) {}

  private audio(): AudioContext | null {
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

  private noise(audio: AudioContext, seconds: number): AudioBuffer {
    const buffer = audio.createBuffer(1, Math.round(audio.sampleRate * seconds), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private build(audio: AudioContext): Engine {
    const low = audio.createOscillator();
    const high = audio.createOscillator();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    low.type = "sawtooth";
    high.type = "square";
    filter.type = "lowpass";
    filter.frequency.value = 400;
    gain.gain.value = 0;
    low.connect(filter);
    high.connect(filter);
    filter.connect(gain).connect(audio.destination);
    const wind = audio.createBufferSource();
    wind.buffer = this.noise(audio, 2);
    wind.loop = true;
    const wind_filter = audio.createBiquadFilter();
    wind_filter.type = "bandpass";
    wind_filter.Q.value = 0.7;
    const wind_gain = audio.createGain();
    wind_gain.gain.value = 0;
    wind.connect(wind_filter).connect(wind_gain).connect(audio.destination);
    const rumble_filter = audio.createBiquadFilter();
    rumble_filter.type = "lowpass";
    rumble_filter.frequency.value = 90;
    const rumble_gain = audio.createGain();
    rumble_gain.gain.value = 0;
    wind.connect(rumble_filter).connect(rumble_gain).connect(audio.destination);
    const horn = audio.createOscillator();
    horn.type = "triangle";
    horn.frequency.value = 880;
    const horn_gain = audio.createGain();
    horn_gain.gain.value = 0;
    horn.connect(horn_gain).connect(audio.destination);
    low.start();
    high.start();
    wind.start();
    horn.start();
    return { low, high, filter, gain, wind, wind_filter, wind_gain, horn, horn_gain, rumble_filter, rumble_gain };
  }

  /**
   * Every frame: the engine's spool (0 to 1), airspeed as a share of cruise, whether the stall horn sounds, how far the
   * wing's flow has broken away (the buffet's rumble) and airspeed in m/s for the wind. A jet whines with its spool
   * alone; a glider has only the wind.
   */
  drone(engine: EngineKind, spool: number, cruise_share: number, stall: boolean, buffet: number, airspeed: number) {
    const audio = this.engine ? this.context : this.audio();
    if (!audio) return;
    this.engine ??= this.build(audio);
    const e = this.engine;
    const now = audio.currentTime;
    const jet = engine === EngineKind.JET;
    // A fixed-pitch prop: the airflow drives it, so the note rises in a dive and sags in a climb.
    const rpm = jet ? 70 + spool * 190 : (22 + spool * 30) * (0.85 + 0.3 * Math.min(1.6, cruise_share));
    e.low.frequency.setTargetAtTime(rpm, now, 0.2);
    e.high.frequency.setTargetAtTime(rpm * (jet ? 3.02 : 2), now, 0.2);
    e.filter.frequency.setTargetAtTime(jet ? 700 + spool * 2400 : 300 + spool * 900, now, 0.2);
    e.gain.gain.setTargetAtTime(engine === EngineKind.NONE ? 0 : VOLUME * (0.25 + spool * 0.9), now, 0.2);
    const wind = Math.min(1, airspeed / 45);
    e.wind_filter.frequency.setTargetAtTime(300 + wind * 1400, now, 0.3);
    e.wind_gain.gain.setTargetAtTime(VOLUME * 1.6 * wind * wind, now, 0.3);
    e.horn_gain.gain.setTargetAtTime(stall ? VOLUME * 0.7 : 0, now, 0.03);
    e.rumble_gain.gain.setTargetAtTime(VOLUME * 6 * Math.min(1, buffet), now, 0.08);
  }

  chirp(sink: number) {
    const audio = this.audio();
    if (!audio) return;
    const share = Math.min(1, sink / 2);
    const source = audio.createBufferSource();
    source.buffer = this.noise(audio, 0.25);
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800 - share * 900;
    const gain = audio.createGain();
    const at = audio.currentTime;
    gain.gain.setValueAtTime(VOLUME * (0.6 + share * 2), at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12 + share * 0.15);
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(at);
  }

  /** The gear taking the weight: a low thud, louder with the sink. */
  thump(sink: number) {
    const audio = this.audio();
    if (!audio) return;
    const share = Math.min(1, sink / 2.5);
    const at = audio.currentTime;
    const oscillator = audio.createOscillator();
    oscillator.frequency.setValueAtTime(90, at);
    oscillator.frequency.exponentialRampToValueAtTime(45, at + 0.18);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(VOLUME * (1 + share * 5), at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.25);
  }

  crash() {
    const audio = this.audio();
    if (!audio) return;
    const at = audio.currentTime;
    const source = audio.createBufferSource();
    source.buffer = this.noise(audio, 0.8);
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(VOLUME * 4, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(at);
  }

  pick() {
    const audio = this.audio();
    if (!audio) return;
    const at = audio.currentTime;
    for (const [frequency, delay] of [
      [440, 0],
      [660, 0.09],
    ]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at + delay);
      gain.gain.linearRampToValueAtTime(VOLUME, at + delay + 0.01);
      gain.gain.linearRampToValueAtTime(0, at + delay + 0.1);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at + delay);
      oscillator.stop(at + delay + 0.12);
    }
  }

  quiet() {
    if (!this.engine || !this.context) return;
    const e = this.engine;
    const now = this.context.currentTime;
    for (const gain of [e.gain, e.wind_gain, e.horn_gain, e.rumble_gain]) gain.gain.setTargetAtTime(0, now, 0.05);
    for (const node of [e.low, e.high, e.wind, e.horn]) node.stop(now + 0.3);
    this.engine = null;
  }

  close() {
    this.quiet();
    void this.context?.close();
    this.context = null;
  }
}
