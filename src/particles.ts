import { type Element, ELEMENTS, ELEMENT_COLOR, ELEMENT_HANJA } from './koryo';

// Five element particles drifting in the air (normalized frame coords). Reach a
// fingertip into one and it flares, sounding its tone, and every body point of
// that element glows. The catch-a-colour gesture, at body scale.

export interface Particle {
  element: Element;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number;
  flare: number; // 0..1, decays after a touch
  armed: boolean; // fingertip must leave before it can be caught again
}

export function makeParticles(): Particle[] {
  return ELEMENTS.map((el, i) => ({
    element: el,
    x: 0.22 + 0.14 * i,
    y: 0.28 + 0.12 * Math.sin(i * 1.7),
    vx: (i % 2 ? 1 : -1) * 0.000036,
    vy: (i % 3 ? 1 : -1) * 0.000027,
    ph: i * 1.3,
    flare: 0,
    armed: true,
  }));
}

export function updateParticles(ps: Particle[], dt: number, now: number): void {
  for (const p of ps) {
    p.x += p.vx * dt + Math.cos(now / 1500 + p.ph) * 0.00036;
    p.y += p.vy * dt + Math.sin(now / 1200 + p.ph) * 0.00036;
    if (p.x < 0.08 || p.x > 0.92) p.vx *= -1;
    if (p.y < 0.12 || p.y > 0.74) p.vy *= -1;
    p.x = Math.max(0.06, Math.min(0.94, p.x));
    p.y = Math.max(0.1, Math.min(0.78, p.y));
    if (p.flare > 0) p.flare = Math.max(0, p.flare - dt / 700);
  }
}

/** Draw one particle as a soft glowing orb with its element sign. */
export function drawParticle(ctx: CanvasRenderingContext2D, x: number, y: number, p: Particle, now: number): void {
  const bob = 0.6 + 0.4 * Math.sin(now / 600 + p.ph);
  const r = (16 + 6 * bob + 22 * p.flare) * 1.3;
  const col = ELEMENT_COLOR[p.element];
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
  g.addColorStop(0, hexA(col, 0.5 + 0.4 * p.flare));
  g.addColorStop(0.5, hexA(col, 0.16));
  g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexA(col, 0.9);
  ctx.beginPath();
  ctx.arc(x, y, (4 + 3 * bob) * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(11,10,8,0.9)';
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ELEMENT_HANJA[p.element], x, y + 0.5);
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
