import type {
  SongMap,
  BeatEvent,
  OnsetEvent,
  Section,
  PitchPoint,
  EnergyPoint,
} from './structures';

/**
 * Performs offline audio analysis to produce a SongMap.
 *
 * We use a custom analysis approach using Web Audio API's OfflineAudioContext
 * for feature extraction, since Essentia.js WASM loading can be unreliable.
 * This provides BPM detection, beat grid, energy curve, spectral analysis,
 * onset detection, and section segmentation.
 */

export async function analyzeAudio(
  audioBuffer: AudioBuffer,
  onProgress?: (progress: number) => void
): Promise<SongMap> {
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;

  // Get mono channel data
  const channelData = getMono(audioBuffer);

  onProgress?.(0.05);

  // --- BPM Detection ---
  const bpm = detectBPM(channelData, sampleRate);
  onProgress?.(0.15);

  // --- Beat Grid ---
  const beats = generateBeatGrid(channelData, sampleRate, bpm, duration);
  onProgress?.(0.3);

  // --- Energy Curve (sampled at ~30fps) ---
  const energyCurve = computeEnergyCurve(channelData, sampleRate);
  onProgress?.(0.45);

  // --- Onset Detection ---
  const onsets = detectOnsets(channelData, sampleRate);
  onProgress?.(0.55);

  // --- Pitch Contour (simplified) ---
  const pitchContour = extractPitchContour(channelData, sampleRate);
  onProgress?.(0.7);

  // --- Section Segmentation ---
  const sections = segmentSections(energyCurve, duration);
  onProgress?.(0.85);

  // --- Key Detection (simplified) ---
  const key = detectKey(channelData, sampleRate);

  // --- Danceability (heuristic) ---
  const avgEnergy = energyCurve.reduce((sum, p) => sum + p.energy, 0) / energyCurve.length;
  const beatRegularity = computeBeatRegularity(beats);
  const danceability = Math.min(1, (avgEnergy * 0.5 + beatRegularity * 0.5));

  onProgress?.(1.0);

  return {
    bpm,
    key,
    danceability,
    duration,
    beats,
    onsets,
    sections,
    pitchContour,
    energyCurve,
    idealPath: [], // generated later by path-generator
  };
}

/** Mix down to mono */
function getMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0);
  }
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const mono = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    mono[i] = (left[i] + right[i]) * 0.5;
  }
  return mono;
}

