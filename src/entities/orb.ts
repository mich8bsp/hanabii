import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import { input } from '../game/input';
import { lerp, clamp } from '../utils/math';

const ORB_RADIUS = 0.4;
const MOVE_SPEED = 15; // units per second
const MOUSE_INFLUENCE = 0.6;
const KEYBOARD_INFLUENCE = 0.4;
const SMOOTHING = 0.08;
const FORWARD_SPEED = 8; // constant forward velocity (negative Z)
const LATERAL_BOUNDS = 20; // max X distance
const VERTICAL_BOUNDS = 12; // max Y distance

class Orb {
  mesh!: THREE.Mesh;
  glowLight!: THREE.PointLight;
  trail!: THREE.Line;

  /** The actual rendered position (smoothly interpolated) */
  readonly position = new THREE.Vector3(0, 0, 0);

  /** Target position based on raw input */
  private targetPosition = new THREE.Vector3(0, 0, 0);

  /** Trail history */
  private trailPositions: THREE.Vector3[] = [];
  private trailMaxLength = 80;

  /** Pulse boost state */
  private pulseTimer = 0;
  private baseEmissiveIntensity = 0.5;

  init(): void {
    // Orb mesh
    const geometry = new THREE.SphereGeometry(ORB_RADIUS, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffcc88,
      emissive: 0xffaa55,
      emissiveIntensity: this.baseEmissiveIntensity,
      metalness: 0.2,
      roughness: 0.3,
      transparent: true,
      opacity: 0.95,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    sceneManager.scene.add(this.mesh);

    // Glow point light attached to orb
    this.glowLight = new THREE.PointLight(0xffaa55, 2, 30, 2);
    this.mesh.add(this.glowLight);

    // Trail line
    const trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(this.trailMaxLength * 3);
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setDrawRange(0, 0);

    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0xffcc88,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.trail = new THREE.Line(trailGeometry, trailMaterial);
    sceneManager.scene.add(this.trail);
  }

  update(dt: number, songPlaying: boolean): void {
    if (songPlaying) {
      // Move forward constantly
      this.targetPosition.z -= FORWARD_SPEED * dt;

      // Mouse-driven lateral/vertical (maps NDC to world offset)
      const mouseX = input.mouseNDC.x * LATERAL_BOUNDS * MOUSE_INFLUENCE;
      const mouseY = input.mouseNDC.y * VERTICAL_BOUNDS * MOUSE_INFLUENCE;

      // Keyboard/gamepad additive
      this.targetPosition.x += input.movement.x * MOVE_SPEED * KEYBOARD_INFLUENCE * dt;
      this.targetPosition.y += input.movement.y * MOVE_SPEED * KEYBOARD_INFLUENCE * dt;

      // Blend mouse position
      this.targetPosition.x = lerp(this.targetPosition.x, mouseX + this.position.z * 0 , 3 * dt);
      this.targetPosition.y = lerp(this.targetPosition.y, mouseY, 3 * dt);

      // Clamp
      this.targetPosition.x = clamp(this.targetPosition.x, -LATERAL_BOUNDS, LATERAL_BOUNDS);
      this.targetPosition.y = clamp(this.targetPosition.y, -VERTICAL_BOUNDS / 2, VERTICAL_BOUNDS);
    }

    // Smooth interpolation
    this.position.lerp(this.targetPosition, SMOOTHING);
    this.mesh.position.copy(this.position);

    // Pulse boost
    if (input.pulseBoost && this.pulseTimer <= 0) {
      this.pulseTimer = 0.3;
    }
    if (this.pulseTimer > 0) {
      this.pulseTimer -= dt;
      const mat = this.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = this.baseEmissiveIntensity + 2 * (this.pulseTimer / 0.3);
      this.glowLight.intensity = 2 + 4 * (this.pulseTimer / 0.3);
    } else {
      const mat = this.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = this.baseEmissiveIntensity;
      this.glowLight.intensity = 2;
    }

    // Update trail
    this.updateTrail();
  }

  /** Set the orb color/emissive to match current palette */
  setColor(color: THREE.Color): void {
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.color.copy(color);
    mat.emissive.copy(color);
    this.glowLight.color.copy(color);
    (this.trail.material as THREE.LineBasicMaterial).color.copy(color);
  }

  /** Pulsate the orb on beat */
  beatPulse(strength: number): void {
    const scale = 1 + strength * 0.3;
    this.mesh.scale.setScalar(scale);
    // It will naturally lerp back via update
  }

  /** Lerp scale back to 1 each frame */
  lerpScaleBack(dt: number): void {
    const s = lerp(this.mesh.scale.x, 1, 5 * dt);
    this.mesh.scale.setScalar(s);
  }

  reset(): void {
    this.position.set(0, 0, 0);
    this.targetPosition.set(0, 0, 0);
    this.mesh.position.set(0, 0, 0);
    this.mesh.scale.setScalar(1);
    this.trailPositions = [];
    this.trail.geometry.setDrawRange(0, 0);
    this.pulseTimer = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.trail.geometry.dispose();
    (this.trail.material as THREE.Material).dispose();
    sceneManager.scene.remove(this.mesh);
    sceneManager.scene.remove(this.trail);
  }

  private updateTrail(): void {
    this.trailPositions.push(this.position.clone());
    if (this.trailPositions.length > this.trailMaxLength) {
      this.trailPositions.shift();
    }

    const attr = this.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.trailPositions.length; i++) {
      const p = this.trailPositions[i];
      attr.setXYZ(i, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, this.trailPositions.length);
  }
}

export const orb = new Orb();
