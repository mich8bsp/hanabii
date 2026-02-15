import * as THREE from 'three';
import type { SongMap, Section } from '../audio/structures';
import { lerp } from '../utils/math';

/** Palette: 4 colors used throughout the visual systems */
export interface Palette {
  primary: THREE.Color;
  secondary: THREE.Color;
  accent: THREE.Color;
  background: THREE.Color;
}

// Pre-defined palettes for major/minor and section types
const MAJOR_PALETTES: Record<string, Palette> = {
  intro: {
    primary: new THREE.Color(0xffe4b5),    // warm white
    secondary: new THREE.Color(0xffa07a),   // light salmon
    accent: new THREE.Color(0xffd700),      // gold
    background: new THREE.Color(0x0a0510),
  },
  verse: {
    primary: new THREE.Color(0xffcc88),     // warm amber
    secondary: new THREE.Color(0xff8866),   // coral
    accent: new THREE.Color(0xffaa00),      // orange gold
    background: new THREE.Color(0x080412),
  },
  chorus: {
    primary: new THREE.Color(0xff6644),     // vivid coral
    secondary: new THREE.Color(0xffdd44),   // bright gold
    accent: new THREE.Color(0xff2266),      // hot pink
    background: new THREE.Color(0x100818),
  },
  bridge: {
    primary: new THREE.Color(0xcc88ff),     // soft purple
    secondary: new THREE.Color(0xff88aa),   // pink
    accent: new THREE.Color(0xffaa44),      // orange
    background: new THREE.Color(0x0c0618),
  },
  outro: {
    primary: new THREE.Color(0xffd4a0),     // fading gold
    secondary: new THREE.Color(0xccaa88),   // muted warm
    accent: new THREE.Color(0xeebb66),      // pale gold
    background: new THREE.Color(0x060310),
  },
};

const MINOR_PALETTES: Record<string, Palette> = {
  intro: {
    primary: new THREE.Color(0x88aacc),     // cool silver blue
    secondary: new THREE.Color(0x6688aa),   // steel blue
    accent: new THREE.Color(0xaaccee),      // ice blue
    background: new THREE.Color(0x040810),
  },
  verse: {
    primary: new THREE.Color(0x44aaaa),     // teal
    secondary: new THREE.Color(0x3366aa),   // ocean blue
    accent: new THREE.Color(0x66ddcc),      // seafoam
    background: new THREE.Color(0x040a14),
  },
  chorus: {
    primary: new THREE.Color(0x6644cc),     // indigo
    secondary: new THREE.Color(0xaa44dd),   // purple
    accent: new THREE.Color(0xee66ff),      // magenta
    background: new THREE.Color(0x0a0420),
  },
  bridge: {
    primary: new THREE.Color(0x8866bb),     // soft violet
    secondary: new THREE.Color(0x446688),   // slate
    accent: new THREE.Color(0xbb88dd),      // lavender
    background: new THREE.Color(0x080616),
  },
  outro: {
    primary: new THREE.Color(0x667788),     // muted silver
    secondary: new THREE.Color(0x445566),   // dark slate
    accent: new THREE.Color(0x8899aa),      // grey blue
    background: new THREE.Color(0x030508),
  },
};

class ColorPaletteManager {
  private currentPalette: Palette = { ...MAJOR_PALETTES.intro };
  private targetPalette: Palette = { ...MAJOR_PALETTES.intro };
  private scale: 'major' | 'minor' = 'major';

  /** The active interpolated palette */
  get palette(): Palette {
    return this.currentPalette;
  }

  /** Initialize with song key */
  init(songMap: SongMap): void {
    this.scale = songMap.key.scale;
    const palettes = this.scale === 'major' ? MAJOR_PALETTES : MINOR_PALETTES;
    const initial = palettes.intro;
    this.currentPalette = clonePalette(initial);
    this.targetPalette = clonePalette(initial);
  }

  /** Call when a new section starts */
  setSection(section: Section): void {
    const palettes = this.scale === 'major' ? MAJOR_PALETTES : MINOR_PALETTES;
    const label = section.label as keyof typeof MAJOR_PALETTES;
    const target = palettes[label] || palettes.verse;
    this.targetPalette = clonePalette(target);
  }

  /** Smoothly interpolate toward target palette. Call each frame. */
  update(dt: number, energy: number): void {
    const speed = 1.5 * dt;
    lerpColor(this.currentPalette.primary, this.targetPalette.primary, speed);
    lerpColor(this.currentPalette.secondary, this.targetPalette.secondary, speed);
    lerpColor(this.currentPalette.accent, this.targetPalette.accent, speed);
    lerpColor(this.currentPalette.background, this.targetPalette.background, speed);

    // Energy modulates saturation (subtle)
    // High energy = more vivid, low = more pastel
    // Applied as a slight shift toward white at low energy
    // (done at the consumer level instead for simplicity)
  }

  /** Desaturate palette based on sync (lower sync = less saturated) */
  getDesaturated(sync: number): Palette {
    const grey = new THREE.Color(0.3, 0.3, 0.3);
    const factor = 0.3 + sync * 0.7; // at sync=0, 30% of original color

    return {
      primary: new THREE.Color().copy(this.currentPalette.primary).lerp(grey, 1 - factor),
      secondary: new THREE.Color().copy(this.currentPalette.secondary).lerp(grey, 1 - factor),
      accent: new THREE.Color().copy(this.currentPalette.accent).lerp(grey, 1 - factor),
      background: new THREE.Color().copy(this.currentPalette.background),
    };
  }
}

function clonePalette(p: Palette): Palette {
  return {
    primary: p.primary.clone(),
    secondary: p.secondary.clone(),
    accent: p.accent.clone(),
    background: p.background.clone(),
  };
}

function lerpColor(current: THREE.Color, target: THREE.Color, t: number): void {
  current.r = lerp(current.r, target.r, t);
  current.g = lerp(current.g, target.g, t);
  current.b = lerp(current.b, target.b, t);
}

export const colorPalette = new ColorPaletteManager();
