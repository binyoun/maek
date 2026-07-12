import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Vec2 } from './cun';
import { P } from './pose';
import { type Element, ELEMENT_COLOR } from './koryo';

// The cun solver on the body. Bones set the units (骨度分寸): the forearm from
// elbow crease to wrist crease is 12 cun, the lower leg from knee to ankle is 16
// cun. One cun is that span over its count, derived per person, per frame, from
// the pose landmarks. The same rule engine as the hand, at body scale, on three
// regions now: this generalization is the thesis.
//
// Points sit along a limb (t measured in cun from the distal joint) with an
// optional perpendicular offset in cun toward one edge. SCHEMATIC: a front
// camera cannot resolve a limb's rotation or its front/back face, so paired or
// medial/lateral points are spread sideways here rather than truly placed. The
// arms carry the Metal and Fire channels, the legs carry Wood, Earth and Water,
// so together the five elements are all present on the body.

interface LimbPoint {
  id: string;
  en: string;
  hanja: string;
  ko: string;
  element: Element;
  cunFromDistal: number; // up the limb from wrist/ankle
  perpCun?: number; // + lateral, - medial
}

interface Limb {
  distal: number;
  proximal: number;
  cunSpan: number;
  lateralSign: number; // flips the perpendicular per side
  side: 'L' | 'R';
  region: 'arm' | 'leg';
  points: LimbPoint[];
}

const FOREARM: LimbPoint[] = [
  { id: 'HT7', en: 'Spirit Gate', hanja: '神門', ko: '신문', element: 'Fire', cunFromDistal: 0, perpCun: -1.4 },
  { id: 'LU7', en: 'Broken Sequence', hanja: '列缺', ko: '열결', element: 'Metal', cunFromDistal: 1.5, perpCun: 1.6 },
  { id: 'PC6', en: 'Inner Pass', hanja: '內關', ko: '내관', element: 'Fire', cunFromDistal: 2, perpCun: 0 },
  { id: 'TE5', en: 'Outer Pass', hanja: '外關', ko: '외관', element: 'Fire', cunFromDistal: 2, perpCun: 1.8 },
  { id: 'LU5', en: 'Cubit Marsh', hanja: '尺澤', ko: '척택', element: 'Metal', cunFromDistal: 12, perpCun: 0.8 },
  { id: 'LI11', en: 'Pool at the Bend', hanja: '曲池', ko: '곡지', element: 'Metal', cunFromDistal: 12, perpCun: 2.4 },
];

const LOWERLEG: LimbPoint[] = [
  { id: 'KI3', en: 'Great Ravine', hanja: '太谿', ko: '태계', element: 'Water', cunFromDistal: 0, perpCun: -1.5 },
  { id: 'KI7', en: 'Recover Flow', hanja: '復溜', ko: '부류', element: 'Water', cunFromDistal: 2, perpCun: -1.5 },
  { id: 'SP6', en: 'Three Yin Crossing', hanja: '三陰交', ko: '삼음교', element: 'Earth', cunFromDistal: 3, perpCun: -2 },
  { id: 'ST36', en: 'Leg Three Miles', hanja: '足三里', ko: '족삼리', element: 'Earth', cunFromDistal: 13, perpCun: 2 },
  { id: 'GB34', en: 'Yang Mound Spring', hanja: '陽陵泉', ko: '양릉천', element: 'Wood', cunFromDistal: 15, perpCun: 2.5 },
  { id: 'LR8', en: 'Spring at the Bend', hanja: '曲泉', ko: '곡천', element: 'Wood', cunFromDistal: 15.5, perpCun: -2.5 },
];

const LIMBS: Limb[] = [
  { distal: P.lWrist, proximal: P.lElbow, cunSpan: 12, lateralSign: 1, side: 'L', region: 'arm', points: FOREARM },
  { distal: P.rWrist, proximal: P.rElbow, cunSpan: 12, lateralSign: -1, side: 'R', region: 'arm', points: FOREARM },
  { distal: P.lAnkle, proximal: P.lKnee, cunSpan: 16, lateralSign: 1, side: 'L', region: 'leg', points: LOWERLEG },
  { distal: P.rAnkle, proximal: P.rKnee, cunSpan: 16, lateralSign: -1, side: 'R', region: 'leg', points: LOWERLEG },
];

export interface BodySolved {
  id: string;
  en: string;
  hanja: string;
  ko: string;
  element: Element;
  color: string;
  side: 'L' | 'R';
  region: 'arm' | 'leg';
  pos: Vec2;
}

function lp(lm: NormalizedLandmark[], i: number): Vec2 {
  return { x: lm[i]!.x, y: lm[i]!.y };
}

/** Solve the point set on every limb the pose exposes. */
export function solveBody(lm: NormalizedLandmark[]): BodySolved[] {
  const out: BodySolved[] = [];
  for (const limb of LIMBS) {
    const d = lp(lm, limb.distal);
    const p = lp(lm, limb.proximal);
    const len = Math.hypot(p.x - d.x, p.y - d.y);
    if (len < 1e-4) continue;
    const cun = len / limb.cunSpan;
    const ux = (p.x - d.x) / len;
    const uy = (p.y - d.y) / len;
    const perpX = -uy * limb.lateralSign;
    const perpY = ux * limb.lateralSign;
    for (const pt of limb.points) {
      const along = pt.cunFromDistal * cun;
      const perp = (pt.perpCun ?? 0) * cun;
      out.push({
        id: pt.id,
        en: pt.en,
        hanja: pt.hanja,
        ko: pt.ko,
        element: pt.element,
        color: ELEMENT_COLOR[pt.element],
        side: limb.side,
        region: limb.region,
        pos: { x: d.x + ux * along + perpX * perp, y: d.y + uy * along + perpY * perp },
      });
    }
  }
  return out;
}

// The channels the front camera cannot reach on a standing body, named as
// absence rather than faked: the back and the interior.
export const UNSEEN: string[] = [
  '독맥 Governing vessel · the back, unseen',
  '방광 Bladder · the back, unseen',
  '충맥 Penetrating vessel · the core, unseen',
];
