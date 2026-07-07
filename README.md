# maek 맥

The East Asian medical body, mapped onto your own hand in real time. Acupuncture
points (혈점) and meridian channels (경락) are located by proportional measurement
(cun, 骨度分寸 / 同身寸), the body's own units, not fixed pixels: each point is
stored as a rule relative to hand landmarks and solved every frame against your
hand, so the map rescales with hand size and camera distance for free.

Phase 1 of the **Maek** project (see the plan in the vault). A camera piece, a
practice-based research artifact toward "Sensing Otherwise", and a step from the
`mediapipe-hands` sandbox toward an acupoint / meridian atlas.

**A design source and cultural coordinate system, not medical advice.** It
diagnoses nothing and treats nothing.

## Run it

```
npm install
npm run dev
```

HTTPS dev server (camera needs a secure context). Accept the self-signed
certificate, "allow camera", and show your hand. Turn it over to move between the
palmar and dorsal channels. Toggle "flip facing" once if palm and back read
inverted on your device.

## What it does (phase 1)

- Locates hand and wrist points across four channels, three palmar (Lung,
  Pericardium, Heart) and one dorsal (Large Intestine), and draws each channel
  through its points in its Five Elements colour.
- Solves every point from your hand's own proportions each frame (`src/cun.ts`).
- Shows the palmar or the dorsal channels depending on which face of the hand
  you present (`src/anatomy.ts`).
- Renders confidence honestly: confident points sharp, estimated points soft.

## How it is built

- `src/cun.ts` — the proportional solver. `personalCun` derives one finger-cun
  from the middle phalanx (landmarks 10 to 11); `solvePoint` evaluates a point's
  rule (a landmark, or a fraction along a segment, plus an optional offset in cun).
- `src/acupoints.ts` — the dataset: each point with its names (en / 한자 / 한글),
  meridian, surface, confidence, and landmark-relative rule; and the meridians
  with their Five Elements colour and ordered point sequence.
- `src/anatomy.ts` — palmar vs dorsal from the hand's orientation.
- `src/draw.ts` — the faint skeleton, the channels, and the labelled points.
- `src/hands.ts` — the MediaPipe HandLandmarker (self-hosted, VIDEO mode).

## Standards and references

- Point locations follow the **WHO Standard Acupuncture Point Locations in the
  Western Pacific Region** (WPRO, 2008). The rules here are landmark-relative
  approximations of those definitions, to be calibrated against a real hand.
- Philosophical and traditional context: the *Huangdi Neijing* (黃帝內經) and the
  *Dongui Bogam* (東醫寶鑑).

## Honest limits (phase 1)

- Landmarks are estimated joint centres; acupoints are palpation-defined surface
  sites. The mapping layer bridges that gap and the confidence tiers make it
  visible.
- Placement is 2D; points are gated by hand orientation rather than registered
  in 3D. Cun fractions are only accurate when the hand is roughly parallel to the
  camera.
- Palm-versus-back detection is a heuristic; use the "flip facing" toggle to
  calibrate.

## Roadmap

Phase 2 adds the body via `PoseLandmarker` (forearm and leg points, bone-
proportional cun). Phase 3 adds interaction (hover to reveal, dwell to press, the
channel lighting along its flow, optionally paced by a pulse sensor). See the
project plan.

## Deploy

Push to `main`; GitHub Actions builds and publishes to GitHub Pages. Vite `base`
is set to the repo name (`/maek/`).
