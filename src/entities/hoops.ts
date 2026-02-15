import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import type { SongMap, BeatEvent, PathPoint } from '../audio/structures';
import { clamp } from '../utils/math';

// Torii gate dimensions
const GATE_WIDTH = 5.0;       // distance between pillars
const GATE_HEIGHT = 5.5;      // total height
const PILLAR_RADIUS = 0.12;
const PILLAR_HEIGHT = GATE_HEIGHT;
const BEAM_OVERHANG = 0.8;    // how far the top beam extends past pillars
const BEAM_THICKNESS = 0.18;
const BEAM_DEPTH = 0.25;
const SUB_BEAM_Y = GATE_HEIGHT * 0.75; // secondary beam height

const PASS_HALF_W = GATE_WIDTH / 2 + 0.5;  // generous horizontal pass zone
const PASS_MIN_Y = -1.0;                     // can be slightly below pillar base
const PASS_MAX_Y = GATE_HEIGHT + 1.0;       // can be slightly above top beam
const VISIBLE_AHEAD_Z = 100;
const VISIBLE_BEHIND_Z = 10;

export interface Hoop {
  time: number;
  position: THREE.Vector3; // center-bottom of the gate (between pillars, at ground)
  group: THREE.Group;
  light: THREE.PointLight;
  materials: THREE.MeshBasicMaterial[];
  state: 'upcoming' | 'passed' | 'missed';
  strength: number;
  isDownbeat: boolean;
}

class HoopSystem {
  private hoops: Hoop[] = [];
  private nextCheckIndex = 0;

  hoopsPassed = 0;
  hoopsTotal = 0;

  init(songMap: SongMap): void {
    this.hoops = [];
    this.nextCheckIndex = 0;
    this.hoopsPassed = 0;

    const beats = this.selectHoopBeats(songMap.beats);
    this.hoopsTotal = beats.length;

    for (const beat of beats) {
      const pos = this.getPathPositionAtTime(songMap.idealPath, beat.time);
      if (!pos) continue;

      const hoop = this.createToriiGate(pos, beat);
      this.hoops.push(hoop);
    }
  }

  /**
   * Build a torii gate from basic geometries.
   * The gate faces the -Z direction (the orb flies through it).
   */
  private createToriiGate(position: THREE.Vector3, beat: BeatEvent): Hoop {
    const group = new THREE.Group();
    const materials: THREE.MeshBasicMaterial[] = [];

    const pillarColor = 0xcc3333; // traditional vermillion red

    // Helper to create a material and track it
    const makeMat = (color: number, opacity = 0.8) => {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      materials.push(mat);
      return mat;
    };

    const pillarMat = makeMat(pillarColor);
    const beamMat = makeMat(pillarColor, 0.85);
    const capMat = makeMat(0xff5544, 0.7);

    // --- Left pillar ---
    const pillarGeo = new THREE.CylinderGeometry(PILLAR_RADIUS, PILLAR_RADIUS * 1.15, PILLAR_HEIGHT, 8);
    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-GATE_WIDTH / 2, PILLAR_HEIGHT / 2, 0);
    group.add(leftPillar);

    // --- Right pillar ---
    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(GATE_WIDTH / 2, PILLAR_HEIGHT / 2, 0);
    group.add(rightPillar);

    // --- Top beam (kasagi) - slightly curved upward at tips ---
    const kasagiWidth = GATE_WIDTH + BEAM_OVERHANG * 2;
    const kasagiGeo = new THREE.BoxGeometry(kasagiWidth, BEAM_THICKNESS, BEAM_DEPTH);
    const kasagi = new THREE.Mesh(kasagiGeo, beamMat);
    kasagi.position.set(0, GATE_HEIGHT, 0);
    group.add(kasagi);

    // --- Curved cap on top of kasagi (shimaki) ---
    // A flattened cylinder arc for the traditional upward curve
    const capGeo = new THREE.BoxGeometry(kasagiWidth + 0.3, BEAM_THICKNESS * 0.6, BEAM_DEPTH + 0.1);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(0, GATE_HEIGHT + BEAM_THICKNESS * 0.7, 0);
    group.add(cap);

    // --- Left tip upturn ---
    const tipGeo = new THREE.BoxGeometry(0.4, BEAM_THICKNESS * 1.2, BEAM_DEPTH);
    const leftTip = new THREE.Mesh(tipGeo, capMat);
    leftTip.position.set(-kasagiWidth / 2 + 0.1, GATE_HEIGHT + BEAM_THICKNESS * 0.3, 0);
    leftTip.rotation.z = 0.25;
    group.add(leftTip);

    const rightTip = new THREE.Mesh(tipGeo, capMat);
    rightTip.position.set(kasagiWidth / 2 - 0.1, GATE_HEIGHT + BEAM_THICKNESS * 0.3, 0);
    rightTip.rotation.z = -0.25;
    group.add(rightTip);

    // --- Secondary beam (nuki) ---
    const nukiGeo = new THREE.BoxGeometry(GATE_WIDTH + 0.3, BEAM_THICKNESS * 0.7, BEAM_DEPTH * 0.7);
    const nuki = new THREE.Mesh(nukiGeo, beamMat);
    nuki.position.set(0, SUB_BEAM_Y, 0);
    group.add(nuki);

