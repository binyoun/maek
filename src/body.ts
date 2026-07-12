import { initPose, detectPose, P } from './pose';
import { initHands, detect } from './hands';
import { solveBody, UNSEEN } from './bodypoints';
import { personalCun, solvePoint, type Vec2 } from './cun';
import { ACUPOINTS } from './acupoints';
import { containRect, mapPoint } from './draw';
import { KORYO_LEGEND, ELEMENT_NOTE, ELEMENT_COLOR, ELEMENTS, solveKoryo, type Element } from './koryo';
import { burst, stream, ambient, updateMotes, drawMotes } from './particles';
import * as sound from './sound';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

type HandMap = 'transport' | 'koryo';

// A glowable point, from the body (pose) or a hand. armSide is set for arm
// points so a hand never resonates with its own arm, only a deliberate reach.
interface Glow { element: Element; color: string; pos: Vec2; label: string; armSide?: 'L' | 'R' }

// Five Transport points (오수혈 / 五輸穴): the distal points of each channel are
// themselves assigned the five elements (井 well, 滎 spring, 輸 stream ...), so
// colouring by that element makes the WHO hand span all five, not only its
// channel's Metal or Fire. Only the transport points we already place are mapped.
const TRANSPORT_ELEMENT: Record<string, Element> = {
  LU11: 'Wood', LU10: 'Fire', LU9: 'Earth', // Lung (yin): 井滎輸
  PC9: 'Wood', PC8: 'Fire', PC7: 'Earth', // Pericardium (yin)
  HT9: 'Wood', HT8: 'Fire', HT7: 'Earth', // Heart (yin)
  LI1: 'Metal', LI3: 'Wood', // Large Intestine (yang)
  SI1: 'Metal', SI2: 'Water', SI3: 'Wood', // Small Intestine (yang)
  TE1: 'Metal', TE2: 'Water', TE3: 'Wood', // Triple Energizer (yang)
};

function solveHand(hlm: NormalizedLandmark[], mode: HandMap): Glow[] {
  const cun = personalCun(hlm);
  if (mode === 'koryo') {
    return [...solveKoryo(hlm, cun, 'palmar'), ...solveKoryo(hlm, cun, 'dorsal')]
      .filter((k) => k.element !== 'Vessel')
      .map((k) => ({ element: k.element, color: k.color, pos: k.pos, label: `${k.id} ${k.ko}` }));
  }
  const out: Glow[] = [];
  for (const id of Object.keys(TRANSPORT_ELEMENT)) {
    const ap = ACUPOINTS[id];
    if (!ap) continue;
    const el = TRANSPORT_ELEMENT[id]!;
    out.push({ element: el, color: ELEMENT_COLOR[el], pos: solvePoint(hlm, ap.rule, cun), label: id });
  }
  return out;
}

// The body register of Maek (Tier 3). The hand carries a moving constellation of
// element points; the body carries fixed ones. When a hand point meets a body
// point of the SAME element, like resonates with like: both light and the
// element's 오행 tone sounds. Move your hand across your body to play it.

const ENCOUNTER = 0.045; // normalized distance at which like meets like
const GLOW_MS = 2600; // how long a struck element stays lit

const litAt: Partial<Record<Element, number>> = {};
const armed: Partial<Record<Element, boolean>> = {};
let handMap: HandMap = 'transport';
let lastNow = 0;

function colorA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function glow(el: Element, now: number): number {
  const t = litAt[el];
  return t == null ? 0 : Math.max(0, 1 - (now - t) / GLOW_MS);
}

const startBtn = document.getElementById('start') as HTMLButtonElement;
const startWrap = document.getElementById('start-wrap')!;
const video = document.getElementById('video') as HTMLVideoElement;
const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const panel = document.getElementById('panel')!;
const statusEl = document.getElementById('status')!;
const labelToggle = document.getElementById('t-labels') as HTMLInputElement;
const handMapBtn = document.getElementById('t-handmap') as HTMLButtonElement;
handMapBtn.addEventListener('click', () => {
  handMap = handMap === 'transport' ? 'koryo' : 'transport';
  handMapBtn.textContent = handMap === 'transport' ? 'hand: 오수혈' : 'hand: 고려수지침';
});

