import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import { randomRange, randomInSphere } from '../utils/math';
import type { Palette } from './color-palette';

interface FireworkBurst {
  particles: THREE.InstancedMesh;
  velocities: Float32Array;
  colors: Float32Array; // per-particle color for color shifts
  maxAge: number;
  age: number;
  particleCount: number;
  gravity: number;
  type: 'peony' | 'willow' | 'chrysanthemum' | 'kamuro';
  // Secondary explosion state
  secondaryFired: boolean;
  secondaryTime: number; // when to fire secondary
  origin: THREE.Vector3;
  palette: Palette;
}

const MAX_ACTIVE_BURSTS = 40;
const dummy = new THREE.Object3D();

class FireworkSystem {
  private bursts: FireworkBurst[] = [];
  private geometry: THREE.SphereGeometry;
  private pendingSecondaries: { position: THREE.Vector3; palette: Palette; strength: number }[] = [];

  constructor() {
    this.geometry = new THREE.SphereGeometry(0.07, 6, 6);
  }

  init(): void {
    this.bursts = [];
    this.pendingSecondaries = [];
  }

  /**
   * Trigger a firework burst at a given position.
   */
  burst(
    position: THREE.Vector3,
    strength: number,
    isDownbeat: boolean,
    palette: Palette,
    sync: number
  ): void {
    if (this.bursts.length >= MAX_ACTIVE_BURSTS) return;

    let type: FireworkBurst['type'];
    let particleCount: number;
    let maxAge: number;
    let gravity: number;

    if (isDownbeat && strength > 0.6) {
      type = 'chrysanthemum';
      particleCount = 500;
      maxAge = 3.0;
      gravity = 1.2;
    } else if (strength > 0.7) {
      type = 'peony';
      particleCount = 350;
      maxAge = 2.5;
      gravity = 1.8;
    } else if (strength > 0.4) {
      type = 'willow';
      particleCount = 250;
      maxAge = 3.5;
      gravity = 0.5;
    } else {
      type = 'kamuro';
      particleCount = 200;
      maxAge = 2.0;
      gravity = 2.5;
    }

    particleCount = Math.max(40, particleCount);

    // Multi-color: pick 3 colors per burst from the palette
    const colorA = palette.accent.clone();
    const colorB = palette.primary.clone();
    const colorC = palette.secondary.clone();

    // For kamuro, use gold/silver tones
    if (type === 'kamuro') {
      colorA.set(0xffd700);
      colorB.set(0xffeebb);
      colorC.set(0xffcc44);
    }

    // Use a shader material that supports per-instance color
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const mesh = new THREE.InstancedMesh(this.geometry, material, particleCount);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(particleCount * 3), 3
    );
    mesh.frustumCulled = false;
    sceneManager.scene.add(mesh);

    const velocities = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const burstRadius = type === 'chrysanthemum' ? 10
      : type === 'willow' ? 7
      : type === 'peony' ? 8
      : 6;

    for (let i = 0; i < particleCount; i++) {
      const dir = randomInSphere(1).normalize();
      const speed = randomRange(burstRadius * 0.4, burstRadius) * strength;

      velocities[i * 3] = dir.x * speed;
      velocities[i * 3 + 1] = dir.y * speed + randomRange(1.5, 4); // upward bias
      velocities[i * 3 + 2] = dir.z * speed;

      // Assign each particle one of the 3 colors with random blend
      const pick = Math.random();
      let color: THREE.Color;
      if (pick < 0.4) {
        color = colorA.clone().lerp(colorB, Math.random() * 0.3);
      } else if (pick < 0.75) {
        color = colorB.clone().lerp(colorC, Math.random() * 0.3);
      } else {
        color = colorC.clone().lerp(colorA, Math.random() * 0.3);
      }

      // Slight random brightness variation
      const brightness = randomRange(0.7, 1.3);
      color.multiplyScalar(brightness);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      mesh.instanceColor!.setXYZ(i, color.r, color.g, color.b);

      dummy.position.copy(position);
      dummy.scale.setScalar(randomRange(0.5, 1.8));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;

    // Schedule secondary explosion for larger bursts
    const hasSecondary = type === 'chrysanthemum' || (type === 'peony' && strength > 0.6);
    const secondaryTime = maxAge * randomRange(0.35, 0.5);

    this.bursts.push({
      particles: mesh,
      velocities,
      colors,
      maxAge,
      age: 0,
      particleCount,
      gravity,
      type,
      secondaryFired: !hasSecondary, // if no secondary, mark as already fired
      secondaryTime,
      origin: position.clone(),
      palette,
    });
  }

