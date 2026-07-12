import { initHands, detect } from './hands';
import { personalCun, solvePoint, type Vec2, type PointRule } from './cun';
import { palmFacing } from './anatomy';
import { ACUPOINTS, MERIDIANS, type Meridian } from './acupoints';
import { containRect, drawSkeleton, drawChannel, drawChannelProgress, drawPoint, drawFlow, drawCallout, drawDwellRing, drawFinaleGlow, projectToPolyline, mapPoint } from './draw';
import { drawKoryoAxis, solveKoryo, KORYO_LEGEND, ELEMENT_HANJA } from './koryo';
import * as sound from './sound';
import * as calib from './calib';
import type { Rect } from './draw';

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

// Opening arc: channels opened by pressing a point or tracing the whole channel
// stay open (persistent flow); the set persists as the hand turns over, so all
// six of the arm channels can be opened across both faces, then the finale.
const openChannels = new Set<string>();
let traceId: string | null = null; // channel the fingertip is currently tracing
let traceMax = 0; // furthest flow-fraction reached on it, [0..1]
let traceSeenAt = 0; // last time the pointer was riding the traced channel
let pressSoundedId: string | null = null; // channel whose press tone already sounded
let finaleAt = 0; // when the sixth channel opened
const TRACE_REACH = 0.4; // multiple of palm width counted as riding a channel
const TRACE_START = 0.25; // a trace may only begin near the flow origin
const TRACE_COMPLETE = 0.9;
const TRACE_DECAY_MS = 900;

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
const soundToggle = document.getElementById('t-sound') as HTMLInputElement;
const koryoToggle = document.getElementById('t-koryo') as HTMLInputElement;
const finaleEl = document.getElementById('finale')!;
koryoToggle.addEventListener('change', buildLegend);
soundToggle.addEventListener('change', () => { sound.setMuted(!soundToggle.checked); sound.resumeAudio(); });

let running = false;

