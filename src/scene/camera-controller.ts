import * as THREE from 'three';
import { sceneManager } from './scene-manager';
import { lerp } from '../utils/math';

/**
 * Camera follows the orb from behind with smooth interpolation.
 * Adjusts distance/angle based on energy and section changes.
 */
class CameraController {
  /** Offset from orb position */
  private offset = new THREE.Vector3(0, 3, 12);
  private targetOffset = new THREE.Vector3(0, 3, 12);

  /** Procedural shake */
  private shakeIntensity = 0;
  private shakeDecay = 5;

  /** Smoothing factor for camera follow (lower = smoother) */
  private followSmoothing = 0.05;

  update(orbPosition: THREE.Vector3, dt: number): void {
    const cam = sceneManager.camera;

    // Lerp offset toward target offset
    this.offset.x = lerp(this.offset.x, this.targetOffset.x, 2 * dt);
    this.offset.y = lerp(this.offset.y, this.targetOffset.y, 2 * dt);
    this.offset.z = lerp(this.offset.z, this.targetOffset.z, 2 * dt);

    // Target camera position
    const targetPos = new THREE.Vector3().copy(orbPosition).add(this.offset);

    // Smooth follow
    cam.position.lerp(targetPos, this.followSmoothing);

    // Look at the orb (slightly ahead)
    const lookTarget = new THREE.Vector3().copy(orbPosition);
    lookTarget.z -= 5; // look slightly ahead of the orb
    cam.lookAt(lookTarget);

    // Apply procedural shake
    if (this.shakeIntensity > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      cam.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= Math.exp(-this.shakeDecay * dt);
    }
  }

  /** Trigger a camera shake (e.g. on heavy bass hit) */
  shake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  /** Pull camera back for high energy, closer for quiet */
  setEnergyLevel(energy: number): void {
    // energy: 0-1
    this.targetOffset.z = lerp(10, 16, energy);
    this.targetOffset.y = lerp(2.5, 4.5, energy);
  }

  /** Cinematic wide shot for section transitions */
  cinematicPush(duration = 2): void {
    // Temporarily push camera out, it will naturally lerp back
    this.offset.z += 8;
    this.offset.y += 3;
  }

  reset(): void {
    this.offset.set(0, 3, 12);
    this.targetOffset.set(0, 3, 12);
    this.shakeIntensity = 0;
  }
}

export const cameraController = new CameraController();
