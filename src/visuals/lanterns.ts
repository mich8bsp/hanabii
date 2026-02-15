import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import { randomRange } from '../utils/math';

interface Lantern {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
}

const MAX_LANTERNS = 30;
const LANTERN_LIFETIME = 15;

// Section label -> lantern color
const SECTION_COLORS: Record<string, number> = {
  intro: 0xffffff,
  verse: 0x6699cc,
  chorus: 0xff8844,
  bridge: 0xaa66cc,
  outro: 0xddaa44,
};

class LanternSystem {
  private lanterns: Lantern[] = [];
  private geometry: THREE.SphereGeometry;

  constructor() {
    this.geometry = new THREE.SphereGeometry(0.3, 8, 8);
  }

  init(): void {}

  /**
   * Release lanterns on a section change.
   */
  release(
    anchorPosition: THREE.Vector3,
    sectionLabel: string,
    count = 5
  ): void {
    const colorHex = SECTION_COLORS[sectionLabel] ?? 0xffaa44;

    for (let i = 0; i < count && this.lanterns.length < MAX_LANTERNS; i++) {
      const color = new THREE.Color(colorHex);

      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.position.set(
        anchorPosition.x + randomRange(-10, 10),
        anchorPosition.y - randomRange(2, 6),
        anchorPosition.z + randomRange(-15, 5)
      );
      mesh.scale.setScalar(randomRange(0.6, 1.2));
      sceneManager.scene.add(mesh);

      const light = new THREE.PointLight(colorHex, 1.5, 15);
      mesh.add(light);

      this.lanterns.push({
        mesh,
        light,
        velocity: new THREE.Vector3(
          randomRange(-0.3, 0.3),
          randomRange(0.5, 1.5),
          randomRange(-0.5, 0.5)
        ),
        age: 0,
        maxAge: LANTERN_LIFETIME + randomRange(-3, 3),
      });
    }
  }

  update(dt: number): void {
    const toRemove: number[] = [];

    for (let i = 0; i < this.lanterns.length; i++) {
      const l = this.lanterns[i];
      l.age += dt;

      if (l.age > l.maxAge) {
        toRemove.push(i);
        continue;
      }

      // Rise and drift
      l.mesh.position.add(l.velocity.clone().multiplyScalar(dt));

      // Flicker
      const flicker = 0.8 + 0.2 * Math.sin(l.age * 5 + i * 1.7);
      l.light.intensity = 1.5 * flicker;

      // Fade out in last 3 seconds
      const fadeStart = l.maxAge - 3;
      if (l.age > fadeStart) {
        const fade = 1 - (l.age - fadeStart) / 3;
        (l.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * fade;
        l.light.intensity *= fade;
      }
    }

    // Remove expired
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const l = this.lanterns[idx];
      (l.mesh.material as THREE.Material).dispose();
      l.mesh.remove(l.light);
      l.light.dispose();
      sceneManager.scene.remove(l.mesh);
      this.lanterns.splice(idx, 1);
    }
  }

  dispose(): void {
    for (const l of this.lanterns) {
      (l.mesh.material as THREE.Material).dispose();
      l.mesh.remove(l.light);
      l.light.dispose();
      sceneManager.scene.remove(l.mesh);
    }
    this.lanterns = [];
    this.geometry.dispose();
  }
}

export const lanterns = new LanternSystem();
