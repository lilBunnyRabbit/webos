import { GameSounds } from "$kit/games/play2d/sound";

const VOLUME = 0.06;
const PUFF_GAP = 0.11;

interface Engine {
  roar: AudioBufferSourceNode;
  roar_filter: BiquadFilterNode;
  roar_gain: GainNode;
  rumble: OscillatorNode;
  rumble_gain: GainNode;
}

/** The engine's roar with the spool, RCS puffs while turning, the legs taking the weight, a crash and the chimes. */
export class Sounds extends GameSounds {
  private engine: Engine | null = null;
  private last_puff = 0;

  private build(audio: AudioContext): Engine {
    const roar = audio.createBufferSource();
    roar.buffer = this.noise(audio, 2);
    roar.loop = true;
    const roar_filter = audio.createBiquadFilter();
    roar_filter.type = "lowpass";
    roar_filter.frequency.value = 300;
    const roar_gain = audio.createGain();
    roar_gain.gain.value = 0;
    roar.connect(roar_filter).connect(roar_gain).connect(audio.destination);
    const rumble = audio.createOscillator();
    rumble.type = "sawtooth";
    rumble.frequency.value = 38;
    const rumble_filter = audio.createBiquadFilter();
    rumble_filter.type = "lowpass";
    rumble_filter.frequency.value = 120;
    const rumble_gain = audio.createGain();
    rumble_gain.gain.value = 0;
    rumble.connect(rumble_filter).connect(rumble_gain).connect(audio.destination);
    roar.start();
    rumble.start();
    return { roar, roar_filter, roar_gain, rumble, rumble_gain };
  }

  /** Every frame: the main engine's spool (0 to 1), how hard the RCS or the split is working, and a bigger ship's lower note. */
  drone(spool: number, turning: number, pitch = 1, rcs = true) {
    const audio = this.engine ? this.context : this.audio();
    if (!audio) return;
    this.engine ??= this.build(audio);
    const e = this.engine;
    const now = audio.currentTime;
    e.roar_filter.frequency.setTargetAtTime((220 + spool * 1300) * pitch, now, 0.08);
    e.roar_gain.gain.setTargetAtTime(VOLUME * 2.4 * spool, now, 0.06);
    e.rumble.frequency.setTargetAtTime((32 + spool * 22) * pitch, now, 0.1);
    e.rumble_gain.gain.setTargetAtTime(VOLUME * 1.2 * spool, now, 0.08);
    if (rcs && Math.abs(turning) > 0.15 && now - this.last_puff > PUFF_GAP) {
      this.last_puff = now;
      this.puff(audio, Math.min(1, Math.abs(turning)));
    }
  }

  private puff(audio: AudioContext, share: number) {
    const source = audio.createBufferSource();
    source.buffer = this.noise(audio, 0.12);
    const filter = audio.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2200;
    const gain = audio.createGain();
    const at = audio.currentTime;
    gain.gain.setValueAtTime(VOLUME * (0.4 + share * 0.6), at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(at);
  }

  /** The legs taking the weight: a thud and a creak, louder with the sink. */
  touchdown(sink: number) {
    const audio = this.audio();
    if (!audio) return;
    const share = Math.min(1, sink / 2.5);
    const at = audio.currentTime;
    const thud = audio.createOscillator();
    thud.frequency.setValueAtTime(80, at);
    thud.frequency.exponentialRampToValueAtTime(40, at + 0.2);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(VOLUME * (1.2 + share * 5), at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
    thud.connect(gain).connect(audio.destination);
    thud.start(at);
    thud.stop(at + 0.3);
    const creak = audio.createOscillator();
    creak.type = "triangle";
    creak.frequency.setValueAtTime(320 + share * 200, at + 0.03);
    creak.frequency.exponentialRampToValueAtTime(180, at + 0.2);
    const creak_gain = audio.createGain();
    creak_gain.gain.setValueAtTime(0, at);
    creak_gain.gain.linearRampToValueAtTime(VOLUME * 0.5, at + 0.05);
    creak_gain.gain.linearRampToValueAtTime(0, at + 0.22);
    creak.connect(creak_gain).connect(audio.destination);
    creak.start(at);
    creak.stop(at + 0.25);
  }

  crash() {
    const audio = this.audio();
    if (!audio) return;
    const at = audio.currentTime;
    const source = audio.createBufferSource();
    source.buffer = this.noise(audio, 0.9);
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(VOLUME * 4, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.8);
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(at);
  }

  chime(notes: readonly number[] = [440, 660]) {
    const audio = this.audio();
    if (!audio) return;
    const at = audio.currentTime;
    notes.forEach((frequency, i) => {
      const start = at + i * 0.1;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(VOLUME, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, start + 0.12);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
    });
  }

  override quiet() {
    if (!this.engine || !this.context) return;
    const e = this.engine;
    const now = this.context.currentTime;
    e.roar_gain.gain.setTargetAtTime(0, now, 0.05);
    e.rumble_gain.gain.setTargetAtTime(0, now, 0.05);
    e.roar.stop(now + 0.3);
    e.rumble.stop(now + 0.3);
    this.engine = null;
  }
}
