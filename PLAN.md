# Hanabii - Music Visualization Game

## Overview

Hanabii (from Japanese _hanabi_ - fireworks) is a browser-based music visualization game where players guide a glowing orb through a procedurally generated nightscape driven by audio analysis. The player's movement synchronization with the music determines the beauty and accuracy of the visual experience.

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Language | TypeScript (strict mode) | Type safety across audio + rendering pipelines |
| Build | Vite | Fast HMR, native TS/ESM support, simple config |
| Audio Analysis | Meyda (real-time features) + Essentia.js WASM (offline deep analysis) | Meyda is lightweight for frame-by-frame features; Essentia provides structural/harmonic/rhythmic analysis upfront |
| Rendering | Three.js + custom GLSL shaders | Industry standard for WebGL, great particle/post-processing ecosystem |
| Post-Processing | Three.js EffectComposer | Bloom, chromatic aberration, film grain for the night sky aesthetic |
| Audio Playback | Web Audio API (native) | Low-latency, precise timing, analyser nodes for real-time FFT |
| State Management | Vanilla TS (no framework) | Minimal UI surface - a framework would be overkill |
| UI | HTML/CSS overlay on WebGL canvas | Song picker, HUD, end screen |

---

## Architecture

```
src/
  main.ts                   # Entry point, game loop orchestration

  audio/
    loader.ts               # MP3 file loading, decoding to AudioBuffer
    analyzer.ts             # Offline deep analysis via Essentia.js (runs in Web Worker)
    realtime.ts             # Real-time audio features via Meyda (RMS, spectral centroid, etc.)
    structures.ts           # Types for analysis output (SongMap, beat grid, sections, etc.)

  game/
    game-state.ts           # State machine: MENU -> ANALYZING -> PLAYING -> RESULTS
    clock.ts                # High-precision game clock synced to audio currentTime
    sync-tracker.ts         # Synchronization scoring engine
    path-generator.ts       # Generates the "ideal path" from analysis data
    input.ts                # Keyboard/mouse/gamepad input handling

  scene/
    scene-manager.ts        # Three.js scene, camera, renderer setup
    camera-controller.ts    # Dynamic camera (follows orb, cinematic shifts on sections)
    environment.ts          # Skybox, ambient stars, fog, ground plane

  entities/
    orb.ts                  # Player-controlled orb (mesh, glow, trail, physics)
    guide-path.ts           # Visible/semi-visible ideal path ribbon

  visuals/
    visual-director.ts      # Master conductor - maps analysis data to visual events
    fireworks.ts            # Firework burst particle systems (triggered on beats/accents)
    fireflies.ts            # Ambient firefly particles (density follows melody intensity)
    lanterns.ts             # Floating lanterns (rise on section changes, color-coded)
    stars.ts                # Background starfield (twinkle on hi-hats/high-freq)
    aurora.ts               # Flowing aurora ribbons (follow vocal/lead melody contour)
    trails.ts               # Orb motion trails + beat ripples
    color-palette.ts        # Dynamic palette generation from song energy/mood
    distortion.ts           # Visual degradation effects when sync drops

  shaders/
    bloom-glow.frag         # Custom bloom for orb and fireworks
    aurora.vert / .frag     # Vertex-displaced aurora ribbons
    particle.vert / .frag   # GPU-instanced particles
    distortion.frag         # Chromatic aberration / noise for desync

  ui/
    menu-screen.ts          # File picker, title, start button
    hud.ts                  # Sync percentage, song progress bar, subtle indicators
    results-screen.ts       # End-of-song summary

  utils/
    math.ts                 # Lerp, easing functions, spline utilities
    pool.ts                 # Object pool for particle reuse
    worker-bridge.ts        # Typed wrapper for Web Worker communication
```

---

## Game Flow

### State Machine

```
MENU  -->  ANALYZING  -->  PLAYING  -->  RESULTS
 ^                                         |
 |_________________________________________|
```

### 1. MENU State

- Full-screen dark canvas with a slow-rotating starfield and drifting fireflies as ambient backdrop.
- Centered UI overlay:
  - Title: "Hanabii" with subtle glow animation.
  - "Choose a song" button opens native file picker (accepts `.mp3`, `.wav`, `.ogg`, `.flac`).
  - After file selection, transition to ANALYZING.

### 2. ANALYZING State

- Display a loading visualization: the orb pulses gently at center screen while analysis runs.
- Show progress text: "Listening to your song..." with a subtle progress indicator.
- **Analysis runs in a Web Worker** to avoid blocking the main thread.
- Analysis pipeline (detailed in Audio Analysis section below).
- On completion, brief countdown (3... 2... 1...) then transition to PLAYING.

