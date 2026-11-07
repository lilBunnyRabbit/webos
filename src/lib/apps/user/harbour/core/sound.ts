import { GameSounds } from "$kit/games/play2d/sound";

const VOLUME = 0.06;

/** The window's sounds: an engine drone that follows the thrust, gear clunks, fender squeaks, a crash and the lines. */
export class Sounds extends GameSounds {
  private engine: { low: OscillatorNode; high: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

  private blip(frequency: number, at: number, length: number, volume = VOLUME, type: OscillatorType = "sine", to?: number) {
    const audio = this.audio();
    if (!audio) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (to) oscillator.frequency.exponentialRampToValueAtTime(to, at + length);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.008);
    gain.gain.setValueAtTime(volume, at + length * 0.6);
    gain.gain.linearRampToValueAtTime(0, at + length);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
  }

  /** Called every frame with the engine's power (0 to 1) and gear; idles quietly in neutral. `pitch` lowers a bigger engine. */
  drone(power: number, gear: number, pitch = 1) {
    const audio = this.engine ? this.context : this.audio();
    if (!audio) return;
    if (!this.engine) {
      const low = audio.createOscillator();
      const high = audio.createOscillator();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      low.type = "sawtooth";
      high.type = "triangle";
      filter.type = "lowpass";
      filter.frequency.value = 320;
      gain.gain.value = 0;
      low.connect(filter);
      high.connect(filter);
      filter.connect(gain).connect(audio.destination);
      low.start();
      high.start();
      this.engine = { low, high, gain, filter };
    }
    const now = audio.currentTime;
    const rpm = (38 + power * 46) * pitch;
    this.engine.low.frequency.setTargetAtTime(rpm, now, 0.15);
    this.engine.high.frequency.setTargetAtTime(rpm * 2.02, now, 0.15);
    this.engine.filter.frequency.setTargetAtTime(260 + power * 520, now, 0.2);
    this.engine.gain.gain.setTargetAtTime(VOLUME * (0.35 + power * (gear === 0 ? 0 : 0.9)), now, 0.2);
  }

  shift() {
    const audio = this.audio();
    if (audio) this.blip(110, audio.currentTime, 0.07, VOLUME * 0.9, "square", 70);
  }

  /** A fender squeak, louder and higher the faster the touch. */
  squeak(speed: number) {
    const audio = this.audio();
    if (!audio) return;
    const share = Math.min(1, speed / 0.5);
    this.blip(520 + share * 260, audio.currentTime, 0.12 + share * 0.1, VOLUME * (0.3 + share * 0.8), "triangle", 360 + share * 140);
  }

  crash() {
    const audio = this.audio();
    if (!audio) return;
    this.blip(150, audio.currentTime, 0.3, VOLUME * 2.2, "triangle", 50);
    this.blip(90, audio.currentTime + 0.02, 0.35, VOLUME * 1.4, "sawtooth", 40);
  }

  docked(record = false) {
    const audio = this.audio();
    if (!audio) return;
    const at = audio.currentTime;
    this.blip(660, at, 0.1);
    this.blip(990, at + 0.12, 0.16);
    if (record) this.blip(1320, at + 0.3, 0.22);
  }

  swap() {
    const audio = this.audio();
    if (!audio) return;
    this.blip(440, audio.currentTime, 0.08);
    this.blip(660, audio.currentTime + 0.09, 0.1);
  }

  override quiet() {
    if (!this.engine || !this.context) return;
    const { low, high, gain } = this.engine;
    const now = this.context.currentTime;
    gain.gain.setTargetAtTime(0, now, 0.05);
    low.stop(now + 0.3);
    high.stop(now + 0.3);
    this.engine = null;
  }
}
