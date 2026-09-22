import { GeneratedSong, Question, Difficulty, AudioOption } from "./types.ts";
import { GENRES, generateRandomSong, pitchClassName, pitchForLabelNearOctave, chordQuality, INSTRUMENT_FAMILY, BASS_STYLE } from "./songGenerator.ts";
import { KNOWN_SONGS, buildKnownSong } from "./knownSongs.ts";

// Chance that a question is built around a real, hand-transcribed song
// instead of a freshly generated one, when nothing is forced (see below).
const KNOWN_SONG_CHANCE = 0.25;

function pickSong(forcedSongId?: string): GeneratedSong {
  if (forcedSongId) {
    const forced = KNOWN_SONGS.find((s) => s.id === forcedSongId);
    if (forced) return buildKnownSong(forced);
  } else if (Math.random() < KNOWN_SONG_CHANCE && KNOWN_SONGS.length > 0) {
    return buildKnownSong(KNOWN_SONGS[Math.floor(Math.random() * KNOWN_SONGS.length)]);
  }
  return generateRandomSong();
}

// ---------------------------------------------------------------------------
// Same trait-definition pattern as before, but every trait now reads a value
// that genuinely exists in the generated song's structure (key, scale, the
// actual first chord, the actual first melody note, rhythm parameters) -
// nothing about vocals/mood/production, since the generator has no such
// concepts. A few traits (specific notes/chords) are new and only possible
// because we now have real note-level data instead of an opaque audio file.
// ---------------------------------------------------------------------------

interface TraitDefinition {
  id: string;
  category: string;
  difficulty: Difficulty;
  prompt: string;
  /** How many answer options this trait's questions should have - always 2 or 4, so the layout can adapt. */
  numOptions: 2 | 4;
  getValue: (song: GeneratedSong) => string;
  /** Static pool, or - for traits whose correct value varies continuously per song - a function computing plausible distractors. */
  optionPool: string[] | ((song: GeneratedSong, correctAnswer: string) => string[]);
  isApplicable?: (song: GeneratedSong) => boolean;
  /** When set, this trait's answer options should be heard (a specific instrument + pitch) instead of spoken as text. */
  audible?: {
    instrument: (song: GeneratedSong) => string;
    pitchFor: (song: GeneratedSong, label: string) => number;
  };
}

const bool = (v: boolean, yes: string, no: string) => (v ? yes : no);

function tempoBucket(bpm: number): string {
  return bpm < 90 ? "langzaam" : bpm < 140 ? "gemiddeld" : "snel";
}
function densityBucket(density: number): string {
  return density < 0.35 ? "dun" : density < 0.7 ? "gemiddeld" : "druk";
}
function swingBucket(swing: number): string {
  return swing >= 0.18 ? "shuffle" : "recht";
}

function noteCountDistractors(song: GeneratedSong, correctAnswer: string): string[] {
  const correct = Number(correctAnswer);
  const deltas = [-3, -2, -1, 1, 2, 3];
  const candidates = deltas.map((d) => correct + d).filter((n) => n >= 1);
  return Array.from(new Set(candidates)).map(String);
}

function melodyDirection(a: number, b: number): string {
  return b > a ? "omhoog" : "omlaag";
}