// latest solved points, kept so a tap in calibration mode can hit-test them
let lastVisible: VisiblePoint[] = [];
let lastRect: Rect | null = null;
let lastMirror = false;
calib.initCalib();
if (calib.calibMode) {
  canvas.addEventListener('pointerdown', (e) => {
    if (!lastRect || lastVisible.length === 0) return;
    let best = 44;
    let hit: string | null = null;
    for (const v of lastVisible) {
      const [px, py] = mapPoint(v.pos, lastRect, lastMirror);
      const d = Math.hypot(e.clientX - px, e.clientY - py);
      if (d < best) { best = d; hit = v.id; }
    }
    if (hit) calib.select(hit);
  });
}

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
  sound.initAudio(); // the start click is the user gesture that unlocks audio
  sound.resumeAudio();
  sound.setMuted(!soundToggle.checked);
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
      `<div class="leg head">고려수지침 · five elements</div>` +
      KORYO_LEGEND.map((z) => `<div class="leg"><span class="sw" style="background:${z.color}"></span>${z.element} <span class="mn">${z.hanja} ${z.ko}</span></div>`).join('') +
      `<div class="leg foot">palm = 장 yin &middot; back = 부 yang</div>`;
  } else {
    panel.innerHTML =
      `<div class="leg head">WHO channels</div>` +
      MERIDIANS.map((m) =>
        `<div class="leg" data-surface="${m.surface}" data-id="${m.id}"><span class="sw" style="background:${m.color}"></span>${m.id} <span class="mn">${m.name}</span> <span class="el">${m.element}</span></div>`
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
      const cun = personalCun(lm) * calib.cunScale;
      const phase = (now / 1000) * 0.22;

      drawSkeleton(ctx, lm, rect, mirror);

      // shared explorer cursor: the other index fingertip, or the folded thumb
      const palm = Math.hypot(lm[0]!.x - lm[9]!.x, lm[0]!.y - lm[9]!.y);
      if (!pointer) {
        const fold = Math.hypot(lm[4]!.x - lm[9]!.x, lm[4]!.y - lm[9]!.y);
        if (fold < palm * 0.6) { pointer = lm[4]!; thumbPointer = true; }
      }
      if (pointer) { lastPointerAt = now; tourAnchor = 0; }

      if (koryoToggle.checked) {
        drawKoryoAxis(ctx, lm, rect, mirror);
        const kpts = solveKoryo(lm, cun, surface);
        // hover: nearest correspondence point to the explorer fingertip
        let kHover: (typeof kpts)[number] | null = null;
        if (pointer) {
          let best = palm * (thumbPointer ? 0.26 : 0.32);
          for (const k of kpts) {
            const d = Math.hypot(k.pos.x - pointer.x, k.pos.y - pointer.y);
            if (d < best) { best = d; kHover = k; }
          }
        }
        // dwell-to-press, the same gesture as the WHO register
        let dwellProgress = 0;
        let pressed = false;
        if (kHover) {
          if (kHover.id !== dwellId) { dwellId = kHover.id; dwellStart = now; }
          dwellProgress = Math.min(1, (now - dwellStart) / DWELL_MS);
          pressed = dwellProgress >= 1;
          dismissGuide();
        } else {
          dwellId = null;
        }
        // a press sounds the point's own element tone (오행 → 오음)
        if (pressed && kHover) {
          if (pressSoundedId !== kHover.id) { if (kHover.note) sound.pluck(kHover.note); pressSoundedId = kHover.id; }
        }
        if (!pressed) pressSoundedId = null;

        for (const k of kpts) {
          drawPoint(ctx, k.pos, rect, mirror, k.color, `${k.id} ${k.ko}`, 'high', labelToggle.checked, kHover?.id === k.id);
        }
        if (kHover) {
          const [hx, hy] = mapPoint(kHover.pos, rect, mirror);
          if (!pressed && dwellProgress > 0.02) drawDwellRing(ctx, hx, hy, dwellProgress, kHover.color);
          drawCallout(ctx, hx, hy, [
            `${kHover.id} ${kHover.en}`,
            `${kHover.hanja} ${kHover.ko}`,
            `${kHover.element} ${ELEMENT_HANJA[kHover.element]}${pressed ? ' · pressed' : ''}`,
          ], kHover.color);
        }
        facingEl.textContent = `${facing ? 'palm · 장 yin organs' : 'back · 부 yang organs'}${pointer ? '' : '  ·  bring your other hand'}`;
        panel.querySelectorAll<HTMLElement>('.leg').forEach((el) => el.classList.remove('dim', 'open'));
        if (traceId) { traceId = null; traceMax = 0; sound.glideOff(); }
      } else {
        // gather the points on the visible face
        const visible: VisiblePoint[] = [];
        for (const mer of MERIDIANS) {
          if (mer.surface !== surface) continue;
          for (const id of mer.points) {
            const ap = ACUPOINTS[id];
            if (ap) visible.push({ id, mer, pos: solvePoint(lm, calib.effectiveRule(id, ap.rule), cun) });
          }
        }
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
        if (!pointer && !calib.calibMode && visible.length > 0 && now - lastPointerAt > TOUR_IDLE_MS) {
          if (tourAnchor === 0) tourAnchor = now;
          hovered = visible[Math.floor((now - tourAnchor) / TOUR_STEP_MS) % visible.length]!;
          touring = true;
        }
        // per-channel polylines on the visible face, in flow order
        const chanPts = new Map<string, Vec2[]>();
        for (const mer of MERIDIANS) {
          if (mer.surface !== surface) continue;
          chanPts.set(mer.id, visible.filter((v) => v.mer.id === mer.id).map((v) => v.pos));
        }

        // trace-to-open: riding a channel from its flow origin to its end opens it.
        // Wrong-direction dragging (starting at the tip) never begins a trace.
        if (pointer && !touring) {
          let onId: string | null = null;
          let onS = 0;
          let bestD = palm * TRACE_REACH;
          for (const [id, pts] of chanPts) {
            if (pts.length < 2) continue;
            const { s, d } = projectToPolyline(pointer, pts);
            if (d < bestD) { bestD = d; onId = id; onS = s; }
          }
          if (onId) {
            if (onId === traceId) {
              if (onS > traceMax) traceMax = onS;
              traceSeenAt = now;
            } else if (onS < TRACE_START) {
              // begin a trace only at a channel's flow origin; riding near a
              // different channel mid-length is ignored so the current trace holds
              traceId = onId;
              traceMax = onS;
              traceSeenAt = now;
            }
          }
        }
        if (traceId && now - traceSeenAt > TRACE_DECAY_MS) { traceId = null; traceMax = 0; }

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

        // opening: a completed trace, or a completed press, opens the channel
        let justOpened: string | null = null;
        if (traceId && traceMax >= TRACE_COMPLETE) {
          if (!openChannels.has(traceId)) { openChannels.add(traceId); justOpened = traceId; }
          traceId = null;
          traceMax = 0;
          sound.glideOff();
        }
        if (pressed && hovered && !openChannels.has(hovered.mer.id)) {
          openChannels.add(hovered.mer.id);
          justOpened = hovered.mer.id;
        }

        // sound: trace bends a held tone up the channel; opening blooms; a press
        // on an already-open channel just plucks its tone again
        if (traceId) sound.glide(sound.NOTES[traceId]! * (0.9 + traceMax * 0.6));
        else sound.glideOff();
        if (justOpened) {
          sound.bloom(sound.NOTES[justOpened]!);
          pressSoundedId = justOpened;
          dismissGuide();
        } else if (pressed && hovered) {
          if (pressSoundedId !== hovered.mer.id) { sound.pluck(sound.NOTES[hovered.mer.id]!); pressSoundedId = hovered.mer.id; }
        }
        if (!pressed && !justOpened) pressSoundedId = null;

        // finale: the sixth channel open sounds the whole pentatonic and lights the hand
        if (openChannels.size >= 6 && finaleAt === 0) {
          finaleAt = now;
          sound.finale(sound.FINALE_CHORD);
          finaleEl.textContent = '六經  the six channels open';
          finaleEl.classList.add('show');
          window.setTimeout(() => finaleEl.classList.remove('show'), 5000);
        }
        const finaleT = finaleAt ? (now - finaleAt) / 1000 : -1;
        const finaleBurst = finaleT >= 0 && finaleT < 6;
        const pressPhase = (now / 1000) * 0.6;

        for (const mer of MERIDIANS) {
          if (mer.surface !== surface) continue;
          const pts = chanPts.get(mer.id)!;
          const isOpen = openChannels.has(mer.id);
          const isPressed = pressed && hovered?.mer.id === mer.id;
          const isAttended = hovered?.mer.id === mer.id;
          const isTracing = traceId === mer.id;
          let alpha = 0.5;
          let width = 3;
          if (finaleBurst) { alpha = 0.92; width = 4.5; }
          else if (isPressed) { alpha = 0.95; width = 5; }
          else if (isOpen) { alpha = 0.75; width = 3.5; }
          else if (pressed) { alpha = 0.22; }
          else if (isTracing) { alpha = 0.6; }
          drawChannel(ctx, pts, rect, mirror, mer.color, alpha, width);
          if (isTracing) drawChannelProgress(ctx, pts, rect, mirror, mer.color, traceMax);
          if (finaleBurst) drawFlow(ctx, pts, rect, mirror, mer.color, pressPhase, 4, 1.4);
          else if (isPressed) drawFlow(ctx, pts, rect, mirror, mer.color, pressPhase, 4, 1.5);
          else if (isOpen) drawFlow(ctx, pts, rect, mirror, mer.color, phase * 1.5, 3, 1.1);
          else if (!pressed && (!hovered || isAttended)) drawFlow(ctx, pts, rect, mirror, mer.color, phase, 2, 1);
        }
        for (const v of visible) {
          const ap = ACUPOINTS[v.id]!;
          const active = hovered?.id === v.id || (calib.calibMode && calib.selectedId === v.id);
          drawPoint(ctx, v.pos, rect, mirror, v.mer.color, v.id, ap.confidence, labelToggle.checked, active);
        }
        lastVisible = visible;
        lastRect = rect;
        lastMirror = mirror;
        if (finaleBurst) {
          const [gx, gy] = mapPoint(lm[9]!, rect, mirror);
          drawFinaleGlow(ctx, gx, gy, palm * rect.w * 2.4, finaleT, now);
        }
        if (hovered) {
          const ap = ACUPOINTS[hovered.id]!;
          const [hx, hy] = mapPoint(hovered.pos, rect, mirror);
          if (!pressed && dwellProgress > 0.02 && traceId == null) drawDwellRing(ctx, hx, hy, dwellProgress, hovered.mer.color);
          drawCallout(ctx, hx, hy, [`${hovered.id} ${ap.names.en}`, `${ap.names.hanja} ${ap.names.ko}`, pressed ? `${hovered.mer.name} · pressed` : hovered.mer.name], hovered.mer.color);
        }
        const openN = openChannels.size;
        let status = facing ? 'palm' : 'back of hand';
        if (finaleBurst) status += '  ·  六經 the six channels open';
        else if (openN > 0) status += `  ·  ${openN}/6 open`;
        else if (!pointer) status += touring ? '  ·  wandering the channels' : '  ·  bring your other hand';
        facingEl.textContent = status;
        panel.querySelectorAll<HTMLElement>('.leg').forEach((el) => {
          el.classList.toggle('dim', el.dataset.surface != null && el.dataset.surface !== surface);
          el.classList.toggle('open', el.dataset.id != null && openChannels.has(el.dataset.id));
        });
      }
    } else {
      facingEl.textContent = 'show your hand';
      lastPointerAt = now; // the tour only counts idle time while a hand is visible
      tourAnchor = 0;
      if (traceId) { traceId = null; traceMax = 0; }
      sound.glideOff();
    }
  }
  if (!guideDone && now - guideShownAt > GUIDE_MS) dismissGuide();

  requestAnimationFrame(loop);
}