  update(dt: number): void {
    const toRemove: number[] = [];

    for (let b = 0; b < this.bursts.length; b++) {
      const burst = this.bursts[b];
      burst.age += dt;

      if (burst.age > burst.maxAge) {
        toRemove.push(b);
        continue;
      }

      const lifeRatio = burst.age / burst.maxAge;

      // Color shift over lifetime: warm → cool fade
      const instanceColor = burst.particles.instanceColor!;
      for (let i = 0; i < burst.particleCount; i++) {
        // Shift toward warm amber/white as particles age
        const fadeToR = 1.0;
        const fadeToG = 0.7;
        const fadeToB = 0.3;
        const shift = lifeRatio * 0.4;

        const r = burst.colors[i * 3] * (1 - shift) + fadeToR * shift;
        const g = burst.colors[i * 3 + 1] * (1 - shift) + fadeToG * shift;
        const bl = burst.colors[i * 3 + 2] * (1 - shift) + fadeToB * shift;
        instanceColor.setXYZ(i, r, g, bl);
      }
      instanceColor.needsUpdate = true;

      // Opacity fade: slow at start, fast at end
      const material = burst.particles.material as THREE.MeshBasicMaterial;
      const opacityCurve = lifeRatio < 0.3
        ? 0.95
        : 0.95 * Math.pow(1 - (lifeRatio - 0.3) / 0.7, 1.5);
      material.opacity = Math.max(0, opacityCurve);

      // Check for secondary explosion trigger
      if (!burst.secondaryFired && burst.age >= burst.secondaryTime) {
        burst.secondaryFired = true;
        this.spawnSecondaries(burst);
      }

      for (let i = 0; i < burst.particleCount; i++) {
        burst.particles.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

        // Velocity
        dummy.position.x += burst.velocities[i * 3] * dt;
        dummy.position.y += burst.velocities[i * 3 + 1] * dt;
        dummy.position.z += burst.velocities[i * 3 + 2] * dt;

        // Gravity
        burst.velocities[i * 3 + 1] -= burst.gravity * dt;

        // Type-specific drag
        if (burst.type === 'willow') {
          const drag = 0.97;
          burst.velocities[i * 3] *= drag;
          burst.velocities[i * 3 + 1] *= drag;
          burst.velocities[i * 3 + 2] *= drag;
        } else if (burst.type === 'kamuro') {
          // Glittery: add slight random sparkle jitter
          burst.velocities[i * 3] += (Math.random() - 0.5) * 0.3 * dt;
          burst.velocities[i * 3 + 2] += (Math.random() - 0.5) * 0.3 * dt;
        }

        // Scale: particles grow slightly then shrink
        const growPhase = Math.min(1, burst.age * 5);
        const shrinkPhase = Math.max(0.01, 1 - lifeRatio * lifeRatio);
        dummy.scale.setScalar(growPhase * shrinkPhase * randomRange(0.6, 1.4));

        dummy.updateMatrix();
        burst.particles.setMatrixAt(i, dummy.matrix);
      }
      burst.particles.instanceMatrix.needsUpdate = true;
    }

    // Remove expired bursts (reverse order)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const burst = this.bursts[idx];
      (burst.particles.material as THREE.Material).dispose();
      sceneManager.scene.remove(burst.particles);
      this.bursts.splice(idx, 1);
    }

    // Process any pending secondary bursts
    for (const sec of this.pendingSecondaries) {
      this.burst(sec.position, sec.strength, false, sec.palette, 1.0);
    }
    this.pendingSecondaries = [];
  }

  /**
   * Spawn smaller secondary bursts from random particles of the parent.
   */
  private spawnSecondaries(parent: FireworkBurst): void {
    // Pick 3-6 random particle positions as origins for secondaries
    const count = Math.floor(randomRange(3, 7));

    for (let s = 0; s < count; s++) {
      const idx = Math.floor(Math.random() * parent.particleCount);
      parent.particles.getMatrixAt(idx, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

      // Create a complementary palette for the secondary
      const secPalette: Palette = {
        primary: parent.palette.secondary.clone(),
        secondary: parent.palette.accent.clone(),
        accent: parent.palette.primary.clone(),
        background: parent.palette.background.clone(),
      };

      this.pendingSecondaries.push({
        position: dummy.position.clone(),
        palette: secPalette,
        strength: randomRange(0.3, 0.6),
      });
    }
  }

  dispose(): void {
    for (const burst of this.bursts) {
      (burst.particles.material as THREE.Material).dispose();
      sceneManager.scene.remove(burst.particles);
    }
    this.bursts = [];
    this.pendingSecondaries = [];
    this.geometry.dispose();
  }
}

export const fireworks = new FireworkSystem();
