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
  /** Whether bass/chords/drums are actually generated and played - chosen per-question to hit a target difficulty rating. */
  bass: boolean;
  chords: boolean;
  drums: boolean;
}

/** A fully procedurally generated song: notes, chords, and rhythm - no audio file involved. */
export interface GeneratedSong {
  id: string;
  config: SongConfig;
  melody: MelodyNote[];
  chords: ChordNote[][]; // one array of chord-tone notes per bar - always computed (melody generation needs it), whether or not it's played
  progressions: string[]; // roman-numeral degree per bar
  /** Mirrors config.chords - whether the chords are actually played back / a fair thing to ask about. */
  chordsAudible: boolean;
  bass?: MelodyNote[];
  drums?: DrumHit[];
  drumType?: DrumType;
  /** Only set on motif songs (generateMotifSong): how many times the one-bar motif is heard - 1 means nothing repeats. */
  motifRepeats?: number;
}

/** A single audible answer option: a specific instrument + pitch to play instead of speaking a name. */
export interface AudioOption {
  instrument: string;
  pitch: number; // MIDI note number
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
  /** When set, parallel to `options`: play these notes instead of speaking the option text. */
  audioOptions?: AudioOption[];
  /** This specific song's computed difficulty rating for this trait - the Elo "opponent" the player's per-trait rating is matched against. */
  songRating: number;
}

export interface AnsweredQuestion extends Question {
  chosenAnswer: string;
  correct: boolean;
}
