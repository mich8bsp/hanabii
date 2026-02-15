import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import type { PathPoint } from '../audio/structures';
import { clamp, lerp } from '../utils/math';

const VISIBLE_AHEAD = 10; // seconds of path visible ahead
const VISIBLE_BEHIND = 1; // seconds of path visible behind
const MAX_POINTS = 400;
const BEACON_COUNT = 60; // number of floating beacon particles along path

class GuidePath {
  // --- Path ribbon (two parallel lines for width) ---
  private line!: THREE.Line;
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.ShaderMaterial;
  private positionAttr!: THREE.BufferAttribute;
  private alphaAttr!: THREE.BufferAttribute;

  // --- Current-position target marker ---
  private marker!: THREE.Mesh;
  private markerRing!: THREE.Mesh;
  private markerLight!: THREE.PointLight;

  // --- Beacon particles along path ---
  private beacons!: THREE.Points;
  private beaconGeometry!: THREE.BufferGeometry;
  private beaconPositionAttr!: THREE.BufferAttribute;
  private beaconAlphaAttr!: THREE.BufferAttribute;
  private beaconMaterial!: THREE.ShaderMaterial;

  // --- Direction hint particles (between orb and target) ---
  private hints!: THREE.Points;
  private hintGeometry!: THREE.BufferGeometry;
  private hintPositionAttr!: THREE.BufferAttribute;
  private hintMaterial!: THREE.PointsMaterial;
  private hintCount = 12;

  init(): void {
    this.initPathLine();
    this.initMarker();
    this.initBeacons();
    this.initDirectionHints();
  }