let running = false;

async function start(): Promise<void> {
  startBtn.disabled = true;
  startBtn.textContent = 'loading model...';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    await initPose();
    await initHands(2);
  } catch (err) {
    console.error(err);
    startBtn.disabled = false;
    startBtn.textContent = 'camera blocked, retry';
    return;
  }
  sound.initAudio(); // the start click is the user gesture that unlocks audio
  sound.resumeAudio();
  startWrap.style.display = 'none';
  buildLegend();
  running = true;
  requestAnimationFrame(loop);
}
startBtn.addEventListener('click', () => { start().catch((e) => console.error(e)); });

function buildLegend(): void {
  panel.innerHTML =
    `<div class="leg head">body · five elements</div>` +
    KORYO_LEGEND.map((z) => `<div class="leg"><span class="sw" style="background:${z.color}"></span>${z.element} <span class="mn">${z.hanja} ${z.ko}</span></div>`).join('') +
    `<div class="leg foot">hand meets body · like lights like</div>`;
}

const LINKS: Array<[number, number]> = [
  [P.lShoulder, P.rShoulder],
  [P.lShoulder, P.lElbow], [P.lElbow, P.lWrist],
  [P.rShoulder, P.rElbow], [P.rElbow, P.rWrist],
  [P.lShoulder, P.lHip], [P.rShoulder, P.rHip], [P.lHip, P.rHip],
  [P.lHip, P.lKnee], [P.lKnee, P.lAnkle],
  [P.rHip, P.rKnee], [P.rKnee, P.rAnkle],
];

type Rect = { x: number; y: number; w: number; h: number };

function drawBodySkeleton(lm: NormalizedLandmark[], rect: Rect, mirror: boolean): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  for (const [a, b] of LINKS) {
    const [ax, ay] = mapPoint({ x: lm[a]!.x, y: lm[a]!.y }, rect, mirror);
    const [bx, by] = mapPoint({ x: lm[b]!.x, y: lm[b]!.y }, rect, mirror);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
}

function drawUnseen(w: number, h: number): void {
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(238,241,244,0.32)';
  UNSEEN.forEach((t, i) => ctx.fillText(t, w - 14, h * 0.32 + i * 20));
}

function drawGlowPoint(g: Glow, now: number, rect: Rect, mirror: boolean): void {
  const gl = glow(g.element, now);
  const [x, y] = mapPoint(g.pos, rect, mirror);
  if (gl > 0) {
    const pulse = 0.6 + 0.4 * Math.sin(now / 300);
    const rad = 9 + 15 * gl * pulse;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, colorA(g.color, 0.5 * gl));
    grd.addColorStop(1, colorA(g.color, 0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, 3 + 3 * gl, 0, Math.PI * 2);
  ctx.fillStyle = colorA(g.color, 0.3 + 0.6 * gl);
  ctx.fill();
  if (labelToggle.checked || gl > 0.3) {
    ctx.fillStyle = colorA('#eef1f4', 0.5 + 0.4 * gl);
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.label, x + 8, y);
  }
}

