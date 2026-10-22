// Every line this prototype says out loud, in one place. Each line is one audio
// file (paths are relative to /public, like the other sounds). While `src` is
// still null the line is read out by the browser's text-to-speech from `text`,
// so the quiz stays playable before the recordings exist. `text` is also the
// script for the recording.
//
// TODO(speech): record each line and fill in its `src`, e.g.
//   loading: { text: "...", src: ["sounds/quiz_prompts_1.webm", "sounds/quiz_prompts_1.mp3"] },
// Some sentences are built from several lines (e.g. "B." + "omhoog"): those
// parts are recorded separately and played back to back — see speak().

export interface VoiceLine {
    /** what is said: the recording script, and the text-to-speech fallback */
    text: string;
    /** the recording, or null to fall back to text-to-speech */
    src: string | string[] | null;
}

// --- intro ("oefenlevel") -------------------------------------------------------
export const INTRO_LINES = {
    // the preview: each caption is shown on screen, said, and then its sound plays
    // TODO(speech): record → sounds/quiz_intro_1.mp3 (a piece with drums plays after this)
    previewDrums:    { text: "Luister eerst. Dit is een stukje muziek mét drums.", src: null },
    // TODO(speech): record → sounds/quiz_intro_2.mp3 (the same piece without drums plays after this)
    previewNoDrums:  { text: "En dit is hetzelfde stukje zónder drums.", src: null },
    // TODO(speech): record → sounds/quiz_intro_3.mp3 (then "A", "B" as the zones light up)
    previewTwoZones: { text: "Soms zijn er twee antwoorden: links en rechts.", src: null },
    // TODO(speech): record → sounds/quiz_intro_4.mp3 (then "A", "B", "C", "D")
    previewFourZones: { text: "Soms zijn er vier antwoorden, één in elke hoek.", src: null },
    // TODO(speech): record → sounds/quiz_intro_5.mp3 (the practice questions start after this)
    ready:           { text: "Klaar? Daar gaan we — volg de aanwijzingen.", src: null },

    // the practice questions: said right before the question itself
    // TODO(speech): record → sounds/quiz_intro_6.mp3
    practice1:       { text: "Eerste oefenvraag.", src: null },
    // TODO(speech): record → sounds/quiz_intro_7.mp3
    practice2:       { text: "Nu zijn er vier antwoorden, één in elke hoek. Wil je de vraag nog eens horen? Schud dan je telefoon.", src: null },
    // TODO(speech): record → sounds/quiz_intro_8.mp3 (after a wrong practice answer)
    tryAgain:        { text: "Probeer het nog eens met een nieuw stukje.", src: null },
    // TODO(speech): record → sounds/quiz_intro_9.mp3
    done:            { text: "Goed gedaan! Je kent nu de quiz.", src: null },
    // TODO(speech): record → sounds/quiz_intro_10.mp3 (after "done", only when not in the combined/ shell)
    backToStart:     { text: "Terug naar het startscherm.", src: null },
} satisfies Record<string, VoiceLine>;

// --- the quiz -----------------------------------------------------------------
export const GAME_LINES = {
    // TODO(speech): record → sounds/quiz_prompts_1.mp3 (while the instruments are still loading)
    loading:   { text: "Instrumenten laden, momentje.", src: null },
    // TODO(speech): record → sounds/quiz_prompts_2.mp3
    quizStart: { text: "Daar gaan we. Luister goed.", src: null },
    // TODO(speech): record → sounds/quiz_prompts_3.mp3 — after a wrong answer: "Het was" + the right answer
    itWas:     { text: "Het was", src: null },
    // TODO(speech): record → sounds/quiz_prompts_4.mp3 — after a wrong "which note" answer, the note plays after this
    rightNote: { text: "Dit was de juiste noot:", src: null },
} satisfies Record<string, VoiceLine>;

