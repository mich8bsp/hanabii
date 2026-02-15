import * as THREE from 'three';
import type { SongMap, PathPoint } from '../audio/structures';
import { clamp, mapRange } from '../utils/math';

const FORWARD_SPEED = 8; // must match orb.ts
const LATERAL_RANGE = 8; // reduced for gentler curves
const VERTICAL_RANGE = 4;
const VERTICAL_BASE = 2;
const SMOOTHING_WINDOW = 25; // much wider smoothing for fluid curves

/**
 * Generate the ideal path from the SongMap analysis data.
 * The path is a series of 3D points over time that the player should follow.
 */
export function generateIdealPath(songMap: SongMap): PathPoint[] {
  const { duration, pitchContour, energyCurve, danceability } = songMap;

  // Sample path at ~15 points per second
  const sampleRate = 15;
  const numPoints = Math.floor(duration * sampleRate);
  const rawPoints: PathPoint[] = [];

  // Pre-compute lookup maps for fast interpolation
  const pitchTimes = pitchContour.map((p) => p.time);
  const energyTimes = energyCurve.map((p) => p.time);

  // Find pitch range for normalization
  const validPitches = pitchContour.filter((p) => p.confidence > 0.3 && p.frequency > 50);
  let minPitch = validPitches.length > 0
    ? Math.min(...validPitches.map((p) => p.frequency))
    : 100;
  let maxPitch = validPitches.length > 0
    ? Math.max(...validPitches.map((p) => p.frequency))
    : 500;
  // Prevent division by zero in mapRange when all pitches are identical
  if (maxPitch - minPitch < 1) {
    minPitch -= 50;
    maxPitch += 50;
  }

  for (let i = 0; i < numPoints; i++) {
    const time = (i / sampleRate);
    if (time > duration) break;

    // Z: constant forward motion
    const z = -time * FORWARD_SPEED;

    // X: from pitch contour
    const pitch = interpolatePitch(time, pitchContour, pitchTimes);
    const normalizedPitch = mapRange(
      clamp(pitch, minPitch, maxPitch),
      minPitch,
      maxPitch,
      -1,
      1
    );
    // Scale by danceability (more danceable = wider movement)
    const movementScale = 0.5 + danceability * 0.5;
    const x = normalizedPitch * LATERAL_RANGE * movementScale;

    // Y: from energy curve
    const energy = interpolateEnergy(time, energyCurve, energyTimes);
    const y = VERTICAL_BASE + energy * VERTICAL_RANGE;

    rawPoints.push({
      time,
      position: new THREE.Vector3(x, y, z),
    });
  }

  // Multiple smoothing passes for very fluid curves
  let result = smoothPath(rawPoints, SMOOTHING_WINDOW);
  result = smoothPath(result, Math.floor(SMOOTHING_WINDOW / 2));
  return result;
}

function interpolatePitch(
  time: number,
  contour: { time: number; frequency: number; confidence: number }[],
  times: number[]
): number {
  if (contour.length === 0) return 250;

  // Binary search for closest time
  let lo = 0, hi = times.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) lo = mid;
    else hi = mid;
  }

  const p0 = contour[lo];
  const p1 = contour[hi];
  if (p0.time === p1.time) return p0.frequency;

  const t = (time - p0.time) / (p1.time - p0.time);

  // Weight by confidence
  const w0 = p0.confidence;
  const w1 = p1.confidence;
  const totalWeight = w0 + w1;
  if (totalWeight < 0.01) return 250; // default

  const denom = w0 * (1 - t) + w1 * t;
  if (denom < 0.001) return 250; // avoid division by zero
  return (p0.frequency * w0 * (1 - t) + p1.frequency * w1 * t) / denom;
}

function interpolateEnergy(
  time: number,
  curve: { time: number; energy: number }[],
  times: number[]
): number {
  if (curve.length === 0) return 0.5;

  let lo = 0, hi = times.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) lo = mid;
    else hi = mid;
  }

  const p0 = curve[lo];
  const p1 = curve[hi];
  if (p0.time === p1.time) return p0.energy;

  const t = (time - p0.time) / (p1.time - p0.time);
  return p0.energy * (1 - t) + p1.energy * t;
}

function smoothPath(points: PathPoint[], windowSize: number): PathPoint[] {
  const smoothed: PathPoint[] = [];
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < points.length; i++) {
    let sx = 0, sy = 0, sz = 0, count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j++) {
      sx += points[j].position.x;
      sy += points[j].position.y;
      sz += points[j].position.z;
      count++;
    }
    smoothed.push({
      time: points[i].time,
      position: new THREE.Vector3(sx / count, sy / count, sz / count),
    });
  }

  return smoothed;
}
