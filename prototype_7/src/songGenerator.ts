import { ScaleName, DrumType, MelodyNote, ChordNote, DrumHit, SongConfig, GeneratedSong } from "./types.ts";

// ---------------------------------------------------------------------------
// Ported (and lightly typed) from the uploaded "Adaptive Song Generator".
// This is the actual music-theory engine: real scales, chord progressions,
// voice leading, swing, and genre-specific rhythm - so quiz questions can be
// about genuine musical structure (key, chord quality, specific notes)
// rather than metadata.
// ---------------------------------------------------------------------------

export interface GenreVariant {
  tonics: string[];
  scales: ScaleName[];
  swing: [number, number];
  melodyOctave: number;
}

export interface GenreDefinition {
  id: string;
  label: string;
  emoji: string;
  instruments: { melody: string; chords: string };
  hasDrums: boolean;
  drumType: DrumType | null;
  bassInstrument: string | null;
  variants: GenreVariant[];
}

export const GENRES: GenreDefinition[] = [
  {
    id: "jazz", label: "Jazz", emoji: "🎷",
    instruments: { melody: "sax", chords: "piano" },
    hasDrums: true, drumType: "acoustic", bassInstrument: "uprightBass",
    variants: [
      { tonics: ["C", "F", "Bb", "Eb"], scales: ["dorian", "mixolydian"], swing: [0.55, 0.80], melodyOctave: 5 },
      { tonics: ["G", "D", "A"], scales: ["major", "mixolydian"], swing: [0.50, 0.70], melodyOctave: 5 },
    ],
  },
  {
    id: "blues", label: "Blues", emoji: "🎸",
    instruments: { melody: "elGuitar", chords: "piano" },
    hasDrums: true, drumType: "acoustic", bassInstrument: "elBass",
    variants: [{ tonics: ["A", "E", "G", "D"], scales: ["minor", "mixolydian"], swing: [0.45, 0.70], melodyOctave: 4 }],
  },
  {
    id: "classical", label: "Klassiek", emoji: "🎻",
    instruments: { melody: "violin", chords: "piano" },
    hasDrums: false, drumType: null, bassInstrument: "cello",
    variants: [
      { tonics: ["C", "G", "D", "F"], scales: ["major"], swing: [0.00, 0.05], melodyOctave: 5 },
      { tonics: ["A", "E", "B"], scales: ["minor"], swing: [0.00, 0.05], melodyOctave: 5 },
    ],
  },
  {
    id: "pop", label: "Pop", emoji: "🎤",
    instruments: { melody: "synthLead", chords: "synthPad" },
    hasDrums: true, drumType: "electronic", bassInstrument: "synthBass",
    variants: [
      { tonics: ["C", "G", "A", "F"], scales: ["major"], swing: [0.05, 0.20], melodyOctave: 5 },
      { tonics: ["A", "D", "E"], scales: ["minor"], swing: [0.05, 0.20], melodyOctave: 5 },
    ],
  },
  {
    id: "hiphop", label: "Hiphop", emoji: "🎧",
    instruments: { melody: "synthLead", chords: "synthPad" },
    hasDrums: true, drumType: "electronic", bassInstrument: "slapBass",
    variants: [{ tonics: ["C", "F", "G", "D"], scales: ["minor", "dorian"], swing: [0.30, 0.55], melodyOctave: 5 }],
  },
  {
    id: "funk", label: "Funk", emoji: "🕺",
    instruments: { melody: "elGuitar", chords: "piano" },
    hasDrums: true, drumType: "acoustic", bassInstrument: "slapBass",
    variants: [{ tonics: ["E", "A", "D", "G"], scales: ["dorian", "mixolydian"], swing: [0.35, 0.60], melodyOctave: 4 }],
  },
  {
    id: "latin", label: "Latin", emoji: "💃",
    instruments: { melody: "trumpet", chords: "piano" },
    hasDrums: true, drumType: "acoustic", bassInstrument: "bass",
    variants: [
      { tonics: ["A", "D", "G", "E"], scales: ["minor", "phrygian"], swing: [0.20, 0.45], melodyOctave: 5 },
      { tonics: ["C", "F", "G"], scales: ["major", "mixolydian"], swing: [0.15, 0.35], melodyOctave: 5 },
    ],
  },
  {
    id: "ambient", label: "Ambient", emoji: "🌌",
    instruments: { melody: "synthPad", chords: "synthPad" },
    hasDrums: false, drumType: null, bassInstrument: "synthBass",
    variants: [{ tonics: ["D", "A", "E", "B"], scales: ["lydian", "dorian"], swing: [0.00, 0.10], melodyOctave: 4 }],
  },
  {
    id: "folk", label: "Folk", emoji: "🪕",
    instruments: { melody: "guitar", chords: "piano" },
    hasDrums: false, drumType: null, bassInstrument: "uprightBass",
    variants: [
      { tonics: ["G", "D", "A", "C"], scales: ["major", "mixolydian"], swing: [0.10, 0.25], melodyOctave: 4 },
      { tonics: ["A", "D", "E"], scales: ["minor"], swing: [0.05, 0.20], melodyOctave: 4 },
    ],
  },
  {
    id: "metal", label: "Metal", emoji: "🤘",
    instruments: { melody: "disGuitar", chords: "disGuitar" },
    hasDrums: true, drumType: "electronic", bassInstrument: "elBass",
    variants: [{ tonics: ["E", "A", "B", "D"], scales: ["phrygian", "minor"], swing: [0.00, 0.08], melodyOctave: 4 }],
  },
  {
    id: "reggae", label: "Reggae", emoji: "🌴",
    instruments: { melody: "guitar", chords: "piano" },
    hasDrums: true, drumType: "acoustic", bassInstrument: "bass",
    variants: [{ tonics: ["A", "D", "G", "E"], scales: ["major", "mixolydian"], swing: [0.25, 0.45], melodyOctave: 4 }],
  },
  {
    id: "electronic", label: "Elektronisch", emoji: "🎛️",
    instruments: { melody: "synthLead", chords: "synthPad" },
    hasDrums: true, drumType: "electronic", bassInstrument: "synthBass",
    variants: [
      { tonics: ["C", "F", "A", "D"], scales: ["minor", "dorian"], swing: [0.00, 0.15], melodyOctave: 5 },
      { tonics: ["G", "E", "B"], scales: ["phrygian", "lydian"], swing: [0.00, 0.10], melodyOctave: 5 },
    ],
  },
];

