import { GeneratedSong, Question, Difficulty, AudioOption } from "./types.ts";
import { GENRES, GenreDefinition, generateSongFromParams, generateMotifSong, SongParams, pitchClassName, pitchForLabelNearOctave, chordQuality, INSTRUMENT_FAMILY, BASS_STYLE } from "./songGenerator.ts";
import { KNOWN_SONGS, buildKnownSong, knownSongBars, KNOWN_SONG_DENSITY } from "./knownSongs.ts";
import { BASE_RATING } from "./rating.ts";

// Chance that a question is built around a real, hand-transcribed song
// instead of a freshly generated one, when nothing is forced (see below).
const KNOWN_SONG_CHANCE = 0.25;

// ---------------------------------------------------------------------------
// Same trait-definition pattern as before, but every trait now reads a value
// that genuinely exists in the generated song's structure (key, scale, the
// actual first chord, the actual first melody note, rhythm parameters) -
// nothing about vocals/mood/production, since the generator has no such
// concepts. A few traits (specific notes/chords) are new and only possible
// because we now have real note-level data instead of an opaque audio file.
//
// Question generation now picks the trait FIRST, then generates a song for
// it: each trait carries a `difficultyWeights` vector saying how much each
// song parameter (length, which layers are audible) shifts *that specific
// trait's* difficulty - e.g. a longer song makes counting the melody's notes
// harder, but makes recognizing an instrument's timbre easier. The song's
// params are then chosen (see pickSongParamsForTrait below) to land that
// trait's difficulty rating close to the player's current rating for it.
// ---------------------------------------------------------------------------

/** How much each song parameter (booleans as 0/1) shifts a trait's difficulty rating away from BASE_RATING. */
interface DifficultyWeights {
  bars: number;
  bass: number;
  chords: number;
  drums: number;
  density: number;
}

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
  /** Forces chords on whenever this trait is picked - it needs to ask about them. */
  requiresChords?: boolean;
  /** Custom song builder for traits the regular generator can't answer reliably - also skips known songs. */
  buildSong?: (genre: GenreDefinition, params: SongParams) => GeneratedSong;
  difficultyWeights: DifficultyWeights;
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
    difficultyWeights: { bars: -10, bass: 0, chords: 0, drums: 0, density: 0 }, // longer clip -> easier to judge tempo
  },
  {
    id: "has-drums",
    category: "Ritme",
    difficulty: "easy",
    prompt: "Zitten er drums in dit stuk?",
    numOptions: 2,
    getValue: (s) => bool(!!s.drums, "ja", "nee"),
    optionPool: ["ja", "nee"],
    difficultyWeights: { bars: -8, bass: 0, chords: 0, drums: 0, density: 0 }, // longer clip -> more chances to notice drums
  },
  {
    id: "motif-repeats",
    category: "Herhaling",
    difficulty: "easy",
    prompt: "Hoor je een stukje muziek dat steeds terugkomt?",
    numOptions: 2,
    getValue: (s) => bool((s.motifRepeats ?? 1) >= 2, "ja", "nee"),
    optionPool: ["ja", "nee"],
    buildSong: (genre, params) =>
      generateMotifSong(genre, params, Math.random() < 0.5 ? 1 : 2 + Math.floor(Math.random() * (Math.min(4, params.bars) - 1))),
    // a longer stukje and more layers make the repeat harder to notice
    difficultyWeights: { bars: 0, bass: 15, chords: 10, drums: 15, density: 30 },
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
    // longer clip -> more timbral exposure -> easier; busier mix -> harder to isolate the melody instrument
    difficultyWeights: { bars: -15, bass: 0, chords: 0, drums: 0, density: 35 },
  },
  {
    id: "chords-instrument-family",
    category: "Instrumentatie",
    difficulty: "medium",
    prompt: "Wat speelt de akkoorden eronder?",
    numOptions: 4,
    getValue: (s) => INSTRUMENT_FAMILY[GENRES.find((g) => g.id === s.config.genre)!.instruments.chords],
    optionPool: Array.from(new Set(Object.values(INSTRUMENT_FAMILY))),
    requiresChords: true,
    // same as melody-instrument-family, plus an inherent bump from chords always being on, plus drums adding clutter
    difficultyWeights: { bars: -15, bass: 0, chords: 130, drums: 20, density: 35 },
  },
  {
    id: "density",
    category: "Arrangement",
    difficulty: "medium",
    prompt: "Hoe druk voelt het arrangement?",
    numOptions: 2,
    getValue: (s) => densityBucket(s.config.density),
    optionPool: ["dun", "gemiddeld", "druk"],
    difficultyWeights: { bars: -5, bass: 0, chords: 0, drums: 0, density: 0 }, // longer clip -> easier to judge how busy it is
  },
  {
    id: "beats-per-bar",
    category: "Ritme",
    difficulty: "medium",
    prompt: "Hoeveel tellen zitten er in elke maat?",
    numOptions: 4,
    getValue: (s) => String(s.config.bpb),
    optionPool: ["2", "3", "4", "5", "6"],
    difficultyWeights: { bars: 0, bass: 0, chords: 0, drums: 0, density: 0 }, // independent of length/instrumentation
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
    // longer/busier/more layers -> harder to keep an exact count
    difficultyWeights: { bars: 35, bass: 25, chords: 20, drums: 30, density: 45 },
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
    // only the first two notes matter, but more layers make isolating the melody line harder
    difficultyWeights: { bars: 2, bass: 15, chords: 15, drums: 15, density: 10 },
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
    difficultyWeights: { bars: 2, bass: 15, chords: 15, drums: 15, density: 10 },
  },
  {
    id: "motif-count",
    category: "Herhaling",
    difficulty: "medium",
    prompt: "Hoeveel keer hoor je het stukje dat terugkomt?",
    numOptions: 4,
    getValue: (s) => String(s.motifRepeats),
    optionPool: ["2", "3", "4", "5"],
    buildSong: (genre, params) =>
      generateMotifSong(genre, params, 2 + Math.floor(Math.random() * (Math.min(5, params.bars) - 1))),
    // more (different) bars around the stukje and more layers make it harder to keep count
    difficultyWeights: { bars: 20, bass: 15, chords: 10, drums: 20, density: 30 },
  },

  // ---- Moeilijk: specifieke noten/akkoorden - vraagt echt geoefend luisteren ----
  //   {
  //   id: "melody-start-note",
  //   category: "Melodie",
  //   difficulty: "hard",
  //   prompt: "Op welke noot begint de melodie?",
  //   numOptions: 4,
  //   getValue: (s) => pitchClassName(s.melody[0].pitch),
  //   optionPool: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  //   isApplicable: (s) => s.melody.length > 0,
  //   audible: {
  //     instrument: (s) => GENRES.find((g) => g.id === s.config.genre)!.instruments.melody,
  //     pitchFor: (s, label) => pitchForLabelNearOctave(label, s.melody[0].pitch),
  //   },
  //   // isolating one pitch is harder with more going on around it
  //   difficultyWeights: { bars: 5, bass: 10, chords: 10, drums: 10, density: 10 },
  // },
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

