// The channels made audible. Each meridian takes a degree of the pentatonic
// scale that underlies the 궁상각치우 (宮商角徵羽) five-tone system: press a point
// and its channel sounds, trace a channel and the tone bends up its length, and
// when all six open the whole pentatonic blooms as one chord. This is the sonic
// twin of the Five Elements colour already carried on screen; the precise
// element-to-degree mapping is documented for the paper, not decoded by ear.

// Pentatonic degrees (C major pentatonic), one per arm channel, low to high.
export const NOTES: Record<string, number> = {
  LU: 293.66, // D4
  PC: 329.63, // E4
  HT: 392.0, // G4
  LI: 440.0, // A4
  SI: 523.25, // C5
  TE: 587.33, // D5
};

// The six-channels-open chord: the full pentatonic sounded together.
export const FINALE_CHORD = [293.66, 329.63, 392.0, 440.0, 523.25];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

// A single voice held open while the fingertip traces a channel.
let glideOsc: OscillatorNode | null = null;
let glideGain: GainNode | null = null;

// A soft reverb the pad voice sends to, so wakes bloom into space and dissolve.
let reverb: ConvolverNode | null = null;

function makeImpulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function initAudio(): void {
  if (ctx) return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? 0.9 : 0;
  master.connect(ctx.destination);
  reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 3.4, 2.6);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.85;
  reverb.connect(reverbReturn).connect(master);
}

export function resumeAudio(): void {
  ctx?.resume().catch(() => {});
}

export function setMuted(muted: boolean): void {
  enabled = !muted;
  if (master && ctx) master.gain.setTargetAtTime(enabled ? 0.9 : 0, ctx.currentTime, 0.02);
}

interface ToneOpts {
  dur?: number;
  type?: OscillatorType;
  gain?: number;
}

/** A soft enveloped note, rounded by a lowpass. */
export function pluck(freq: number, opts: ToneOpts = {}): void {
  if (!ctx || !master || !enabled) return;
  const { dur = 0.9, type = 'triangle', gain = 0.2 } = opts;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(4200, freq * 6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp).connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A fuller two-layer note for the moment a channel opens. */
export function bloom(freq: number): void {
  pluck(freq, { dur: 1.5, gain: 0.24, type: 'sine' });
  pluck(freq * 1.5, { dur: 1.5, gain: 0.1, type: 'sine' });
}

/** Hold or bend a continuous tone while a channel is being traced. */
export function glide(freq: number): void {
  if (!ctx || !master || !enabled) return;
  if (!glideOsc) {
    glideOsc = ctx.createOscillator();
    glideOsc.type = 'sine';
    glideGain = ctx.createGain();
    glideGain.gain.setValueAtTime(0, ctx.currentTime);
    glideGain.gain.linearRampToValueAtTime(0.13, ctx.currentTime + 0.08);
    glideOsc.connect(glideGain).connect(master);
    glideOsc.start();
  }
  glideOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
}

export function glideOff(): void {
  if (!ctx || !glideOsc || !glideGain) return;
  const o = glideOsc;
  const g = glideGain;
  glideOsc = null;
  glideGain = null;
  g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  o.stop(ctx.currentTime + 0.5);
}

/** A soft sustained pad: slow swell, long fade, a warm sub and gentle detune,
    sent to reverb so it blooms into space. Meditative, for the element orbs. */
export function pad(freq: number): void {
  if (!ctx || !master || !enabled) return;
  const t = ctx.currentTime;
  const layers: Array<[number, number]> = [[0.5, 0.06], [1, 0.12], [2, 0.045], [3, 0.022]];
  layers.forEach(([mult, g], i) => {
    const o = ctx!.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    o.detune.value = (i - 1.5) * 4; // slight shimmer between layers
    const lp = ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(2600, freq * 3);
    const gain = ctx!.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(g, t + 0.7); // slow swell, matches the light
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 4.5); // long fade
    o.connect(lp).connect(gain);
    gain.connect(master!); // dry
    if (reverb) gain.connect(reverb); // wet
    o.start(t);
    o.stop(t + 4.6);
  });
}

/** The finale: the pentatonic sounded as a slow rising arpeggio. */
export function finale(freqs: number[]): void {
  if (!ctx) return;
  freqs.forEach((f, i) => {
    window.setTimeout(() => pluck(f, { dur: 2.4, gain: 0.18, type: 'sine' }), i * 150);
  });
}