// ---- Music theory ----------------------------------------------------------

// NOTE: the original file omitted Bb/Eb (used by the jazz variant), which
// would have produced NaN pitches for that variant. Fixed here.
const NOTE_TO_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, Bb: 10, Eb: 3 };

const SCALES: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

const CHORD_PROGRESSIONS: Record<ScaleName, string[][]> = {
  major: [["I", "V", "vi", "IV"], ["I", "vi", "IV", "V"], ["vi", "IV", "I", "V"], ["I", "IV", "vi", "V"], ["ii", "V", "I", "vi"]],
  minor: [["i", "VI", "III", "VII"], ["i", "iv", "VII", "III"], ["i", "VI", "iv", "V"], ["i", "iv", "VI", "V"]],
  dorian: [["i", "IV", "i", "VII"], ["i", "VII", "IV", "i"], ["i", "IV", "VII", "i"]],
  phrygian: [["i", "II", "VII", "i"], ["i", "VII", "VI", "VII"], ["i", "II", "i", "VII"]],
  lydian: [["I", "II", "V", "I"], ["I", "V", "II", "I"], ["I", "II", "vi", "V"]],
  mixolydian: [["I", "VII", "IV", "I"], ["I", "VII", "I", "IV"], ["I", "IV", "VII", "I"]],
};

const CHORD_QUALITIES: Record<ScaleName, Record<string, string>> = {
  major: { I: "maj", ii: "min", iii: "min", IV: "maj", V: "maj", vi: "min", vii: "dim" },
  minor: { i: "min", ii: "dim", III: "maj", iv: "min", V: "maj", VI: "maj", VII: "maj" },
  dorian: { i: "min", ii: "min", III: "maj", IV: "maj", v: "min", VI: "dim", VII: "maj" },
  phrygian: { i: "min", II: "maj", III: "maj", iv: "min", v: "dim", VI: "maj", VII: "min" },
  lydian: { I: "maj", ii: "maj", iii: "min", IV: "dim", V: "maj", vi: "min", vii: "min" },
  mixolydian: { I: "maj", ii: "min", iii: "dim", IV: "maj", v: "min", VI: "min", VII: "maj" },
};

