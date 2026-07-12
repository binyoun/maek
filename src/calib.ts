// Live calibration overlay (?calib=1). The cun solver places points by rule,
// but the gap between skeletal landmarks and palpated surface points has to be
// closed against a real hand. Rather than edit acupoints.ts and redeploy per
// point, this mode tunes the two levers on device, the global cun ruler and a
// selected point's own parameters, then exports the tuned values to paste back
// once. It is inert unless ?calib=1 is present, so it never touches the piece.

import type { PointRule } from './cun';

export const calibMode = new URLSearchParams(location.search).has('calib');

// Multiplies the personal cun each frame; the single fix when every offset point
// sits uniformly too far out or too far in.
export let cunScale = 1;

interface Override { t?: number; cun?: number }
const overrides: Record<string, Override> = {};
// base rules of points that have been selected, kept so export can show old->new
const baseRules: Record<string, PointRule> = {};

export let selectedId: string | null = null;
let selectedLabel = '';

/** The rule actually solved, with any live overrides folded in. Unchanged when none. */
export function effectiveRule(id: string, rule: PointRule): PointRule {
  const o = overrides[id];
  if (!o) return rule;
  const base = !('at' in rule.base) && o.t != null ? { ...rule.base, t: o.t } : rule.base;
  const offset = rule.offset && o.cun != null ? { ...rule.offset, cun: o.cun } : rule.offset;
  return { base, offset };
}

// DOM, wired once. All guarded so the module is safe to import unconditionally.
let panel: HTMLElement | null = null;
let selEl: HTMLElement | null = null;
let tRow: HTMLElement | null = null;
let oRow: HTMLElement | null = null;
let tIn: HTMLInputElement | null = null;
let oIn: HTMLInputElement | null = null;
let tVal: HTMLElement | null = null;
let oVal: HTMLElement | null = null;
let out: HTMLTextAreaElement | null = null;
let cunVal: HTMLElement | null = null;

export function initCalib(): void {
  if (!calibMode) return;
  panel = document.getElementById('calib');
  panel?.classList.add('show');
  selEl = document.getElementById('c-sel');
  tRow = document.getElementById('c-trow');
  oRow = document.getElementById('c-orow');
  tIn = document.getElementById('c-t') as HTMLInputElement;
  oIn = document.getElementById('c-o') as HTMLInputElement;
  tVal = document.getElementById('c-tv');
  oVal = document.getElementById('c-ov');
  out = document.getElementById('c-out') as HTMLTextAreaElement;
  cunVal = document.getElementById('c-cunv');
  const cunIn = document.getElementById('c-cun') as HTMLInputElement;

  cunIn?.addEventListener('input', () => {
    cunScale = parseFloat(cunIn.value);
    if (cunVal) cunVal.textContent = cunScale.toFixed(2);
    writeExport();
  });
  tIn?.addEventListener('input', () => {
    if (!selectedId || !tIn) return;
    (overrides[selectedId] ??= {}).t = parseFloat(tIn.value);
    if (tVal) tVal.textContent = parseFloat(tIn.value).toFixed(2);
    writeExport();
  });
  oIn?.addEventListener('input', () => {
    if (!selectedId || !oIn) return;
    (overrides[selectedId] ??= {}).cun = parseFloat(oIn.value);
    if (oVal) oVal.textContent = parseFloat(oIn.value).toFixed(2);
    writeExport();
  });
  document.getElementById('c-copy')?.addEventListener('click', () => {
    if (out) { out.select(); navigator.clipboard?.writeText(out.value).catch(() => {}); }
  });
  document.getElementById('c-reset')?.addEventListener('click', () => {
    for (const k of Object.keys(overrides)) delete overrides[k];
    cunScale = 1;
    if (cunIn) cunIn.value = '1';
    if (cunVal) cunVal.textContent = '1.00';
    if (selectedId && baseRules[selectedId]) select(selectedId, baseRules[selectedId]!, selectedLabel);
    writeExport();
  });
}

/** Select a point (from a tap) and populate its sliders from its rule. Register
    agnostic: the caller passes the point's base rule and a display label. */
export function select(id: string, rule: PointRule, label: string): void {
  selectedId = id;
  selectedLabel = label;
  baseRules[id] = rule;
  if (!panel) return;
  const o = overrides[id] ?? {};
  if (selEl) selEl.textContent = label;

  const isSegment = !('at' in rule.base);
  if (isSegment && tRow && tIn && tVal) {
    tRow.hidden = false;
    const t = o.t ?? (rule.base as { t: number }).t;
    tIn.value = String(t);
    tVal.textContent = t.toFixed(2);
  } else if (tRow) {
    tRow.hidden = true;
  }

  if (rule.offset && oRow && oIn && oVal) {
    oRow.hidden = false;
    const c = o.cun ?? rule.offset.cun;
    oIn.value = String(c);
    oVal.textContent = c.toFixed(2);
  } else if (oRow) {
    oRow.hidden = true;
  }

  if (!isSegment && !rule.offset && selEl) {
    selEl.textContent = `${label} · sits on a landmark, nothing to tune`;
  }
}

function writeExport(): void {
  if (!out) return;
  const lines: string[] = ['// maek calibration'];
  if (cunScale !== 1) lines.push(`// cun.ts personalCun: multiply result by ${cunScale.toFixed(3)}`);
  const ids = Object.keys(overrides).filter((id) => overrides[id]!.t != null || overrides[id]!.cun != null);
  if (ids.length) lines.push('// acupoints.ts / koryo.ts:');
  for (const id of ids) {
    const rule = baseRules[id];
    if (!rule) continue;
    const o = overrides[id]!;
    const parts: string[] = [];
    if (o.t != null && !('at' in rule.base)) parts.push(`base.t ${(rule.base as { t: number }).t} -> ${o.t.toFixed(2)}`);
    if (o.cun != null && rule.offset) parts.push(`offset.cun ${rule.offset.cun} -> ${o.cun.toFixed(2)}`);
    if (parts.length) lines.push(`${id}: ${parts.join(', ')}`);
  }
  if (lines.length === 1) lines.push('// no changes yet');
  out.value = lines.join('\n');
}
