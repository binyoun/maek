import { initHands, detect } from './hands';
import { personalCun, solvePoint, type Vec2, type PointRule } from './cun';
import { palmFacing } from './anatomy';
import { ACUPOINTS, MERIDIANS, type Meridian } from './acupoints';
import { containRect, drawSkeleton, drawChannel, drawPoint, drawFlow, drawCallout, drawDwellRing, mapPoint } from './draw';
import { drawKoryo, KORYO_LEGEND } from './koryo';

type VisiblePoint = { id: string; mer: Meridian; pos: Vec2 };
let facingHeld = true; // hysteresis so palm/back does not flicker mid-rotation
let facingCount = 0;
let dwellId: string | null = null; // point the fingertip is dwelling on (acupressure)
let dwellStart = 0;
const DWELL_MS = 850;
let lastPointerAt = 0; // last time an explorer fingertip was seen; the tour idles in after this
let tourAnchor = 0; // when the current auto-tour began
const TOUR_IDLE_MS = 6000;
const TOUR_STEP_MS = 2000;
let guideShownAt = 0;
let guideDone = false;
const GUIDE_MS = 15000;

// A point anchored on the thumb cannot be pointed at by the same hand's thumb.
function ruleUsesThumb(rule: PointRule): boolean {
  const ids: number[] = 'at' in rule.base ? [rule.base.at] : [rule.base.from, rule.base.to];
  if (rule.offset) ids.push(rule.offset.toward);
  return ids.some((i) => i >= 1 && i <= 4);
}

const startBtn = document.getElementById('start') as HTMLButtonElement;
const startWrap = document.getElementById('start-wrap')!;
const video = document.getElementById('video') as HTMLVideoElement;
const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const panel = document.getElementById('panel')!;
const facingEl = document.getElementById('facing')!;
const guide = document.getElementById('guide')!;
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
    await initHands(2); // one hand is the body, the other's fingertip explores it
  } catch (err) {
    console.error(err);
    startBtn.disabled = false;
    startBtn.textContent = 'camera blocked, retry';
    return;
  }
  startWrap.style.display = 'none';
  buildLegend();
  guide.classList.add('show');
  guideShownAt = performance.now();
  lastPointerAt = performance.now();
  running = true;
  requestAnimationFrame(loop);
}
startBtn.addEventListener('click', () => { start().catch((e) => console.error(e)); });