// ---------------------------------------------------------------------------
// Difficulty rating: BASE_RATING plus each of this trait's weights dotted
// against the song's own parameter vector (booleans as 0/1). Used both to
// compute a specific song's rating (the Elo "opponent") and, via the search
// below, to choose the params that land closest to a target rating.
// ---------------------------------------------------------------------------
function ratingForTrait(trait: TraitDefinition, params: SongParams): number {
  const w = trait.difficultyWeights;
  return (
    BASE_RATING +
    w.bars * params.bars +
    w.bass * (params.bass ? 1 : 0) +
    w.chords * (params.chords ? 1 : 0) +
    w.drums * (params.drums ? 1 : 0) +
    w.density * params.density
  );
}

const BARS_CANDIDATES = [2, 3, 4, 5, 6, 7, 8];
const DENSITY_CANDIDATES = [0.25, 0.5, 0.85]; // thin / medium / busy, matching densityBucket's own thresholds

/** Picks (bars, bass, chords, drums, density) for `genre` whose rating for `trait` lands as close as possible to `targetRating`. */
export function pickSongParamsForTrait(trait: TraitDefinition, genre: GenreDefinition, targetRating: number): SongParams {
  const chordsOptions = trait.requiresChords ? [true] : [true, false];
  const drumsOptions = genre.hasDrums ? [true, false] : [false];

  let best: SongParams | null = null;
  let bestDist = Infinity;
  for (const bars of BARS_CANDIDATES) {
    for (const density of DENSITY_CANDIDATES) {
      for (const bass of [true, false]) {
        for (const drums of drumsOptions) {
          for (const chords of chordsOptions) {
            const params: SongParams = { bars, bass, chords, drums, density };
            const dist = Math.abs(ratingForTrait(trait, params) - targetRating);
            if (dist < bestDist) {
              bestDist = dist;
              best = params;
            }
          }
        }
      }
    }
  }
  return best!;
}

