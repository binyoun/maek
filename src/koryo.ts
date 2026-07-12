import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { solvePoint, type Vec2, type PointRule } from './cun';
import { mapPoint, type Rect } from './draw';

// Koryo Hand Therapy (고려수지침, Yoo Tae-Woo, 1971): a different register from the
// WHO channel atlas. The hand is read as a micro-map of the whole body: the
// middle finger is the head and the spinal axis, index and ring fingers the
// arms, thumb and little finger the legs, the palm the torso (front of body),
// the back of the hand the back. Because the WHOLE body is projected onto the
// hand here, all Five Elements are present, not only the Metal and Fire arm
// channels of the WHO register: the fourteen organ meridians map on, the six
// yin (장, solid) organs and the Conception vessel read on the palm, the six
// yang (부, hollow) organs and the Governing vessel on the back.
//
// The placements below are SCHEMATIC correspondences on the 21 hand landmarks,
// arranged by the Koryo body projection (chest high near the knuckles, abdomen
// mid-palm, pelvis toward the wrist), NOT the precise Yoo Tae-Woo point atlas
// coordinates. Ids are Yoo Tae-Woo's Koryo meridian letters (A-N), in organ-clock
// order: A 임맥, B 독맥, then C 폐, D 대장, E 위, F 비, G 심, H 소장, I 방광, J 신,
// K 심포, L 삼초, M 담, N 간. These are the meridian-level codes; the individual
// numbered points along each (A1.., C1..) are a further layer, deferred.

export type Element = 'Wood' | 'Fire' | 'Earth' | 'Metal' | 'Water' | 'Vessel';

export const ELEMENTS: Element[] = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];

export const ELEMENT_HANJA: Record<Element, string> = {
  Wood: '木', Fire: '火', Earth: '土', Metal: '金', Water: '水', Vessel: '脈',
};

export const ELEMENT_KO: Record<Element, string> = {
  Wood: '목', Fire: '화', Earth: '토', Metal: '금', Water: '수', Vessel: '맥',
};

export const ELEMENT_COLOR: Record<Element, string> = {
  Wood: '#7bab6e', Fire: '#e5544b', Earth: '#d8b24a', Metal: '#c6d2dc', Water: '#5b93c4', Vessel: '#d98a4a',
};

// The authentic Five Elements to Five Tones (오행 → 오음, 궁상각치우) mapping, sounded
// on press. Wood 角, Fire 徵, Earth 宮, Metal 商, Water 羽. Vessels stay silent.
export const ELEMENT_NOTE: Record<Element, number | null> = {
  Wood: 329.63, // 角 E4
  Fire: 392.0, // 徵 G4
  Earth: 261.63, // 宮 C4
  Metal: 293.66, // 商 D4
  Water: 220.0, // 羽 A3, deep
  Vessel: null,
};

interface KoryoPoint {
  id: string;
  en: string;
  hanja: string;
  ko: string;
  element: Element;
  surface: 'palmar' | 'dorsal';
  rule: PointRule;
}

