# Hanabii - Implementation Progress

## Phase 1: Foundation
- [x] Project scaffolding (Vite + TypeScript + Three.js)
- [x] Basic Three.js scene: dark skybox, static starfield, camera
- [x] Orb entity with mouse/keyboard control and smooth movement
- [x] File picker UI, MP3 loading and Web Audio playback
- [x] Game state machine (MENU -> ANALYZING -> PLAYING -> RESULTS)

## Phase 2: Audio Analysis
- [x] Custom analysis pipeline (BPM autocorrelation, beat grid, onset detection, pitch contour, energy curve, key detection, section segmentation) - uses native Web Audio API instead of Essentia.js WASM for reliability
- [x] SongMap data structure
- [x] Meyda-style real-time feature extraction (RMS, spectral centroid, spectral flux, ZCR, band energies)

## Phase 3: Path & Sync
- [x] Ideal path generation from SongMap (pitch -> X, energy -> Y, time -> Z)
- [x] Path spline rendering (guide ribbon with adaptive visibility)
- [x] Synchronization engine (distance-based scoring, EMA smoothing, final score)
- [x] HUD (sync display, progress bar)

## Phase 4: Visual Elements
- [x] Firework particle system (peony, willow, chrysanthemum, kamuro types, beat-triggered, GPU instanced)
- [x] Firefly ambient system (Brownian motion, energy-driven density, sync-driven coherence)
- [x] Floating lanterns (section-triggered, color-coded, rising with flicker)
- [x] Aurora ribbon (pitch-driven vertex displacement, GLSL shader, confidence-gated)
- [x] Star twinkle system (ZCR-driven ambient twinkle, onset-triggered bursts, shooting stars)
- [x] Dynamic color palette (major/minor key palettes, section-based transitions, desaturation at low sync)

## Phase 5: Polish & Effects
- [x] Post-processing pipeline (UnrealBloomPass, custom distortion shader)
- [x] Distortion effects tied to sync level (chromatic aberration, vignette, film grain)
- [x] Camera system (follow cam, energy-responsive distance, procedural shake, cinematic push)
- [x] Results screen with scoring and rating labels
- [x] Pulse boost mechanic (space/gamepad A)

## Phase 6: Optimization & QA
- [ ] Performance profiling, particle budget enforcement
- [ ] Object pooling finalization
- [ ] Device capability detection and quality scaling
- [ ] Cross-browser testing

## Files Created
```
hanabii/
  index.html                          # Entry HTML with all UI screens
  package.json                        # Dependencies and scripts
  tsconfig.json                       # TypeScript strict config
  vite.config.ts                      # Vite + path aliases
  .gitignore
  PLAN.md                             # Full project spec
  PROGRESS.md                         # This file
  src/
    main.ts                           # Entry point, game loop, state wiring
    audio/
      structures.ts                   # SongMap, BeatEvent, RealtimeFeatures types
      loader.ts                       # Web Audio API file loading + playback
      analyzer.ts                     # Offline analysis (BPM, beats, onsets, pitch, sections, key)
      realtime.ts                     # Frame-by-frame feature extraction
    game/
      game-state.ts                   # State machine (MENU/ANALYZING/PLAYING/RESULTS)
      clock.ts                        # High-precision game clock
      input.ts                        # Mouse/keyboard/gamepad input
      path-generator.ts               # Ideal path from SongMap
      sync-tracker.ts                 # Sync scoring engine
    scene/
      scene-manager.ts                # Three.js scene/camera/renderer
      environment.ts                  # Static starfield
      camera-controller.ts            # Follow cam + shake + energy
    entities/
      orb.ts                          # Player orb (mesh, glow, trail, pulse)
      guide-path.ts                   # Visible ideal path ribbon
    visuals/
      visual-director.ts              # Master conductor for all visual systems
      color-palette.ts                # Dynamic palette per key/section/sync
      fireworks.ts                    # Beat-triggered firework bursts
      fireflies.ts                    # Ambient firefly particles
      lanterns.ts                     # Section-triggered floating lanterns
      aurora.ts                       # Pitch-driven aurora ribbon (GLSL)
      stars.ts                        # Twinkle-capable starfield
      post-processing.ts              # Bloom + chromatic aberration + vignette + grain
    utils/
      math.ts                         # lerp, clamp, catmullRom, easing, randomInSphere
      pool.ts                         # Generic object pool
```

## How to Run
```bash
cd hanabii
npm run dev
```
Then open http://localhost:5173 in a browser.
