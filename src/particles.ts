import { type Element, ELEMENTS, ELEMENT_COLOR, ELEMENT_HANJA } from './koryo';

// Orbs are element colours drifting slowly in the air. Brush a matching-colour
// point (on hand or body) through one and its element wakes: the corresponding
// points light and a soft tone sounds. Motes are the faint light shed on a
// touch and by the orbs themselves. Everything slow and soft, meditative.

export interface Orb {
  element: Element;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number;
  flare: number;
  armed: boolean; // a point must leave before it can wake the orb again
}

export function makeOrbs(): Orb[] {
  const orbs: Orb[] = [];
  ELEMENTS.forEach((el, i) => {
    for (let k = 0; k < 2; k++) {
      orbs.push({
        element: el,
        x: 0.14 + Math.random() * 0.72,
        y: 0.14 + Math.random() * 0.62,
        vx: (Math.random() - 0.5) * 0.00001,
        vy: (Math.random() - 0.5) * 0.00001,
        ph: Math.random() * Math.PI * 2 + i,
        flare: 0,
        armed: true,
      });
    }
  });
  return orbs;
}

export function updateOrbs(orbs: Orb[], dt: number, now: number): void {
  for (const o of orbs) {
    o.x += o.vx * dt + Math.cos(now / 2600 + o.ph) * 0.00011;
    o.y += o.vy * dt + Math.sin(now / 2300 + o.ph) * 0.00011;
    if (o.x < 0.06 || o.x > 0.94) o.vx *= -1;
    if (o.y < 0.08 || o.y > 0.82) o.vy *= -1;
    o.x = Math.max(0.05, Math.min(0.95, o.x));
    o.y = Math.max(0.06, Math.min(0.84, o.y));
    if (o.flare > 0) o.flare = Math.max(0, o.flare - dt / 1400);
  }
}

export function drawOrb(ctx: CanvasRenderingContext2D, x: number, y: number, o: Orb, now: number): void {
  const bob = 0.5 + 0.5 * Math.sin(now / 1500 + o.ph);
  const r = 22 + 9 * bob + 26 * o.flare;
  const col = ELEMENT_COLOR[o.element];
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(col, 0.24 + 0.4 * o.flare));
  g.addColorStop(0.55, hexA(col, 0.08));
  g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexA(col, 0.5 + 0.3 * o.flare);
  ctx.beginPath();
  ctx.arc(x, y, 2.5 + 2 * bob, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexA(col, 0.6);
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ELEMENT_HANJA[o.element], x, y + 0.5);
}

// Motes: soft, slow light.
interface Mote { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
const pool: Mote[] = [];
const CAP = 500;

function put(m: Mote): void {
  if (pool.length < CAP) pool.push(m);
}

/** A gentle spray when a point wakes an orb. */
export function burst(x: number, y: number, color: string, n = 10): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.008 + Math.random() * 0.04;
    put({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.012, life: 0, max: 900 + Math.random() * 700, color, size: 1.2 + Math.random() * 1.8 });
  }
}

/** One slow rising mote, shed by a drifting orb. */
export function ambient(x: number, y: number, color: string): void {
  put({ x: x + (Math.random() - 0.5) * 8, y, vx: (Math.random() - 0.5) * 0.004, vy: -0.008 - Math.random() * 0.008, life: 0, max: 1100 + Math.random() * 700, color, size: 1 + Math.random() * 1.2 });
}

export function updateMotes(dt: number): void {
  for (let i = pool.length - 1; i >= 0; i--) {
    const m = pool[i]!;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.vy += 0.000012 * dt;
    m.vx *= 0.9992;
    m.life += dt;
    if (m.life >= m.max) pool.splice(i, 1);
  }
}

export function drawMotes(ctx: CanvasRenderingContext2D): void {
  ctx.globalCompositeOperation = 'lighter';
  for (const m of pool) {
    ctx.globalAlpha = Math.max(0, 1 - m.life / m.max) * 0.7;
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
