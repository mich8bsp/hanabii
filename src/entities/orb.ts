import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import { input } from '../game/input';
import { lerp, clamp } from '../utils/math';

const ORB_RADIUS = 0.4;
const FORWARD_SPEED = 8; // constant forward velocity (negative Z)
const LATERAL_BOUNDS = 15;
const VERTICAL_MIN = -3;
const VERTICAL_MAX = 10;

/**
 * Movement tuning for a floaty, fluid feel.
 * Instead of snapping to mouse, the orb accelerates toward the target
 * with velocity damping, giving inertia and momentum.
 */
const MOUSE_RANGE_X = 12;
const MOUSE_RANGE_Y = 7;
const ACCELERATION = 35;
const DAMPING = 4.5; // velocity friction
const KEYBOARD_ACCEL = 25;

class Orb {
  mesh!: THREE.Mesh;
  glowLight!: THREE.PointLight;
  trail!: THREE.Line;

  /** The actual rendered position */
  readonly position = new THREE.Vector3(0, 0, 0);

  /** Velocity for inertia-based movement */
  private velocity = new THREE.Vector2(0, 0);

  /** Trail history */
  private trailPositions: THREE.Vector3[] = [];
  private trailMaxLength = 100;

  /** Pulse boost state */
  private pulseTimer = 0;
  private baseEmissiveIntensity = 0.5;

  init(): void {
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

    this.glowLight = new THREE.PointLight(0xffaa55, 2, 30, 2);
    this.mesh.add(this.glowLight);

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
      // Forward motion is constant and direct (not velocity-based)
      this.position.z -= FORWARD_SPEED * dt;

      // Compute target from mouse (where the player wants to be)
      const targetX = input.mouseNDC.x * MOUSE_RANGE_X;
      const targetY = input.mouseNDC.y * MOUSE_RANGE_Y;

      // Acceleration toward mouse target
      const dx = targetX - this.position.x;
      const dy = targetY - this.position.y;
      this.velocity.x += dx * ACCELERATION * dt;
      this.velocity.y += dy * ACCELERATION * dt;

      // Keyboard/gamepad adds direct acceleration
      this.velocity.x += input.movement.x * KEYBOARD_ACCEL * dt;
      this.velocity.y += input.movement.y * KEYBOARD_ACCEL * dt;

      // Damping (friction) for smooth deceleration
      this.velocity.x *= Math.exp(-DAMPING * dt);
      this.velocity.y *= Math.exp(-DAMPING * dt);

      // Apply velocity
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;

      // Soft clamp with elastic bounce-back
      if (this.position.x > LATERAL_BOUNDS) {
        this.velocity.x -= (this.position.x - LATERAL_BOUNDS) * 10 * dt;
      } else if (this.position.x < -LATERAL_BOUNDS) {
        this.velocity.x -= (this.position.x + LATERAL_BOUNDS) * 10 * dt;
      }
      if (this.position.y > VERTICAL_MAX) {
        this.velocity.y -= (this.position.y - VERTICAL_MAX) * 10 * dt;
      } else if (this.position.y < VERTICAL_MIN) {
        this.velocity.y -= (this.position.y - VERTICAL_MIN) * 10 * dt;
      }
    }

    this.mesh.position.copy(this.position);

    // Subtle tilt based on velocity for visual feedback
    this.mesh.rotation.z = -this.velocity.x * 0.02;
    this.mesh.rotation.x = this.velocity.y * 0.015;

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

    this.updateTrail();
  }

  setColor(color: THREE.Color): void {
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.color.copy(color);
    mat.emissive.copy(color);
    this.glowLight.color.copy(color);
    (this.trail.material as THREE.LineBasicMaterial).color.copy(color);
  }

  beatPulse(strength: number): void {
    const scale = 1 + strength * 0.3;
    this.mesh.scale.setScalar(scale);
  }

  lerpScaleBack(dt: number): void {
    const s = lerp(this.mesh.scale.x, 1, 5 * dt);
    this.mesh.scale.setScalar(s);
  }

  reset(): void {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0);
    this.mesh.position.set(0, 0, 0);
    this.mesh.scale.setScalar(1);
    this.mesh.rotation.set(0, 0, 0);
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
