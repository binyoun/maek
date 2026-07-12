import { initPose, detectPose, P } from './pose';
import { solveBody, UNSEEN } from './bodypoints';
import { containRect, mapPoint } from './draw';
import { KORYO_LEGEND, ELEMENT_NOTE, type Element } from './koryo';
import { makeParticles, updateParticles, drawParticle } from './particles';
import * as sound from './sound';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// The body register of Maek (Tier 3). Five element particles drift in the air;
// reach a fingertip into one and it flares, sounds its 오행 tone, and every body
// point of that element glows across the arms and legs. The catch-a-colour
// gesture at body scale, so nothing depends on pressing tiny overlapping points.

const HIT_RADIUS = 0.091; // normalized: how near a fingertip catches a particle
const GLOW_MS = 3400; // how long an element stays lit after a catch

const particles = makeParticles();
const litAt: Partial<Record<Element, number>> = {};
let lastNow = 0;

function vis(l: NormalizedLandmark | undefined): NormalizedLandmark | null {
  return l && (l.visibility ?? 1) > 0.5 ? l : null;
}
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

let running = false;

async function start(): Promise<void> {
  startBtn.disabled = true;
  startBtn.textContent = 'loading model...';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    await initPose();
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
    `<div class="leg foot">catch a colour, its points light</div>`;
}

const LINKS: Array<[number, number]> = [
  [P.lShoulder, P.rShoulder],
  [P.lShoulder, P.lElbow], [P.lElbow, P.lWrist],
  [P.rShoulder, P.rElbow], [P.rElbow, P.rWrist],
  [P.lShoulder, P.lHip], [P.rShoulder, P.rHip], [P.lHip, P.rHip],
  [P.lHip, P.lKnee], [P.lKnee, P.lAnkle],
  [P.rHip, P.rKnee], [P.rKnee, P.rAnkle],
];

function drawBodySkeleton(lm: NormalizedLandmark[], rect: { x: number; y: number; w: number; h: number }, mirror: boolean): void {
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

  updateParticles(particles, dt, now);

  const mirror = true;
  if (video.readyState >= 2 && video.videoWidth > 0) {
    const rect = containRect(w, h, video.videoWidth / video.videoHeight);
    ctx.save();
    ctx.translate(rect.x + rect.w, rect.y);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, rect.w, rect.h);
    ctx.restore();

    const frame = detectPose(video, now);
    const lm = frame?.landmarks?.[0] ?? null;

    // fingertips (and wrists as a larger fallback) are what catch the particles
    const catchers = lm
      ? [vis(lm[P.lIndex]), vis(lm[P.rIndex]), vis(lm[P.lWrist]), vis(lm[P.rWrist])].filter((c): c is NormalizedLandmark => c != null)
      : [];

    // catch: a particle armed and reached by a fingertip flares and lights its element
    for (const p of particles) {
      let touched = false;
      for (const c of catchers) {
        if (Math.hypot(p.x - c.x, p.y - c.y) < HIT_RADIUS) { touched = true; break; }
      }
      if (touched && p.armed) {
        p.armed = false;
        p.flare = 1;
        litAt[p.element] = now;
        const n = ELEMENT_NOTE[p.element];
        if (n) sound.pluck(n);
      } else if (!touched) {
        p.armed = true;
      }
    }

    if (lm) {
      drawBodySkeleton(lm, rect, mirror);
      const pts = solveBody(lm);
      for (const p of pts) {
        const g = glow(p.element, now);
        const [x, y] = mapPoint(p.pos, rect, mirror);
        if (g > 0) {
          const pulse = 0.6 + 0.4 * Math.sin(now / 300);
          const rad = 9 + 15 * g * pulse;
          const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
          grd.addColorStop(0, colorA(p.color, 0.5 * g));
          grd.addColorStop(1, colorA(p.color, 0));
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, 3 + 3 * g, 0, Math.PI * 2);
        ctx.fillStyle = colorA(p.color, 0.32 + 0.6 * g);
        ctx.fill();
        if (labelToggle.checked || g > 0.3) {
          ctx.fillStyle = colorA('#eef1f4', 0.55 + 0.4 * g);
          ctx.font = '11px ui-monospace, monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${p.id} ${p.ko}`, x + 8, y);
        }
      }
      statusEl.textContent = catchers.length ? 'catch a colour in the air' : 'step back · show your whole body';
    } else {
      statusEl.textContent = 'step back · show head, torso, arms, legs';
    }

    // the particles float above the scene
    for (const p of particles) {
      const [x, y] = mapPoint({ x: p.x, y: p.y }, rect, mirror);
      drawParticle(ctx, x, y, p, now);
    }
    drawUnseen(w, h);
  }
  requestAnimationFrame(loop);
}
