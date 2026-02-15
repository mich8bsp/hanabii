import * as THREE from 'three';

/**
 * Unified input handler for mouse, keyboard, and gamepad.
 * Exposes a normalized 2D movement vector and action flags.
 */
class InputManager {
  /** Normalized mouse position (-1 to 1) on screen */
  readonly mouseNDC = new THREE.Vector2(0, 0);

  /** Movement direction from WASD/arrows/gamepad (each axis -1 to 1) */
  readonly movement = new THREE.Vector2(0, 0);

  /** Whether the pulse boost action is pressed this frame */
  pulseBoost = false;

  /** Whether escape/pause is pressed */
  pausePressed = false;

  private keys = new Set<string>();
  private _pulseQueued = false;
  private _pauseQueued = false;

  init(): void {
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  dispose(): void {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  /** Call once per frame to update derived state */
  update(): void {
    // Keyboard movement
    let mx = 0;
    let my = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;

    // Gamepad (if connected)
    const gamepad = navigator.getGamepads?.()[0];
    if (gamepad) {
      const deadzone = 0.15;
      const lx = Math.abs(gamepad.axes[0]) > deadzone ? gamepad.axes[0] : 0;
      const ly = Math.abs(gamepad.axes[1]) > deadzone ? -gamepad.axes[1] : 0;
      mx += lx;
      my += ly;

      if (gamepad.buttons[0]?.pressed) this._pulseQueued = true;
      if (gamepad.buttons[9]?.pressed) this._pauseQueued = true;
    }

    this.movement.set(
      THREE.MathUtils.clamp(mx, -1, 1),
      THREE.MathUtils.clamp(my, -1, 1)
    );

    this.pulseBoost = this._pulseQueued;
    this._pulseQueued = false;

    this.pausePressed = this._pauseQueued;
    this._pauseQueued = false;
  }

  private onMouseMove = (e: MouseEvent): void => {
    this.mouseNDC.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    if (e.code === 'Space') this._pulseQueued = true;
    if (e.code === 'Escape') this._pauseQueued = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
}

export const input = new InputManager();
