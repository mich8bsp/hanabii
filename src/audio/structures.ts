import * as THREE from 'three';

export interface BeatEvent {
  time: number;
  strength: number;
  isDownbeat: boolean;
}

export interface OnsetEvent {
  time: number;
  strength: number;
  frequencyBand: 'low' | 'mid' | 'high';
}

export interface Section {
  startTime: number;
  endTime: number;
  label: string;
  energy: number;
}

export interface PitchPoint {
  time: number;
  frequency: number;
  confidence: number;
}

export interface EnergyPoint {
  time: number;
  energy: number;
}

export interface PathPoint {
  time: number;
  position: THREE.Vector3;
}

export interface SongMap {
  bpm: number;
  key: { key: string; scale: 'major' | 'minor' };
  danceability: number;
  duration: number;

  beats: BeatEvent[];
  onsets: OnsetEvent[];
  sections: Section[];
  pitchContour: PitchPoint[];
  energyCurve: EnergyPoint[];

  idealPath: PathPoint[];
}

export interface RealtimeFeatures {
  rms: number;
  spectralCentroid: number;
  spectralFlux: number;
  zcr: number;
  mfcc: number[];
}
