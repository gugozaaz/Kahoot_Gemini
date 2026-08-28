// Lightweight game audio engine.
// Every sound is synthesised with the WebAudio API, so the app ships no audio
// assets and works offline. Browsers block audio until a user gesture, so the
// context is created lazily and `unlock()` is called from real clicks.

const MUTE_KEY = 'kamooy:muted';

let ctx = null;
let master = null;
let muted = false;

try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  muted = false;
}

const listeners = new Set();

function notify() {
  listeners.forEach(fn => fn(muted));
}

function ensureCtx() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// One tone: oscillator -> per-note envelope -> master.
function tone({ freq, dur = 0.18, type = 'square', gain = 0.18, at = 0, sweepTo = null }) {
  const c = ensureCtx();
  if (!c || muted) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const env = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur);

  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(env);
  env.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// Short filtered-noise burst, used for whooshes and impacts.
function noise({ dur = 0.3, gain = 0.15, at = 0, from = 3000, to = 300 }) {
  const c = ensureCtx();
  if (!c || muted) return;
  const t0 = c.currentTime + at;
  const frames = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), t0 + dur);
  filter.Q.value = 1.2;

  const env = c.createGain();
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filter);
  filter.connect(env);
  env.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, E6: 1318.5, G6: 1568.0,
};

const effects = {
  // A player appears in the lobby.
  join: () => {
    tone({ freq: NOTE.E5, dur: 0.09, type: 'triangle', gain: 0.16 });
    tone({ freq: NOTE.B5, dur: 0.12, type: 'triangle', gain: 0.13, at: 0.07 });
  },
  // Host presses Start.
  start: () => {
    noise({ dur: 0.45, gain: 0.12, from: 400, to: 4000 });
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) =>
      tone({ freq: f, dur: 0.16, type: 'sawtooth', gain: 0.14, at: i * 0.08 }));
  },
  // 3 - 2 - 1 before a question.
  countdown: () => tone({ freq: NOTE.A5, dur: 0.12, type: 'square', gain: 0.16 }),
  // Question opens for answers.
  go: () => {
    noise({ dur: 0.35, gain: 0.14, from: 600, to: 5000 });
    tone({ freq: NOTE.C5, dur: 0.22, type: 'sawtooth', gain: 0.16, sweepTo: NOTE.C6 });
  },
  // Clock ticking in the final seconds.
  tick: () => tone({ freq: 1200, dur: 0.05, type: 'square', gain: 0.1 }),
  urgentTick: () => tone({ freq: 1600, dur: 0.06, type: 'square', gain: 0.16 }),
  // Player taps an answer pad.
  select: () => {
    tone({ freq: NOTE.G4, dur: 0.07, type: 'square', gain: 0.16 });
    tone({ freq: NOTE.D5, dur: 0.09, type: 'square', gain: 0.12, at: 0.05 });
  },
  // Time is up / reveal.
  reveal: () => {
    noise({ dur: 0.5, gain: 0.16, from: 5000, to: 200 });
    tone({ freq: NOTE.G4, dur: 0.3, type: 'sawtooth', gain: 0.12, sweepTo: NOTE.C4 });
  },
  correct: () => {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) =>
      tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.2, at: i * 0.07 }));
  },
  wrong: () => {
    tone({ freq: 220, dur: 0.35, type: 'sawtooth', gain: 0.16, sweepTo: 90 });
    tone({ freq: 208, dur: 0.35, type: 'square', gain: 0.1, at: 0.02, sweepTo: 85 });
  },
  // A run of correct answers: the higher the streak, the higher the pitch.
  streak: (level = 2) => {
    const base = NOTE.E5 * Math.pow(1.06, Math.min(level, 8));
    [0, 4, 7, 12].forEach((semi, i) =>
      tone({ freq: base * Math.pow(2, semi / 12), dur: 0.16, type: 'triangle', gain: 0.16, at: i * 0.055 }));
  },
  // Leaderboard slides in.
  leaderboard: () => {
    noise({ dur: 0.4, gain: 0.1, from: 300, to: 3500 });
    [NOTE.G4, NOTE.C5, NOTE.E5].forEach((f, i) =>
      tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.13, at: i * 0.09 }));
  },
  rankUp: () => {
    tone({ freq: NOTE.E5, dur: 0.1, type: 'triangle', gain: 0.14 });
    tone({ freq: NOTE.A5, dur: 0.14, type: 'triangle', gain: 0.12, at: 0.08 });
  },
  // Final scoreboard.
  fanfare: () => {
    const seq = [
      [NOTE.C5, 0], [NOTE.E5, 0.11], [NOTE.G5, 0.22], [NOTE.C6, 0.33],
      [NOTE.G5, 0.5], [NOTE.C6, 0.6], [NOTE.E6, 0.72], [NOTE.G6, 0.85],
    ];
    seq.forEach(([f, at]) => {
      tone({ freq: f, dur: 0.28, type: 'triangle', gain: 0.2, at });
      tone({ freq: f / 2, dur: 0.28, type: 'sawtooth', gain: 0.07, at });
    });
    noise({ dur: 0.9, gain: 0.09, at: 0.85, from: 6000, to: 400 });
  },
};

// --- Background music -------------------------------------------------------
// A tiny step sequencer built on the same tone() helper.

const TRACKS = {
  lobby: {
    step: 0.28,
    type: 'triangle',
    gain: 0.05,
    notes: [
      [NOTE.C4, NOTE.E4], null, [NOTE.G4], null,
      [NOTE.A4], null, [NOTE.E4], null,
      [NOTE.F4, NOTE.A4], null, [NOTE.C5], null,
      [NOTE.G4], null, [NOTE.E4], null,
    ],
  },
  question: {
    step: 0.2,
    type: 'square',
    gain: 0.045,
    notes: [
      [NOTE.C4], [NOTE.C4], [NOTE.G4], [NOTE.C4],
      [NOTE.A4], [NOTE.C4], [NOTE.G4], [NOTE.E4],
      [NOTE.F4], [NOTE.C4], [NOTE.A4], [NOTE.C4],
      [NOTE.G4], [NOTE.E4], [NOTE.D4], [NOTE.C4],
    ],
  },
};

let musicTimer = null;
let musicName = null;

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  musicName = null;
}

function playMusic(name) {
  if (musicName === name) return;
  stopMusic();
  const track = TRACKS[name];
  if (!track) return;
  musicName = name;

  let step = 0;
  const playStep = () => {
    if (muted || !musicName) return;
    const chord = track.notes[step % track.notes.length];
    step += 1;
    if (!chord) return;
    chord.forEach(freq => tone({ freq, dur: track.step * 0.85, type: track.type, gain: track.gain }));
  };
  playStep();
  musicTimer = setInterval(playStep, track.step * 1000);
}

export const sfx = {
  ...effects,
  // Call from a real click so the browser lets audio through.
  unlock() {
    ensureCtx();
  },
  isMuted: () => muted,
  setMuted(next) {
    muted = !!next;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
    if (master) master.gain.value = muted ? 0 : 0.6;
    if (muted) stopMusic();
    notify();
  },
  toggleMute() {
    sfx.setMuted(!muted);
    ensureCtx();
    return muted;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  music: playMusic,
  stopMusic,
};

export default sfx;
