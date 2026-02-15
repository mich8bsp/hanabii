/**
 * High-precision game clock synced to the audio context.
 * Tracks delta time and elapsed time for the game loop.
 */
export class GameClock {
  private _lastTime = 0;
  private _deltaTime = 0;
  private _elapsedTime = 0;
  private _running = false;

  /** Time since last frame in seconds */
  get deltaTime(): number {
    return this._deltaTime;
  }

  /** Total elapsed time in seconds since start */
  get elapsedTime(): number {
    return this._elapsedTime;
  }

  get running(): boolean {
    return this._running;
  }

  start(): void {
    this._lastTime = performance.now() / 1000;
    this._running = true;
    this._elapsedTime = 0;
  }

  stop(): void {
    this._running = false;
  }

  /** Call once per frame with the current timestamp from requestAnimationFrame */
  tick(timestampMs?: number): void {
    const now = timestampMs !== undefined ? timestampMs / 1000 : performance.now() / 1000;
    this._deltaTime = Math.min(now - this._lastTime, 0.1); // cap at 100ms to avoid spiral
    if (this._running) {
      this._elapsedTime += this._deltaTime;
    }
    this._lastTime = now;
  }
}

export const gameClock = new GameClock();