function dismissGuide(): void {
  if (guideDone) return;
  guideDone = true;
  guide.classList.remove('show');
}

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
    // the other hand's index fingertip (landmark 8) is the explorer cursor;
    // alone, the same hand's thumb folded across the palm stands in for it
    let pointer = frame?.landmarks?.[1]?.[8] ?? null;
    let thumbPointer = false;
    if (lm) {
      const handed = frame!.handedness?.[0]?.[0]?.categoryName ?? 'Right';
      // hysteresis: only flip palm/back after the reading holds for a few frames
      const raw = palmFacing(lm, handed, flipToggle.checked);
      if (raw === facingHeld) facingCount = 0;
      else if (++facingCount > 4) { facingHeld = raw; facingCount = 0; }
      const facing = facingHeld;
      const surface = facing ? 'palmar' : 'dorsal';
      const cun = personalCun(lm);
      const phase = (now / 1000) * 0.22;

      drawSkeleton(ctx, lm, rect, mirror);

      if (koryoToggle.checked) {
        drawKoryo(ctx, lm, rect, mirror, labelToggle.checked);
        facingEl.textContent = facing ? 'front (palm)' : 'back (dorsum)';
      } else {
        // gather the points on the visible face
        const visible: VisiblePoint[] = [];
        for (const mer of MERIDIANS) {
          if (mer.surface !== surface) continue;
          for (const id of mer.points) {
            const ap = ACUPOINTS[id];
            if (ap) visible.push({ id, mer, pos: solvePoint(lm, ap.rule, cun) });
          }
        }
        const palm = Math.hypot(lm[0]!.x - lm[9]!.x, lm[0]!.y - lm[9]!.y);
        if (!pointer) {
          const fold = Math.hypot(lm[4]!.x - lm[9]!.x, lm[4]!.y - lm[9]!.y);
          if (fold < palm * 0.6) { pointer = lm[4]!; thumbPointer = true; }
        }
        if (pointer) { lastPointerAt = now; tourAnchor = 0; }
        // hovered = nearest visible point to the cursor, within reach
        let hovered: VisiblePoint | null = null;
        if (pointer) {
          let best = palm * (thumbPointer ? 0.26 : 0.32);
          for (const v of visible) {
            if (thumbPointer && ruleUsesThumb(ACUPOINTS[v.id]!.rule)) continue;
            const d = Math.hypot(v.pos.x - pointer.x, v.pos.y - pointer.y);
            if (d < best) { best = d; hovered = v; }
          }
        }
        // idle auto-tour: with no explorer present, walk the visible points in
        // channel order so the vocabulary shows itself to a passerby
        let touring = false;
        if (!pointer && visible.length > 0 && now - lastPointerAt > TOUR_IDLE_MS) {
          if (tourAnchor === 0) tourAnchor = now;
          hovered = visible[Math.floor((now - tourAnchor) / TOUR_STEP_MS) % visible.length]!;
          touring = true;
        }
        // dwell-to-press: holding the fingertip still on a point fills a ring,
        // then ignites it and surges its whole channel (the acupressure gesture)
        let dwellProgress = 0;
        let pressed = false;
        if (hovered && !touring) {
          if (hovered.id !== dwellId) { dwellId = hovered.id; dwellStart = now; }
          dwellProgress = Math.min(1, (now - dwellStart) / DWELL_MS);
          pressed = dwellProgress >= 1;
          dismissGuide();
        } else {
          dwellId = null;
        }
        const pressPhase = (now / 1000) * 0.6;

        for (const mer of MERIDIANS) {
          if (mer.surface !== surface) continue;
          const pts = visible.filter((v) => v.mer.id === mer.id).map((v) => v.pos);
          const isPressed = pressed && hovered?.mer.id === mer.id;
          const isAttended = hovered?.mer.id === mer.id;
          drawChannel(ctx, pts, rect, mirror, mer.color, isPressed ? 0.95 : pressed ? 0.22 : 0.5, isPressed ? 5 : 3);
          if (isPressed) drawFlow(ctx, pts, rect, mirror, mer.color, pressPhase, 4, 1.5);
          else if (!pressed && (!hovered || isAttended)) drawFlow(ctx, pts, rect, mirror, mer.color, phase, 2, 1);
        }
        for (const v of visible) {
          const ap = ACUPOINTS[v.id]!;
          drawPoint(ctx, v.pos, rect, mirror, v.mer.color, v.id, ap.confidence, labelToggle.checked, hovered?.id === v.id);
        }
        if (hovered) {
          const ap = ACUPOINTS[hovered.id]!;
          const [hx, hy] = mapPoint(hovered.pos, rect, mirror);
          if (!pressed && dwellProgress > 0.02) drawDwellRing(ctx, hx, hy, dwellProgress, hovered.mer.color);
          drawCallout(ctx, hx, hy, [`${hovered.id} ${ap.names.en}`, `${ap.names.hanja} ${ap.names.ko}`, pressed ? `${hovered.mer.name} · pressed` : hovered.mer.name], hovered.mer.color);
        }
        facingEl.textContent = `${facing ? 'palm' : 'back of hand'}${pointer ? '' : touring ? '  ·  wandering the channels' : '  ·  bring your other hand'}`;
        panel.querySelectorAll<HTMLElement>('.leg').forEach((el) => {
          el.classList.toggle('dim', el.dataset.surface != null && el.dataset.surface !== surface);
        });
      }
    } else {
      facingEl.textContent = 'show your hand';
      lastPointerAt = now; // the tour only counts idle time while a hand is visible
      tourAnchor = 0;
    }
  }
  if (!guideDone && now - guideShownAt > GUIDE_MS) dismissGuide();

  requestAnimationFrame(loop);
}
