export type Difficulty = "easy" | "medium" | "hard";

export type ScaleName = "major" | "minor" | "dorian" | "phrygian" | "lydian" | "mixolydian";
export type DrumType = "acoustic" | "electronic";

export interface MelodyNote {
  pitch: number; // MIDI note number
  startBeat: number;
  duration: number;
  velocity: number;
}

export interface ChordNote extends MelodyNote {
  role: "root" | "third" | "fifth" | "seventh";
}

export interface DrumHit {
  type: string;
  pitch: number;
  startBeat: number;
  duration: number;
  velocity: number;
}

export interface SongConfig {
  tonic: string;
  scale: ScaleName;
  swing: number;
  melodyOctave: number;
  bars: number;
  bpb: number;
  density: number;
  bpm: number;
  genre: string;
}

/** A fully procedurally generated song: notes, chords, and rhythm - no audio file involved. */
export interface GeneratedSong {
  id: string;
  config: SongConfig;
  melody: MelodyNote[];
  chords: ChordNote[][]; // one array of chord-tone notes per bar
  progressions: string[]; // roman-numeral degree per bar
  bass?: MelodyNote[];
  drums?: DrumHit[];
  drumType?: DrumType;
}

export interface Question {
  id: string;
  traitId: string;
  category: string;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  correctAnswer: string;
  /** The freshly generated song this question is about - each question gets its own song. */
  song: GeneratedSong;
}

export interface AnsweredQuestion extends Question {
  chosenAnswer: string;
  correct: boolean;
}
