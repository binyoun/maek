import { initPose, detectPose, P } from './pose';
import { solveBody, UNSEEN } from './bodypoints';
import { containRect, drawPoint, mapPoint } from './draw';
import { KORYO_LEGEND } from './koryo';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// The body register of Maek (Tier 3 scaffold). PoseLandmarker live, the forearm
// cun ruler, and a starter set of arm points placed by proportion. Its own page
// because the body wants the camera stepped back. Interaction and the full
// point set come next; this proves the pipeline and the cun generalization.

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
    `<div class="leg foot">forearm = 12 cun, elbow to wrist</div>`;
}

const LINKS: Array<[number, number]> = [
  [P.lShoulder, P.rShoulder],
  [P.lShoulder, P.lElbow], [P.lElbow, P.lWrist],
  [P.rShoulder, P.rElbow], [P.rElbow, P.rWrist],
  [P.lShoulder, P.lHip], [P.rShoulder, P.rHip], [P.lHip, P.rHip],
];

function drawBodySkeleton(lm: NormalizedLandmark[], rect: { x: number; y: number; w: number; h: number }, mirror: boolean): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
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

    const frame = detectPose(video, now);
    const lm = frame?.landmarks?.[0] ?? null;
    if (lm) {
      drawBodySkeleton(lm, rect, mirror);
      const pts = solveBody(lm);
      for (const p of pts) drawPoint(ctx, p.pos, rect, mirror, p.color, `${p.id} ${p.ko}`, 'med', labelToggle.checked, false);
      statusEl.textContent = `${pts.length} forearm points · 12-cun ruler`;
    } else {
      statusEl.textContent = 'step back · show head, torso, arms';
    }
    drawUnseen(w, h);
  }
  requestAnimationFrame(loop);
}
