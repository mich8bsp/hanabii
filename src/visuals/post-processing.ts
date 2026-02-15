import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { sceneManager } from '../scene/scene-manager';
import { lerp } from '../utils/math';

/**
 * Custom chromatic aberration + vignette + grain shader.
 * Intensity driven by sync level (low sync = more distortion).
 */
const DistortionShader = {
  uniforms: {
    tDiffuse: { value: null },
    uChromaticAberration: { value: 0.0 },
    uVignette: { value: 0.3 },
    uGrain: { value: 0.0 },
    uTime: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uChromaticAberration;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uTime;
    varying vec2 vUv;

    // Simple noise function
    float random(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center);

      // Chromatic aberration: offset RGB channels
      float ca = uChromaticAberration * dist;
      vec2 rOffset = center * ca;
      vec2 bOffset = -center * ca;

      float r = texture2D(tDiffuse, vUv + rOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + bOffset).b;
      float a = texture2D(tDiffuse, vUv).a;

      vec3 color = vec3(r, g, b);

      // Vignette
      float vig = 1.0 - smoothstep(0.3, 0.9, dist * uVignette * 2.0);
      color *= vig;

      // Film grain
      if (uGrain > 0.001) {
        float grain = random(vUv + fract(uTime * 0.1)) * 2.0 - 1.0;
        color += grain * uGrain;
      }

      gl_FragColor = vec4(color, a);
    }
  `,
};

class PostProcessing {
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private distortionPass!: ShaderPass;
  private enabled = true;

  /** Target distortion values (driven by sync) */
  private targetCA = 0;
  private targetGrain = 0;
  private targetVignette = 0.3;

  init(): void {
    const { renderer, scene, camera } = sceneManager;
    const size = new THREE.Vector2();
    renderer.getSize(size);

    this.composer = new EffectComposer(renderer);

    // Render pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Bloom
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      0.8,  // strength
      0.4,  // radius
      0.85  // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Distortion (chromatic aberration + vignette + grain)
    this.distortionPass = new ShaderPass(DistortionShader);
    this.composer.addPass(this.distortionPass);

    // Handle resize
    window.addEventListener('resize', this.onResize);
  }

  /**
   * Update distortion based on sync level.
   * sync: 0-1 (1 = perfect sync, 0 = no sync)
   */
  updateSync(sync: number, elapsed: number): void {
    // Guard against NaN
    if (!isFinite(sync)) sync = 1.0;

    // Low sync = more distortion
    const desync = 1 - sync;

    this.targetCA = desync * 0.05;           // max 5% chromatic aberration
    this.targetGrain = desync * 0.08;         // max 8% grain
    this.targetVignette = 0.3 + desync * 0.7; // vignette darkens edges

    // Bloom reduces at low sync
    this.bloomPass.strength = lerp(this.bloomPass.strength, 0.3 + sync * 0.7, 0.05);

    // Smooth transitions
    const uniforms = this.distortionPass.uniforms;
    uniforms.uChromaticAberration.value = lerp(uniforms.uChromaticAberration.value, this.targetCA, 0.05);
    uniforms.uGrain.value = lerp(uniforms.uGrain.value, this.targetGrain, 0.05);
    uniforms.uVignette.value = lerp(uniforms.uVignette.value, this.targetVignette, 0.05);
    uniforms.uTime.value = elapsed;
  }

  /** Set bloom intensity (for beat pulses) */
  pulseBloom(intensity: number): void {
    this.bloomPass.strength = Math.min(2, this.bloomPass.strength + intensity);
  }

  render(): void {
    if (this.enabled) {
      this.composer.render();
    } else {
      sceneManager.render();
    }
  }

  /** Reset to clean state */
  reset(): void {
    this.bloomPass.strength = 0.8;
    const uniforms = this.distortionPass.uniforms;
    uniforms.uChromaticAberration.value = 0;
    uniforms.uGrain.value = 0;
    uniforms.uVignette.value = 0.3;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
  }

  private onResize = (): void => {
    const { renderer } = sceneManager;
    const size = new THREE.Vector2();
    renderer.getSize(size);
    this.composer.setSize(size.x, size.y);
  };
}

export const postProcessing = new PostProcessing();