/** Same idea, but for a known song whose bars/density are fixed by the transcription - only the layer booleans are searched. */
function pickKnownSongLayers(
  trait: TraitDefinition,
  bars: number,
  genre: GenreDefinition,
  targetRating: number
): Pick<SongParams, "bass" | "chords" | "drums"> {
  const chordsOptions = trait.requiresChords ? [true] : [true, false];
  const drumsOptions = genre.hasDrums ? [true, false] : [false];

  let best: Pick<SongParams, "bass" | "chords" | "drums"> | null = null;
  let bestDist = Infinity;
  for (const bass of [true, false]) {
    for (const drums of drumsOptions) {
      for (const chords of chordsOptions) {
        const params: SongParams = { bars, bass, chords, drums, density: KNOWN_SONG_DENSITY };
        const dist = Math.abs(ratingForTrait(trait, params) - targetRating);
        if (dist < bestDist) {
          bestDist = dist;
          best = { bass, chords, drums };
        }
      }
    }
  }
  return best!;
}

function pickTrait(recentTraitIds: string[]): TraitDefinition {
  let candidates = TRAITS.filter((t) => !recentTraitIds.includes(t.id));
  if (candidates.length === 0) candidates = TRAITS;
  return pickRandom(candidates);
}

// A trait's isApplicable can depend on the melody's actual (randomly
// generated) content, not just its params - e.g. "does the melody move" -
// so a few retries cover the rare case where the first attempt doesn't
// satisfy it, without touching the chosen difficulty params.
const MAX_APPLICABILITY_RETRIES = 5;

function generateSongForTrait(
  trait: TraitDefinition,
  targetRating: number,
  forcedSongId?: string
): { song: GeneratedSong; songRating: number } {
  // Traits with their own builder need control over the melody, so they never use a known song.
  const knownEntry = trait.buildSong
    ? undefined
    : forcedSongId
    ? KNOWN_SONGS.find((s) => s.id === forcedSongId)
    : Math.random() < KNOWN_SONG_CHANCE && KNOWN_SONGS.length > 0
      ? KNOWN_SONGS[Math.floor(Math.random() * KNOWN_SONGS.length)]
      : undefined;

  if (knownEntry) {
    const classical = GENRES.find((g) => g.id === "classical")!;
    const bars = knownSongBars(knownEntry);
    const layers = pickKnownSongLayers(trait, bars, classical, targetRating);
    const songRating = ratingForTrait(trait, { bars, density: KNOWN_SONG_DENSITY, ...layers });
    let song = buildKnownSong(knownEntry, layers);
    for (let attempt = 0; trait.isApplicable && !trait.isApplicable(song) && attempt < MAX_APPLICABILITY_RETRIES; attempt++) {
      song = buildKnownSong(knownEntry, layers);
    }
    return { song, songRating };
  }

  const genre = pickRandom(GENRES);
  const params = pickSongParamsForTrait(trait, genre, targetRating);
  const songRating = ratingForTrait(trait, params);
  const build = trait.buildSong ?? generateSongFromParams;
  let song = build(genre, params);
  for (let attempt = 0; trait.isApplicable && !trait.isApplicable(song) && attempt < MAX_APPLICABILITY_RETRIES; attempt++) {
    song = build(genre, params);
  }
  return { song, songRating };
}

function buildQuestionFromTrait(trait: TraitDefinition, song: GeneratedSong, songRating: number): Question {
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
    songRating,
  };
}

export interface GeneratorOptions {
  /** Current Elo rating per trait id - looked up for whichever trait gets picked, to target that question's song difficulty. */
  playerRatings: Record<string, number>;
  recentTraitIds?: string[];
  /** When set, always use this KNOWN_SONGS entry instead of a random/generated song - for auditioning a specific song against the quiz. */
  forcedSongId?: string;
}

/**
 * Picks a trait/question type first, then generates a song shaped for it:
 * its params are chosen so that trait's difficulty rating lands close to the
 * player's current rating for that trait (an Elo match between the two).
 */
export function generateQuestion(options: GeneratorOptions): Question {
  const { playerRatings, recentTraitIds = [], forcedSongId } = options;
  const trait = pickTrait(recentTraitIds);
  const targetRating = playerRatings[trait.id] ?? BASE_RATING;
  const { song, songRating } = generateSongForTrait(trait, targetRating, forcedSongId);
  return buildQuestionFromTrait(trait, song, songRating);
}
