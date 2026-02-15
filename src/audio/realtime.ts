import type { RealtimeFeatures } from './structures';
import { getAnalyserNode } from './loader';

const BUFFER_SIZE = 2048;
let timeDomainData: Float32Array | null = null;
let freqData: Float32Array | null = null;
let prevSpectrum: Float32Array | null = null;

/**
 * Extract real-time audio features from the analyser node.
 * Call once per frame during PLAYING state.
 */
export function extractRealtimeFeatures(): RealtimeFeatures {
  const analyser = getAnalyserNode();
  if (!analyser) {
    return { rms: 0, spectralCentroid: 0, spectralFlux: 0, zcr: 0, mfcc: [] };
  }

  if (!timeDomainData) {
    timeDomainData = new Float32Array(BUFFER_SIZE);
    freqData = new Float32Array(analyser.frequencyBinCount);
    prevSpectrum = new Float32Array(analyser.frequencyBinCount);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (analyser as any).getFloatTimeDomainData(timeDomainData);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (analyser as any).getFloatFrequencyData(freqData);

  // RMS
  let sumSquares = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    sumSquares += timeDomainData[i] * timeDomainData[i];
  }
  const rms = Math.sqrt(sumSquares / timeDomainData.length);

  // Zero-crossing rate
  let crossings = 0;
  for (let i = 1; i < timeDomainData.length; i++) {
    if (
      (timeDomainData[i] >= 0 && timeDomainData[i - 1] < 0) ||
      (timeDomainData[i] < 0 && timeDomainData[i - 1] >= 0)
    ) {
      crossings++;
    }
  }
  const zcr = crossings / (timeDomainData.length - 1);

  // Spectral centroid (from frequency data, which is in dB)
  const spectrum = freqData!;
  let weightedSum = 0;
  let totalMag = 0;
  for (let i = 0; i < spectrum.length; i++) {
    // Convert dB to linear magnitude
    const mag = Math.pow(10, spectrum[i] / 20);
    weightedSum += i * mag;
    totalMag += mag;
  }
  const spectralCentroid = totalMag > 0 ? weightedSum / totalMag / spectrum.length : 0;

  // Spectral flux
  let flux = 0;
  for (let i = 0; i < spectrum.length; i++) {
    const mag = Math.pow(10, spectrum[i] / 20);
    const prevMag = Math.pow(10, prevSpectrum![i] / 20);
    const diff = mag - prevMag;
    if (diff > 0) flux += diff;
  }

  // Copy current spectrum to previous
  prevSpectrum!.set(spectrum);

  // Simplified MFCC-like: just energy in a few frequency bands
  const numBands = 6;
  const bandSize = Math.floor(spectrum.length / numBands);
  const mfcc: number[] = [];
  for (let b = 0; b < numBands; b++) {
    let bandEnergy = 0;
    for (let i = b * bandSize; i < (b + 1) * bandSize && i < spectrum.length; i++) {
      const mag = Math.pow(10, spectrum[i] / 20);
      bandEnergy += mag;
    }
    mfcc.push(bandEnergy / bandSize);
  }

  return { rms, spectralCentroid, spectralFlux: flux, zcr, mfcc };
}