  private initPathLine(): void {
    const positions = new Float32Array(MAX_POINTS * 3);
    const alphas = new Float32Array(MAX_POINTS);
    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(positions, 3);
    this.alphaAttr = new THREE.BufferAttribute(alphas, 1);
    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('alpha', this.alphaAttr);
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(0x88ccff) },
        uOpacity: { value: 0.4 },
      },
      vertexShader: /* glsl */ `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, uOpacity * vAlpha);
        }
      `,
    });

    this.line = new THREE.Line(this.geometry, this.material);
    sceneManager.scene.add(this.line);
  }

  private initMarker(): void {
    // Inner glowing sphere at the current ideal position
    const markerGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0x66bbff,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.marker = new THREE.Mesh(markerGeo, markerMat);
    this.marker.visible = false;
    sceneManager.scene.add(this.marker);

    // Outer pulsing ring
    const ringGeo = new THREE.RingGeometry(0.6, 0.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x88ddff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.markerRing = new THREE.Mesh(ringGeo, ringMat);
    this.markerRing.visible = false;
    sceneManager.scene.add(this.markerRing);

    // Point light on the marker so it illuminates the area
    this.markerLight = new THREE.PointLight(0x66bbff, 2, 20);
    this.marker.add(this.markerLight);
  }

  private initBeacons(): void {
    const positions = new Float32Array(BEACON_COUNT * 3);
    const alphas = new Float32Array(BEACON_COUNT);
    this.beaconGeometry = new THREE.BufferGeometry();
    this.beaconPositionAttr = new THREE.BufferAttribute(positions, 3);
    this.beaconAlphaAttr = new THREE.BufferAttribute(alphas, 1);
    this.beaconGeometry.setAttribute('position', this.beaconPositionAttr);
    this.beaconGeometry.setAttribute('alpha', this.beaconAlphaAttr);
    this.beaconGeometry.setDrawRange(0, 0);

    this.beaconMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(0x88ccff) },
        uSize: { value: 6.0 },
        uOpacity: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        attribute float alpha;
        uniform float uSize;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float glow = 1.0 - smoothstep(0.0, 1.0, d);
          gl_FragColor = vec4(uColor, glow * uOpacity * vAlpha);
        }
      `,
    });

    this.beacons = new THREE.Points(this.beaconGeometry, this.beaconMaterial);
    this.beacons.frustumCulled = false;
    sceneManager.scene.add(this.beacons);
  }

  private initDirectionHints(): void {
    const positions = new Float32Array(this.hintCount * 3);
    this.hintGeometry = new THREE.BufferGeometry();
    this.hintPositionAttr = new THREE.BufferAttribute(positions, 3);
    this.hintGeometry.setAttribute('position', this.hintPositionAttr);
    this.hintGeometry.setDrawRange(0, 0);

    this.hintMaterial = new THREE.PointsMaterial({
      color: 0xaaddff,
      size: 0.15,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.hints = new THREE.Points(this.hintGeometry, this.hintMaterial);
    this.hints.frustumCulled = false;
    sceneManager.scene.add(this.hints);
  }

  /**
   * Update visible portion of the path, marker, beacons, and direction hints.
   * @param orbPosition - current orb world position
   * @param sync - 0-1, controls visibility (lower sync = more visible guide)
   * @param elapsed - total elapsed time for animation
   */
  update(
    idealPath: PathPoint[],
    currentTime: number,
    sync: number,
    orbPosition?: THREE.Vector3,
    elapsed?: number
  ): void {
    if (idealPath.length === 0) {
      this.geometry.setDrawRange(0, 0);
      this.beaconGeometry.setDrawRange(0, 0);
      this.hintGeometry.setDrawRange(0, 0);
      this.marker.visible = false;
      this.markerRing.visible = false;
      return;
    }

    const time = elapsed ?? 0;
    const startTime = currentTime - VISIBLE_BEHIND;
    const endTime = currentTime + VISIBLE_AHEAD;

    // --- Visibility scales with desync: always somewhat visible, much brighter when off-path ---
    const baseOpacity = 0.15 + (1 - sync) * 0.5;
    this.material.uniforms.uOpacity.value = baseOpacity;
    this.beaconMaterial.uniforms.uOpacity.value = 0.25 + (1 - sync) * 0.5;

    // --- Update path line with per-vertex alpha (fades ahead) ---
    let count = 0;
    const startIdx = this.findStartIndex(idealPath, startTime);
    for (let i = startIdx; i < idealPath.length && count < MAX_POINTS; i++) {
      const p = idealPath[i];
      if (p.time > endTime) break;

      this.positionAttr.setXYZ(count, p.position.x, p.position.y, p.position.z);

      // Alpha: full near current time, fading ahead and behind
      const timeDelta = p.time - currentTime;
      let alpha: number;
      if (timeDelta < 0) {
        alpha = clamp(1 + timeDelta / VISIBLE_BEHIND, 0, 1) * 0.3;
      } else {
        alpha = clamp(1 - timeDelta / VISIBLE_AHEAD, 0, 1);
        // Pulse effect: gentle wave along the path
        alpha *= 0.6 + 0.4 * Math.sin(timeDelta * 2 - time * 3);
      }
      this.alphaAttr.setX(count, alpha);
      count++;
    }
    this.positionAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, count);

    // --- Update beacons (evenly spaced glowing dots along future path) ---
    this.updateBeacons(idealPath, currentTime, endTime, time);

    // --- Update target marker at current ideal position ---
    this.updateMarker(idealPath, currentTime, sync, time);

    // --- Update direction hint particles (orb -> marker) ---
    if (orbPosition) {
      this.updateDirectionHints(orbPosition, sync, time);
    }
  }

  private updateBeacons(
    idealPath: PathPoint[],
    currentTime: number,
    endTime: number,
    elapsed: number
  ): void {
    const beaconSpacing = (endTime - currentTime) / BEACON_COUNT;
    let bCount = 0;

    for (let b = 0; b < BEACON_COUNT; b++) {
      const t = currentTime + (b + 1) * beaconSpacing;
      const point = this.interpolatePathAtTime(idealPath, t);
      if (!point) continue;

      // Vertical bob
      const bob = Math.sin(elapsed * 2 + b * 0.5) * 0.2;

      this.beaconPositionAttr.setXYZ(bCount, point.x, point.y + bob, point.z);

      // Fade with distance from current time
      const dist = (t - currentTime) / (endTime - currentTime);
      const alpha = (1 - dist * dist) * (0.5 + 0.5 * Math.sin(elapsed * 3 + b * 0.8));
      this.beaconAlphaAttr.setX(bCount, clamp(alpha, 0, 1));
      bCount++;
    }

    this.beaconPositionAttr.needsUpdate = true;
    this.beaconAlphaAttr.needsUpdate = true;
    this.beaconGeometry.setDrawRange(0, bCount);
  }

  private updateMarker(
    idealPath: PathPoint[],
    currentTime: number,
    sync: number,
    elapsed: number
  ): void {
    const pos = this.interpolatePathAtTime(idealPath, currentTime);
    if (!pos) {
      this.marker.visible = false;
      this.markerRing.visible = false;
      return;
    }

    this.marker.visible = true;
    this.markerRing.visible = true;

    this.marker.position.copy(pos);
    this.markerRing.position.copy(pos);

    // Ring faces camera
    this.markerRing.lookAt(sceneManager.camera.position);

    // Pulse scale
    const pulse = 1 + 0.2 * Math.sin(elapsed * 4);
    this.markerRing.scale.setScalar(pulse);

    // Brightness inversely proportional to sync
    const markerOpacity = 0.3 + (1 - sync) * 0.5;
    (this.marker.material as THREE.MeshBasicMaterial).opacity = markerOpacity;
    (this.markerRing.material as THREE.MeshBasicMaterial).opacity = markerOpacity * 0.6;
    this.markerLight.intensity = 1 + (1 - sync) * 3;
  }

  private updateDirectionHints(
    orbPosition: THREE.Vector3,
    sync: number,
    elapsed: number
  ): void {
    // Only show direction hints when sync is low enough to need guidance
    const showHints = sync < 0.75;
    const hintOpacity = showHints ? clamp((0.75 - sync) * 2, 0, 0.6) : 0;
    this.hintMaterial.opacity = hintOpacity;

    if (!showHints || !this.marker.visible) {
      this.hintGeometry.setDrawRange(0, 0);
      return;
    }

    const target = this.marker.position;

    for (let i = 0; i < this.hintCount; i++) {
      // Distribute particles from orb toward target, animated flowing
      const baseT = (i / this.hintCount);
      const animT = (baseT + elapsed * 0.5) % 1.0; // flow toward target

      const x = lerp(orbPosition.x, target.x, animT);
      const y = lerp(orbPosition.y, target.y, animT);
      const z = lerp(orbPosition.z, target.z, animT);

      // Slight sinusoidal offset for visual interest
      const offset = Math.sin(animT * Math.PI * 2 + elapsed * 3) * 0.15;

      this.hintPositionAttr.setXYZ(i, x + offset, y + offset * 0.5, z);
    }

    this.hintPositionAttr.needsUpdate = true;
    this.hintGeometry.setDrawRange(0, this.hintCount);
  }

  setColor(color: THREE.Color): void {
    this.material.uniforms.uColor.value.copy(color);
    this.beaconMaterial.uniforms.uColor.value.copy(color);
    (this.marker.material as THREE.MeshBasicMaterial).color.copy(color);
    (this.markerRing.material as THREE.MeshBasicMaterial).color.copy(color);
    this.markerLight.color.copy(color);
    this.hintMaterial.color.copy(color);
  }

  private findStartIndex(path: PathPoint[], time: number): number {
    // Binary search for first point >= time
    let lo = 0, hi = path.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (path[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private interpolatePathAtTime(path: PathPoint[], time: number): THREE.Vector3 | null {
    if (path.length === 0) return null;
    if (time <= path[0].time) return path[0].position.clone();
    if (time >= path[path.length - 1].time) return path[path.length - 1].position.clone();

    // Binary search
    let lo = 0, hi = path.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (path[mid].time <= time) lo = mid;
      else hi = mid;
    }

    const p0 = path[lo];
    const p1 = path[hi];
    const t = (time - p0.time) / (p1.time - p0.time);
    return new THREE.Vector3().lerpVectors(p0.position, p1.position, clamp(t, 0, 1));
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    sceneManager.scene.remove(this.line);

    (this.marker.material as THREE.Material).dispose();
    this.marker.geometry.dispose();
    sceneManager.scene.remove(this.marker);

    (this.markerRing.material as THREE.Material).dispose();
    this.markerRing.geometry.dispose();
    sceneManager.scene.remove(this.markerRing);

    this.beaconGeometry.dispose();
    this.beaconMaterial.dispose();
    sceneManager.scene.remove(this.beacons);

    this.hintGeometry.dispose();
    this.hintMaterial.dispose();
    sceneManager.scene.remove(this.hints);
  }
}

export const guidePath = new GuidePath();
