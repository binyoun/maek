import { initPose, detectPose, P } from './pose';
import { initHands, detect } from './hands';
import { solveBody, UNSEEN } from './bodypoints';
import { personalCun, solvePoint, type Vec2 } from './cun';
import { ACUPOINTS } from './acupoints';
import { containRect, mapPoint } from './draw';
import { KORYO_LEGEND, ELEMENT_NOTE, ELEMENT_COLOR, ELEMENTS, solveKoryo, type Element } from './koryo';
import { makeOrbs, updateOrbs, drawOrb, ambient, trail, updateMotes, drawMotes } from './particles';
import * as sound from './sound';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

type HandMap = 'transport' | 'koryo';

// A point on the hand or body, carrying its element so it can wake a matching orb.
interface Glow { element: Element; color: string; pos: Vec2; label: string }

// Five Transport points (오수혈 / 五輸穴): the distal points of each channel are
// themselves assigned the five elements, so colouring by that element makes the
// WHO hand span all five, not only its channel's Metal or Fire.
const TRANSPORT_ELEMENT: Record<string, Element> = {
  LU11: 'Wood', LU10: 'Fire', LU9: 'Earth',
  PC9: 'Wood', PC8: 'Fire', PC7: 'Earth',
  HT9: 'Wood', HT8: 'Fire', HT7: 'Earth',
  LI1: 'Metal', LI3: 'Wood',
  SI1: 'Metal', SI2: 'Water', SI3: 'Wood',
  TE1: 'Metal', TE2: 'Water', TE3: 'Wood',
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

// The body register of Maek (Tier 3). Element orbs drift in the air. Brush a
// matching-colour point (hand or body) through one and its element wakes: the
// light swells in (never pops), the space fills faintly with that colour, and a
// soft pad blooms. Everything slow, soft, meditative.

const TOUCH = 0.06; // normalized: how near a point wakes an orb
const ATTACK_TAU = 240; // ms, how fast the light swells in when brushed
const RELEASE_TAU = 1700; // ms, how slowly it fades when released

const orbs = makeOrbs();
const level: Partial<Record<Element, number>> = {}; // 0..1 lamp per element
let handMap: HandMap = 'transport';
let lastNow = 0;

function colorA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
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
    `<div class="leg foot">brush the colours in the air</div>`;
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
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  for (const [a, b] of LINKS) {
    const [ax, ay] = mapPoint({ x: lm[a]!.x, y: lm[a]!.y }, rect, mirror);
    const [bx, by] = mapPoint({ x: lm[b]!.x, y: lm[b]!.y }, rect, mirror);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
}

/** The ambient wash: the space fills faintly with each woken element's colour. */
function drawWash(w: number, h: number): void {
  ctx.globalCompositeOperation = 'lighter';
  const cx = w * 0.5;
  const cy = h * 0.5;
  const r = Math.max(w, h) * 0.8;
  for (const el of ELEMENTS) {
    const L = level[el] ?? 0;
    if (L < 0.02) continue;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, colorA(ELEMENT_COLOR[el], 0.11 * L));
    grd.addColorStop(1, colorA(ELEMENT_COLOR[el], 0));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawUnseen(w: number, h: number): void {
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(238,241,244,0.3)';
  UNSEEN.forEach((t, i) => ctx.fillText(t, w - 14, h * 0.32 + i * 20));
}

function drawGlowPoint(g: Glow, now: number, rect: Rect, mirror: boolean): void {
  const gl = level[g.element] ?? 0;
  const [x, y] = mapPoint(g.pos, rect, mirror);
  if (gl > 0.01) {
    const pulse = 0.7 + 0.3 * Math.sin(now / 560); // slow, calm breath
    const rad = 7 + 18 * gl * pulse;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, colorA(g.color, 0.4 * gl));
    grd.addColorStop(1, colorA(g.color, 0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, 2.5 + 3 * gl, 0, Math.PI * 2);
  ctx.fillStyle = colorA(g.color, 0.24 + 0.55 * gl);
  ctx.fill();
  if (labelToggle.checked || gl > 0.3) {
    ctx.fillStyle = colorA('#eef1f4', 0.45 + 0.4 * gl);
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.label, x + 8, y);
  }
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

  updateOrbs(orbs, dt, now);

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

    // every point on hand and body can brush an orb
    const pts: Glow[] = [];
    if (lm) for (const p of solveBody(lm)) pts.push({ element: p.element, color: p.color, pos: p.pos, label: `${p.id} ${p.ko}` });
    for (const hlm of hands) pts.push(...solveHand(hlm, handMap));

    // brush: a matching-colour point over an orb keeps its element active; the
    // first contact wakes it (one soft pad). A freshly woken orb sheds more motes.
    const active = new Set<Element>();
    for (const o of orbs) {
      let touched = false;
      for (const p of pts) {
        if (p.element !== o.element) continue;
        if (Math.hypot(p.pos.x - o.x, p.pos.y - o.y) < TOUCH) { touched = true; break; }
      }
      if (touched) {
        active.add(o.element);
        if (o.armed) { o.armed = false; o.flare = 1; const n = ELEMENT_NOTE[o.element]; if (n) sound.pad(n); }
      } else {
        o.armed = true;
      }
      if (Math.random() < 0.015 + 0.16 * o.flare) { const [ox, oy] = mapPoint({ x: o.x, y: o.y }, rect, mirror); ambient(ox, oy, ELEMENT_COLOR[o.element]); }
    }

    // lamp: each element's light eases toward lit or unlit, so nothing pops
    for (const el of ELEMENTS) {
      const target = active.has(el) ? 1 : 0;
      const tau = active.has(el) ? ATTACK_TAU : RELEASE_TAU;
      const cur = level[el] ?? 0;
      level[el] = cur + (target - cur) * (1 - Math.exp(-dt / tau));
    }
    // light trail: lit points shed lingering motes as they move, painting a ribbon
    for (const p of pts) {
      const L = level[p.element] ?? 0;
      if (L > 0.12 && Math.random() < L * 0.6) { const [x, y] = mapPoint(p.pos, rect, mirror); trail(x, y, p.color); }
    }
    updateMotes(dt);

    drawWash(w, h);
    if (lm) drawBodySkeleton(lm, rect, mirror);
    for (const g of pts) drawGlowPoint(g, now, rect, mirror);
    for (const o of orbs) { const [ox, oy] = mapPoint({ x: o.x, y: o.y }, rect, mirror); drawOrb(ctx, ox, oy, o, now); }
    drawMotes(ctx);

    if (!lm) statusEl.textContent = 'step back · show head, torso, arms, legs';
    else if (!hands.length) statusEl.textContent = 'raise a hand · brush the colours';
    else statusEl.textContent = 'brush a colour with a matching point';

    drawUnseen(w, h);
  }
  requestAnimationFrame(loop);
}
