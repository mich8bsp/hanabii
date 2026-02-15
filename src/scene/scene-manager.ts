import * as THREE from 'three';

class SceneManager {
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;

  private _width = window.innerWidth;
  private _height = window.innerHeight;

  get width(): number {
    return this._width;
  }
  get height(): number {
    return this._height;
  }

  init(container: HTMLElement): void {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000011, 0.0015);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, this._width / this._height, 0.1, 2000);
    this.camera.position.set(0, 2, 10);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(this._width, this._height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.insertBefore(this.renderer.domElement, container.firstChild);

    // Ambient light
    const ambient = new THREE.AmbientLight(0x111122, 0.5);
    this.scene.add(ambient);

    // Resize handler
    window.addEventListener('resize', this.onResize);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }

  private onResize = (): void => {
    this._width = window.innerWidth;
    this._height = window.innerHeight;
    this.camera.aspect = this._width / this._height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this._width, this._height);
  };
}

export const sceneManager = new SceneManager();
