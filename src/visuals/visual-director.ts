import * as THREE from 'three';
import type { SongMap, RealtimeFeatures } from '../audio/structures';
import { colorPalette } from './color-palette';
import { fireworks } from './fireworks';
import { fireflies } from './fireflies';
import { lanterns } from './lanterns';
import { aurora } from './aurora';
import { stars } from './stars';
import { hoops, type Hoop } from '../entities/hoops';
import { orb } from '../entities/orb';
import { clamp, mapRange } from '../utils/math';

/**
 * Master conductor that maps audio analysis data to visual events.
 * Hoops are placed at beat positions; fireworks fire when the orb
 * passes through a hoop.
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

    colorPalette.init(songMap);

    fireworks.init();
    fireflies.init();
    lanterns.init();
    aurora.init();
    stars.init();
    hoops.init(songMap);
  }

  update(
    currentTime: number,
    dt: number,
    elapsed: number,
    realtime: RealtimeFeatures,
    sync: number
  ): void {
    const orbPos = orb.position;

    // --- Process beats (orb pulse only, no fireworks) ---
    this.processBeats(currentTime);

    // --- Process onsets (star twinkle) ---
    this.processOnsets(currentTime);

    // --- Process sections (lanterns + palette) ---
    this.processSections(currentTime, orbPos);

    // --- Update hoops and check for passage ---
    const passedHoops = hoops.update(dt, elapsed, orbPos, sync);

    // --- Fireworks on successful hoop passage ---
    for (const hoop of passedHoops) {
      this.fireworksOnHoop(hoop);
    }

    // --- Update color palette ---
    colorPalette.update(dt, realtime.rms);
    const palette = sync > 0.5 ? colorPalette.palette : colorPalette.getDesaturated(sync);

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

    // Hoop color from palette
    hoops.setColor(palette.accent);

    // Orb
    orb.setColor(palette.primary);
    orb.lerpScaleBack(dt);
    orb.glowLight.intensity = 1 + realtime.rms * 8;
  }

  /**
   * Fire fireworks from the hoop position when the orb passes through.
   */
  private fireworksOnHoop(hoop: Hoop): void {
    const palette = colorPalette.palette;
    const pos = hoop.position.clone();

    // Main burst at hoop position
    fireworks.burst(pos, hoop.strength, hoop.isDownbeat, palette, 1.0);

    // Extra bursts for downbeats (more spectacular)
    if (hoop.isDownbeat) {
      fireworks.burst(
        pos.clone().add(new THREE.Vector3(0, 2, 0)),
        hoop.strength * 0.8,
        false,
        palette,
        1.0
      );
    }

    // Star twinkle on pass
    stars.triggerTwinkle(40, hoop.strength);

    // Orb pulse
    orb.beatPulse(hoop.strength);
  }

  private processBeats(currentTime: number): void {
    const beats = this.songMap.beats;
    while (this.nextBeatIndex < beats.length && beats[this.nextBeatIndex].time <= currentTime) {
      const beat = beats[this.nextBeatIndex];
      // Subtle orb pulse on every beat (visual rhythm)
      orb.beatPulse(beat.strength * 0.4);
      this.nextBeatIndex++;
    }
  }

  private processOnsets(currentTime: number): void {
    const onsets = this.songMap.onsets;
    while (this.nextOnsetIndex < onsets.length && onsets[this.nextOnsetIndex].time <= currentTime) {
      const onset = onsets[this.nextOnsetIndex];
      if (onset.frequencyBand === 'high') {
        stars.triggerTwinkle(Math.floor(onset.strength * 20), onset.strength);
      }
      if (onset.strength > 0.9 && Math.random() < 0.08) {
        stars.triggerShootingStar();
      }
      this.nextOnsetIndex++;
    }
  }

  private processSections(currentTime: number, orbPos: THREE.Vector3): void {
    const sections = this.songMap.sections;
    if (this.currentSectionIndex >= sections.length) return;

    for (let i = this.currentSectionIndex; i < sections.length; i++) {
      if (currentTime >= sections[i].startTime && currentTime < sections[i].endTime) {
        if (i !== this.currentSectionIndex || sections[i].label !== this.lastSectionLabel) {
          this.currentSectionIndex = i;
          this.lastSectionLabel = sections[i].label;
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

    let closest = contour[0];
    for (let i = 1; i < contour.length; i++) {
      if (Math.abs(contour[i].time - currentTime) < Math.abs(closest.time - currentTime)) {
        closest = contour[i];
      } else if (contour[i].time > currentTime + 1) {
        break;
      }
    }

    if (closest.confidence < 0.2) return 0.5;
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
    hoops.dispose();
  }
}

export const visualDirector = new VisualDirector();
