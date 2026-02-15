import { sceneManager } from './scene/scene-manager';
import { createEnvironment, updateEnvironment } from './scene/environment';
import { cameraController } from './scene/camera-controller';
import { orb } from './entities/orb';
import { guidePath } from './entities/guide-path';
import { input } from './game/input';
import { gameClock } from './game/clock';
import { gameState, type GameState } from './game/game-state';
import { syncTracker } from './game/sync-tracker';
import { generateIdealPath } from './game/path-generator';
import { loadAudioFile, playAudio, stopAudio, getCurrentTime, getDuration, isPlaying, hasEnded } from './audio/loader';
import { analyzeAudio } from './audio/analyzer';
import { extractRealtimeFeatures } from './audio/realtime';
import { visualDirector } from './visuals/visual-director';
import { postProcessing } from './visuals/post-processing';
import type { SongMap } from './audio/structures';

// ─── DOM Elements ───────────────────────────────────────────
const app = document.getElementById('app')!;
const menuScreen = document.getElementById('menu-screen')!;
const analyzingScreen = document.getElementById('analyzing-screen')!;
const analyzingStatus = document.getElementById('analyzing-status')!;
const analyzingProgress = document.getElementById('analyzing-progress')!;
const countdownEl = document.getElementById('countdown')!;
const hud = document.getElementById('hud')!;
const syncValueEl = document.getElementById('sync-value')!;
const songProgressFill = document.getElementById('song-progress-fill')!;
const resultsScreen = document.getElementById('results-screen')!;
const finalSyncValue = document.getElementById('final-sync-value')!;
const ratingLabel = document.getElementById('rating-label')!;
const chooseSongBtn = document.getElementById('choose-song-btn')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const playAgainBtn = document.getElementById('play-again-btn')!;
const chooseAnotherBtn = document.getElementById('choose-another-btn')!;

// ─── State ──────────────────────────────────────────────────
let currentSongMap: SongMap | null = null;
let lastAudioFile: File | null = null;

// ─── Initialize ─────────────────────────────────────────────
function init(): void {
  sceneManager.init(app);
  createEnvironment();
  orb.init();
  guidePath.init();
  postProcessing.init();
  input.init();
  gameClock.start();

  // Wire up UI
  chooseSongBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', onFileSelected);
  playAgainBtn.addEventListener('click', onPlayAgain);
  chooseAnotherBtn.addEventListener('click', onChooseAnother);

  // State change handler
  gameState.onStateChange(onStateChange);

  // Start render loop
  requestAnimationFrame(loop);
}

// ─── UI State Transitions ───────────────────────────────────
function onStateChange(newState: GameState, _oldState: GameState): void {
  menuScreen.style.display = newState === 'MENU' ? 'flex' : 'none';
  analyzingScreen.style.display = newState === 'ANALYZING' ? 'flex' : 'none';
  countdownEl.style.display = 'none';
  hud.style.display = newState === 'PLAYING' ? 'block' : 'none';
  resultsScreen.style.display = newState === 'RESULTS' ? 'flex' : 'none';

  if (newState === 'PLAYING') {
    document.body.style.cursor = 'none';
  } else {
    document.body.style.cursor = 'default';
  }
}

// ─── File Selection ─────────────────────────────────────────
async function onFileSelected(): Promise<void> {
  const file = fileInput.files?.[0];
  if (!file) return;

  lastAudioFile = file;
  gameState.transition('ANALYZING');
  analyzingStatus.textContent = 'Listening to your song...';
  analyzingProgress.style.width = '0%';

  try {
    // Load and decode audio
    const audioBuffer = await loadAudioFile(file);
    analyzingProgress.style.width = '10%';

    // Analyze
    const songMap = await analyzeAudio(audioBuffer, (progress) => {
      analyzingProgress.style.width = `${10 + progress * 80}%`;
    });

    // Generate ideal path
    songMap.idealPath = generateIdealPath(songMap);
    currentSongMap = songMap;
    analyzingProgress.style.width = '100%';
    analyzingStatus.textContent = 'Ready!';

    // Countdown
    await countdown();

    // Start playing
    startPlaying();
  } catch (err) {
    console.error('Analysis failed:', err);
    analyzingStatus.textContent = 'Analysis failed. Try another file.';
    setTimeout(() => gameState.transition('MENU'), 2000);
  }
}

