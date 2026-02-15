import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import { randomRange } from '../utils/math';

const STAR_COUNT = 2000;
const SPHERE_RADIUS = 500;

/**
 * Twinkle-capable star system. Extends the static environment stars
 * with interactive twinkle triggered by high-frequency onsets.
 */
class StarTwinkleSystem {
  private points!: THREE.Points;
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.PointsMaterial;
  private baseSizes!: Float32Array;
  private sizeAttr!: THREE.BufferAttribute;
  private phases!: Float32Array;
  private twinkleTargets!: Float32Array;

  /** Indices of stars currently twinkling brighter */
  private activeSet = new Set<number>();

  init(): void {
    const positions = new Float32Array(STAR_COUNT * 3);
    this.baseSizes = new Float32Array(STAR_COUNT);
    this.phases = new Float32Array(STAR_COUNT);
    this.twinkleTargets = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = SPHERE_RADIUS * (0.6 + Math.random() * 0.4);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      this.baseSizes[i] = randomRange(0.3, 1.5);
      this.phases[i] = Math.random() * Math.PI * 2;
      this.twinkleTargets[i] = 0;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(this.baseSizes), 1);
    this.geometry.setAttribute('size', this.sizeAttr);

    this.material = new THREE.PointsMaterial({
      color: 0xeeeeff,
      size: 1.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    sceneManager.scene.add(this.points);
  }

  /**
   * Trigger a burst of twinkling stars.
   * @param count Number of stars to twinkle
   * @param intensity How bright the twinkle is (0-1)
   */
  triggerTwinkle(count: number, intensity: number): void {
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * STAR_COUNT);
      this.twinkleTargets[idx] = intensity;
      this.activeSet.add(idx);
    }
  }

  /** Trigger a shooting star effect */
  triggerShootingStar(): void {
    // TODO: Implement as a separate line geometry
    // For now, just twinkle a streak of adjacent stars
    const startIdx = Math.floor(Math.random() * (STAR_COUNT - 20));
    for (let i = 0; i < 20; i++) {
      this.twinkleTargets[startIdx + i] = 1.0;
      this.activeSet.add(startIdx + i);
    }
  }

  update(dt: number, elapsed: number, zcr: number): void {
    const sizes = this.sizeAttr.array as Float32Array;

    // Ambient gentle twinkle from ZCR
    const twinkleRate = 0.5 + zcr * 3;

    for (let i = 0; i < STAR_COUNT; i++) {
      // Base gentle twinkle
      const base = this.baseSizes[i] * (0.8 + 0.2 * Math.sin(elapsed * twinkleRate + this.phases[i]));

      // Active twinkle
      if (this.twinkleTargets[i] > 0.01) {
        sizes[i] = base + this.twinkleTargets[i] * 3;
        this.twinkleTargets[i] *= Math.exp(-4 * dt);
        if (this.twinkleTargets[i] < 0.01) {
          this.twinkleTargets[i] = 0;
          this.activeSet.delete(i);
        }
      } else {
        sizes[i] = base;
      }
    }

    this.sizeAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    sceneManager.scene.remove(this.points);
  }
}

export const stars = new StarTwinkleSystem();