// Palm axis for the rules below runs wrist(0) -> middle knuckle(9): t=0 at the
// pelvis, t~0.8 at the chest; lateral nudges lean toward the radial (5) or ulnar
// (13, 17) side in the person's own cun.
const KORYO_POINTS: KoryoPoint[] = [
  // Palmar: the six yin (장) organs + Pericardium's ministerial fire + the Conception vessel
  { id: 'C', en: 'Lung', hanja: '肺', ko: '폐', element: 'Metal', surface: 'palmar', rule: { base: { from: 0, to: 9, t: 0.8 }, offset: { toward: 5, cun: 0.8 } } },
  { id: 'G', en: 'Heart', hanja: '心', ko: '심', element: 'Fire', surface: 'palmar', rule: { base: { from: 0, to: 9, t: 0.78 }, offset: { toward: 13, cun: 0.7 } } },
  { id: 'K', en: 'Pericardium', hanja: '心包', ko: '심포', element: 'Fire', surface: 'palmar', rule: { base: { from: 0, to: 9, t: 0.62 } } },
  { id: 'N', en: 'Liver', hanja: '肝', ko: '간', element: 'Wood', surface: 'palmar', rule: { base: { from: 0, to: 9, t: 0.5 }, offset: { toward: 5, cun: 1.1 } } },
  { id: 'F', en: 'Spleen', hanja: '脾', ko: '비', element: 'Earth', surface: 'palmar', rule: { base: { from: 0, to: 9, t: 0.5 }, offset: { toward: 13, cun: 0.9 } } },
  { id: 'J', en: 'Kidney', hanja: '腎', ko: '신', element: 'Water', surface: 'palmar', rule: { base: { from: 0, to: 9, t: 0.3 }, offset: { toward: 5, cun: 0.5 } } },
  { id: 'A', en: 'Conception Vessel', hanja: '任脈', ko: '임맥', element: 'Vessel', surface: 'palmar', rule: { base: { from: 12, to: 9, t: 0.35 } } },
  // Dorsal: the six yang (부) organs + the Governing vessel
  { id: 'D', en: 'Large Intestine', hanja: '大腸', ko: '대장', element: 'Metal', surface: 'dorsal', rule: { base: { from: 0, to: 9, t: 0.8 }, offset: { toward: 5, cun: 0.8 } } },
  { id: 'H', en: 'Small Intestine', hanja: '小腸', ko: '소장', element: 'Fire', surface: 'dorsal', rule: { base: { from: 0, to: 9, t: 0.5 }, offset: { toward: 17, cun: 1.0 } } },
  { id: 'L', en: 'Triple Energizer', hanja: '三焦', ko: '삼초', element: 'Fire', surface: 'dorsal', rule: { base: { from: 0, to: 9, t: 0.62 }, offset: { toward: 13, cun: 0.6 } } },
  { id: 'M', en: 'Gallbladder', hanja: '膽', ko: '담', element: 'Wood', surface: 'dorsal', rule: { base: { from: 0, to: 9, t: 0.5 }, offset: { toward: 5, cun: 1.1 } } },
  { id: 'E', en: 'Stomach', hanja: '胃', ko: '위', element: 'Earth', surface: 'dorsal', rule: { base: { from: 0, to: 9, t: 0.62 } } },
  { id: 'I', en: 'Bladder', hanja: '膀胱', ko: '방광', element: 'Water', surface: 'dorsal', rule: { base: { from: 0, to: 9, t: 0.3 }, offset: { toward: 13, cun: 0.5 } } },
  { id: 'B', en: 'Governing Vessel', hanja: '督脈', ko: '독맥', element: 'Vessel', surface: 'dorsal', rule: { base: { from: 12, to: 9, t: 0.35 } } },
];

export interface KoryoSolved {
  id: string;
  en: string;
  hanja: string;
  ko: string;
  element: Element;
  color: string;
  note: number | null;
  pos: Vec2;
}

/** The correspondence points on the visible face, solved to this hand. */
export function solveKoryo(lm: NormalizedLandmark[], cun: number, surface: 'palmar' | 'dorsal'): KoryoSolved[] {
  const out: KoryoSolved[] = [];
  for (const p of KORYO_POINTS) {
    if (p.surface !== surface) continue;
    out.push({
      id: p.id,
      en: p.en,
      hanja: p.hanja,
      ko: p.ko,
      element: p.element,
      color: ELEMENT_COLOR[p.element],
      note: ELEMENT_NOTE[p.element],
      pos: solvePoint(lm, p.rule, cun),
    });
  }
  return out;
}

const SPINE: number[] = [12, 11, 10, 9, 0]; // central axis: head (middle fingertip) to base
const ACCENT = '#d98a4a';

/** The Koryo body scaffold: the spinal axis and the four limb correspondences. */
export function drawKoryoAxis(ctx: CanvasRenderingContext2D, lm: NormalizedLandmark[], rect: Rect, mirror: boolean): void {
  ctx.lineWidth = 3;
  ctx.strokeStyle = ACCENT;
  ctx.globalAlpha = 0.45;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  SPINE.forEach((i, k) => {
    const [x, y] = mapPoint({ x: lm[i]!.x, y: lm[i]!.y }, rect, mirror);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  // limbs: shoulders to index/ring (arms), hips to thumb/little (legs)
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 2;
  const limb = (from: number, to: number): void => {
    const [ax, ay] = mapPoint({ x: lm[from]!.x, y: lm[from]!.y }, rect, mirror);
    const [bx, by] = mapPoint({ x: lm[to]!.x, y: lm[to]!.y }, rect, mirror);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  };
  limb(9, 5); limb(9, 8); // arm to index
  limb(9, 13); limb(13, 16); // arm to ring
  limb(0, 2); limb(2, 4); // leg to thumb
  limb(0, 17); limb(17, 20); // leg to little finger
  ctx.globalAlpha = 1;
}

// For the legend panel: the Five Elements carried on the Koryo hand.
export const KORYO_LEGEND = ELEMENTS.map((el) => ({ element: el, color: ELEMENT_COLOR[el], hanja: ELEMENT_HANJA[el], ko: ELEMENT_KO[el] }));
