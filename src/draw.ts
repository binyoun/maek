import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Vec2 } from './cun';
import type { Confidence } from './acupoints';

export interface Rect { x: number; y: number; w: number; h: number }

const SKELETON: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export function containRect(w: number, h: number, aspect: number): Rect {
  const canvasAspect = w / h;
  if (aspect > canvasAspect) {
    const rh = w / aspect;
    return { x: 0, y: (h - rh) / 2, w, h: rh };
  }
  const rw = h * aspect;
  return { x: (w - rw) / 2, y: 0, w: rw, h };
}

/** Map a normalized point into the drawn video rect, mirroring x if requested. */
export function mapPoint(p: Vec2, rect: Rect, mirror: boolean): [number, number] {
  const nx = mirror ? 1 - p.x : p.x;
  return [rect.x + nx * rect.w, rect.y + p.y * rect.h];
}
const toPx = mapPoint;

/** A faint hand skeleton for context; the acupoints and channels are the subject. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, lm: NormalizedLandmark[], rect: Rect, mirror: boolean): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  for (const [a, b] of SKELETON) {
    const [ax, ay] = toPx(lm[a]!, rect, mirror);
    const [bx, by] = toPx(lm[b]!, rect, mirror);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
}

export function drawChannel(ctx: CanvasRenderingContext2D, pts: Vec2[], rect: Rect, mirror: boolean, color: string, alpha = 0.5, width = 3): void {
  if (pts.length < 2) return;
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = toPx(p, rect, mirror);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A light travelling along the channel in its Qi-flow direction (points are
    ordered by flow). Two motes, half a cycle apart. */
export function drawFlow(ctx: CanvasRenderingContext2D, pts: Vec2[], rect: Rect, mirror: boolean, color: string, phase: number, count = 2, sizeScale = 1): void {
  if (pts.length < 2) return;
  const sp = pts.map((p) => mapPoint(p, rect, mirror));
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < sp.length; i++) {
    const d = Math.hypot(sp[i]![0] - sp[i - 1]![0], sp[i]![1] - sp[i - 1]![1]);
    seg.push(d);
    total += d;
  }
  if (total < 1) return;
  for (let m = 0; m < count; m++) {
    let d = ((phase + m / count) % 1) * total;
    let i = 0;
    while (i < seg.length && d > seg[i]!) { d -= seg[i]!; i++; }
    if (i >= seg.length) i = seg.length - 1;
    const t = seg[i]! > 0 ? d / seg[i]! : 0;
    const x = sp[i]![0] + (sp[i + 1]![0] - sp[i]![0]) * t;
    const y = sp[i]![1] + (sp[i + 1]![1] - sp[i]![1]) * t;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(x, y, 7 * sizeScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(x, y, 3 * sizeScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * Project a pointer onto a channel's polyline (all in normalized coords).
 * Returns the arc-length fraction s in [0,1] of the nearest point on the line
 * (0 at the flow origin) and the perpendicular distance d. Used to tell whether
 * the fingertip is riding a channel, and how far along its flow it has reached.
 */
export function projectToPolyline(p: Vec2, pts: Vec2[]): { s: number; d: number } {
  if (pts.length < 2) return { s: 0, d: pts.length ? Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y) : Infinity };
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    lens.push(d);
    total += d;
  }
  if (total < 1e-6) return { s: 0, d: Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y) };
  let bestD = Infinity;
  let bestS = 0;
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1]!.x, ay = pts[i - 1]!.y;
    const dx = pts[i]!.x - ax, dy = pts[i]!.y - ay;
    const l2 = dx * dx + dy * dy || 1e-9;
    let t = ((p.x - ax) * dx + (p.y - ay) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t, cy = ay + dy * t;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bestD) { bestD = d; bestS = (run + lens[i - 1]! * t) / total; }
    run += lens[i - 1]!;
  }
  return { s: bestS, d: bestD };
}

/** The lit portion of a channel as the fingertip traces it, with a leading dot. */
export function drawChannelProgress(ctx: CanvasRenderingContext2D, pts: Vec2[], rect: Rect, mirror: boolean, color: string, frac: number): void {
  if (pts.length < 2 || frac <= 0) return;
  const sp = pts.map((p) => mapPoint(p, rect, mirror));
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < sp.length; i++) {
    const d = Math.hypot(sp[i]![0] - sp[i - 1]![0], sp[i]![1] - sp[i - 1]![1]);
    seg.push(d);
    total += d;
  }
  const target = Math.min(1, frac) * total;
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(sp[0]![0], sp[0]![1]);
  let acc = 0;
  let tipX = sp[0]![0];
  let tipY = sp[0]![1];
  for (let i = 1; i < sp.length; i++) {
    const d = seg[i - 1]!;
    if (acc + d <= target) {
      ctx.lineTo(sp[i]![0], sp[i]![1]);
      acc += d;
      tipX = sp[i]![0];
      tipY = sp[i]![1];
    } else {
      const t = d > 0 ? (target - acc) / d : 0;
      tipX = sp[i - 1]![0] + (sp[i]![0] - sp[i - 1]![0]) * t;
      tipY = sp[i - 1]![1] + (sp[i]![1] - sp[i - 1]![1]) * t;
      ctx.lineTo(tipX, tipY);
      break;
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
  ctx.fill();
}

/** A whole-hand radial glow, pulsing then fading, for the finale. */
export function drawFinaleGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, t: number, now: number): void {
  const env = Math.max(0, 1 - t / 6);
  if (env <= 0) return;
  const pulse = 0.5 + 0.5 * Math.sin(now / 380);
  const a = 0.2 * env * (0.55 + 0.45 * pulse);
  const r = radius * (0.9 + 0.18 * pulse);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(217,138,74,${a})`);
  g.addColorStop(1, 'rgba(217,138,74,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A progress ring filling around a point while the fingertip dwells on it. */
export function drawDwellRing(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number, color: string): void {
  const r = 15;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.stroke();
}

/** A small info box beside a hovered point. */
export function drawCallout(ctx: CanvasRenderingContext2D, x: number, y: number, lines: string[], color: string): void {
  ctx.font = '12px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
  const h = lines.length * 16 + 8;
  const bx = x + 12;
  const by = y - h / 2;
  ctx.fillStyle = 'rgba(11,10,8,0.88)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.fillRect(bx, by, w, h);
  ctx.strokeRect(bx, by, w, h);
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? color : 'rgba(255,255,255,0.9)';
    ctx.fillText(l, bx + 8, by + 12 + i * 16);
  });
}

export function drawPoint(
  ctx: CanvasRenderingContext2D,
  p: Vec2,
  rect: Rect,
  mirror: boolean,
  color: string,
  label: string,
  confidence: Confidence,
  showLabel: boolean,
  active = false,
): void {
  const [x, y] = toPx(p, rect, mirror);
  // confidence renders as certainty: confident points sharp, estimated soft.
  const soft = active ? 1 : confidence === 'low' ? 0.5 : confidence === 'med' ? 0.78 : 1;
  ctx.beginPath();
  ctx.arc(x, y, active ? 12 : confidence === 'low' ? 9 : 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = (active ? 0.3 : 0.16) * soft;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, active ? 5.5 : 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = soft;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = active ? 1.5 : 1;
  ctx.strokeStyle = active ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.55)';
  ctx.stroke();
  if (showLabel && !active) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 9, y);
  }
}
