import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
  type Category,
} from '@mediapipe/tasks-vision';

// HandLandmarker, self-hosted (no CDN). 21 landmarks per hand, VIDEO mode.

const WASM_BASE = `${import.meta.env.BASE_URL}vendor/mediapipe-wasm`;
const HAND_MODEL = `${import.meta.env.BASE_URL}models/hand_landmarker.task`;

export interface HandsFrame {
  landmarks: NormalizedLandmark[][]; // per hand: 21 points, x/y normalized 0..1
  handedness: Category[][]; // per hand: Left / Right + confidence
}

let hands: HandLandmarker | null = null;

export async function initHands(numHands = 1): Promise<void> {
  if (hands) return;
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  hands = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands,
  });
}

/** Detect one video frame. timestampMs must strictly increase. */
export function detect(video: HTMLVideoElement, timestampMs: number): HandsFrame | null {
  if (!hands) return null;
  const r = hands.detectForVideo(video, timestampMs);
  return { landmarks: r.landmarks, handedness: r.handedness };
}
