let context: AudioContext | null = null;

// Browsers only let an AudioContext start from a user gesture; resuming it on Start keeps it allowed for the phase end.
export function prime_audio(): void {
  context ??= new AudioContext();
  void context.resume();
}

export function chime(): void {
  context ??= new AudioContext();
  const audio = context;
  const at = audio.currentTime + 0.02;
  [659.25, 987.77].forEach((frequency, index) => {
    const start = at + index * 0.22;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 1.5);
  });
}
