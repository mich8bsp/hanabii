import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import type { PathPoint } from '../audio/structures';
import { clamp } from '../utils/math';

const VISIBLE_AHEAD = 8; // seconds of path visible ahead
const VISIBLE_BEHIND = 1; // seconds of path visible behind
const MAX_POINTS = 300;

class GuidePath {
  private line!: THREE.Line;
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.LineBasicMaterial;
  private positionAttr!: THREE.BufferAttribute;

  init(): void {
    const positions = new Float32Array(MAX_POINTS * 3);
    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(positions, 3);
    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.line = new THREE.Line(this.geometry, this.material);
    sceneManager.scene.add(this.line);
  }

  /**
   * Update visible portion of the path.
   * sync: 0-1, controls visibility (lower sync = more visible guide)
   */
  update(idealPath: PathPoint[], currentTime: number, sync: number): void {
    if (idealPath.length === 0) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    const startTime = currentTime - VISIBLE_BEHIND;
    const endTime = currentTime + VISIBLE_AHEAD;

    // Adjust opacity based on sync: high sync = nearly invisible, low sync = more visible
    const baseOpacity = 0.05 + (1 - sync) * 0.25;
    this.material.opacity = baseOpacity;

    // Collect visible points
    let count = 0;
    for (let i = 0; i < idealPath.length && count < MAX_POINTS; i++) {
      const p = idealPath[i];
      if (p.time < startTime) continue;
      if (p.time > endTime) break;

      this.positionAttr.setXYZ(count, p.position.x, p.position.y, p.position.z);
      count++;
    }

    this.positionAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, count);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    sceneManager.scene.remove(this.line);
  }
}

export const guidePath = new GuidePath();
