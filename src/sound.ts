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

/** A singing-bowl voice: inharmonic struck-metal partials (a strong ~2.76
    overtone), each a pair of near-equal frequencies whose slow beating gives the
    bowl's shimmer, higher partials dying first, a long ring through reverb. */
export function pad(freq: number): void {
  if (!ctx || !master || !enabled) return;
  const t = ctx.currentTime;
  // ratios and per-partial decay of a struck bowl: fundamental + the 2.76 sing
  const partials: Array<{ mul: number; gain: number; decay: number }> = [
    { mul: 1.0, gain: 0.11, decay: 8.5 },
    { mul: 2.01, gain: 0.035, decay: 6.0 },
    { mul: 2.76, gain: 0.075, decay: 6.5 }, // the singing overtone
    { mul: 3.93, gain: 0.022, decay: 4.0 },
    { mul: 5.42, gain: 0.014, decay: 2.6 }, // metallic sparkle, dies first
  ];
  for (const p of partials) {
    const base = freq * p.mul;
    for (const beat of [-0.5, 0.5]) { // two voices, slow beating shimmer
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base + beat;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p.gain, t + 0.16); // soft mallet
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay); // long ring
      o.connect(g);
      g.connect(master!); // dry
      if (reverb) g.connect(reverb); // wet
      o.start(t);
      o.stop(t + p.decay + 0.1);
    }
  }
}

// --- Body-register voices: element materials (오행) and the stone chime (편경) ---

function voiceOut(node: AudioNode): void {
  node.connect(master!); // dry
  if (reverb) node.connect(reverb); // wet
}

/** One enveloped oscillator partial. */
function partial(freq: number, gain: number, attack: number, decay: number, type: OscillatorType = 'sine'): void {
  const t = ctx!.currentTime;
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g);
  voiceOut(g);
  o.start(t);
  o.stop(t + decay + 0.05);
}

/** A band-passed noise transient, for the attack of a struck material. */
function noiseHit(center: number, q: number, peak: number, decay: number): void {
  const t = ctx!.currentTime;
  const len = Math.floor(ctx!.sampleRate * decay) + 1;
  const buf = ctx!.createBuffer(1, len, ctx!.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx!.createBufferSource();
  src.buffer = buf;
  const bp = ctx!.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = center;
  bp.Q.value = q;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(bp).connect(g);
  voiceOut(g);
  src.start(t);
  src.stop(t + decay + 0.02);
}

/** 편경, the stone chime: a clean, bright, pure struck tone, few partials. */
export function chime(freq: number): void {
  if (!ctx || !master || !enabled) return;
  partial(freq, 0.13, 0.004, 2.0);
  partial(freq * 2.7, 0.05, 0.004, 1.5);
  partial(freq * 5.1, 0.02, 0.004, 0.9);
}

// Metal 金: a bronze bell.
function bell(freq: number): void {
  partial(freq, 0.1, 0.006, 3.0);
  partial(freq * 2.4, 0.05, 0.006, 2.2);
  partial(freq * 3.9, 0.03, 0.006, 1.5);
  partial(freq * 5.3, 0.02, 0.006, 1.0);
}

// Wood 木: a 목탁, the hollow wooden knock.
function woodblock(freq: number): void {
  partial(freq * 1.5, 0.12, 0.002, 0.14, 'triangle');
  partial(freq * 2.9, 0.05, 0.002, 0.08, 'triangle');
  noiseHit(1400, 6, 0.1, 0.05);
}

// Water 水: a soft droplet, a quick downward plip.
function droplet(freq: number): void {
  const t = ctx!.currentTime;
  const o = ctx!.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.9, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.9, t + 0.13);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.14, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(g);
  voiceOut(g);
  o.start(t);
  o.stop(t + 0.55);
}

// Fire 火: a warm breathy reed with a little vibrato.
function reed(freq: number): void {
  const t = ctx!.currentTime;
  const o = ctx!.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  const lp = ctx!.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = freq * 4;
  lp.Q.value = 1.5;
  const lfo = ctx!.createOscillator();
  lfo.frequency.value = 5.5;
  const lfoG = ctx!.createGain();
  lfoG.gain.value = freq * 0.012;
  lfo.connect(lfoG).connect(o.frequency);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.07, t + 0.09);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
  o.connect(lp).connect(g);
  voiceOut(g);
  lfo.start(t);
  o.start(t);
  lfo.stop(t + 1.8);
  o.stop(t + 1.8);
}

// Earth 土: a deep, soft clay/frame drum thud.
function drum(freq: number): void {
  const t = ctx!.currentTime;
  const o = ctx!.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 0.5 * 1.4, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.08);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g);
  voiceOut(g);
  o.start(t);
  o.stop(t + 0.65);
  noiseHit(140, 2, 0.06, 0.1);
}

/** The 오행 voice: each element sounds as its own material. */
export function material(element: string, freq: number): void {
  if (!ctx || !master || !enabled) return;
  switch (element) {
    case 'Metal': return bell(freq);
    case 'Wood': return woodblock(freq);
    case 'Water': return droplet(freq);
    case 'Fire': return reed(freq);
    case 'Earth': return drum(freq);
    default: return bell(freq);
  }
}

/** The finale: the pentatonic sounded as a slow rising arpeggio. */
export function finale(freqs: number[]): void {
  if (!ctx) return;
  freqs.forEach((f, i) => {
    window.setTimeout(() => pluck(f, { dur: 2.4, gain: 0.18, type: 'sine' }), i * 150);
  });
}