export const TRAITS: TraitDefinition[] = [
  // ---- Makkelijk ------------------------------------------------------------
  {
    id: "tempo-broad",
    category: "Tempo",
    difficulty: "easy",
    prompt: "Hoe zou je het tempo omschrijven?",
    numOptions: 2,
    getValue: (s) => tempoBucket(s.config.bpm),
    optionPool: ["langzaam", "gemiddeld", "snel"],
  },
  {
    id: "has-drums",
    category: "Ritme",
    difficulty: "easy",
    prompt: "Zitten er drums in dit stuk?",
    numOptions: 2,
    getValue: (s) => bool(!!s.drums, "ja", "nee"),
    optionPool: ["ja", "nee"],
  },

  // ---- Gemiddeld ------------------------------------------------------------
  {
    id: "melody-instrument-family",
    category: "Instrumentatie",
    difficulty: "medium",
    prompt: "Tot welke familie hoort het instrument van de hoofdmelodie?",
    numOptions: 4,
    getValue: (s) => INSTRUMENT_FAMILY[GENRES.find((g) => g.id === s.config.genre)!.instruments.melody],
    optionPool: Array.from(new Set(Object.values(INSTRUMENT_FAMILY))),
  },
  {
    id: "chords-instrument-family",
    category: "Instrumentatie",
    difficulty: "medium",
    prompt: "Wat speelt de akkoorden eronder?",
    numOptions: 4,
    getValue: (s) => INSTRUMENT_FAMILY[GENRES.find((g) => g.id === s.config.genre)!.instruments.chords],
    optionPool: Array.from(new Set(Object.values(INSTRUMENT_FAMILY))),
  },
  {
    id: "density",
    category: "Arrangement",
    difficulty: "medium",
    prompt: "Hoe druk voelt het arrangement?",
    numOptions: 2,
    getValue: (s) => densityBucket(s.config.density),
    optionPool: ["dun", "gemiddeld", "druk"],
  },
  {
    id: "beats-per-bar",
    category: "Ritme",
    difficulty: "medium",
    prompt: "Hoeveel tellen zitten er in elke maat?",
    numOptions: 4,
    getValue: (s) => String(s.config.bpb),
    optionPool: ["2", "3", "4", "5", "6"],
  },
  {
    id: "melody-note-count",
    category: "Melodie",
    difficulty: "medium",
    prompt: "Uit hoeveel noten bestaat de melodie?",
    numOptions: 4,
    getValue: (s) => String(s.melody.length),
    optionPool: noteCountDistractors,
    isApplicable: (s) => s.melody.length > 0,
  },
  {
    id: "melody-direction-start",
    category: "Melodie",
    difficulty: "medium",
    prompt: "Gaat de melodie aan het begin omhoog of omlaag?",
    numOptions: 2,
    getValue: (s) => melodyDirection(s.melody[0].pitch, s.melody[1].pitch),
    optionPool: ["omhoog", "omlaag"],
    isApplicable: (s) => s.melody.length >= 2 && s.melody[0].pitch !== s.melody[1].pitch,
  },
  {
    id: "melody-direction-end",
    category: "Melodie",
    difficulty: "medium",
    prompt: "Gaat de melodie aan het einde omhoog of omlaag?",
    numOptions: 2,
    getValue: (s) => melodyDirection(s.melody[s.melody.length - 2].pitch, s.melody[s.melody.length - 1].pitch),
    optionPool: ["omhoog", "omlaag"],
    isApplicable: (s) => s.melody.length >= 2 && s.melody[s.melody.length - 2].pitch !== s.melody[s.melody.length - 1].pitch,
  },

  // ---- Moeilijk: specifieke noten/akkoorden - vraagt echt geoefend luisteren ----
    {
    id: "melody-start-note",
    category: "Melodie",
    difficulty: "hard",
    prompt: "Op welke noot begint de melodie?",
    numOptions: 4,
    getValue: (s) => pitchClassName(s.melody[0].pitch),
    optionPool: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
    isApplicable: (s) => s.melody.length > 0,
    audible: {
      instrument: (s) => GENRES.find((g) => g.id === s.config.genre)!.instruments.melody,
      pitchFor: (s, label) => pitchForLabelNearOctave(label, s.melody[0].pitch),
    },
  },
  {
    id: "first-chord-root",
    category: "Harmonie",
    difficulty: "hard",
    prompt: "Wat is de grondtoon van het allereerste akkoord?",
    numOptions: 4,
    getValue: (s) => pitchClassName(s.chords[0][0].pitch),
    optionPool: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
    audible: {
      instrument: (s) => GENRES.find((g) => g.id === s.config.genre)!.instruments.chords,
      pitchFor: (s, label) => pitchForLabelNearOctave(label, s.chords[0][0].pitch),
    },
  },
  {
    id: "unique-chord-count",
    category: "Harmonie",
    difficulty: "hard",
    prompt: "Hoeveel verschillende akkoorden komen er in de progressie voor?",
    numOptions: 4,
    getValue: (s) => String(new Set(s.progressions).size),
    optionPool: ["1", "2", "3", "4"],
  },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface GeneratorOptions {
  difficulty?: Difficulty | "mixed";
  recentTraitIds?: string[];
  /** When set, always use this KNOWN_SONGS entry instead of a random/generated song - for auditioning a specific song against the quiz. */
  forcedSongId?: string;
}

/**
 * Generates a song - usually a fresh, randomly-composed one, occasionally a
 * real known song, or a forced known song when auditioning one - and a
 * procedural question about one of its perceivable traits.
 */
export function generateQuestion(options: GeneratorOptions = {}): Question {
  const { difficulty = "mixed", recentTraitIds = [], forcedSongId } = options;
  const song = pickSong(forcedSongId);

  let candidateTraits = TRAITS.filter(
    (t) => (difficulty === "mixed" || t.difficulty === difficulty) && (!t.isApplicable || t.isApplicable(song))
  );

  const fresh = candidateTraits.filter((t) => !recentTraitIds.includes(t.id));
  if (fresh.length > 0) candidateTraits = fresh;

  const trait = pickRandom(candidateTraits);
  const correctAnswer = trait.getValue(song);

  const pool = typeof trait.optionPool === "function" ? trait.optionPool(song, correctAnswer) : trait.optionPool;
  const distractorPool = pool.filter((v) => v !== correctAnswer);
  const distractors = shuffle(distractorPool).slice(0, trait.numOptions - 1);
  const options_ = shuffle([correctAnswer, ...distractors]);

  const audioOptions: AudioOption[] | undefined = trait.audible
    ? options_.map((label) => ({ instrument: trait.audible!.instrument(song), pitch: trait.audible!.pitchFor(song, label) }))
    : undefined;

  return {
    id: `${song.id}-${trait.id}`,
    traitId: trait.id,
    category: trait.category,
    difficulty: trait.difficulty,
    prompt: trait.prompt,
    options: options_,
    correctAnswer,
    audioOptions,
    song,
  };
}

export function generateQuiz(count: number, difficulty: Difficulty | "mixed" = "mixed", forcedSongId?: string): Question[] {
  const questions: Question[] = [];
  const recentTraitIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const q = generateQuestion({ difficulty, recentTraitIds, forcedSongId });
    questions.push(q);
    recentTraitIds.push(q.traitId);
    if (recentTraitIds.length > 3) recentTraitIds.shift();
  }
  return questions;
}
