let audioContext: AudioContext | null = null;
let sourceNode: AudioBufferSourceNode | null = null;
let gainNode: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let _audioBuffer: AudioBuffer | null = null;
let _startTime = 0;
let _playing = false;
let _ended = false;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function getAnalyserNode(): AnalyserNode | null {
  return analyserNode;
}

export function getAudioBuffer(): AudioBuffer | null {
  return _audioBuffer;
}

export function isPlaying(): boolean {
  return _playing;
}

export function hasEnded(): boolean {
  return _ended;
}

/** Current playback position in seconds */
export function getCurrentTime(): number {
  if (!audioContext) return 0;
  if (!_playing) {
    // Return duration if song ended naturally, 0 if never started
    return _ended ? (getDuration()) : 0;
  }
  return audioContext.currentTime - _startTime;
}

/** Duration of loaded audio in seconds */
export function getDuration(): number {
  return _audioBuffer?.duration ?? 0;
}

/**
 * Load an audio file from a File object.
 * Returns the decoded AudioBuffer.
 */
export async function loadAudioFile(file: File): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const arrayBuffer = await file.arrayBuffer();
  _audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  return _audioBuffer;
}

/**
 * Start playing the loaded audio.
 */
export function playAudio(): void {
  if (!_audioBuffer || !audioContext) return;

  // Create fresh nodes each play
  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = _audioBuffer;

  gainNode = audioContext.createGain();
  gainNode.gain.value = 1.0;

  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 2048;
  analyserNode.smoothingTimeConstant = 0.8;

  sourceNode.connect(gainNode);
  gainNode.connect(analyserNode);
  analyserNode.connect(audioContext.destination);

  _startTime = audioContext.currentTime;
  sourceNode.start(0);
  _playing = true;

  _ended = false;
  sourceNode.onended = () => {
    _playing = false;
    _ended = true;
  };
}

/**
 * Stop playing.
 */
export function stopAudio(): void {
  if (sourceNode) {
    try {
      sourceNode.stop();
    } catch {
      // already stopped
    }
    sourceNode.disconnect();
    sourceNode = null;
  }
  _playing = false;
  _ended = false;
}

/**
 * Clean up everything.
 */
export function disposeAudio(): void {
  stopAudio();
  _audioBuffer = null;
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}