async function countdown(): Promise<void> {
  countdownEl.style.display = 'flex';
  analyzingScreen.style.display = 'none';

  for (let i = 3; i >= 1; i--) {
    countdownEl.textContent = String(i);
    await sleep(800);
  }
  countdownEl.textContent = '';
  countdownEl.style.display = 'none';
}

function startPlaying(): void {
  if (!currentSongMap) return;

  gameState.transition('PLAYING');
  orb.reset();
  syncTracker.reset();
  visualDirector.init(currentSongMap);
  playAudio();
}

function onPlayAgain(): void {
  if (!lastAudioFile || !currentSongMap) return;
  stopAudio();
  orb.reset();

  // Reuse existing analysis
  (async () => {
    await countdown();
    startPlaying();
  })();

  // Show countdown
  resultsScreen.style.display = 'none';
  countdownEl.style.display = 'flex';
}

function onChooseAnother(): void {
  stopAudio();
  orb.reset();
  currentSongMap = null;
  lastAudioFile = null;
  fileInput.value = '';
  gameState.transition('MENU');
}

// ─── Game Loop ──────────────────────────────────────────────
function loop(timestamp: number): void {
  requestAnimationFrame(loop);

  gameClock.tick(timestamp);
  const dt = gameClock.deltaTime;
  const elapsed = gameClock.elapsedTime;

  input.update();

  // Always update environment (starfield rotation)
  updateEnvironment(elapsed, dt);

  const state = gameState.state;

  if (state === 'MENU' || state === 'ANALYZING') {
    // Gentle idle: camera slowly orbits
    sceneManager.camera.position.x = Math.sin(elapsed * 0.1) * 3;
    sceneManager.camera.position.y = 2 + Math.sin(elapsed * 0.15) * 0.5;
    sceneManager.camera.lookAt(0, 0, 0);
    orb.mesh.position.set(0, Math.sin(elapsed * 0.8) * 0.3, 0);
    orb.glowLight.intensity = 1.5 + Math.sin(elapsed * 2) * 0.5;
  }

  if (state === 'PLAYING' && currentSongMap) {
    const songTime = getCurrentTime();
    const duration = getDuration();

    // Check if song ended
    if (hasEnded()) {
      endSong();
      postProcessing.render();
      return;
    }

    // Update orb movement
    orb.update(dt, true);

    // Update sync
    syncTracker.update(orb.position, currentSongMap.idealPath, songTime, dt);
    const sync = syncTracker.displaySync;

    // Update camera
    cameraController.update(orb.position, dt);

    // Get real-time audio features
    const realtime = extractRealtimeFeatures();

    // Camera energy adjustment
    cameraController.setEnergyLevel(realtime.rms);
    if (realtime.spectralFlux > 0.5) {
      cameraController.shake(realtime.spectralFlux * 0.15);
    }

    // Update guide path
    guidePath.update(currentSongMap.idealPath, songTime, sync, orb.position, elapsed);

    // Update all visuals
    visualDirector.update(songTime, dt, elapsed, realtime, sync);

    // Update post-processing distortion
    postProcessing.updateSync(sync, elapsed);

    // Update HUD
    syncValueEl.textContent = String(Math.round(sync * 100));
    songProgressFill.style.width = `${(songTime / duration) * 100}%`;
  }

  postProcessing.render();
}

function endSong(): void {
  const score = syncTracker.getFinalScore();
  const rating = syncTracker.getRating(score);

  finalSyncValue.textContent = `${score}%`;
  ratingLabel.textContent = rating;

  gameState.transition('RESULTS');
  visualDirector.dispose();
  cameraController.reset();
  postProcessing.reset();
}

// ─── Helpers ────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Start ──────────────────────────────────────────────────
init();
