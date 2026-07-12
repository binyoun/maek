import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Vec2 } from './cun';
import { P } from './pose';
import { type Element, ELEMENT_COLOR } from './koryo';

// The cun solver on the body. The forearm from the elbow crease to the wrist
// crease is 12 cun (骨度分寸), so one cun on the arm is that length over twelve,
// derived per person, per frame, from their own pose landmarks. The same rule
// engine as the hand, at a different scale: this generalization is the thesis.
//
// Points are placed along the forearm (t: 0 at the wrist, 1 at the elbow) with
// an optional perpendicular offset in cun toward the radial (+) or ulnar (-)
// edge. SCHEMATIC: the front camera cannot resolve the palmar/dorsal face of the
// forearm or its rotation, so paired points (PC6 palmar / TE5 dorsal) are spread
// laterally here rather than truly front/back. That unresolved face is exactly
// what the "unseen" register names rather than fakes.

interface Arm { side: 'L' | 'R'; shoulder: number; elbow: number; wrist: number; radialSign: number }
const ARMS: Arm[] = [
  { side: 'L', shoulder: P.lShoulder, elbow: P.lElbow, wrist: P.lWrist, radialSign: 1 },
  { side: 'R', shoulder: P.rShoulder, elbow: P.rElbow, wrist: P.rWrist, radialSign: -1 },
];

interface BodyPointDef {
  id: string;
  en: string;
  hanja: string;
  ko: string;
  element: Element;
  cunFromWrist: number; // proximal distance up the forearm, in cun (0..12)
  perpCun?: number; // + radial, - ulnar, in cun
}

// A starter set on the forearm, the most landmark-resolvable body region.
const FOREARM: BodyPointDef[] = [
  { id: 'HT7', en: 'Spirit Gate', hanja: '神門', ko: '신문', element: 'Fire', cunFromWrist: 0, perpCun: -1.4 },
  { id: 'LU7', en: 'Broken Sequence', hanja: '列缺', ko: '열결', element: 'Metal', cunFromWrist: 1.5, perpCun: 1.6 },
  { id: 'PC6', en: 'Inner Pass', hanja: '內關', ko: '내관', element: 'Fire', cunFromWrist: 2, perpCun: 0 },
  { id: 'TE5', en: 'Outer Pass', hanja: '外關', ko: '외관', element: 'Fire', cunFromWrist: 2, perpCun: 1.8 },
  { id: 'LU5', en: 'Cubit Marsh', hanja: '尺澤', ko: '척택', element: 'Metal', cunFromWrist: 12, perpCun: 0.8 },
  { id: 'LI11', en: 'Pool at the Bend', hanja: '曲池', ko: '곡지', element: 'Metal', cunFromWrist: 12, perpCun: 2.4 },
];

export interface BodySolved {
  id: string;
  en: string;
  hanja: string;
  ko: string;
  element: Element;
  color: string;
  arm: 'L' | 'R'; // which forearm it sits on; explored by the opposite index finger
  cun: number; // this arm's cun, for hover reach
  pos: Vec2;
}

function lp(lm: NormalizedLandmark[], i: number): Vec2 {
  return { x: lm[i]!.x, y: lm[i]!.y };
}
function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** One cun on a given forearm: elbow-to-wrist over twelve. */
export function forearmCun(lm: NormalizedLandmark[], arm: Arm): number {
  return dist(lp(lm, arm.elbow), lp(lm, arm.wrist)) / 12;
}

/** Solve the starter arm points on both forearms visible to the pose. */
export function solveBody(lm: NormalizedLandmark[]): BodySolved[] {
  const out: BodySolved[] = [];
  for (const arm of ARMS) {
    const wrist = lp(lm, arm.wrist);
    const elbow = lp(lm, arm.elbow);
    const cun = forearmCun(lm, arm);
    if (cun < 1e-4) continue;
    // unit vector up the forearm, and its perpendicular
    const ux = (elbow.x - wrist.x) / (cun * 12);
    const uy = (elbow.y - wrist.y) / (cun * 12);
    const px = -uy * arm.radialSign;
    const py = ux * arm.radialSign;
    for (const d of FOREARM) {
      const along = d.cunFromWrist * cun;
      const perp = (d.perpCun ?? 0) * cun;
      out.push({
        id: d.id,
        en: d.en,
        hanja: d.hanja,
        ko: d.ko,
        element: d.element,
        color: ELEMENT_COLOR[d.element],
        arm: arm.side,
        cun,
        pos: { x: wrist.x + ux * along + px * perp, y: wrist.y + uy * along + py * perp },
      });
    }
  }
  return out;
}

// The channels and points the front camera cannot resolve on a standing body:
// the back (Governing vessel, Bladder), and the interior organ projections.
// Named here as absences, rendered at the frame edge, rather than faked.
export const UNSEEN: string[] = [
  '독맥 Governing vessel · the back, unseen',
  '방광 Bladder · the back, unseen',
  '신 Kidney · deep, unseen',
  '충맥 Penetrating vessel · the core, unseen',
];