/** BPM detection using autocorrelation on the energy envelope */
function detectBPM(samples: Float32Array, sampleRate: number): number {
  // Compute energy envelope with hop
  const hopSize = Math.floor(sampleRate * 0.01); // 10ms hop
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms window
  const envelopeLength = Math.floor(samples.length / hopSize);
  const envelope = new Float32Array(envelopeLength);

  for (let i = 0; i < envelopeLength; i++) {
    const start = i * hopSize;
    let sum = 0;
    const end = Math.min(start + windowSize, samples.length);
    for (let j = start; j < end; j++) {
      sum += samples[j] * samples[j];
    }
    envelope[i] = Math.sqrt(sum / (end - start));
  }

  // Differentiate (onset strength)
  const diff = new Float32Array(envelopeLength - 1);
  for (let i = 1; i < envelopeLength; i++) {
    diff[i - 1] = Math.max(0, envelope[i] - envelope[i - 1]);
  }

  // Autocorrelation on diff for BPM range 60-200
  const envelopeSR = sampleRate / hopSize; // samples per second in envelope domain
  const minLag = Math.floor(envelopeSR * 60 / 200); // lag for 200 BPM
  const maxLag = Math.floor(envelopeSR * 60 / 60); // lag for 60 BPM
  const acLength = Math.min(maxLag + 1, diff.length);

  let bestLag = minLag;
  let bestCorr = -Infinity;

  for (let lag = minLag; lag <= Math.min(maxLag, acLength - 1); lag++) {
    let corr = 0;
    const n = Math.min(diff.length - lag, 2000); // limit computation
    for (let i = 0; i < n; i++) {
      corr += diff[i] * diff[i + lag];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  const detectedBPM = (envelopeSR * 60) / bestLag;

  // Normalize to common range 80-180
  let bpm = detectedBPM;
  while (bpm < 80) bpm *= 2;
  while (bpm > 180) bpm /= 2;

  return Math.round(bpm);
}

/** Generate beat grid from BPM, refined with onset detection */
function generateBeatGrid(
  samples: Float32Array,
  sampleRate: number,
  bpm: number,
  duration: number
): BeatEvent[] {
  const beatInterval = 60 / bpm;
  const beats: BeatEvent[] = [];

  // Find first strong onset to align grid
  const hopSize = Math.floor(sampleRate * 0.01);
  let firstOnsetTime = 0;
  let maxEnergy = 0;

  // Search first 2 seconds for a strong onset
  const searchEnd = Math.min(Math.floor(2 * sampleRate / hopSize), Math.floor(samples.length / hopSize));
  for (let i = 1; i < searchEnd; i++) {
    const start = i * hopSize;
    let energy = 0;
    for (let j = start; j < Math.min(start + hopSize, samples.length); j++) {
      energy += samples[j] * samples[j];
    }
    if (energy > maxEnergy) {
      maxEnergy = energy;
      firstOnsetTime = (i * hopSize) / sampleRate;
    }
  }

  // Generate grid from first onset
  let time = firstOnsetTime;
  let beatIndex = 0;
  while (time < duration) {
    const isDownbeat = beatIndex % 4 === 0;

    // Compute local energy for strength
    const sampleIdx = Math.floor(time * sampleRate);
    const windowSamples = 1024;
    let energy = 0;
    for (let j = sampleIdx; j < Math.min(sampleIdx + windowSamples, samples.length); j++) {
      energy += samples[j] * samples[j];
    }
    const strength = Math.min(1, Math.sqrt(energy / windowSamples) * 5);

    beats.push({
      time,
      strength: isDownbeat ? Math.min(1, strength + 0.3) : strength,
      isDownbeat,
    });

    time += beatInterval;
    beatIndex++;
  }

  return beats;
}

/** Compute energy curve sampled at ~30fps */
function computeEnergyCurve(samples: Float32Array, sampleRate: number): EnergyPoint[] {
  const fps = 30;
  const hopSize = Math.floor(sampleRate / fps);
  const windowSize = hopSize * 2; // overlapping window
  const curve: EnergyPoint[] = [];

  let maxRMS = 0;

  // First pass: compute raw RMS
  const rawRMS: number[] = [];
  for (let i = 0; i * hopSize < samples.length; i++) {
    const start = i * hopSize;
    const end = Math.min(start + windowSize, samples.length);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += samples[j] * samples[j];
    }
    const rms = Math.sqrt(sum / (end - start));
    rawRMS.push(rms);
    if (rms > maxRMS) maxRMS = rms;
  }

  // Normalize
  for (let i = 0; i < rawRMS.length; i++) {
    curve.push({
      time: (i * hopSize) / sampleRate,
      energy: maxRMS > 0 ? rawRMS[i] / maxRMS : 0,
    });
  }

  return curve;
}

/** Simple onset detection using spectral flux approximation */
function detectOnsets(samples: Float32Array, sampleRate: number): OnsetEvent[] {
  const hopSize = Math.floor(sampleRate * 0.01); // 10ms
  const windowSize = 2048;
  const onsets: OnsetEvent[] = [];

  let prevEnergy = 0;
  const threshold = 0.02;

  for (let i = 0; i * hopSize + windowSize < samples.length; i++) {
    const start = i * hopSize;

    // Compute energy in low, mid, high bands (simplified)
    let lowEnergy = 0, midEnergy = 0, highEnergy = 0;
    for (let j = 0; j < windowSize; j++) {
      const s = samples[start + j];
      const val = s * s;
      // Rough frequency band split by position in window
      if (j < windowSize / 3) lowEnergy += val;
      else if (j < (windowSize * 2) / 3) midEnergy += val;
      else highEnergy += val;
    }

    const totalEnergy = lowEnergy + midEnergy + highEnergy;
    const flux = totalEnergy - prevEnergy;
    prevEnergy = totalEnergy;

    if (flux > threshold) {
      // Determine dominant band
      let band: 'low' | 'mid' | 'high' = 'mid';
      if (lowEnergy > midEnergy && lowEnergy > highEnergy) band = 'low';
      else if (highEnergy > midEnergy && highEnergy > lowEnergy) band = 'high';

      const time = (i * hopSize) / sampleRate;
      const strength = Math.min(1, flux * 10);

      // Avoid duplicates within 50ms
      if (onsets.length === 0 || time - onsets[onsets.length - 1].time > 0.05) {
        onsets.push({ time, strength, frequencyBand: band });
      }
    }
  }

  return onsets;
}

/** Simplified pitch contour using zero-crossing rate and autocorrelation */
function extractPitchContour(samples: Float32Array, sampleRate: number): PitchPoint[] {
  const hopSize = Math.floor(sampleRate * 0.02); // 20ms hop
  const windowSize = Math.floor(sampleRate * 0.04); // 40ms window
  const contour: PitchPoint[] = [];

  for (let i = 0; i * hopSize + windowSize < samples.length; i++) {
    const start = i * hopSize;
    const time = start / sampleRate;

    // Simple autocorrelation pitch detection
    const minPeriod = Math.floor(sampleRate / 1000); // 1000 Hz max
    const maxPeriod = Math.floor(sampleRate / 80); // 80 Hz min

    let bestPeriod = minPeriod;
    let bestCorr = -1;
    let energy = 0;

    for (let j = 0; j < windowSize; j++) {
      energy += samples[start + j] * samples[start + j];
    }

    if (energy / windowSize < 0.0001) {
      // Too quiet, skip
      if (i % 5 === 0) {
        contour.push({ time, frequency: 0, confidence: 0 });
      }
      continue;
    }

    for (let lag = minPeriod; lag < Math.min(maxPeriod, windowSize / 2); lag++) {
      let corr = 0;
      let norm1 = 0;
      let norm2 = 0;
      const n = Math.min(windowSize - lag, 512);
      for (let j = 0; j < n; j++) {
        corr += samples[start + j] * samples[start + j + lag];
        norm1 += samples[start + j] * samples[start + j];
        norm2 += samples[start + j + lag] * samples[start + j + lag];
      }
      const normCorr = norm1 > 0 && norm2 > 0 ? corr / Math.sqrt(norm1 * norm2) : 0;
      if (normCorr > bestCorr) {
        bestCorr = normCorr;
        bestPeriod = lag;
      }
    }

    const frequency = sampleRate / bestPeriod;
    const confidence = Math.max(0, bestCorr);

    // Downsample output (every 5th frame)
    if (i % 5 === 0) {
      contour.push({ time, frequency, confidence });
    }
  }

  return contour;
}

/** Segment song into sections based on energy curve changes */
function segmentSections(energyCurve: EnergyPoint[], duration: number): Section[] {
  if (energyCurve.length < 10) {
    return [{ startTime: 0, endTime: duration, label: 'intro', energy: 0.5 }];
  }

  const sections: Section[] = [];
  const windowSize = 90; // ~3 seconds at 30fps

  // Compute smoothed energy
  const smoothed: number[] = [];
  for (let i = 0; i < energyCurve.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize / 2); j < Math.min(energyCurve.length, i + windowSize / 2); j++) {
      sum += energyCurve[j].energy;
      count++;
    }
    smoothed.push(sum / count);
  }

  // Detect significant changes in smoothed energy
  const changeThreshold = 0.08;
  const minSectionFrames = 150; // ~5 seconds minimum section

  let sectionStart = 0;
  let lastChangeFrame = 0;

  for (let i = 1; i < smoothed.length; i++) {
    const change = Math.abs(smoothed[i] - smoothed[i - 1]);
    if (change > changeThreshold && (i - lastChangeFrame) > minSectionFrames) {
      const startTime = energyCurve[sectionStart]?.time ?? 0;
      const endTime = energyCurve[i]?.time ?? duration;
      const avgEnergy =
        smoothed.slice(sectionStart, i).reduce((a, b) => a + b, 0) / (i - sectionStart);

      sections.push({
        startTime,
        endTime,
        label: labelFromEnergy(avgEnergy, sections.length),
        energy: avgEnergy,
      });
      sectionStart = i;
      lastChangeFrame = i;
    }
  }

  // Final section
  const startTime = energyCurve[sectionStart]?.time ?? 0;
  const avgEnergy =
    smoothed.slice(sectionStart).reduce((a, b) => a + b, 0) /
    (smoothed.length - sectionStart || 1);
  sections.push({
    startTime,
    endTime: duration,
    label: sections.length === 0 ? 'intro' : 'outro',
    energy: avgEnergy,
  });

  return sections;
}

