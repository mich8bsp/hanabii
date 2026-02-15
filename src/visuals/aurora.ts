import * as THREE from 'three';
import { sceneManager } from '../scene/scene-manager';
import { lerp, mapRange, clamp } from '../utils/math';

const SEGMENTS_X = 60;
const SEGMENTS_Y = 8;
const RIBBON_WIDTH = 40;
const RIBBON_HEIGHT = 6;
const RIBBON_Y_OFFSET = 10; // above the path

class AuroraRibbon {
  private mesh!: THREE.Mesh;
  private geometry!: THREE.PlaneGeometry;
  private material!: THREE.ShaderMaterial;
  private positionAttr!: THREE.BufferAttribute;
  private basePositions!: Float32Array;

  init(): void {
    this.geometry = new THREE.PlaneGeometry(
      RIBBON_WIDTH,
      RIBBON_HEIGHT,
      SEGMENTS_X,
      SEGMENTS_Y
    );
    this.basePositions = new Float32Array(this.geometry.getAttribute('position').array);
    this.positionAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.3 },
        uColorLow: { value: new THREE.Color(0x00aa66) },
        uColorHigh: { value: new THREE.Color(0xaa44cc) },
        uPitch: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vElevation;
        void main() {
          vUv = uv;
          vElevation = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColorLow;
        uniform vec3 uColorHigh;
        uniform float uPitch;
        varying vec2 vUv;
        varying float vElevation;

        void main() {
          // Gradient from low to high color based on pitch and UV
          float mixFactor = smoothstep(0.0, 1.0, vUv.y * 0.7 + uPitch * 0.3);
          vec3 color = mix(uColorLow, uColorHigh, mixFactor);

          // Shimmer
          float shimmer = sin(vUv.x * 20.0 + uTime * 2.0) * 0.5 + 0.5;
          shimmer *= sin(vUv.y * 10.0 + uTime * 1.5) * 0.5 + 0.5;

          // Edge fade
          float edgeFade = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
          float vertFade = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.6, vUv.y);

          float alpha = uOpacity * edgeFade * vertFade * (0.5 + shimmer * 0.5);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI * 0.1; // slight tilt
    this.mesh.position.y = RIBBON_Y_OFFSET;
    this.mesh.visible = false;
    sceneManager.scene.add(this.mesh);
  }

  /**
   * Update aurora position, shape, and color.
   * @param anchorZ - Z position of the orb
   * @param pitch - normalized 0-1 pitch value
   * @param energy - 0-1 energy
   * @param confidence - 0-1, melody confidence (low = hide aurora)
   * @param elapsed - total elapsed time
   * @param sync - 0-1 sync level
   */
  update(
    anchorZ: number,
    pitch: number,
    energy: number,
    confidence: number,
    elapsed: number,
    sync: number
  ): void {
    this.mesh.visible = true;
    this.mesh.position.z = anchorZ - 10;

    // Animate vertices with noise-like undulation
    const positions = this.positionAttr.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const baseX = this.basePositions[i];
      const baseY = this.basePositions[i + 1];
      const baseZ = this.basePositions[i + 2];

      const wave1 = Math.sin(baseX * 0.3 + elapsed * 0.8) * 1.5;
      const wave2 = Math.cos(baseX * 0.5 + elapsed * 1.2) * 0.8;
      const wave3 = Math.sin(baseY * 1.0 + elapsed * 0.5) * 0.5;

      positions[i] = baseX;
      positions[i + 1] = baseY + wave1 + wave2 + pitch * 3;
      positions[i + 2] = baseZ + wave3;
    }
    this.positionAttr.needsUpdate = true;

    // Update uniforms
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uPitch.value = pitch;

    // Opacity: based on confidence and energy
    const targetOpacity = clamp(confidence * 0.4 + energy * 0.2, 0, 0.5) * sync;
    this.material.uniforms.uOpacity.value = lerp(
      this.material.uniforms.uOpacity.value,
      targetOpacity,
      0.05
    );

    // Width pulse with energy
    const scaleX = 1 + energy * 0.3;
    this.mesh.scale.x = lerp(this.mesh.scale.x, scaleX, 0.05);
  }

  setColors(low: THREE.Color, high: THREE.Color): void {
    this.material.uniforms.uColorLow.value.copy(low);
    this.material.uniforms.uColorHigh.value.copy(high);
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    sceneManager.scene.remove(this.mesh);
  }
}

export const aurora = new AuroraRibbon();