// --- answer positions: "A." + the answer when an option is read out ----------
// TODO(speech): record each → sounds/quiz_letter_<a-d>.mp3
export const LETTER_LINES: Record<string, VoiceLine> = {
    A: { text: "A.", src: null },   // left / top left
    B: { text: "B.", src: null },   // right / top right
    C: { text: "C.", src: null },   // bottom left
    D: { text: "D.", src: null },   // bottom right
};

// --- questions, keyed by trait id (questionGenerator.ts) ------------------------
// Keep `text` the same as the trait's `prompt` there: that one is what's logged.
export const QUESTION_LINES: Record<string, VoiceLine> = {
    // TODO(speech): record each → sounds/quiz_vraag_<trait id>.mp3
    "has-drums":                { text: "Zitten er drums in dit stuk?", src: null },
    "motif-repeats":            { text: "Hoor je een stukje muziek dat steeds terugkomt?", src: null },
    "melody-instrument-family": { text: "Tot welke familie hoort het instrument van de melodie?", src: null },
    "chords-instrument-family": { text: "Wat speelt de akkoorden eronder?", src: null },
    "beats-per-bar":            { text: "Hoeveel tellen zitten er in elke maat?", src: null },
    "melody-note-count":        { text: "Uit hoeveel noten bestaat de melodie?", src: null },
    "melody-direction-start":   { text: "Gaat de melodie aan het begin omhoog of omlaag?", src: null },
    "melody-direction-end":     { text: "Gaat de melodie aan het einde omhoog of omlaag?", src: null },
    "motif-count":              { text: "Hoeveel keer hoor je het stukje dat terugkomt?", src: null },
    // traits that are switched off in questionGenerator.ts:
    // "tempo-broad":       { text: "Hoe zou je het tempo omschrijven?", src: null },
    // "density":           { text: "Hoe druk voelt het arrangement?", src: null },
    // "melody-start-note": { text: "Op welke noot begint de melodie?", src: null },
};

// --- answers, keyed by the option text the question generator produces --------
export const ANSWER_LINES: Record<string, VoiceLine> = {
    // TODO(speech): record each → sounds/quiz_antwoord_<answer>.mp3
    "ja":     { text: "ja", src: null },
    "nee":    { text: "nee", src: null },
    "omhoog": { text: "omhoog", src: null },
    "omlaag": { text: "omlaag", src: null },

    // instrument families (INSTRUMENT_FAMILY in songGenerator.ts)
    "Piano/toetsen": { text: "Piano/toetsen", src: null },
    "Gitaar":        { text: "Gitaar", src: null },
    "Strijkers":     { text: "Strijkers", src: null },
    "Koper":         { text: "Koper", src: null },
    "Hout":          { text: "Hout", src: null },
    "Synth":         { text: "Synth", src: null },

    // counts: beats per bar (2–6), repeats (2–5) and melody notes (any number;
    // a count without a line here is read out by text-to-speech)
    "1":  { text: "1", src: null },
    "2":  { text: "2", src: null },
    "3":  { text: "3", src: null },
    "4":  { text: "4", src: null },
    "5":  { text: "5", src: null },
    "6":  { text: "6", src: null },
    "7":  { text: "7", src: null },
    "8":  { text: "8", src: null },
    "9":  { text: "9", src: null },
    "10": { text: "10", src: null },
    "11": { text: "11", src: null },
    "12": { text: "12", src: null },
    "13": { text: "13", src: null },
    "14": { text: "14", src: null },
    "15": { text: "15", src: null },
    "16": { text: "16", src: null },
};

/** The line for a question; one without a line here is read out from `prompt`. */
export function questionLine(traitId: string, prompt: string): VoiceLine {
    return QUESTION_LINES[traitId] ?? { text: prompt, src: null };
}

/** The line for an answer option; one without a line here is read out as-is. */
export function answerLine(option: string): VoiceLine {
    return ANSWER_LINES[option] ?? { text: option, src: null };
}

/** The line for an answer position ("A"–"D"). */
export function letterLine(letter: string): VoiceLine {
    return LETTER_LINES[letter] ?? { text: `${letter}.`, src: null };
}
