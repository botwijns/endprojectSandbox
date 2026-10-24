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
// The host's script, in the order it is said (see the introduction section of
// main.ts). Some sentences are split where a side or corner lights up on a word.
export const INTRO_LINES = {
    // TODO(speech): record → sounds/quiz_intro_1.mp3
    welcome:      { text: "Welkom bij de Muziekquiz van vandaag! Ik ben Quintin, jullie quizmaster. We gaan nu testen of je naast muziek maken ook goed kan luisteren naar muziek. Ik laat een audiofragment horen en dan stel ik daar een vraag over.", src: "sounds/quiz_intro_1.mp3" },
    // TODO(speech): record → sounds/quiz_intro_2.mp3, _3 ("links of", left lights up) and _4 ("rechts te klikken", right lights up)
    howToAnswer:  { text: "Daar geef je antwoord op door twee keer op het antwoord", src: "sounds/quiz_intro_2.mp3" },
    howLeft:      { text: "links of", src: "sounds/quiz_intro_3.mp3" },
    howRight:     { text: "rechts te klikken.", src: "sounds/quiz_intro_4.mp3" },
    // TODO(speech): record → sounds/quiz_intro_5.mp3
    shake:        { text: "Als je de vraag en antwoorden opnieuw wil horen, schud dan met je telefoon!", src: "sounds/quiz_intro_5.mp3" },
    // TODO(speech): record → sounds/quiz_intro_6.mp3
    letsGo:       { text: "Oké, daar gaan we!", src: "sounds/quiz_intro_6.mp3" },
    // TODO(speech): record → sounds/quiz_intro_7.mp3 (then a piece plays twice, once with drums and once without)
    drumsQuestion: { text: "In welk liedje zitten er drums?", src: "sounds/quiz_intro_7.mp3" },
    // TODO(speech): record → sounds/quiz_intro_8.mp3 / _9 (the answers of the drums question)
    firstSong:    { text: "Eerste liedje", src: "sounds/quiz_intro_8.mp3" },
    secondSong:   { text: "Tweede liedje", src: "sounds/quiz_intro_9.mp3" },
    // TODO(speech): record → sounds/quiz_intro_10.mp3 (after a right practice answer)
    wellDone:     { text: "Goedzo!", src: "sounds/quiz_intro_10.mp3" },
    // TODO(speech): record → sounds/quiz_intro_11.mp3 (then each corner's name as it lights up: POSITION_LINES)
    fourAnswers:  { text: "Soms zijn er vier antwoorden:", src: "sounds/quiz_intro_11.mp3" },
    // TODO(speech): record → sounds/quiz_intro_12.mp3
    notesQuestion: { text: "Hoeveel noten zitten er in dit liedje?", src: "sounds/quiz_intro_12.mp3" },
    // TODO(speech): record → sounds/quiz_intro_13.mp3 (after a wrong practice answer)
    tryAgain:     { text: "Probeer het nog eens met een nieuw stukje.", src: "sounds/quiz_intro_13.mp3" },
    // TODO(speech): record → sounds/quiz_intro_14.mp3
    done:         { text: "Goed gedaan! Je kent nu de quiz.", src: "sounds/quiz_intro_14.mp3" },
    // TODO(speech): record → sounds/quiz_intro_15.mp3 (after "done", only when not in the combined/ shell)
    backToStart:  { text: "Terug naar het startscherm.", src: null },
} satisfies Record<string, VoiceLine>;

// --- answer positions by name: the intro reads its answers as "links: ..." -----
// TODO(speech): record each → sounds/quiz_positie_<name>.mp3
export const POSITION_LINES: Record<2 | 4, VoiceLine[]> = {
    2: [
        { text: "links:", src: "sounds/quiz_positie_a.mp3" },
        { text: "rechts:", src: "sounds/quiz_positie_b2.mp3" },
    ],
    4: [
        { text: "linksboven:", src: "sounds/quiz_positie_a.mp3" },
        { text: "rechtsboven:", src: "sounds/quiz_positie_b.mp3" },
        { text: "linksonder:", src: "sounds/quiz_positie_c.mp3" },
        { text: "rechtsonder:", src: "sounds/quiz_positie_d.mp3" },
    ],
};

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
    "has-drums":                { text: "Zitten er drums in dit stuk?", src: "sounds/quiz_vraag_1.mp3" },
    "motif-repeats":            { text: "Hoor je een stukje muziek dat steeds terugkomt?", src: "sounds/quiz_vraag_2.mp3" },
    "melody-instrument-family": { text: "Tot welke familie hoort het instrument van de melodie?", src: "sounds/quiz_vraag_3.mp3" },
    "chords-instrument-family": { text: "Wat speelt de akkoorden eronder?", src: "sounds/quiz_vraag_4.mp3" },
    "beats-per-bar":            { text: "Hoeveel tellen zitten er in elke maat?", src: "sounds/quiz_vraag_5.mp3" },
    "melody-note-count":        { text: "Uit hoeveel noten bestaat de melodie?", src: "sounds/quiz_vraag_6.mp3" },
    "melody-direction-start":   { text: "Gaat de melodie aan het begin omhoog of omlaag?", src: "sounds/quiz_vraag_7.mp3" },
    "melody-direction-end":     { text: "Gaat de melodie aan het einde omhoog of omlaag?", src: "sounds/quiz_vraag_8.mp3" },
    "motif-count":              { text: "Hoeveel keer hoor je het stukje dat terugkomt?", src: "sounds/quiz_vraag_9.mp3" },
    // traits that are switched off in questionGenerator.ts:
    // "tempo-broad":       { text: "Hoe zou je het tempo omschrijven?", src: null },
    // "density":           { text: "Hoe druk voelt het arrangement?", src: null },
    // "melody-start-note": { text: "Op welke noot begint de melodie?", src: null },
};

// --- answers, keyed by the option text the question generator produces --------
export const ANSWER_LINES: Record<string, VoiceLine> = {
    // TODO(speech): record each → sounds/quiz_antwoord_<answer>.mp3
    "ja":     { text: "ja", src: "sounds/quiz_antwoord_ja.mp3" },
    "nee":    { text: "nee", src: "sounds/quiz_antwoord_nee.mp3" },
    "omhoog": { text: "omhoog", src: "sounds/quiz_antwoord_omhoog.mp3" },
    "omlaag": { text: "omlaag", src: "sounds/quiz_antwoord_omlaag.mp3" },

    // instrument families (INSTRUMENT_FAMILY in songGenerator.ts)
    "Piano/toetsen": { text: "Piano/toetsen", src: "sounds/quiz_instrument_1.mp3" },
    "Gitaar":        { text: "Gitaar", src: "sounds/quiz_instrument_2.mp3" },
    "Strijkers":     { text: "Strijkers", src: "sounds/quiz_instrument_3.mp3" },
    "Koper":         { text: "Koper", src: "sounds/quiz_instrument_4.mp3" },
    "Hout":          { text: "Hout", src: "sounds/quiz_instrument_5.mp3" },
    "Synth":         { text: "Synth", src: "sounds/quiz_instrument_6.mp3" },

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

/** The name of answer position `index` in a `count`-answer layout ("links", "rechtsonder", ...). */
export function positionLine(index: number, count: number): VoiceLine {
    return POSITION_LINES[count <= 2 ? 2 : 4][index];
}

/** The line for an answer position ("A"–"D"). */
export function letterLine(letter: string): VoiceLine {
    return LETTER_LINES[letter] ?? { text: `${letter}.`, src: null };
}