    // --- Center tablet (gakuzuka) between beams ---
    const tabletGeo = new THREE.BoxGeometry(0.8, (GATE_HEIGHT - SUB_BEAM_Y) * 0.7, BEAM_DEPTH * 0.5);
    const tabletMat = makeMat(0xff6644, 0.5);
    const tablet = new THREE.Mesh(tabletGeo, tabletMat);
    tablet.position.set(0, SUB_BEAM_Y + (GATE_HEIGHT - SUB_BEAM_Y) * 0.45, 0);
    group.add(tablet);

    // Position the whole gate
    // The gate's Y=0 is at pillar base; offset so `position` is the path point
    // Path position is roughly where the orb center should pass, so center
    // the gate opening around it
    group.position.set(position.x, position.y - GATE_HEIGHT * 0.4, position.z);

    group.visible = false;
    sceneManager.scene.add(group);

    // Light at the top of the gate
    const light = new THREE.PointLight(0xcc4422, 1.5, 20);
    light.position.set(0, GATE_HEIGHT, 0);
    group.add(light);

    return {
      time: beat.time,
      position: position.clone(),
      group,
      light,
      materials,
      state: 'upcoming',
      strength: beat.strength,
      isDownbeat: beat.isDownbeat,
    };
  }

  private selectHoopBeats(beats: BeatEvent[]): BeatEvent[] {
    const selected: BeatEvent[] = [];
    const minInterval = 1.5;
    let lastTime = -minInterval;

    for (const beat of beats) {
      if (beat.time - lastTime < minInterval) continue;
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

      // Visibility
      const visible = dz < VISIBLE_AHEAD_Z && dz > -VISIBLE_BEHIND_Z;
      hoop.group.visible = visible && hoop.state === 'upcoming';

      if (hoop.state !== 'upcoming') continue;

      if (visible) {
        // Gentle pulse
        const pulse = 1 + 0.05 * Math.sin(elapsed * 3 + i * 0.7);
        hoop.group.scale.setScalar(pulse);

        // Brighter as orb approaches
        const proximity = clamp(1 - dz / VISIBLE_AHEAD_Z, 0, 1);
        const opacity = 0.2 + proximity * 0.7;
        for (const mat of hoop.materials) {
          mat.opacity = opacity;
        }
        hoop.light.intensity = 0.5 + proximity * 2.5;
      }

      // Check passage
      if (orbZ < hoop.position.z) {
        const dx = Math.abs(orbPosition.x - hoop.position.x);
        const dy = orbPosition.y - hoop.position.y;

        // Pass if within gate opening horizontally and reasonable vertically
        const gateBaseY = hoop.position.y - GATE_HEIGHT * 0.4;
        const relY = orbPosition.y - gateBaseY;
        const passedThrough = dx < PASS_HALF_W && relY > PASS_MIN_Y && relY < PASS_MAX_Y;

        if (passedThrough) {
          hoop.state = 'passed';
          this.hoopsPassed++;
          passedThisFrame.push(hoop);
          this.animatePassSuccess(hoop);
        } else {
          hoop.state = 'missed';
          this.animateMiss(hoop);
        }

        if (i === this.nextCheckIndex) {
          this.nextCheckIndex++;
        }
      }
    }

    this.cleanupBehind(orbZ);
    return passedThisFrame;
  }

  private animatePassSuccess(hoop: Hoop): void {
    // Flash white/gold
    for (const mat of hoop.materials) {
      mat.color.set(0xffeedd);
      mat.opacity = 1.0;
    }
    hoop.light.color.set(0xffffff);
    hoop.light.intensity = 8;

    let t = 0;
    const interval = setInterval(() => {
      t += 0.03;
      const fade = 1 - t;
      if (fade <= 0) {
        hoop.group.visible = false;
        clearInterval(interval);
        return;
      }
      for (const mat of hoop.materials) {
        mat.opacity = fade;
      }
      hoop.light.intensity = fade * 8;
      hoop.group.scale.setScalar(1 + t * 0.5);
    }, 30);
  }

  private animateMiss(hoop: Hoop): void {
    for (const mat of hoop.materials) {
      mat.color.set(0xff2222);
      mat.opacity = 0.4;
    }
    hoop.light.color.set(0xff2222);
    hoop.light.intensity = 1;

    let t = 0;
    const interval = setInterval(() => {
      t += 0.05;
      const fade = 1 - t;
      if (fade <= 0) {
        hoop.group.visible = false;
        clearInterval(interval);
        return;
      }
      for (const mat of hoop.materials) {
        mat.opacity = fade * 0.3;
      }
      hoop.light.intensity = fade;
    }, 30);
  }

  private cleanupBehind(orbZ: number): void {
    for (const hoop of this.hoops) {
      if (hoop.position.z > orbZ + VISIBLE_BEHIND_Z && hoop.state === 'upcoming') {
        hoop.state = 'missed';
        hoop.group.visible = false;
      }
    }
  }

  setColor(color: THREE.Color): void {
    // Tint the traditional red toward the palette accent
    const blended = new THREE.Color(0xcc3333).lerp(color, 0.3);
    for (const hoop of this.hoops) {
      if (hoop.state === 'upcoming') {
        for (const mat of hoop.materials) {
          mat.color.copy(blended);
        }
        hoop.light.color.copy(blended);
      }
    }
  }

  dispose(): void {
    for (const hoop of this.hoops) {
      // Dispose all child geometries and materials
      hoop.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      });
      for (const mat of hoop.materials) {
        mat.dispose();
      }
      hoop.light.dispose();
      sceneManager.scene.remove(hoop.group);
    }
    this.hoops = [];
  }
}

export const hoops = new HoopSystem();
