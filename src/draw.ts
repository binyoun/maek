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

export function drawChannel(ctx: CanvasRenderingContext2D, pts: Vec2[], rect: Rect, mirror: boolean, color: string): void {
  if (pts.length < 2) return;
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
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

export function drawPoint(
  ctx: CanvasRenderingContext2D,
  p: Vec2,
  rect: Rect,
  mirror: boolean,
  color: string,
  label: string,
  confidence: Confidence,
  showLabel: boolean,
): void {
  const [x, y] = toPx(p, rect, mirror);
  // confidence renders as certainty: confident points sharp, estimated soft.
  const soft = confidence === 'low' ? 0.5 : confidence === 'med' ? 0.78 : 1;
  ctx.beginPath();
  ctx.arc(x, y, confidence === 'low' ? 9 : 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16 * soft;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = soft;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.stroke();
  if (showLabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 9, y);
  }
}
