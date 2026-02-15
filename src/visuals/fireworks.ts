import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import { randomRange, randomInSphere } from '../utils/math';
import type { Palette } from './color-palette';

interface FireworkBurst {
  particles: THREE.InstancedMesh;
  velocities: Float32Array;
  ages: Float32Array;
  maxAge: number;
  age: number;
  particleCount: number;
  gravity: number;
  type: 'peony' | 'willow' | 'chrysanthemum' | 'kamuro';
}

const MAX_ACTIVE_BURSTS = 20;
const dummy = new THREE.Object3D();

class FireworkSystem {
  private bursts: FireworkBurst[] = [];
  private geometry: THREE.SphereGeometry;
  private materials: Map<string, THREE.MeshBasicMaterial> = new Map();

  constructor() {
    this.geometry = new THREE.SphereGeometry(0.06, 4, 4);
  }

  init(): void {
    // Pre-create materials will be done per-palette color
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
    if (sync < 0.2) return; // don't fire at very low sync

    // Choose burst type based on musical context
    let type: FireworkBurst['type'];
    let particleCount: number;
    let maxAge: number;
    let gravity: number;

    if (isDownbeat && strength > 0.6) {
      type = 'chrysanthemum';
      particleCount = Math.floor(400 * sync);
      maxAge = 2.5;
      gravity = 1.5;
    } else if (strength > 0.7) {
      type = 'peony';
      particleCount = Math.floor(300 * sync);
      maxAge = 2.0;
      gravity = 2.0;
    } else if (strength > 0.4) {
      type = 'willow';
      particleCount = Math.floor(200 * sync);
      maxAge = 3.0;
      gravity = 0.8;
    } else {
      type = 'kamuro';
      particleCount = Math.floor(150 * sync);
      maxAge = 1.5;
      gravity = 3.0;
    }

    particleCount = Math.max(20, particleCount);

    // Color: blend from palette based on type
    const color = type === 'kamuro'
      ? new THREE.Color(0xffd700) // gold for kamuro
      : palette.accent.clone().lerp(palette.primary, Math.random() * 0.5);

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const mesh = new THREE.InstancedMesh(this.geometry, material, particleCount);
    mesh.frustumCulled = false;
    sceneManager.scene.add(mesh);

    // Initialize velocities
    const velocities = new Float32Array(particleCount * 3);
    const ages = new Float32Array(particleCount);

    const burstRadius = type === 'chrysanthemum' ? 8 : type === 'willow' ? 6 : 5;

    for (let i = 0; i < particleCount; i++) {
      const dir = randomInSphere(1).normalize();
      const speed = randomRange(burstRadius * 0.5, burstRadius) * strength;
      velocities[i * 3] = dir.x * speed;
      velocities[i * 3 + 1] = dir.y * speed + randomRange(1, 3); // upward bias
      velocities[i * 3 + 2] = dir.z * speed;
      ages[i] = randomRange(0, 0.2); // slight age offset for natural look

      // Initial position
      dummy.position.copy(position);
      dummy.scale.setScalar(randomRange(0.5, 1.5));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    this.bursts.push({
      particles: mesh,
      velocities,
      ages,
      maxAge,
      age: 0,
      particleCount,
      gravity,
      type,
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
      const material = burst.particles.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.9 * (1 - lifeRatio * lifeRatio));

      for (let i = 0; i < burst.particleCount; i++) {
        burst.particles.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

        // Apply velocity and gravity
        dummy.position.x += burst.velocities[i * 3] * dt;
        dummy.position.y += burst.velocities[i * 3 + 1] * dt;
        dummy.position.z += burst.velocities[i * 3 + 2] * dt;

        // Gravity
        burst.velocities[i * 3 + 1] -= burst.gravity * dt;

        // Drag for willow type
        if (burst.type === 'willow') {
          burst.velocities[i * 3] *= 0.98;
          burst.velocities[i * 3 + 1] *= 0.98;
          burst.velocities[i * 3 + 2] *= 0.98;
        }

        // Shrink over time
        const scale = Math.max(0.01, 1 - lifeRatio);
        dummy.scale.setScalar(scale * randomRange(0.8, 1.2));

        dummy.updateMatrix();
        burst.particles.setMatrixAt(i, dummy.matrix);
      }
      burst.particles.instanceMatrix.needsUpdate = true;
    }

    // Remove expired bursts (reverse order)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const burst = this.bursts[idx];
      burst.particles.geometry; // already shared
      (burst.particles.material as THREE.Material).dispose();
      sceneManager.scene.remove(burst.particles);
      this.bursts.splice(idx, 1);
    }
  }

  dispose(): void {
    for (const burst of this.bursts) {
      (burst.particles.material as THREE.Material).dispose();
      sceneManager.scene.remove(burst.particles);
    }
    this.bursts = [];
    this.geometry.dispose();
  }
}

export const fireworks = new FireworkSystem();
