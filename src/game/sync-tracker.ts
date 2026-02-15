import * as THREE from 'three';
import type { PathPoint } from '../audio/structures';
import { clamp, ema } from '../utils/math';

const MAX_DISTANCE = 15; // distance at which sync = 0
const EMA_ALPHA = 0.05; // smoothing factor for displayed sync
const SCORE_SAMPLE_INTERVAL = 0.1; // sample every 100ms for final score

class SyncTracker {
  /** Smoothed sync value for display (0-1) */
  displaySync = 1.0;

  /** Raw sync this frame (0-1) */
  rawSync = 1.0;

  /** Accumulated time-weighted score samples */
  private scoreSamples: number[] = [];
  private lastSampleTime = 0;

  /** Cached search index for path lookup */
  private lastPathIndex = 0;

  reset(): void {
    this.displaySync = 1.0;
    this.rawSync = 1.0;
    this.scoreSamples = [];
    this.lastSampleTime = 0;
    this.lastPathIndex = 0;
  }

  /**
   * Update sync based on orb position vs ideal path at the current song time.
   */
  update(
    orbPosition: THREE.Vector3,
    idealPath: PathPoint[],
    currentTime: number,
    dt: number
  ): void {
    if (idealPath.length === 0) {
      this.rawSync = 1.0;
      this.displaySync = 1.0;
      return;
    }

    // Find the nearest path point to the current time
    const nearest = this.findNearestPathPoint(idealPath, currentTime);
    if (!nearest) {
      this.rawSync = 1.0;
      this.displaySync = ema(1.0, this.displaySync, EMA_ALPHA);
      return;
    }

    // Distance only in X/Y plane (Z is just forward motion, both move at same speed)
    const dx = orbPosition.x - nearest.position.x;
    const dy = orbPosition.y - nearest.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Guard against NaN from bad path data
    if (!isFinite(distance)) {
      this.rawSync = 1.0;
      this.displaySync = ema(1.0, this.displaySync, EMA_ALPHA);
      return;
    }

    this.rawSync = clamp(1 - distance / MAX_DISTANCE, 0, 1);
    this.displaySync = ema(this.rawSync, this.displaySync, EMA_ALPHA);

    // Sample for final score
    if (currentTime - this.lastSampleTime >= SCORE_SAMPLE_INTERVAL) {
      this.scoreSamples.push(this.rawSync);
      this.lastSampleTime = currentTime;
    }
  }

  /** Get the final score as a percentage (0-100) */
  getFinalScore(): number {
    if (this.scoreSamples.length === 0) return 100;
    const avg = this.scoreSamples.reduce((a, b) => a + b, 0) / this.scoreSamples.length;
    return Math.round(avg * 100);
  }

  /** Get rating label based on score */
  getRating(score: number): string {
    if (score >= 95) return 'Perfect Harmony';
    if (score >= 80) return 'In the Flow';
    if (score >= 60) return 'Drifting';
    if (score >= 40) return 'Lost in Space';
    return 'Static';
  }

  /** Get the ideal path position at the current time for visual reference */
  getIdealPosition(idealPath: PathPoint[], currentTime: number): THREE.Vector3 | null {
    const point = this.findNearestPathPoint(idealPath, currentTime);
    return point ? point.position : null;
  }

  private findNearestPathPoint(path: PathPoint[], time: number): PathPoint | null {
    if (path.length === 0) return null;

    // Linear search from last known index (path is time-sorted)
    let idx = this.lastPathIndex;
    while (idx < path.length - 1 && path[idx + 1].time <= time) {
      idx++;
    }
    // Don't go backwards too far
    while (idx > 0 && path[idx].time > time + 0.5) {
      idx--;
    }
    this.lastPathIndex = idx;

    // Interpolate between idx and idx+1
    if (idx >= path.length - 1) return path[path.length - 1];

    const p0 = path[idx];
    const p1 = path[idx + 1];
    const t = (time - p0.time) / (p1.time - p0.time);
    const clamped = clamp(t, 0, 1);

    return {
      time,
      position: new THREE.Vector3().lerpVectors(p0.position, p1.position, clamped),
    };
  }
}

export const syncTracker = new SyncTracker();
