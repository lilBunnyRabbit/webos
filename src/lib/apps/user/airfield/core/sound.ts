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
    return { low, high, filter, gain, wind, wind_filter, wind_gain, horn, horn_gain };
  }

  /** Every frame: the engine's spool (0 to 1), airspeed in m/s and whether the stall horn sounds. */
  drone(spool: number, airspeed: number, stall: boolean) {
    const audio = this.engine ? this.context : this.audio();
    if (!audio) return;
    this.engine ??= this.build(audio);
    const e = this.engine;
    const now = audio.currentTime;
    const rpm = 22 + spool * 30 + airspeed * 0.25;
    e.low.frequency.setTargetAtTime(rpm, now, 0.2);
    e.high.frequency.setTargetAtTime(rpm * 2, now, 0.2);
    e.filter.frequency.setTargetAtTime(300 + spool * 900, now, 0.2);
    e.gain.gain.setTargetAtTime(VOLUME * (0.25 + spool * 0.9), now, 0.2);
    const wind = Math.min(1, airspeed / 45);
    e.wind_filter.frequency.setTargetAtTime(300 + wind * 1400, now, 0.3);
    e.wind_gain.gain.setTargetAtTime(VOLUME * 1.6 * wind * wind, now, 0.3);
    e.horn_gain.gain.setTargetAtTime(stall ? VOLUME * 0.7 : 0, now, 0.03);
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
    for (const gain of [e.gain, e.wind_gain, e.horn_gain]) gain.gain.setTargetAtTime(0, now, 0.05);
    for (const node of [e.low, e.high, e.wind, e.horn]) node.stop(now + 0.3);
    this.engine = null;
  }

  close() {
    this.quiet();
    void this.context?.close();
    this.context = null;
  }
}