const DEGREE_INDEX: Record<string, number> = { i: 0, I: 0, ii: 1, II: 1, iii: 2, III: 2, iv: 3, IV: 3, v: 4, V: 4, vi: 5, VI: 5, vii: 6, VII: 6 };

const GENRE_RHYTHMS: Record<string, { melody: number[]; bass: number[]; drums: string | null }> = {
  jazz: { melody: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], bass: [0, 1, 2, 3], drums: "jazz" },
  blues: { melody: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], bass: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], drums: "blues" },
  classical: { melody: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], bass: [0, 1, 2, 3], drums: null },
  pop: { melody: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], bass: [0, 1, 1.5, 2, 3], drums: "pop" },
  hiphop: { melody: [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5], bass: [0, 0.5, 1.5, 2, 2.5, 3.5], drums: "hiphop" },
  funk: { melody: [0, 0.25, 0.5, 0.75, 1, 1.5, 1.75, 2, 2.5, 2.75, 3, 3.5], bass: [0, 0.5, 0.75, 1.5, 2, 2.5, 3, 3.5], drums: "funk" },
  latin: { melody: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], bass: [0, 1, 2, 2.5, 3], drums: "latin" },
  ambient: { melody: [0, 1, 2, 3], bass: [0, 2], drums: null },
  folk: { melody: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], bass: [0, 1, 2, 3], drums: null },
  metal: { melody: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], bass: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], drums: "metal" },
  reggae: { melody: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], bass: [0, 1.5, 2.5, 3], drums: "reggae" },
  electronic: { melody: [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5], bass: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], drums: "electronic" },
};

