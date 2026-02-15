import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import { randomRange, lerp } from '../utils/math';

const MAX_FIREFLIES = 400;
const SPAWN_RADIUS = 30;
const BASE_SIZE = 0.15;

interface Firefly {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  phase: number;
  speed: number;
  brightness: number;
}

class FireflySystem {
  private points!: THREE.Points;
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.PointsMaterial;
  private positionAttr!: THREE.BufferAttribute;
  private fireflies: Firefly[] = [];
  private targetCount = 100;

  init(): void {
    const positions = new Float32Array(MAX_FIREFLIES * 3);
    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(positions, 3);
    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.PointsMaterial({
      color: 0xccff66,
      size: BASE_SIZE,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    sceneManager.scene.add(this.points);
  }

  /**
   * Update firefly positions and counts.
   * @param anchorZ - Z position of the orb (to spawn near)
   * @param energy - 0-1, drives density
   * @param sync - 0-1, drives coherence
   */
  update(dt: number, elapsed: number, anchorZ: number, energy: number, sync: number): void {
    // Target count driven by energy
    this.targetCount = Math.floor(50 + energy * 300);

    // Spawn new fireflies
    while (this.fireflies.length < this.targetCount && this.fireflies.length < MAX_FIREFLIES) {
      this.fireflies.push({
        x: randomRange(-SPAWN_RADIUS, SPAWN_RADIUS),
        y: randomRange(-2, 10),
        z: anchorZ + randomRange(-SPAWN_RADIUS, 10),
        vx: randomRange(-0.5, 0.5),
        vy: randomRange(-0.2, 0.2),
        vz: randomRange(-0.5, 0.5),
        phase: Math.random() * Math.PI * 2,
        speed: randomRange(0.3, 1.2),
        brightness: randomRange(0.5, 1.0),
      });
    }

    // Remove excess fireflies
    while (this.fireflies.length > this.targetCount) {
      this.fireflies.pop();
    }

    // Update positions
    for (let i = 0; i < this.fireflies.length; i++) {
      const f = this.fireflies[i];

      // Brownian motion
      f.vx += (Math.random() - 0.5) * 2 * dt;
      f.vy += (Math.random() - 0.5) * 1.5 * dt;
      f.vz += (Math.random() - 0.5) * 2 * dt;

      // Damping
      f.vx *= 0.95;
      f.vy *= 0.95;
      f.vz *= 0.95;

      // Sinusoidal vertical drift
      f.vy += Math.sin(elapsed * f.speed + f.phase) * 0.5 * dt;

      // Apply velocity
      f.x += f.vx * f.speed * dt;
      f.y += f.vy * f.speed * dt;
      f.z += f.vz * f.speed * dt;

      // Soft bounds: gently push back toward anchor region
      const dz = f.z - anchorZ;
      if (Math.abs(dz) > SPAWN_RADIUS) {
        f.vz -= Math.sign(dz) * 0.5 * dt;
      }
      if (Math.abs(f.x) > SPAWN_RADIUS) {
        f.vx -= Math.sign(f.x) * 0.5 * dt;
      }
      if (f.y < -2 || f.y > 15) {
        f.vy -= Math.sign(f.y - 5) * 0.5 * dt;
      }

      // At low sync, make movement erratic
      if (sync < 0.5) {
        f.vx += (Math.random() - 0.5) * (1 - sync) * 3 * dt;
        f.vy += (Math.random() - 0.5) * (1 - sync) * 3 * dt;
      }

      this.positionAttr.setXYZ(i, f.x, f.y, f.z);
    }

    this.positionAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, this.fireflies.length);

    // Flicker brightness
    const flicker = 0.5 + 0.3 * Math.sin(elapsed * 3) + 0.2 * Math.sin(elapsed * 7.3);
    this.material.opacity = 0.4 + flicker * 0.4;
  }

  setColor(color: THREE.Color): void {
    this.material.color.copy(color);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    sceneManager.scene.remove(this.points);
  }
}

export const fireflies = new FireflySystem();