### 3. PLAYING State

- Song begins playing. Orb is controllable. Visuals generate in real-time.
- HUD shows:
  - Current sync percentage (smoothed, updates every ~500ms visually).
  - Song progress bar (thin, at bottom of screen).
  - No other clutter.
- Duration: full length of the song.

### 4. RESULTS State

- Song ends, orb gently drifts to center, visuals fade to calm starfield.
- Results overlay:
  - Final sync percentage (large, animated counter).
  - Rating label based on percentage:
    - 95-100%: "Perfect Harmony"
    - 80-94%: "In the Flow"
    - 60-79%: "Drifting"
    - 40-59%: "Lost in Space"
    - 0-39%: "Static"
  - "Play Again" and "Choose Another Song" buttons.

---

## Audio Analysis Pipeline

### Phase 1: Offline Deep Analysis (Essentia.js in Web Worker)

Run once after file load. Produces a `SongMap` object.

| Feature | Essentia Algorithm | Purpose |
|---|---|---|
| BPM & Beat Grid | `RhythmExtractor2013` / `BeatTrackerMultiFeature` | Beat positions for fireworks/pulse timing |
| Downbeats | `BeatTrackerDegara` + accent analysis | Stronger visual events on downbeats |
| Onset Detection | `OnsetDetection` + `Onsets` | Trigger transient visual events (bursts, flashes) |
| Song Sections | `SBic` (segmentation) | Major visual transitions (palette shifts, lantern releases, camera moves) |
| Melody Pitch Contour | `PredominantPitchMelodia` / `PitchYinFFT` | Shape the ideal path Y-axis, drive aurora contour |
| Spectral Energy Bands | `BarkBands` / `ERBBands` | Map frequency bands to visual element types |
| Loudness / Energy | `Loudness` / `Energy` | Overall intensity scaling for particle density, bloom strength |
| Key & Scale | `KeyExtractor` | Influence color palette (major = warm, minor = cool) |
| Danceability | `Danceability` | Influence how responsive the ideal path is (more danceable = more movement) |

### Phase 2: SongMap Construction

The analysis output is compiled into a timeline-indexed `SongMap`:

```typescript
interface SongMap {
  bpm: number;
  key: { key: string; scale: 'major' | 'minor' };
  danceability: number;
  duration: number;

  beats: BeatEvent[];        // { time: number; strength: number; isDownbeat: boolean }
  onsets: OnsetEvent[];      // { time: number; strength: number; frequencyBand: 'low'|'mid'|'high' }
  sections: Section[];       // { startTime: number; endTime: number; label: string; energy: number }
  pitchContour: PitchPoint[];// { time: number; frequency: number; confidence: number }
  energyCurve: EnergyPoint[];// { time: number; energy: number } sampled at ~30fps

  // Pre-computed ideal path (3D spline control points)
  idealPath: PathPoint[];    // { time: number; position: Vector3 }
}
```

### Phase 3: Real-Time Features (Meyda, during playback)

Frame-by-frame features extracted from the Web Audio API AnalyserNode:

- **RMS** (volume envelope) - orb glow intensity, particle emission rate.
- **Spectral Centroid** - color temperature shifts (bright/warm for high centroid, dark/cool for low).
- **Spectral Flux** - sudden change detection for micro-burst effects.
- **ZCR** (zero-crossing rate) - noise vs tone, affects star twinkle rate.
- **MFCC** (first few coefficients) - timbral texture for shader parameter modulation.

---

## Ideal Path Generation

The ideal path is a 3D Catmull-Rom spline that the player should follow.

### Path Construction Rules

1. **X-axis (lateral)**: Driven by pitch contour. Higher pitch = further right, lower = further left. Normalized to a comfortable range.
2. **Y-axis (vertical)**: Driven by energy curve. High energy = higher altitude. Section changes cause gradual altitude shifts.
3. **Z-axis (forward)**: Constant forward velocity (creates the sensation of flying through space). Speed modulated slightly by BPM.
4. **Smoothing**: Raw data is smoothed with a moving average window to prevent jittery paths. Danceability score influences smoothing factor (high danceability = more movement allowed).
5. **Lookahead**: The path extends forward in visible space so the player can see where to go (subtle guide ribbon or particle trail).

### Path Visibility

- At high sync (>80%): path is nearly invisible (faint shimmer), player is "feeling it".
- At medium sync (40-80%): path becomes more visible (soft glowing line) as a gentle guide.
- At low sync (<40%): path pulses more obviously, helping the player find their way back.

---

## Synchronization Engine

### Calculation

