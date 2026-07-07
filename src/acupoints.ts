import type { PointRule } from './cun';

// Phase 1 dataset: hand and wrist points locatable from the 21 hand landmarks
// alone, across four channels (three palmar, one dorsal). Locations follow the
// WHO Standard Acupuncture Point Locations (WPRO, 2008); the rules here are the
// landmark-relative approximations of those definitions, to be calibrated on a
// real hand. Confidence tiers are rendered visually (see draw.ts): they are
// honest about the gap between skeletal joints and palpation-defined surface points.
//
// Hand landmark indices: 0 wrist; 1-4 thumb; 5-8 index; 9-12 middle; 13-16 ring;
// 17-20 pinky (knuckle to tip).

export type Surface = 'palmar' | 'dorsal';
export type Confidence = 'high' | 'med' | 'low';

export interface Acupoint {
  id: string;
  names: { en: string; hanja: string; ko: string };
  meridian: string;
  surface: Surface;
  confidence: Confidence;
  rule: PointRule;
}

export interface Meridian {
  id: string;
  name: string;
  element: string;
  color: string;
  surface: Surface;
  points: string[]; // ordered by Qi flow, for drawing the channel
}

export const ACUPOINTS: Record<string, Acupoint> = {
  // Lung (LU), palmar/radial, flowing out to the thumb
  LU9: { id: 'LU9', names: { en: 'Great Abyss', hanja: '太淵', ko: '태연' }, meridian: 'LU', surface: 'palmar', confidence: 'med', rule: { base: { at: 0 }, offset: { toward: 2, cun: 1.2 } } },
  LU10: { id: 'LU10', names: { en: 'Fish Border', hanja: '魚際', ko: '어제' }, meridian: 'LU', surface: 'palmar', confidence: 'low', rule: { base: { from: 2, to: 0, t: 0.4 } } },
  LU11: { id: 'LU11', names: { en: 'Lesser Shang', hanja: '少商', ko: '소상' }, meridian: 'LU', surface: 'palmar', confidence: 'high', rule: { base: { at: 4 } } },

  // Pericardium (PC), palmar midline
  PC7: { id: 'PC7', names: { en: 'Great Mound', hanja: '大陵', ko: '대릉' }, meridian: 'PC', surface: 'palmar', confidence: 'med', rule: { base: { from: 0, to: 9, t: 0.06 } } },
  PC8: { id: 'PC8', names: { en: 'Palace of Toil', hanja: '勞宮', ko: '노궁' }, meridian: 'PC', surface: 'palmar', confidence: 'med', rule: { base: { from: 9, to: 0, t: 0.32 } } },
  PC9: { id: 'PC9', names: { en: 'Central Hub', hanja: '中衝', ko: '중충' }, meridian: 'PC', surface: 'palmar', confidence: 'high', rule: { base: { at: 12 } } },

  // Heart (HT), palmar/ulnar
  HT7: { id: 'HT7', names: { en: 'Spirit Gate', hanja: '神門', ko: '신문' }, meridian: 'HT', surface: 'palmar', confidence: 'med', rule: { base: { at: 0 }, offset: { toward: 17, cun: 1.2 } } },
  HT8: { id: 'HT8', names: { en: 'Lesser Mansion', hanja: '少府', ko: '소부' }, meridian: 'HT', surface: 'palmar', confidence: 'low', rule: { base: { from: 17, to: 0, t: 0.35 }, offset: { toward: 9, cun: 0.8 } } },
  HT9: { id: 'HT9', names: { en: 'Lesser Surge', hanja: '少衝', ko: '소충' }, meridian: 'HT', surface: 'palmar', confidence: 'high', rule: { base: { at: 20 } } },

  // Large Intestine (LI), dorsal, flowing in from the index
  LI1: { id: 'LI1', names: { en: 'Shang Yang', hanja: '商陽', ko: '상양' }, meridian: 'LI', surface: 'dorsal', confidence: 'high', rule: { base: { at: 8 } } },
  LI3: { id: 'LI3', names: { en: 'Third Space', hanja: '三間', ko: '삼간' }, meridian: 'LI', surface: 'dorsal', confidence: 'med', rule: { base: { from: 8, to: 5, t: 0.72 } } },
  LI4: { id: 'LI4', names: { en: 'Union Valley', hanja: '合谷', ko: '합곡' }, meridian: 'LI', surface: 'dorsal', confidence: 'low', rule: { base: { from: 5, to: 2, t: 0.5 }, offset: { toward: 0, cun: 0.6 } } },
};

// Five Elements colours; the two fire channels (HT sovereign, PC ministerial)
// and the two metal channels (LU, LI) are tinted apart for legibility.
export const MERIDIANS: Meridian[] = [
  { id: 'LU', name: 'Lung', element: 'Metal', color: '#cdd6de', surface: 'palmar', points: ['LU9', 'LU10', 'LU11'] },
  { id: 'PC', name: 'Pericardium', element: 'Fire', color: '#e0894a', surface: 'palmar', points: ['PC7', 'PC8', 'PC9'] },
  { id: 'HT', name: 'Heart', element: 'Fire', color: '#e5544b', surface: 'palmar', points: ['HT7', 'HT8', 'HT9'] },
  { id: 'LI', name: 'Large Intestine', element: 'Metal', color: '#93a2ae', surface: 'dorsal', points: ['LI1', 'LI3', 'LI4'] },
];
