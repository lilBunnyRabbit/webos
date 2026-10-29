import { rumble, Rumble } from "./rumble";
import { beep_period } from "./sensors";
import { BLINK_PERIOD } from "./signal";

const PITCH = 1750;
const BEEP = 0.07;
const VOLUME = 0.06;
const ALARM_PITCH = 1040;
const ALARM_BEEP = 0.32;
const ALARM_PERIOD = 0.7;
// Only the last stretch buzzes a controller: the steady tone and the fastest beeps.
const TICK_BELOW = 0.3;
const TONE_TICK = 0.12;

interface SoundSettings {
  sound: boolean;
  rumble: boolean;
}

/** The window's sounds and controller rumble, each behind its own setting. */
export class Sounds {
  private context: AudioContext | null = null;
  private tone: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private next_beep = 0;
  private next_alarm = 0;
  private next_tick = 0;
  private next_click = 0;
  private click_on = true;

  // A getter: the window's settings object is a prop, read fresh on every call.
  constructor(private readonly settings: () => SoundSettings) {}

  private audio(): AudioContext | null {
    if (!this.settings().sound) return null;
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
    const period = distance === null ? null : beep_period(distance);
    this.tick(period);
    const audio = distance === null ? this.context : this.audio();
    if (!audio) return;
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
    this.buzz(Rumble.HIT);
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

  /** Called every frame; it paces itself. */
  reverse_beeper(on: boolean) {
    if (!on) {
      this.next_alarm = 0;
      return;
    }
    const audio = this.audio();
    if (!audio) return;
    const now = audio.currentTime;
    if (now < this.next_alarm) return;
    this.blip(ALARM_PITCH, now, ALARM_BEEP, VOLUME * 0.7, "triangle");
    this.next_alarm = now + ALARM_PERIOD;
  }

  /** Called every frame; the relay clicks on and off with the blinkers. */
  indicator(on: boolean) {
    if (!on) {
      this.next_click = 0;
      this.click_on = true;
      return;
    }
    const audio = this.audio();
    if (!audio) return;
    const now = audio.currentTime;
    if (now < this.next_click) return;
    this.blip(this.click_on ? 1900 : 1500, now, 0.012, VOLUME * 0.5, "square");
    this.click_on = !this.click_on;
    this.next_click = now + BLINK_PERIOD / 2;
  }

  fork(up: boolean) {
    const audio = this.audio();
    if (!audio) return;
    const at = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(up ? 110 : 190, at);
    oscillator.frequency.linearRampToValueAtTime(up ? 190 : 100, at + 0.45);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(VOLUME * 0.45, at + 0.04);
    gain.gain.setValueAtTime(VOLUME * 0.45, at + 0.38);
    gain.gain.linearRampToValueAtTime(0, at + 0.48);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.5);
  }

  quiet() {
    this.stop_tone();
    this.next_beep = 0;
    this.next_alarm = 0;
    this.next_tick = 0;
    this.next_click = 0;
    this.click_on = true;
  }

  close() {
    this.quiet();
    void this.context?.close();
    this.context = null;
  }

  // Paced on the page's clock rather than the audio's, so a muted window still ticks the controller.
  private tick(period: number | null) {
    const now = performance.now() / 1000;
    if (period === null || period >= TICK_BELOW) {
      this.next_tick = 0;
      return;
    }
    if (now < this.next_tick) return;
    this.buzz(Rumble.TICK);
    this.next_tick = now + (period === 0 ? TONE_TICK : BEEP + period);
  }

  private buzz(kind: Rumble) {
    if (this.settings().rumble) rumble(kind);
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
