import * as THREE from 'three';
import type { SongMap, RealtimeFeatures } from '../audio/structures';
import { colorPalette } from './color-palette';
import { fireworks } from './fireworks';
import { fireflies } from './fireflies';
import { lanterns } from './lanterns';
import { aurora } from './aurora';
import { stars } from './stars';
import { orb } from '../entities/orb';
import { clamp, mapRange } from '../utils/math';

/**
 * Master conductor that maps audio analysis data to visual events.
 * Decides what to trigger, when, and with what intensity.
 */
class VisualDirector {
  private songMap!: SongMap;
  private nextBeatIndex = 0;
  private nextOnsetIndex = 0;
  private currentSectionIndex = 0;
  private lastSectionLabel = '';

  init(songMap: SongMap): void {
    this.songMap = songMap;
    this.nextBeatIndex = 0;
    this.nextOnsetIndex = 0;
    this.currentSectionIndex = 0;
    this.lastSectionLabel = '';

    // Initialize color palette
    colorPalette.init(songMap);

    // Initialize sub-systems
    fireworks.init();
    fireflies.init();
    lanterns.init();
    aurora.init();
    stars.init();
  }

  /**
   * Called every frame during PLAYING state.
   */
  update(
    currentTime: number,
    dt: number,
    elapsed: number,
    realtime: RealtimeFeatures,
    sync: number
  ): void {
    const orbPos = orb.position;

    // --- Process beats ---
    this.processBeats(currentTime, orbPos, sync);

    // --- Process onsets ---
    this.processOnsets(currentTime, realtime, sync);

    // --- Process sections ---
    this.processSections(currentTime, orbPos);

    // --- Update color palette ---
    colorPalette.update(dt, realtime.rms);
    const palette = sync > 0.5 ? colorPalette.palette : colorPalette.getDesaturated(sync);

    // --- Update visual systems ---

    // Fireworks
    fireworks.update(dt);

    // Fireflies
    fireflies.setColor(palette.secondary);
    fireflies.update(dt, elapsed, orbPos.z, realtime.rms, sync);

    // Lanterns
    lanterns.update(dt);

    // Aurora
    const pitchNorm = this.getCurrentPitchNormalized(currentTime);
    const melodyConfidence = this.getCurrentMelodyConfidence(currentTime);
    aurora.setColors(palette.primary, palette.accent);
    aurora.update(orbPos.z, pitchNorm, realtime.rms, melodyConfidence, elapsed, sync);

    // Stars
    stars.update(dt, elapsed, realtime.zcr);

    // Orb color
    orb.setColor(palette.primary);
    orb.lerpScaleBack(dt);

    // Orb glow intensity from RMS
    const glowIntensity = 1 + realtime.rms * 8;
    orb.glowLight.intensity = glowIntensity;
  }

  private processBeats(currentTime: number, orbPos: THREE.Vector3, sync: number): void {
    const beats = this.songMap.beats;
    while (this.nextBeatIndex < beats.length && beats[this.nextBeatIndex].time <= currentTime) {
      const beat = beats[this.nextBeatIndex];

      // Orb pulse on beat
      orb.beatPulse(beat.strength);

      // Fireworks on strong beats
      if (beat.strength > 0.4) {
        const burstPos = new THREE.Vector3(
          orbPos.x + (Math.random() - 0.5) * 15,
          orbPos.y + Math.random() * 8 + 2,
          orbPos.z - Math.random() * 20 - 5
        );
        fireworks.burst(burstPos, beat.strength, beat.isDownbeat, colorPalette.palette, sync);
      }

      this.nextBeatIndex++;
    }
  }

  private processOnsets(currentTime: number, realtime: RealtimeFeatures, sync: number): void {
    const onsets = this.songMap.onsets;
    while (this.nextOnsetIndex < onsets.length && onsets[this.nextOnsetIndex].time <= currentTime) {
      const onset = onsets[this.nextOnsetIndex];

      // High-frequency onsets trigger star twinkle
      if (onset.frequencyBand === 'high') {
        stars.triggerTwinkle(Math.floor(onset.strength * 30), onset.strength);
      }

      // Very strong transients trigger shooting stars (rare)
      if (onset.strength > 0.9 && Math.random() < 0.1) {
        stars.triggerShootingStar();
      }

      this.nextOnsetIndex++;
    }
  }

  private processSections(currentTime: number, orbPos: THREE.Vector3): void {
    const sections = this.songMap.sections;
    if (this.currentSectionIndex >= sections.length) return;

    // Check if we've entered a new section
    for (let i = this.currentSectionIndex; i < sections.length; i++) {
      if (currentTime >= sections[i].startTime && currentTime < sections[i].endTime) {
        if (i !== this.currentSectionIndex || sections[i].label !== this.lastSectionLabel) {
          this.currentSectionIndex = i;
          this.lastSectionLabel = sections[i].label;

          // Trigger section change visuals
          colorPalette.setSection(sections[i]);
          lanterns.release(orbPos, sections[i].label, 4 + Math.floor(sections[i].energy * 4));
        }
        break;
      }
    }
  }

  private getCurrentPitchNormalized(currentTime: number): number {
    const contour = this.songMap.pitchContour;
    if (contour.length === 0) return 0.5;

    // Find nearest pitch point
    let closest = contour[0];
    for (let i = 1; i < contour.length; i++) {
      if (Math.abs(contour[i].time - currentTime) < Math.abs(closest.time - currentTime)) {
        closest = contour[i];
      } else if (contour[i].time > currentTime + 1) {
        break;
      }
    }

    if (closest.confidence < 0.2) return 0.5;
    // Normalize frequency (80-800 Hz) to 0-1
    return clamp(mapRange(closest.frequency, 80, 800, 0, 1), 0, 1);
  }

  private getCurrentMelodyConfidence(currentTime: number): number {
    const contour = this.songMap.pitchContour;
    if (contour.length === 0) return 0;

    for (let i = 0; i < contour.length; i++) {
      if (contour[i].time >= currentTime) {
        return contour[i].confidence;
      }
    }
    return 0;
  }

  dispose(): void {
    fireworks.dispose();
    fireflies.dispose();
    lanterns.dispose();
    aurora.dispose();
    stars.dispose();
  }
}

export const visualDirector = new VisualDirector();
