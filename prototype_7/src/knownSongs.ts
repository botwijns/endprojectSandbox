import { MelodyNote, SongConfig, GeneratedSong, ScaleName, Difficulty } from "./types.ts";
import { generateSong } from "./songGenerator.ts";

// ---------------------------------------------------------------------------
// Real, hand-transcribed melodies (short, recognizable excerpts only - not
// full pieces) that plug into the exact same GeneratedSong shape the rest of
// the app already understands. Only the melody is hand-written; chords, bass
// and instrumentation are still produced by the procedural engine in
// songGenerator.ts (steered to the right key via `progression`, when given,
// or auto-generated in-key otherwise) - so playback, the trait-question
// generator, and everything else Just Works without modification.
//
// To add your own song: look up the tune, write each note as
// { note: "E5", duration: 0.5 } in melody order (rests as { rest: 0.5 }),
// figure out its tonic/scale/bpm/bpb, optionally add a chord-per-bar
// `progression` (roman numerals, e.g. ["I", "V", "I"]) if you know the real
// harmony, and push one new entry onto KNOWN_SONGS below. Nothing else needs
// to change. Use the HUD song picker in the running game to preview it.
// ---------------------------------------------------------------------------

export type MelodyStep = { note: string; duration: number } | { rest: number };

export interface KnownSongEntry {
  id: string;
  title: string;
  composer: string;
  tonic: string;
  scale: ScaleName;
  bpm: number;
  bpb: number;
  /** The melody, played back to back in order. Durations are in beats (1 = a quarter-note-ish pulse). */
  melody: MelodyStep[];
  /** Optional roman-numeral chord per bar (cycles if shorter than `bars`). Omit to auto-generate in-key harmony instead. */
  progression?: string[];
}

const PITCH_CLASS_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parses scientific pitch notation like "E5", "C#4", "Bb3" into a MIDI note number (C4 = 60). */
export function noteNameToMidi(name: string): number {
  const match = /^([A-G])(#|b)?(-?\d+)$/.exec(name);
  if (!match) throw new Error(`Invalid note name: "${name}"`);
  const [, letter, accidental, octaveStr] = match;
  let semitone = PITCH_CLASS_SEMITONES[letter];
  if (accidental === "#") semitone += 1;
  else if (accidental === "b") semitone -= 1;
  return (parseInt(octaveStr, 10) + 1) * 12 + semitone;
}

function isRest(step: MelodyStep): step is { rest: number } {
  return "rest" in step;
}

/** Turns a hand-written note list into a full GeneratedSong at the given complexity tier. */
export function buildKnownSong(entry: KnownSongEntry, complexity: Difficulty): GeneratedSong {
  const melody: MelodyNote[] = [];
  let beat = 0;
  for (const step of entry.melody) {
    if (isRest(step)) {
      beat += step.rest;
      continue;
    }
    melody.push({
      pitch: noteNameToMidi(step.note),
      startBeat: beat,
      duration: step.duration,
      velocity: beat % entry.bpb === 0 ? 0.75 : 0.6,
    });
    beat += step.duration;
  }

  const cfg: SongConfig = {
    tonic: entry.tonic,
    scale: entry.scale,
    swing: 0,
    melodyOctave: 5,
    bars: Math.max(1, Math.ceil(beat / entry.bpb)),
    bpb: entry.bpb,
    density: 0.5,
    bpm: entry.bpm,
    genre: "classical",
    complexity,
  };

  return generateSong(cfg, melody, entry.progression);
}

export const KNOWN_SONGS: KnownSongEntry[] = [
  {
    id: "fur-elise",
    title: "Für Elise",
    composer: "Beethoven",
    tonic: "A",
    scale: "minor",
    bpm: 80,
    bpb: 3,
    // The famous opening theme (Poco moto). Harmony alternates i (Am) - V (E) underneath.
    progression: ["i", "i", "V", "i", "V", "i", "i"],
    melody: [
      { note: "E5", duration: 0.5 }, { note: "D#5", duration: 0.5 }, { note: "E5", duration: 0.5 },
      { note: "D#5", duration: 0.5 }, { note: "E5", duration: 0.5 }, { note: "B4", duration: 0.5 },
      { note: "D5", duration: 0.5 }, { note: "C5", duration: 0.5 }, { note: "A4", duration: 1.5 },
      { rest: 0.5 },
      { note: "C4", duration: 0.5 }, { note: "E4", duration: 0.5 }, { note: "A4", duration: 0.5 },
      { note: "B4", duration: 1.5 },
      { rest: 0.5 },
      { note: "E4", duration: 0.5 }, { note: "G#4", duration: 0.5 }, { note: "B4", duration: 0.5 },
      { note: "C5", duration: 1.5 },
      { rest: 0.5 },
      { note: "E4", duration: 0.5 },
      { note: "E5", duration: 0.5 }, { note: "D#5", duration: 0.5 }, { note: "E5", duration: 0.5 },
      { note: "D#5", duration: 0.5 }, { note: "E5", duration: 0.5 }, { note: "B4", duration: 0.5 },
      { note: "D5", duration: 0.5 }, { note: "C5", duration: 0.5 }, { note: "A4", duration: 1.5 },
    ],
  },
  {
    id: "minuet-in-g",
    title: "Minuet in G",
    composer: "Petzold",
    tonic: "G",
    scale: "major",
    bpm: 120,
    bpb: 3,
    // The opening strain. Harmony is a simplified I (G) - V (D) alternation.
    progression: ["I", "I", "V", "V", "I", "I", "V", "V", "I"],
    melody: [
      { note: "D5", duration: 1 }, { note: "G4", duration: 1 }, { note: "A4", duration: 1 },
      { note: "B4", duration: 1 }, { note: "C5", duration: 1 }, { note: "D5", duration: 1 },
      { note: "G5", duration: 1 }, { note: "G4", duration: 1 }, { note: "B4", duration: 1 },
      { note: "A4", duration: 1 }, { note: "G4", duration: 1 }, { note: "F#4", duration: 1 },
      { note: "G4", duration: 3 },
      { note: "G4", duration: 1 }, { note: "F#4", duration: 1 }, { note: "G4", duration: 1 },
      { note: "A4", duration: 1 }, { note: "B4", duration: 1 }, { note: "A4", duration: 1 },
      { note: "G4", duration: 1 }, { note: "A4", duration: 1 }, { note: "F#4", duration: 1 },
      { note: "G4", duration: 3 },
    ],
  },
];
