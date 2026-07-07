import { initHands, detect } from './hands';
import { personalCun, solvePoint, type Vec2 } from './cun';
import { palmFacing } from './anatomy';
import { ACUPOINTS, MERIDIANS } from './acupoints';
import { containRect, drawSkeleton, drawChannel, drawPoint } from './draw';
import { drawKoryo, KORYO_LEGEND } from './koryo';

const startBtn = document.getElementById('start') as HTMLButtonElement;
const startWrap = document.getElementById('start-wrap')!;
const video = document.getElementById('video') as HTMLVideoElement;
const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const panel = document.getElementById('panel')!;
const facingEl = document.getElementById('facing')!;
const labelToggle = document.getElementById('t-labels') as HTMLInputElement;
const flipToggle = document.getElementById('t-flip') as HTMLInputElement;
const mirrorToggle = document.getElementById('t-mirror') as HTMLInputElement;
const koryoToggle = document.getElementById('t-koryo') as HTMLInputElement;
koryoToggle.addEventListener('change', buildLegend);

let running = false;

async function start(): Promise<void> {
  startBtn.disabled = true;
  startBtn.textContent = 'loading model...';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    await initHands(1);
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
  if (koryoToggle.checked) {
    panel.innerHTML =
      `<div class="leg head">고려수지침 Koryo</div>` +
      KORYO_LEGEND.map((z) => `<div class="leg"><span class="sw" style="background:#d98a4a"></span>${z.en} <span class="mn">${z.ko}</span></div>`).join('') +
      `<div class="leg foot">palm = front &middot; back = back</div>`;
  } else {
    panel.innerHTML =
      `<div class="leg head">WHO channels</div>` +
      MERIDIANS.map((m) =>
        `<div class="leg" data-surface="${m.surface}"><span class="sw" style="background:${m.color}"></span>${m.id} <span class="mn">${m.name}</span> <span class="el">${m.element}</span></div>`
      ).join('');
  }
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

  const mirror = mirrorToggle.checked;
  if (video.readyState >= 2 && video.videoWidth > 0) {
    const rect = containRect(w, h, video.videoWidth / video.videoHeight);
    ctx.save();
    if (mirror) {
      ctx.translate(rect.x + rect.w, rect.y);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, rect.w, rect.h);
    } else {
      ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();

    const frame = detect(video, now);
    const lm = frame?.landmarks?.[0] ?? null;
    if (lm) {
      const handed = frame!.handedness?.[0]?.[0]?.categoryName ?? 'Right';
      const facing = palmFacing(lm, handed, flipToggle.checked);
      const surface = facing ? 'palmar' : 'dorsal';
      const cun = personalCun(lm);

      drawSkeleton(ctx, lm, rect, mirror);

      if (koryoToggle.checked) {
        // Koryo register: the hand as a micro-map of the whole body.
        drawKoryo(ctx, lm, rect, mirror, labelToggle.checked);
        facingEl.textContent = facing ? 'front (palm)' : 'back (dorsum)';
      } else {
        // WHO channel atlas, gated by which face of the hand we see.
        for (const mer of MERIDIANS) {
          if (mer.surface !== surface) continue;
          const pts: Vec2[] = [];
          for (const id of mer.points) {
            const ap = ACUPOINTS[id];
            if (ap) pts.push(solvePoint(lm, ap.rule, cun));
          }
          drawChannel(ctx, pts, rect, mirror, mer.color);
          for (let i = 0; i < mer.points.length; i++) {
            const ap = ACUPOINTS[mer.points[i]!];
            const p = pts[i];
            if (ap && p) drawPoint(ctx, p, rect, mirror, mer.color, ap.id, ap.confidence, labelToggle.checked);
          }
        }
        facingEl.textContent = facing ? 'palm' : 'back of hand';
        panel.querySelectorAll<HTMLElement>('.leg').forEach((el) => {
          el.classList.toggle('dim', el.dataset.surface != null && el.dataset.surface !== surface);
        });
      }
    } else {
      facingEl.textContent = 'show your hand';
    }
  }

  requestAnimationFrame(loop);
}
