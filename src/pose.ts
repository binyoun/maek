import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';

// PoseLandmarker, self-hosted (no CDN). 33 body landmarks, VIDEO mode. This is
// the body register of Maek: where the hand cun solver generalizes to the arm
// (elbow-to-wrist crease = 12 cun) and beyond. Kept on its own branch/mode
// because the body wants the camera stepped back, the hand wants it close.

const WASM_BASE = `${import.meta.env.BASE_URL}vendor/mediapipe-wasm`;
const POSE_MODEL = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;

// The pose landmark indices used here (MediaPipe Pose, 33 points).
export const P = {
  nose: 0,
  lShoulder: 11, rShoulder: 12,
  lElbow: 13, rElbow: 14,
  lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24,
} as const;

export interface PoseFrame {
  landmarks: NormalizedLandmark[][]; // per pose: 33 points, x/y normalized 0..1
}

let pose: PoseLandmarker | null = null;

export async function initPose(): Promise<void> {
  if (pose) return;
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  pose = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

/** Detect one video frame. timestampMs must strictly increase. */
export function detectPose(video: HTMLVideoElement, timestampMs: number): PoseFrame | null {
  if (!pose) return null;
  const r = pose.detectForVideo(video, timestampMs);
  return { landmarks: r.landmarks };
}
