export type GameState = 'MENU' | 'ANALYZING' | 'PLAYING' | 'RESULTS';

type StateListener = (newState: GameState, oldState: GameState) => void;

class GameStateMachine {
  private _state: GameState = 'MENU';
  private listeners: StateListener[] = [];

  get state(): GameState {
    return this._state;
  }

  transition(newState: GameState): void {
    if (newState === this._state) return;
    const oldState = this._state;
    this._state = newState;
    for (const listener of this.listeners) {
      listener(newState, oldState);
    }
  }

  onStateChange(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }
}

export const gameState = new GameStateMachine();
