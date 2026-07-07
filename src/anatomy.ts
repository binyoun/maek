import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// Palmar vs dorsal: which face of the hand we are seeing. Derived from the
// screen-space winding of (wrist->index) against (wrist->pinky), normalized by
// handedness. Chirality and camera mirroring make the raw sign device-dependent,
// so the UI offers a one-time "flip facing" calibration.
export function palmFacing(lm: NormalizedLandmark[], handedness: string, flip: boolean): boolean {
  const w = lm[0]!;
  const i = lm[5]!;
  const p = lm[17]!;
  const cross = (i.x - w.x) * (p.y - w.y) - (i.y - w.y) * (p.x - w.x);
  const facing = handedness === 'Right' ? cross < 0 : cross > 0;
  return flip ? !facing : facing;
}
