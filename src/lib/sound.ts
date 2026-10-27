/**
 * Board sounds, synthesised.
 *
 * No audio files: the whole set is a few oscillators and an envelope,
 * which means nothing to download, nothing to cache, and no licence to
 * worry about. A move should sound like a piece being set down — short,
 * dry, slightly woody — not like a notification.
 */

const STORAGE_KEY = "glyph.sound";

let ctx: AudioContext | null = null;
let muted: boolean | null = null;

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  // Browsers suspend audio until the page has been interacted with.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function isMuted(): boolean {
  if (muted !== null) return muted;
  try {
    muted = localStorage.getItem(STORAGE_KEY) === "off";
  } catch {
    muted = false;
  }
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "off" : "on");
  } catch {
    /* the choice still holds for this session */
  }
}

interface ToneSpec {
  freq: number;
  to?: number;      // sweep target
  dur: number;      // seconds
  gain?: number;
  type?: OscillatorType;
  delay?: number;   // seconds from now
}

function tone({ freq, to, dur, gain = 0.14, type = "triangle", delay = 0 }: ToneSpec) {
  const ac = audio();
  if (!ac) return;

  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);

  // Fast attack, exponential decay — the shape of something struck.
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A pinch of noise gives the attack its wooden edge. */
function click(gain = 0.08, dur = 0.03) {
  const ac = audio();
  if (!ac) return;

  const frames = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 3;
  }

  const src = ac.createBufferSource();
  src.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1600;
  filter.Q.value = 0.8;

  const amp = ac.createGain();
  amp.gain.value = gain;

  src.connect(filter).connect(amp).connect(ac.destination);
  src.start();
}

function guard(): boolean {
  return !isMuted();
}

export function playMove() {
  if (!guard()) return;
  click(0.07);
  tone({ freq: 330, to: 230, dur: 0.07, gain: 0.1 });
}

export function playCapture() {
  if (!guard()) return;
  click(0.13, 0.045);
  tone({ freq: 190, to: 110, dur: 0.11, gain: 0.15 });
}

export function playCheck() {
  if (!guard()) return;
  tone({ freq: 740, dur: 0.07, gain: 0.11, type: "square" });
  tone({ freq: 988, dur: 0.1, gain: 0.1, type: "square", delay: 0.08 });
}

export function playEnd(won: boolean | null) {
  if (!guard()) return;
  // Win rises, loss falls, draw sits still.
  const notes = won === true ? [523, 659, 880] : won === false ? [587, 494, 392] : [523, 523, 523];
  notes.forEach((f, i) => tone({ freq: f, dur: 0.22, gain: 0.1, type: "sine", delay: i * 0.11 }));
}

export function playNotify() {
  if (!guard()) return;
  tone({ freq: 880, dur: 0.09, gain: 0.08, type: "sine" });
}

/** Someone wants a game. Two rising notes — a knock, not an alarm. */
export function playChallenge() {
  if (!guard()) return;
  tone({ freq: 659, dur: 0.13, gain: 0.1, type: "sine" });
  tone({ freq: 988, dur: 0.18, gain: 0.1, type: "sine", delay: 0.13 });
}

/** Your clock is getting short. Dry and sharp, impossible to miss. */
export function playLowTime() {
  if (!guard()) return;
  tone({ freq: 1250, dur: 0.05, gain: 0.1, type: "square" });
}

/** Pick the right sound for a move written in algebraic notation. */
export function playForSan(san: string) {
  if (san.includes("#")) return;        // the end sound covers mate
  if (san.includes("+")) return playCheck();
  if (san.includes("x")) return playCapture();
  return playMove();
}
