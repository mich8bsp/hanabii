import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import type { SongMap, BeatEvent, PathPoint } from '../audio/structures';
import { clamp, lerp } from '../utils/math';

const HOOP_RADIUS = 2.0;
const HOOP_TUBE = 0.08;
const HOOP_SEGMENTS = 32;
const PASS_DISTANCE = HOOP_RADIUS * 1.1; // XY distance to count as "through"
const VISIBLE_AHEAD_Z = 100; // world units ahead to show hoops
const VISIBLE_BEHIND_Z = 10;

export interface Hoop {
  time: number;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  ring: THREE.Mesh; // outer glow ring
  light: THREE.PointLight;
  state: 'upcoming' | 'passed' | 'missed';
  strength: number; // beat strength
  isDownbeat: boolean;
}

const FORWARD_SPEED = 8;

class HoopSystem {
  private hoops: Hoop[] = [];
  private torusGeometry!: THREE.TorusGeometry;
  private ringGeometry!: THREE.RingGeometry;
  private nextCheckIndex = 0;

  /** Hoops passed this session */
  hoopsPassed = 0;
  hoopsTotal = 0;

  init(songMap: SongMap): void {
    this.torusGeometry = new THREE.TorusGeometry(HOOP_RADIUS, HOOP_TUBE, 16, HOOP_SEGMENTS);
    this.ringGeometry = new THREE.RingGeometry(HOOP_RADIUS * 0.3, HOOP_RADIUS, HOOP_SEGMENTS);
    this.hoops = [];
    this.nextCheckIndex = 0;
    this.hoopsPassed = 0;

    // Place hoops at strong beats along the ideal path
    const beats = this.selectHoopBeats(songMap.beats);
    this.hoopsTotal = beats.length;

    for (const beat of beats) {
      const pos = this.getPathPositionAtTime(songMap.idealPath, beat.time);
      if (!pos) continue;

      // Torus (the solid hoop ring)
      const torusMat = new THREE.MeshBasicMaterial({
        color: 0x66bbff,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const torus = new THREE.Mesh(this.torusGeometry, torusMat);
      torus.position.copy(pos);
      torus.rotation.y = Math.PI / 2; // face toward camera (along Z)
      torus.visible = false;
      sceneManager.scene.add(torus);

      // Inner fill ring (semi-transparent disc so you can see the "hole")
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x4488cc,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(this.ringGeometry, ringMat);
      ring.position.copy(pos);
      ring.rotation.y = Math.PI / 2;
      ring.visible = false;
      sceneManager.scene.add(ring);

      // Light
      const light = new THREE.PointLight(0x66bbff, 1, 15);
      light.position.copy(pos);
      light.visible = false;
      sceneManager.scene.add(light);

      this.hoops.push({
        time: beat.time,
        position: pos,
        mesh: torus,
        ring,
        light,
        state: 'upcoming',
        strength: beat.strength,
        isDownbeat: beat.isDownbeat,
      });
    }
  }

  /**
   * Select which beats become hoops. Not every beat - pick strong beats
   * with minimum spacing so it doesn't feel cluttered.
   */
  private selectHoopBeats(beats: BeatEvent[]): BeatEvent[] {
    const selected: BeatEvent[] = [];
    const minInterval = 1.5; // seconds between hoops minimum
    let lastTime = -minInterval;

    for (const beat of beats) {
      if (beat.time - lastTime < minInterval) continue;

      // Prefer downbeats and strong beats
      if (beat.isDownbeat || beat.strength > 0.5) {
        selected.push(beat);
        lastTime = beat.time;
      }
    }

    return selected;
  }

  private getPathPositionAtTime(path: PathPoint[], time: number): THREE.Vector3 | null {
    if (path.length === 0) return null;
    if (time <= path[0].time) return path[0].position.clone();
    if (time >= path[path.length - 1].time) return path[path.length - 1].position.clone();

    let lo = 0, hi = path.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (path[mid].time <= time) lo = mid;
      else hi = mid;
    }
    const p0 = path[lo];
    const p1 = path[hi];
    const t = clamp((time - p0.time) / (p1.time - p0.time), 0, 1);
    return new THREE.Vector3().lerpVectors(p0.position, p1.position, t);
  }

  /**
   * Update hoop visibility and check for orb passage.
   * Returns a list of hoops the orb just passed through this frame.
   */
  update(
    dt: number,
    elapsed: number,
    orbPosition: THREE.Vector3,
    sync: number
  ): Hoop[] {
    const passedThisFrame: Hoop[] = [];
    const orbZ = orbPosition.z;

    for (let i = this.nextCheckIndex; i < this.hoops.length; i++) {
      const hoop = this.hoops[i];
      const dz = hoop.position.z - orbZ;

      // Visibility: show hoops in range
      const visible = dz < VISIBLE_AHEAD_Z && dz > -VISIBLE_BEHIND_Z;
      hoop.mesh.visible = visible && hoop.state === 'upcoming';
      hoop.ring.visible = visible && hoop.state === 'upcoming';
      hoop.light.visible = visible && hoop.state === 'upcoming';

      if (hoop.state !== 'upcoming') continue;

      // Animate upcoming hoops
      if (visible) {
        // Gentle pulse
        const pulse = 1 + 0.08 * Math.sin(elapsed * 4 + i * 0.7);
        hoop.mesh.scale.setScalar(pulse);
        hoop.ring.scale.setScalar(pulse);

        // Brighter as orb approaches
        const proximity = clamp(1 - dz / VISIBLE_AHEAD_Z, 0, 1);
        const opacity = 0.3 + proximity * 0.6;
        (hoop.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
        (hoop.ring.material as THREE.MeshBasicMaterial).opacity = proximity * 0.12;
        hoop.light.intensity = proximity * 2;
      }

      // Check passage: orb Z has passed the hoop Z
      if (orbZ < hoop.position.z) {
        // How close was the orb in XY?
        const dx = orbPosition.x - hoop.position.x;
        const dy = orbPosition.y - hoop.position.y;
        const xyDist = Math.sqrt(dx * dx + dy * dy);

        if (xyDist < PASS_DISTANCE) {
          // Passed through!
          hoop.state = 'passed';
          this.hoopsPassed++;
          passedThisFrame.push(hoop);
          this.animatePassSuccess(hoop);
        } else {
          // Missed
          hoop.state = 'missed';
          this.animateMiss(hoop);
        }

        // Advance check index past resolved hoops
        if (i === this.nextCheckIndex) {
          this.nextCheckIndex++;
        }
      }
    }

    // Clean up old hoops behind the player
    this.cleanupBehind(orbZ);

    return passedThisFrame;
  }

  private animatePassSuccess(hoop: Hoop): void {
    // Flash bright then fade out
    (hoop.mesh.material as THREE.MeshBasicMaterial).color.set(0xffffff);
    (hoop.mesh.material as THREE.MeshBasicMaterial).opacity = 1.0;
    hoop.light.color.set(0xffffff);
    hoop.light.intensity = 6;

    // Fade out over ~0.5s via a simple interval
    let t = 0;
    const interval = setInterval(() => {
      t += 0.03;
      const fade = 1 - t;
      if (fade <= 0) {
        hoop.mesh.visible = false;
        hoop.ring.visible = false;
        hoop.light.visible = false;
        clearInterval(interval);
        return;
      }
      (hoop.mesh.material as THREE.MeshBasicMaterial).opacity = fade;
      hoop.light.intensity = fade * 6;
      hoop.mesh.scale.setScalar(1 + t * 2); // expand as it fades
      hoop.ring.scale.setScalar(1 + t * 2);
    }, 30);
  }

  private animateMiss(hoop: Hoop): void {
    // Dim and turn red briefly
    (hoop.mesh.material as THREE.MeshBasicMaterial).color.set(0xff3333);
    (hoop.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5;
    hoop.light.color.set(0xff3333);
    hoop.light.intensity = 1;

    let t = 0;
    const interval = setInterval(() => {
      t += 0.05;
      const fade = 1 - t;
      if (fade <= 0) {
        hoop.mesh.visible = false;
        hoop.ring.visible = false;
        hoop.light.visible = false;
        clearInterval(interval);
        return;
      }
      (hoop.mesh.material as THREE.MeshBasicMaterial).opacity = fade * 0.4;
      hoop.light.intensity = fade;
    }, 30);
  }

  private cleanupBehind(orbZ: number): void {
    for (const hoop of this.hoops) {
      if (hoop.position.z > orbZ + VISIBLE_BEHIND_Z) {
        if (hoop.state === 'upcoming') {
          hoop.state = 'missed';
        }
        hoop.mesh.visible = false;
        hoop.ring.visible = false;
        hoop.light.visible = false;
      }
    }
  }

  /** Set the base color for upcoming hoops (from palette) */
  setColor(color: THREE.Color): void {
    for (const hoop of this.hoops) {
      if (hoop.state === 'upcoming') {
        (hoop.mesh.material as THREE.MeshBasicMaterial).color.copy(color);
        hoop.light.color.copy(color);
      }
    }
  }

  dispose(): void {
    for (const hoop of this.hoops) {
      (hoop.mesh.material as THREE.Material).dispose();
      (hoop.ring.material as THREE.Material).dispose();
      sceneManager.scene.remove(hoop.mesh);
      sceneManager.scene.remove(hoop.ring);
      hoop.light.dispose();
      sceneManager.scene.remove(hoop.light);
    }
    this.hoops = [];
    this.torusGeometry.dispose();
    this.ringGeometry.dispose();
  }
}

export const hoops = new HoopSystem();
