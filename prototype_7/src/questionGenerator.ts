import { GeneratedSong, Question, Difficulty } from "./types.ts";
import { GENRES, generateRandomSong, pitchClassName, chordQuality, INSTRUMENT_FAMILY, BASS_STYLE } from "./songGenerator.ts";

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
  getValue: (song: GeneratedSong) => string;
  optionPool: string[];
  isApplicable?: (song: GeneratedSong) => boolean;
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

export const TRAITS: TraitDefinition[] = [
  // ---- Makkelijk ------------------------------------------------------------
  {
    id: "genre",
    category: "Genre",
    difficulty: "easy",
    prompt: "Welk genre past het best bij dit stuk?",
    getValue: (s) => GENRES.find((g) => g.id === s.config.genre)!.label,
    optionPool: GENRES.map((g) => g.label),
  },
  {
    id: "tempo-broad",
    category: "Tempo",
    difficulty: "easy",
    prompt: "Hoe zou je het tempo omschrijven?",
    getValue: (s) => tempoBucket(s.config.bpm),
    optionPool: ["langzaam", "gemiddeld", "snel"],
  },
  {
    id: "has-drums",
    category: "Ritme",
    difficulty: "easy",
    prompt: "Zitten er drums in dit stuk?",
    getValue: (s) => bool(!!s.drums, "ja", "nee"),
    optionPool: ["ja", "nee"],
  },
  {
    id: "swing-feel",
    category: "Ritme",
    difficulty: "easy",
    prompt: "Voelt het ritme recht of als een shuffle?",
    getValue: (s) => swingBucket(s.config.swing),
    optionPool: ["recht", "shuffle"],
  },

  // ---- Gemiddeld ------------------------------------------------------------
  {
    id: "melody-instrument-family",
    category: "Instrumentatie",
    difficulty: "medium",
    prompt: "Tot welke familie hoort het instrument van de hoofdmelodie?",
    getValue: (s) => INSTRUMENT_FAMILY[GENRES.find((g) => g.id === s.config.genre)!.instruments.melody],
    optionPool: Array.from(new Set(Object.values(INSTRUMENT_FAMILY))),
  },
  {
    id: "chords-instrument-family",
    category: "Instrumentatie",
    difficulty: "medium",
    prompt: "Wat speelt de akkoorden eronder?",
    getValue: (s) => INSTRUMENT_FAMILY[GENRES.find((g) => g.id === s.config.genre)!.instruments.chords],
    optionPool: Array.from(new Set(Object.values(INSTRUMENT_FAMILY))),
  },
  {
    id: "bass-style",
    category: "Instrumentatie",
    difficulty: "medium",
    prompt: "Hoe zou je de bas omschrijven?",
    getValue: (s) => BASS_STYLE[GENRES.find((g) => g.id === s.config.genre)!.bassInstrument!],
    optionPool: Array.from(new Set(Object.values(BASS_STYLE))),
    isApplicable: (s) => !!s.bass,
  },
  {
    id: "drum-type",
    category: "Ritme",
    difficulty: "medium",
    prompt: "Klinken de drums akoestisch of elektronisch?",
    getValue: (s) => (s.drumType === "electronic" ? "elektronisch" : "akoestisch"),
    optionPool: ["akoestisch", "elektronisch"],
    isApplicable: (s) => !!s.drums,
  },
  {
    id: "density",
    category: "Arrangement",
    difficulty: "medium",
    prompt: "Hoe druk voelt het arrangement?",
    getValue: (s) => densityBucket(s.config.density),
    optionPool: ["dun", "gemiddeld", "druk"],
  },
  {
    id: "scale-mode",
    category: "Harmonie",
    difficulty: "medium",
    prompt: "In welke toonladder of modus staat dit stuk?",
    getValue: (s) => s.config.scale,
    optionPool: ["major", "minor", "dorian", "phrygian", "lydian", "mixolydian"],
  },
  {
    id: "tonic-chord-quality",
    category: "Harmonie",
    difficulty: "medium",
    prompt: "Is het allereerste akkoord majeur of mineur?",
    getValue: (s) => {
      const q = chordQuality(s, s.progressions[0]);
      return q === "maj" ? "majeur" : q === "min" ? "mineur" : "verminderd";
    },
    optionPool: ["majeur", "mineur", "verminderd"],
  },
  {
    id: "beats-per-bar",
    category: "Ritme",
    difficulty: "medium",
    prompt: "Hoeveel tellen zitten er in elke maat?",
    getValue: (s) => String(s.config.bpb),
    optionPool: ["2", "3", "4", "5", "6"],
  },

  // ---- Moeilijk: specifieke noten/akkoorden - vraagt echt geoefend luisteren ----
  {
    id: "key-tonic",
    category: "Harmonie",
    difficulty: "hard",
    prompt: "Op welke grondtoon staat dit stuk gecentreerd?",
    getValue: (s) => s.config.tonic,
    optionPool: ["C", "D", "E", "F", "G", "A", "B", "Bb", "Eb"],
  },
  {
    id: "melody-start-note",
    category: "Melodie",
    difficulty: "hard",
    prompt: "Op welke noot begint de melodie?",
    getValue: (s) => pitchClassName(s.melody[0].pitch),
    optionPool: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
    isApplicable: (s) => s.melody.length > 0,
  },
  {
    id: "first-chord-root",
    category: "Harmonie",
    difficulty: "hard",
    prompt: "Wat is de grondtoon van het allereerste akkoord?",
    getValue: (s) => pitchClassName(s.chords[0][0].pitch),
    optionPool: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  },
  {
    id: "unique-chord-count",
    category: "Harmonie",
    difficulty: "hard",
    prompt: "Hoeveel verschillende akkoorden komen er in de progressie voor?",
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
  numOptions?: number;
  recentTraitIds?: string[];
}

/**
 * Generates a fresh, randomly-composed song and a procedural question about
 * one of its perceivable traits. A new song is generated per question, so
 * the supply is unlimited and no two questions ever repeat.
 */
export function generateQuestion(options: GeneratorOptions = {}): Question {
  const { difficulty = "mixed", numOptions = 4, recentTraitIds = [] } = options;
  const song = generateRandomSong();

  let candidateTraits = TRAITS.filter(
    (t) => (difficulty === "mixed" || t.difficulty === difficulty) && (!t.isApplicable || t.isApplicable(song))
  );

  const fresh = candidateTraits.filter((t) => !recentTraitIds.includes(t.id));
  if (fresh.length > 0) candidateTraits = fresh;

  const trait = pickRandom(candidateTraits);
  const correctAnswer = trait.getValue(song);

  const distractorPool = trait.optionPool.filter((v) => v !== correctAnswer);
  const distractors = shuffle(distractorPool).slice(0, numOptions - 1);
  const options_ = shuffle([correctAnswer, ...distractors]);

  return {
    id: `${song.id}-${trait.id}`,
    traitId: trait.id,
    category: trait.category,
    difficulty: trait.difficulty,
    prompt: trait.prompt,
    options: options_,
    correctAnswer,
    song,
  };
}

export function generateQuiz(count: number, difficulty: Difficulty | "mixed" = "mixed"): Question[] {
  const questions: Question[] = [];
  const recentTraitIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const q = generateQuestion({ difficulty, recentTraitIds });
    questions.push(q);
    recentTraitIds.push(q.traitId);
    if (recentTraitIds.length > 3) recentTraitIds.shift();
  }
  return questions;
}