```
sync = 1.0 - clamp(distance(orbPosition, nearestPathPoint) / maxDistance, 0, 1)
```

- `maxDistance`: Tuned radius beyond which sync is 0% (approximately 30% of screen width).
- Sampled every frame, stored in a rolling buffer.
- **Displayed sync**: Exponential moving average of raw sync (smoothing factor ~0.95) to prevent jitter.
- **Final score**: Time-weighted average of sync over entire song duration.

### Sync Impact on Visuals

| Sync Range | Visual Effect |
|---|---|
| 90-100% | Full visual glory. Fireworks are vibrant and well-timed. Aurora flows perfectly. Colors are rich and saturated. Subtle golden particle aura around orb. |
| 70-89% | Visuals are mostly accurate. Slight timing offsets on fireworks. Colors begin to desaturate slightly at the edges. |
| 50-69% | Noticeable degradation. Fireworks misfire or fizzle. Firefly movement becomes erratic. Color palette shifts toward muted tones. Faint chromatic aberration. |
| 30-49% | Significant distortion. Fireworks become scattered sparks. Lanterns flicker and dim. Stars stutter. Visible noise/grain. Screen edges darken. |
| 0-29% | Near-total visual breakdown. Heavy chromatic aberration. Particles scatter chaotically. Colors drain to near-monochrome. Visual "static" overlays. Audio remains unchanged (player can always hear the song clearly). |

---

## Visual Elements (Detailed)

### Orb (Player Entity)

- Core: Glowing sphere with a soft emissive material + point light.
- Inner glow: Animated Fresnel-based shader, color shifts with spectral centroid.
- Trail: Ribbon geometry trailing behind the orb (length proportional to speed, color matches current palette).
- Pulse: Subtle size oscillation on each beat.
- Aura: At high sync, faint concentric rings radiate outward on downbeats.

### Fireworks

