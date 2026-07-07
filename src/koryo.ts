import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Vec2 } from './cun';
import { mapPoint, type Rect } from './draw';

// Koryo Hand Therapy (고려수지침, Yoo Tae-Woo, 1971): a different register from the
// WHO channel atlas. The hand is read as a micro-map of the whole body: the
// middle finger is the head and the spinal axis, index and ring fingers the
// arms, thumb and little finger the legs, the palm the torso (front of body),
// the back of the hand the back. Kept schematic here (correspondence zones and
// the central axis), not the full micro-point set.

interface KoryoZone {
  at?: number; // a landmark
  from?: number; // or a fraction along a segment
  to?: number;
  t?: number;
  en: string;
  ko: string;
}

const SPINE: number[] = [12, 11, 10, 9, 0]; // central axis: head (middle fingertip) to base
const ACCENT = '#d98a4a';

const ZONES: KoryoZone[] = [
  { at: 12, en: 'head', ko: '머리' },
  { at: 8, en: 'arm', ko: '팔' }, // index
  { at: 16, en: 'arm', ko: '팔' }, // ring
  { at: 4, en: 'leg', ko: '다리' }, // thumb
  { at: 20, en: 'leg', ko: '다리' }, // little finger
  { from: 9, to: 0, t: 0.45, en: 'torso', ko: '몸통' }, // palm center
];

function at(lm: NormalizedLandmark[], z: KoryoZone): Vec2 {
  if (z.at != null) return { x: lm[z.at]!.x, y: lm[z.at]!.y };
  const a = lm[z.from!]!;
  const b = lm[z.to!]!;
  return { x: a.x + (b.x - a.x) * z.t!, y: a.y + (b.y - a.y) * z.t! };
}

export function drawKoryo(
  ctx: CanvasRenderingContext2D,
  lm: NormalizedLandmark[],
  rect: Rect,
  mirror: boolean,
  showLabels: boolean,
): void {
  // the spinal axis
  ctx.lineWidth = 3;
  ctx.strokeStyle = ACCENT;
  ctx.globalAlpha = 0.55;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  SPINE.forEach((i, k) => {
    const [x, y] = mapPoint({ x: lm[i]!.x, y: lm[i]!.y }, rect, mirror);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;

  // correspondence zones
  for (const z of ZONES) {
    const [x, y] = mapPoint(at(lm, z), rect, mirror);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (showLabels) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '12px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${z.en} ${z.ko}`, x + 10, y);
    }
  }
}

// For the legend panel.
export const KORYO_LEGEND = ZONES.map((z) => ({ en: z.en, ko: z.ko }));
