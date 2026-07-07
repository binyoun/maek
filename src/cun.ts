import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// The proportional-location core. WHO acupoint locations are defined in cun
// (骨度分寸 / 同身寸), the body's own units, not in pixels. So a point is stored
// as a RULE relative to named landmarks, and solved each frame against the
// participant's actual hand: their personal cun is derived from their own
// landmarks, so the map rescales with hand size and camera distance for free.

export interface Vec2 {
  x: number;
  y: number;
}

export type LM = number; // hand landmark index 0..20

// base: either a landmark, or a fraction along the segment between two landmarks.
// offset: an optional nudge in the participant's own cun, toward another landmark.
export interface PointRule {
  base: { at: LM } | { from: LM; to: LM; t: number };
  offset?: { toward: LM; cun: number };
}

function lp(lm: NormalizedLandmark[], i: number): Vec2 {
  return { x: lm[i]!.x, y: lm[i]!.y };
}
function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * One finger-cun (同身寸) in normalized image units: the length of the middle
 * phalanx of the middle finger (landmarks 10 to 11). A per-person, per-frame
 * ruler. Landmarks are joint centers, not skin creases, so this is a proxy, but
 * it scales offsets with the actual hand.
 */
export function personalCun(lm: NormalizedLandmark[]): number {
  const c = dist(lp(lm, 10), lp(lm, 11));
  return c > 1e-4 ? c : dist(lp(lm, 0), lp(lm, 9)) * 0.33; // fallback to wrist->MCP
}

/** Solve a rule to a normalized 2D position on the hand. */
export function solvePoint(lm: NormalizedLandmark[], rule: PointRule, cun: number): Vec2 {
  let p: Vec2;
  if ('at' in rule.base) {
    p = lp(lm, rule.base.at);
  } else {
    const a = lp(lm, rule.base.from);
    const b = lp(lm, rule.base.to);
    p = { x: a.x + (b.x - a.x) * rule.base.t, y: a.y + (b.y - a.y) * rule.base.t };
  }
  if (rule.offset) {
    const t = lp(lm, rule.offset.toward);
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const d = rule.offset.cun * cun;
    p = { x: p.x + (dx / len) * d, y: p.y + (dy / len) * d };
  }
  return p;
}