/** A bright arc between a meeting hand point and body point, at the contact. */
function drawContact(a: Vec2, b: Vec2, color: string, now: number, rect: Rect, mirror: boolean): void {
  const [ax, ay] = mapPoint(a, rect, mirror);
  const [bx, by] = mapPoint(b, rect, mirror);
  const pulse = 0.7 + 0.3 * Math.sin(now / 120);
  ctx.strokeStyle = colorA(color, 0.5 * pulse);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const r = 8 + 6 * pulse;
  const grd = ctx.createRadialGradient(mx, my, 0, mx, my, r);
  grd.addColorStop(0, colorA(color, 0.85));
  grd.addColorStop(1, colorA(color, 0));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Which arm a detected hand belongs to, by its wrist's nearest pose wrist. */
function handSide(lm: NormalizedLandmark[] | null, hlm: NormalizedLandmark[]): 'L' | 'R' | null {
  if (!lm) return null;
  const wr = hlm[0]!;
  const lw = lm[P.lWrist]!;
  const rw = lm[P.rWrist]!;
  const dl = Math.hypot(wr.x - lw.x, wr.y - lw.y);
  const dr = Math.hypot(wr.x - rw.x, wr.y - rw.y);
  return dl < dr ? 'L' : 'R';
}

function loop(now: number): void {
  if (!running) return;
  const dt = lastNow ? Math.min(now - lastNow, 50) : 16;
  lastNow = now;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const mirror = true;
  if (video.readyState >= 2 && video.videoWidth > 0) {
    const rect = containRect(w, h, video.videoWidth / video.videoHeight);
    ctx.save();
    ctx.translate(rect.x + rect.w, rect.y);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, rect.w, rect.h);
    ctx.restore();

    const lm = detectPose(video, now)?.landmarks?.[0] ?? null;
    const hands = detect(video, now)?.landmarks ?? [];

    // body points (fixed), and hand point groups tagged with their arm side
    const bodyPts: Glow[] = [];
    if (lm) {
      drawBodySkeleton(lm, rect, mirror);
      for (const p of solveBody(lm)) {
        bodyPts.push({ element: p.element, color: p.color, pos: p.pos, label: `${p.id} ${p.ko}`, armSide: p.region === 'arm' ? p.side : undefined });
      }
    }
    const handGroups = hands.map((hlm) => ({ side: handSide(lm, hlm), pts: solveHand(hlm, handMap) }));

    // encounters: a hand point meeting a same-element body point that is not on
    // its own arm. Like resonates with like: the element lights and its tone sounds.
    const met = new Set<Element>();
    const contacts: Array<{ a: Vec2; b: Vec2; color: string; element: Element }> = [];
    for (const hg of handGroups) {
      for (const hp of hg.pts) {
        for (const bp of bodyPts) {
          if (bp.element !== hp.element) continue;
          if (bp.armSide && hg.side && bp.armSide === hg.side) continue; // not your own arm
          if (Math.hypot(hp.pos.x - bp.pos.x, hp.pos.y - bp.pos.y) < ENCOUNTER) {
            met.add(hp.element);
            contacts.push({ a: hp.pos, b: bp.pos, color: hp.color, element: hp.element });
          }
        }
      }
    }
    const fired = new Set<Element>();
    for (const el of ELEMENTS) {
      if (met.has(el)) {
        if (armed[el] !== false) { litAt[el] = now; const n = ELEMENT_NOTE[el]; if (n) sound.pluck(n); armed[el] = false; fired.add(el); }
      } else {
        armed[el] = true;
      }
    }

    // the hand sheds faint element motes as it moves: a living constellation
    for (const hg of handGroups) {
      for (const g of hg.pts) {
        if (Math.random() < 0.06) { const [x, y] = mapPoint(g.pos, rect, mirror); ambient(x, y, g.color); }
      }
    }
    // resonance emits particles: a stream along each contact, a burst on the strike
    for (const c of contacts) {
      const [ax, ay] = mapPoint(c.a, rect, mirror);
      const [bx, by] = mapPoint(c.b, rect, mirror);
      stream(ax, ay, bx, by, c.color);
      if (fired.has(c.element)) burst((ax + bx) / 2, (ay + by) / 2, c.color, 18);
    }
    updateMotes(dt);

    for (const g of bodyPts) drawGlowPoint(g, now, rect, mirror);
    for (const hg of handGroups) for (const g of hg.pts) drawGlowPoint(g, now, rect, mirror);
    for (const c of contacts) drawContact(c.a, c.b, c.color, now, rect, mirror);
    drawMotes(ctx);

    if (!lm) statusEl.textContent = 'step back · show head, torso, arms, legs';
    else if (!hands.length) statusEl.textContent = 'raise a hand into frame';
    else statusEl.textContent = 'bring a hand to your body · like meets like';

    drawUnseen(w, h);
  }
  requestAnimationFrame(loop);
}
