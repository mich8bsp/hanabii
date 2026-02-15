import * as THREE from 'three';
import { sceneManager } from './scene-manager';
import { randomRange } from '../utils/math';

const STAR_COUNT = 3000;
const STAR_SPHERE_RADIUS = 800;

let starPoints: THREE.Points;
let starSizes: Float32Array;
let starPhases: Float32Array;

export function createEnvironment(): void {
  createStarfield();
}

function createStarfield(): void {
  const positions = new Float32Array(STAR_COUNT * 3);
  starSizes = new Float32Array(STAR_COUNT);
  starPhases = new Float32Array(STAR_COUNT);

  for (let i = 0; i < STAR_COUNT; i++) {
    // Distribute on a sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = STAR_SPHERE_RADIUS * (0.8 + Math.random() * 0.2);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    starSizes[i] = randomRange(0.5, 2.5);
    starPhases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  starPoints = new THREE.Points(geometry, material);
  sceneManager.scene.add(starPoints);
}

/**
 * Gently rotate starfield and twinkle. Called each frame.
 */
export function updateEnvironment(elapsed: number, _dt: number): void {
  if (starPoints) {
    starPoints.rotation.y = elapsed * 0.005;
    starPoints.rotation.x = Math.sin(elapsed * 0.002) * 0.02;
  }
}

export function disposeEnvironment(): void {
  if (starPoints) {
    starPoints.geometry.dispose();
    (starPoints.material as THREE.Material).dispose();
    sceneManager.scene.remove(starPoints);
  }
}