function labelFromEnergy(energy: number, index: number): string {
  if (index === 0) return 'intro';
  if (energy > 0.7) return 'chorus';
  if (energy > 0.4) return 'verse';
  return 'bridge';
}

/** Simplified key detection using chroma features */
function detectKey(
  samples: Float32Array,
  sampleRate: number
): { key: string; scale: 'major' | 'minor' } {
  // Very simplified: compute energy in pitch classes using DFT at specific frequencies
  const noteFreqs = [
    261.63, 277.18, 293.66, 311.13, 329.63, 349.23,
    369.99, 392.0, 415.3, 440.0, 466.16, 493.88,
  ];
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const chroma = new Float32Array(12);
  const windowSize = Math.min(samples.length, sampleRate * 10); // analyze first 10 seconds

  for (let n = 0; n < 12; n++) {
    // Goertzel-like: compute energy at this note's frequency (and octaves)
    for (let octave = 0; octave < 3; octave++) {
      const freq = noteFreqs[n] * Math.pow(2, octave - 1);
      const k = Math.round((freq * windowSize) / sampleRate);
      let real = 0, imag = 0;
      for (let i = 0; i < windowSize; i += 4) {
        // Subsample for speed
        const angle = (2 * Math.PI * k * i) / windowSize;
        real += samples[i] * Math.cos(angle);
        imag += samples[i] * Math.sin(angle);
      }
      chroma[n] += Math.sqrt(real * real + imag * imag);
    }
  }

  // Major and minor key profiles (Krumhansl)
  const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  let bestKey = 0;
  let bestCorr = -Infinity;
  let bestScale: 'major' | 'minor' = 'major';

  for (let shift = 0; shift < 12; shift++) {
    let majorCorr = 0, minorCorr = 0;
    for (let i = 0; i < 12; i++) {
      const ci = (i + shift) % 12;
      majorCorr += chroma[ci] * majorProfile[i];
      minorCorr += chroma[ci] * minorProfile[i];
    }
    if (majorCorr > bestCorr) {
      bestCorr = majorCorr;
      bestKey = shift;
      bestScale = 'major';
    }
    if (minorCorr > bestCorr) {
      bestCorr = minorCorr;
      bestKey = shift;
      bestScale = 'minor';
    }
  }

  return { key: noteNames[bestKey], scale: bestScale };
}

/** How regular the beat timing is (0-1) */
function computeBeatRegularity(beats: BeatEvent[]): number {
  if (beats.length < 3) return 0.5;
  const intervals: number[] = [];
  for (let i = 1; i < Math.min(beats.length, 100); i++) {
    intervals.push(beats[i].time - beats[i - 1].time);
  }
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation
  return Math.max(0, 1 - cv * 5); // lower CV = more regular = higher danceability
}
