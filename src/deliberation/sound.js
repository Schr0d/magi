const A5 = 880;
const A6 = 1760;

const CUES = {
  access: [
    { frequency: A6, duration: 0.28, delay: 0, type: 'sine', gain: 0.026 },
  ],
  submit: [
    { frequency: A6, duration: 0.36, delay: 0, type: 'sine', gain: 0.03 },
  ],
  vote: [
    { frequency: A6, duration: 0.16, delay: 0, type: 'sine', gain: 0.026 },
    { frequency: A6, duration: 0.16, delay: 0.35, type: 'sine', gain: 0.026 },
  ],
  accepted: [
    { frequency: A5, duration: 1.25, delay: 0, type: 'sine', gain: 0.028 },
  ],
  rejected: [
    { frequency: A5, duration: 1.25, delay: 0, type: 'sine', gain: 0.03 },
  ],
  error: [
    { frequency: A5, duration: 1.25, delay: 0, type: 'sine', gain: 0.032 },
  ],
};

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

export function createMagiSoundSystem() {
  let context = null;
  let armed = false;

  async function unlock() {
    const AudioContext = getAudioContext();
    if (!AudioContext) return false;

    if (!context) context = new AudioContext();
    if (context.state === 'suspended') await context.resume();
    armed = context.state === 'running';
    return armed;
  }

  function play(cueName) {
    if (!armed || !context) return;
    const cue = CUES[cueName];
    if (!cue) return;

    const now = context.currentTime;
    for (const step of cue) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + step.delay;
      const end = start + step.duration;
      const attack = Math.min(0.012, step.duration * 0.18);
      const release = Math.min(0.12, step.duration * 0.32);
      const sustainUntil = Math.max(start + attack, end - release);

      oscillator.type = step.type;
      oscillator.frequency.setValueAtTime(step.frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(step.gain, start + attack);
      gain.gain.setValueAtTime(step.gain, sustainUntil);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.01);
    }
  }

  return {
    unlock,
    play,
    isArmed: () => armed,
  };
}