function pickArr<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randBetween(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function scaleDegrees(tonic: string, scale: ScaleName, octave: number): number[] {
  const root = NOTE_TO_SEMITONE[tonic] + octave * 12;
  return SCALES[scale].map((i) => root + i);
}

interface ChordPitches {
  root: number; third: number; fifth: number; seventh: number; quality: string;
}

function chordPitches(degree: string, tonic: string, scale: ScaleName, octave = 4): ChordPitches {
  const idx = DEGREE_INDEX[degree];
  const deg = scaleDegrees(tonic, scale, octave);
  const root = deg[idx];
  const third = deg[(idx + 2) % 7] + ((idx + 2) >= 7 ? 12 : 0);
  const fifth = deg[(idx + 4) % 7] + ((idx + 4) >= 7 ? 12 : 0);
  const seventh = deg[(idx + 6) % 7] + ((idx + 6) >= 7 ? 12 : 0);
  return { root, third, fifth, seventh, quality: CHORD_QUALITIES[scale][degree] || "maj" };
}

function chordToneSet(chord: ChordPitches): number[] {
  return [chord.root, chord.third, chord.fifth, chord.seventh];
}

function nearestPitch(target: number, pitches: number[]): number {
  return pitches.reduce((best, p) => (Math.abs(p - target) < Math.abs(best - target) ? p : best), pitches[0]);
}

function pickProgression(scale: ScaleName): string[] {
  return pickArr(CHORD_PROGRESSIONS[scale] || CHORD_PROGRESSIONS.major);
}

export function resolveGenre(genreId: string) {
  const genre = GENRES.find((g) => g.id === genreId)!;
  const variant = pickArr(genre.variants);
  return {
    tonic: pickArr(variant.tonics),
    scale: pickArr(variant.scales),
    swing: randBetween(variant.swing[0], variant.swing[1]),
    melodyOctave: variant.melodyOctave,
  };
}

// ---- Motifs & phrases -------------------------------------------------------

interface MotifEvent { offset: number; pitch: number; duration: number; accent: boolean }

function createMotif(cfg: SongConfig, chord: ChordPitches): MotifEvent[] {
  const degrees = scaleDegrees(cfg.tonic, cfg.scale, cfg.melodyOctave);
  const tones = chordToneSet(chord);
  const rhythm = GENRE_RHYTHMS[cfg.genre]?.melody || [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
  const density = cfg.density;

  const motifLength = density < 0.35 ? 4 : density < 0.7 ? 6 : 8;
  const events: MotifEvent[] = [];

  for (let i = 0; i < motifLength; i++) {
    const beat = rhythm[i % rhythm.length];
    if (Math.random() > Math.min(0.9, density + 0.15) && i > 0) continue;

    const strong = beat % 1 === 0;
    const candidates = strong ? tones : degrees;
    const center = degrees[Math.floor(degrees.length / 2)];
    let pitch = nearestPitch(center + pickArr([-7, -4, -2, 0, 2, 4, 7]), candidates);

    pitch = Math.max(degrees[0], Math.min(degrees[degrees.length - 1], pitch));

    events.push({ offset: beat, pitch, duration: i % 3 === 0 ? 0.5 : 0.25, accent: strong });
  }

  if (!events.length) events.push({ offset: 0, pitch: tones[0], duration: 1, accent: true });
  return events;
}

function mutateMotif(motif: MotifEvent[], cfg: SongConfig, variation: number): MotifEvent[] {
  const degrees = scaleDegrees(cfg.tonic, cfg.scale, cfg.melodyOctave);
  return motif.map((n, i) => {
    let pitch = n.pitch;
    if (variation === 1 && i % 3 === 0) pitch = nearestPitch(pitch + pickArr([-2, 2, 4]), degrees);
    else if (variation === 2 && i % 2 === 1) pitch = nearestPitch(pitch + pickArr([-4, 4, 7]), degrees);
    else if (variation === 3) pitch = nearestPitch(pitch + (i % 2 ? 2 : -2), degrees);
    return { ...n, pitch };
  });
}

function generateMelody(cfg: SongConfig, chords: ChordPitches[]): MelodyNote[] {
  const total = cfg.bars * cfg.bpb;
  const phraseBars = cfg.bars >= 8 ? 2 : 1;
  const phraseBeats = phraseBars * cfg.bpb;
  const motif = createMotif(cfg, chords[0]);
  const notes: MelodyNote[] = [];
  let lastPitch = motif[0]?.pitch ?? scaleDegrees(cfg.tonic, cfg.scale, cfg.melodyOctave)[3];

  for (let phrase = 0, start = 0; start < total; phrase++, start += phraseBeats) {
    const phraseMotif = mutateMotif(motif, cfg, phrase % 4);

    for (const event of phraseMotif) {
      const beat = start + event.offset;
      if (beat >= total) continue;

      const activeChord = chords[Math.min(chords.length - 1, Math.floor(beat / cfg.bpb))];
      const chordTones = chordToneSet(activeChord);
      let pitch = event.pitch;

      if (event.accent || beat % 1 === 0) pitch = nearestPitch(pitch, chordTones);

      if (Math.abs(pitch - lastPitch) > 7 && Math.random() < 0.7) {
        const degrees = scaleDegrees(cfg.tonic, cfg.scale, cfg.melodyOctave);
        pitch = nearestPitch(lastPitch + pickArr([-4, -2, 2, 4]), degrees);
      }

      const isPhraseEnd = beat + event.duration >= start + phraseBeats;
      if (isPhraseEnd) pitch = nearestPitch(pitch, chordTones);

      notes.push({ pitch, startBeat: beat, duration: Math.min(event.duration, total - beat), velocity: 0.65 });
      lastPitch = pitch;
    }
  }

  return applyDynamics(applySwing(notes, cfg.swing, 0.5), cfg);
}

// ---- Chords & voice leading --------------------------------------------------

function generateChords(cfg: SongConfig): { bars: ChordNote[][]; prog: string[] } {
  const base = pickProgression(cfg.scale);
  const prog = Array.from({ length: cfg.bars }, (_, i) => base[i % base.length]);

  const bars: ChordNote[][] = [];
  let previousVoicing: number[] | null = null;

  prog.forEach((degree, bar) => {
    const p = chordPitches(degree, cfg.tonic, cfg.scale, 4);
    const raw = [p.root, p.third, p.fifth, p.seventh];

    let voicing: number[];
    if (!previousVoicing) {
      voicing = raw;
    } else {
      const prev = previousVoicing;
      voicing = raw
        .map((note, i) => nearestPitch(prev[i], [note - 12, note, note + 12]))
        .sort((a, b) => a - b);
    }

    const notes: ChordNote[] = [
      { pitch: voicing[0], role: "root", startBeat: bar * cfg.bpb, duration: cfg.bpb, velocity: 0.38 },
      { pitch: voicing[1], role: "third", startBeat: bar * cfg.bpb, duration: cfg.bpb, velocity: 0.32 },
      { pitch: voicing[2], role: "fifth", startBeat: bar * cfg.bpb, duration: cfg.bpb, velocity: 0.30 },
    ];

    if (cfg.density > 0.35 || Math.random() < 0.7) {
      notes.push({ pitch: voicing[3], role: "seventh", startBeat: bar * cfg.bpb, duration: cfg.bpb, velocity: 0.24 });
    }

    bars.push(notes);
    previousVoicing = voicing;
  });

  return { bars, prog };
}

// ---- Genre-specific bass -----------------------------------------------------

function generateBass(cfg: SongConfig, prog: string[]): MelodyNote[] {
  const total = cfg.bars * cfg.bpb;
  const notes: MelodyNote[] = [];
  const rhythm = GENRE_RHYTHMS[cfg.genre]?.bass || [0, 1, 2, 3];

  for (let bar = 0; bar < cfg.bars; bar++) {
    const degree = prog[bar % prog.length];
    const chord = chordPitches(degree, cfg.tonic, cfg.scale, 2);
    const chordTones = [chord.root, chord.third, chord.fifth];

    rhythm.forEach((offset, i) => {
      const beat = bar * cfg.bpb + offset;
      if (beat >= total) return;

      let pitch: number;
      if (i === 0) pitch = chord.root;
      else if (Math.random() < 0.6) pitch = pickArr(chordTones);
      else {
        const nextDegree = prog[(bar + 1) % prog.length];
        const next = chordPitches(nextDegree, cfg.tonic, cfg.scale, 2);
        pitch = nearestPitch(next.root - 12, scaleDegrees(cfg.tonic, cfg.scale, 2));
      }

      notes.push({ pitch, startBeat: beat, duration: Math.min(0.5, total - beat), velocity: 0.72 });
    });
  }

  return applyDynamics(applySwing(notes, cfg.swing, 0.35), cfg);
}

// ---- Genre-specific drums -----------------------------------------------------

function generateDrums(cfg: SongConfig, drumType: DrumType): DrumHit[] {
  const drums: DrumHit[] = [];
  const total = cfg.bars * cfg.bpb;
  const style = GENRE_RHYTHMS[cfg.genre]?.drums || "generic";

  const drumSounds = drumType === "electronic"
    ? { kick: "elecKick", snare: "elecClap", hihat: "elecCymbal" }
    : { kick: "kick", snare: "snare", hihat: "hihat" };

  for (let bar = 0; bar < cfg.bars; bar++) {
    const base = bar * cfg.bpb;

    const add = (type: string, offset: number, velocity: number, duration = 0.1) => {
      if (base + offset < total) {
        drums.push({
          type,
          pitch: type === drumSounds.kick ? (drumType === "electronic" ? 64 : 36)
            : type === drumSounds.snare ? (drumType === "electronic" ? 69 : 38)
            : (drumType === "electronic" ? 68 : 42),
          startBeat: base + offset,
          duration,
          velocity,
        });
      }
    };

    const kickPatterns: Record<string, number[]> = {
      jazz: [0, 2.5], blues: [0, 2.5], pop: [0, 1.5, 2, 3], hiphop: [0, 1.5, 2.5],
      funk: [0, 0.75, 2, 2.75], latin: [0, 1.5, 2.5], metal: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      reggae: [0, 2.5], electronic: [0, 1.5, 2, 3], generic: [0, 2],
    };

    for (const offset of kickPatterns[style] || kickPatterns.generic) {
      if (Math.random() < 0.78 || offset === 0) add(drumSounds.kick, offset, offset === 0 ? 0.86 : 0.68);
    }

    if (style !== "jazz" && style !== "latin" && style !== "reggae") {
      add(drumSounds.snare, 2, 0.78);
      if (cfg.density > 0.75 && Math.random() < 0.4) add(drumSounds.snare, 3.5, 0.45);
    } else if (style === "jazz") {
      add(drumSounds.snare, 2, 0.45);
    }

    if (style === "reggae") {
      [0.5, 1.5, 2.5, 3.5].forEach((o) => add(drumSounds.hihat, o, 0.38, 0.06));
    } else {
      const spacing = cfg.density > 0.72 ? 0.25 : 0.5;
      for (let o = 0; o < cfg.bpb; o += spacing) {
        const accent = o % 1 === 0 ? 0.48 : 0.32;
        add(drumSounds.hihat, o, accent, 0.06);
      }
    }

    if ((bar + 1) % 4 === 0 && cfg.density > 0.45) {
      [3, 3.25, 3.5, 3.75].forEach((o, i) => add(drumSounds.snare, o, 0.38 + i * 0.08, 0.06));
    }
  }

  return drums;
}

// ---- Dynamics & swing ---------------------------------------------------------

function applyDynamics<T extends MelodyNote>(notes: T[], cfg: SongConfig): T[] {
  return notes.map((n) => {
    const pos = n.startBeat % cfg.bpb;
    const phrasePos = (n.startBeat % Math.max(1, cfg.bpb * 2)) / Math.max(1, cfg.bpb * 2);
    const downbeat = pos === 0 ? 0.12 : 0;
    const phraseShape = Math.sin(Math.PI * phrasePos) * 0.14;
    const variation = (Math.random() - 0.5) * 0.08;
    const velocity = Math.max(0.25, Math.min(0.95, 0.58 + downbeat + phraseShape + variation));
    return { ...n, velocity };
  });
}

function applySwing<T extends MelodyNote>(notes: T[], amount: number, subdivision = 0.5): T[] {
  if (!amount) return notes;
  return notes.map((n) => {
    const pair = Math.floor(n.startBeat / subdivision);
    const inPair = n.startBeat - pair * subdivision;
    if (Math.abs(inPair - subdivision) < 0.0001 || inPair >= subdivision * 0.95) {
      return { ...n, startBeat: n.startBeat + amount * subdivision * 0.33 };
    }
    return n;
  });
}

// ---- Song assembly --------------------------------------------------------------

export function generateSong(cfg: SongConfig): GeneratedSong {
  const { bars, prog } = generateChords(cfg);
  const genre = GENRES.find((g) => g.id === cfg.genre)!;

  const chordPitchesPerBar: ChordPitches[] = bars.map((bar) => ({
    root: bar[0].pitch, third: bar[1].pitch, fifth: bar[2].pitch,
    seventh: bar[3]?.pitch ?? bar[2].pitch, quality: "maj",
  }));

  const song: GeneratedSong = {
    id: `song-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    config: cfg,
    melody: generateMelody(cfg, chordPitchesPerBar),
    chords: bars,
    progressions: prog,
  };

  if (genre.hasDrums && genre.drumType) {
    song.drums = generateDrums(cfg, genre.drumType);
    song.drumType = genre.drumType;
  }
  if (genre.bassInstrument) {
    song.bass = generateBass(cfg, prog);
  }

  return song;
}

/** Builds a randomized config for a random genre and generates a song from it. */
export function generateRandomSong(): GeneratedSong {
  const genre = pickArr(GENRES);
  const resolved = resolveGenre(genre.id);
  const cfg: SongConfig = {
    ...resolved,
    bars: 2 + Math.floor(Math.random() * 5), // 2-6 bars: enough structure, short enough to quiz on
    bpb: 2 + Math.floor(Math.random() * 5), // 2-6 beats per bar
    density: 0.15 + Math.random() * 0.75,
    bpm: 70 + Math.floor(Math.random() * 120),
    genre: genre.id,
  };
  return generateSong(cfg);
}

export function chordQuality(song: GeneratedSong, degree: string): string {
  return CHORD_QUALITIES[song.config.scale][degree] || "maj";
}

// ---- Note naming & instrument families (used by quiz traits) ------------------

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function pitchClassName(midiPitch: number): string {
  return PITCH_CLASSES[((Math.round(midiPitch) % 12) + 12) % 12];
}

export const INSTRUMENT_FAMILY: Record<string, string> = {
  piano: "Piano/toetsen",
  guitar: "Gitaar", elGuitar: "Gitaar", disGuitar: "Gitaar",
  violin: "Strijkers", cello: "Strijkers",
  trumpet: "Koper",
  sax: "Hout",
  synthLead: "Synth", synthPad: "Synth",
};

export const BASS_STYLE: Record<string, string> = {
  uprightBass: "Contrabas (akoestisch)",
  bass: "Elektrisch (getokkeld)",
  elBass: "Elektrisch (getokkeld)",
  slapBass: "Slapbas",
  synthBass: "Synthbas",
};
