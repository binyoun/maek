// A pool of short-lived motes in screen space, the visual language of the body
// register. The hand sheds faint element motes as it moves (a living
// constellation); when a hand point meets a body point of the same element, the
// contact bursts a spray of that colour and a stream flows along the meeting.
// Drawn additively so overlapping motes bloom.

export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

const pool: Mote[] = [];
const CAP = 600;

function push(m: Mote): void {
  if (pool.length < CAP) pool.push(m);
}

/** A radiating spray at a resonance contact. */
export function burst(x: number, y: number, color: string, n = 14): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.02 + Math.random() * 0.1;
    push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.02, life: 0, max: 600 + Math.random() * 500, color, size: 1.5 + Math.random() * 2.2 });
  }
}

/** A few motes flowing along the arc between two meeting points. */
export function stream(ax: number, ay: number, bx: number, by: number, color: string, n = 2): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 0; i < n; i++) {
    const t = Math.random();
    const j = (Math.random() - 0.5) * 10;
    push({ x: ax + dx * t - (dy / len) * j, y: ay + dy * t + (dx / len) * j, vx: (dx / len) * 0.03, vy: (dy / len) * 0.03 - 0.01, life: 0, max: 380 + Math.random() * 280, color, size: 1.2 + Math.random() * 1.4 });
  }
}

/** One slow rising mote shed by a moving point. */
export function ambient(x: number, y: number, color: string): void {
  push({ x: x + (Math.random() - 0.5) * 6, y, vx: (Math.random() - 0.5) * 0.006, vy: -0.01 - Math.random() * 0.01, life: 0, max: 700 + Math.random() * 500, color, size: 1 + Math.random() * 1.3 });
}

export function updateMotes(dt: number): void {
  for (let i = pool.length - 1; i >= 0; i--) {
    const m = pool[i]!;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.vy += 0.00002 * dt; // gentle gravity
    m.vx *= 0.999;
    m.life += dt;
    if (m.life >= m.max) pool.splice(i, 1);
  }
}

export function drawMotes(ctx: CanvasRenderingContext2D): void {
  ctx.globalCompositeOperation = 'lighter';
  for (const m of pool) {
    ctx.globalAlpha = Math.max(0, 1 - m.life / m.max) * 0.8;
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