- Triggered on: Strong beats, downbeats, and high-energy onsets.
- Positioned: Along and around the ideal path, ahead of the orb.
- Behavior: Burst upward, explode into GPU-instanced particles with gravity.
- Variations:
  - **Peony**: Classic spherical burst (on downbeats).
  - **Willow**: Long trailing tails (on sustained notes).
  - **Chrysanthemum**: Dense radial burst with color gradient (on section climaxes).
  - **Kamuro**: Gold/silver glitter cascade (on song's peak energy moments).
- Particle count per burst: 200-800 (GPU instanced, performant).
- Fade: Particles fade with exponential decay, color shifts toward warm amber.

### Fireflies

- Ambient presence throughout. Count driven by mid-frequency energy.
- Behavior: Brownian motion with gentle sinusoidal vertical drift.
- Glow: Small point lights (or billboard sprites with additive blending).
- Color: Warm yellow-green, shifting to cooler tones in minor key passages.
- Clustering: Tend to cluster loosely around the ideal path during high sync.

### Lanterns

- Triggered on: Section transitions (verse -> chorus, etc).
- Behavior: Rise slowly from below the path, drift upward and outward.
- Appearance: Small warm-glowing rectangular/spherical meshes with soft light emission.
- Color: Coded to section type (intro = white, verse = soft blue, chorus = warm orange/red, bridge = purple, outro = fading gold).
- Persistence: Remain visible for ~15 seconds, slowly fading and rising out of view.

### Aurora / Ribbon

- Follows the vocal/melody pitch contour in a flowing ribbon above the path.
- Implemented as a vertex-displaced plane with noise-driven undulation.
- Color: Gradient mapped from pitch (low = deep green/blue, high = pink/purple).
- Opacity: Driven by melody confidence (fades during instrumental breaks, returns with vocals).
- Width: Pulses with RMS energy.

### Stars

- Background particle field (several thousand static particles on a large sphere).
- Twinkle: Random subset twinkle on hi-hat/high-frequency onsets.
- Shooting stars: Rare, triggered on especially sharp transients.
- Constellation hints: During quiet passages, faint lines connect nearby stars briefly.

### Color Palette System

- Base palette derived from key/scale analysis:
  - Major keys: warm palette (gold, coral, warm white, soft orange).
  - Minor keys: cool palette (teal, indigo, silver, soft violet).
- Palette shifts smoothly at section boundaries.
- Energy modulates saturation (high energy = vivid, low energy = pastel).
- The orb itself subtly reflects the current dominant palette color.

### Distortion Effects (Low Sync)

- Chromatic aberration: RGB channel separation increases as sync drops.
- Film grain: Noise overlay scales with desync.
- Vignette: Screen edges darken.
- Particle chaos: Ordered patterns dissolve into random scatter.
- Color drain: Saturation drops toward grayscale.
- Temporal jitter: Slight frame time perturbation for visual unease.

---

## Player Controls

### Input: Keyboard + Mouse (Primary)

| Control | Action |
|---|---|
| Mouse movement | Orb follows cursor position smoothly (lerped, not snapping). Cursor is hidden during gameplay. |
| WASD / Arrow keys | Alternative directional control (orb moves relative to camera). |
| Scroll wheel | Zoom camera in/out slightly (within bounds). |
| Space | Pulse boost - small forward dash with a burst of particles (cosmetic, no sync advantage). |
| Escape | Pause menu |

### Input: Gamepad (Secondary)

| Control | Action |
|---|---|
| Left stick | Orb movement |
| Right stick | Camera orbit (subtle) |
| A / Cross | Pulse boost |
| Start | Pause |

### Orb Physics

- Movement is smoothed with lerp (interpolation factor ~0.08 for floaty, graceful feel).
- Slight inertia: orb continues drifting when input stops.
- No hard boundaries: orb can drift far from path but visual degradation discourages it.
- The orb's forward motion is automatic and constant (player controls lateral/vertical only).

---

## Camera System

- Default: Third-person follow camera behind and slightly above the orb.
- On section changes: Smooth cinematic transition (brief wide shot, then return to follow).
- On high-energy moments: Camera pulls back slightly to show more of the spectacle.
- On quiet moments: Camera moves closer for intimacy.
- Subtle procedural shake on heavy bass impacts (amplitude proportional to low-band energy).
- All transitions use smooth easing (ease-in-out cubic).

---

## Performance Considerations

- **Particle budget**: Cap at ~50,000 active particles. Use object pooling aggressively.
- **GPU instancing**: All particle systems use `InstancedMesh` or `InstancedBufferGeometry`.
- **LOD**: Reduce particle counts and disable post-processing on lower-end devices (detect via `renderer.capabilities` or frame time monitoring).
- **Web Worker**: All Essentia.js analysis runs off-main-thread.
- **Audio buffer**: Decoded once, shared between analysis and playback contexts.
- **RequestAnimationFrame**: Single game loop driving both render and game logic.
- **Disposal**: Aggressive cleanup of geometries, materials, and textures on song end.

---

## Project Setup & Tooling

- **Package manager**: npm
- **Dev server**: Vite (`vite dev`)
- **Build**: Vite (`vite build`) - outputs static files deployable anywhere
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier

### Key Dependencies

```json
{
  "three": "^0.170.0",
  "meyda": "^5.x",
  "essentia.js": "^0.1.3",
  "vite": "^6.x",
  "typescript": "^5.x"
}
```

---

## Implementation Phases

### Phase 1: Foundation
- Project scaffolding (Vite + TS + Three.js).
- Basic Three.js scene: dark skybox, static starfield, camera.
- Orb entity with mouse/keyboard control and smooth movement.
- File picker UI, MP3 loading and Web Audio playback.

### Phase 2: Audio Analysis
- Integrate Essentia.js WASM in a Web Worker.
- Implement the analysis pipeline (BPM, beats, sections, pitch contour, energy).
- Build the SongMap data structure.
- Integrate Meyda for real-time feature extraction.

### Phase 3: Path & Sync
- Ideal path generation from SongMap.
- Path spline rendering (guide ribbon).
- Synchronization engine (distance calculation, scoring, smoothing).
- HUD (sync display, progress bar).

### Phase 4: Visual Elements
- Firework particle system (multiple burst types, beat-triggered).
- Firefly ambient system.
- Floating lanterns (section-triggered).
- Aurora ribbon (pitch-driven).
- Star twinkle system.
- Dynamic color palette.

### Phase 5: Polish & Effects
- Post-processing pipeline (bloom, chromatic aberration, vignette, grain).
- Distortion effects tied to sync level.
- Camera system (cinematic transitions, procedural shake).
- Results screen with scoring.
- Pulse boost mechanic.

### Phase 6: Optimization & QA
- Performance profiling, particle budget enforcement.
- Object pooling finalization.
- Device capability detection and quality scaling.
- Cross-browser testing (Chrome, Firefox, Edge).
- Edge cases: very short songs, very long songs, silence, extreme BPM.

---

## Open Questions / Future Ideas (Out of Scope for V1)

- Microphone input (live audio visualization, no game mechanic).
- Multiplayer (multiple orbs, shared scene via WebRTC).
- Song library / URL loading instead of file picker.
- Mobile touch controls.
- Recording and sharing replays as video.
- Custom visual themes beyond the night sky.
