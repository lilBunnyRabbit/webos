import { beep_period } from "./sensors";

const PITCH = 1750;
const BEEP = 0.07;
const VOLUME = 0.06;

export class Sounds {
  private context: AudioContext | null = null;
  private tone: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private next_beep = 0;

  private audio(): AudioContext | null {
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

  private blip(frequency: number, at: number, length: number, volume = VOLUME, type: OscillatorType = "sine") {
    const audio = this.audio();
    if (!audio) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.005);
    gain.gain.setValueAtTime(volume, at + length - 0.01);
    gain.gain.linearRampToValueAtTime(0, at + length);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
  }

  sensor(distance: number | null) {
    const audio = distance === null ? this.context : this.audio();
    if (!audio) return;
    const period = distance === null ? null : beep_period(distance);
    if (period === 0) {
      if (!this.tone) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = PITCH;
        gain.gain.setValueAtTime(0, audio.currentTime);
        gain.gain.linearRampToValueAtTime(VOLUME, audio.currentTime + 0.01);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start();
        this.tone = { oscillator, gain };
      }
      return;
    }
    this.stop_tone();
    if (period === null) {
      this.next_beep = 0;
      return;
    }
    const now = audio.currentTime;
    if (now < this.next_beep) {
      this.next_beep = Math.min(this.next_beep, now + period);
      return;
    }
    this.blip(PITCH, now, BEEP);
    this.next_beep = now + BEEP + period;
  }

  crash() {
    this.quiet();
    const audio = this.audio();
    if (!audio) return;
    const at = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(150, at);
    oscillator.frequency.exponentialRampToValueAtTime(55, at + 0.22);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.14, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.26);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.28);
  }

  parked(record = false) {
    this.quiet();
    const audio = this.audio();
    if (!audio) return;
    const at = audio.currentTime;
    this.blip(880, at, 0.09);
    this.blip(1320, at + 0.11, 0.14);
    if (record) this.blip(1760, at + 0.27, 0.2);
  }

  shift() {
    const audio = this.audio();
    if (audio) this.blip(2400, audio.currentTime, 0.025, VOLUME * 0.35, "triangle");
  }

  quiet() {
    this.stop_tone();
    this.next_beep = 0;
  }

  close() {
    this.quiet();
    void this.context?.close();
    this.context = null;
  }

  private stop_tone() {
    if (!this.tone || !this.context) return;
    const { oscillator, gain } = this.tone;
    gain.gain.setValueAtTime(gain.gain.value, this.context.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.02);
    oscillator.stop(this.context.currentTime + 0.03);
    this.tone = null;
  }
}
