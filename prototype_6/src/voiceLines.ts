import type { MelodicInstrument } from "./briefs.ts";

// Every line this prototype says out loud, in one place. Each line is one audio
// file (paths are relative to /public, like the other sounds). While `src` is
// still null the line is read out by the browser's text-to-speech from `text`,
// so the game stays playable before the recordings exist. `text` is also the
// script for the recording.
//
// TODO(speech): record each line and fill in its `src`, e.g.
//   welcome: { text: "...", src: ["sounds/sfeer_intro_1.webm", "sounds/sfeer_intro_1.mp3"] },
// Some sentences are built from several lines (e.g. "Nummer 2." + a brief):
// those parts are recorded separately and played back to back — see speak().

export interface VoiceLine {
    /** what is said: the recording script, and the text-to-speech fallback */
    text: string;
    /** the recording, or null to fall back to text-to-speech */
    src: string | string[] | null;
}

// --- intro level: the fisherman at the campfire (see intro/introLevel.ts) ----
export const INTRO_LINES = {
    // TODO(speech): record → sounds/sfeer_intro_1.mp3
    welcome:    { text: "Oké, bij een goed vuurtje hoort ook een lekker liedje.", src: "sounds/sfeer_intro_1.mp3" },
    // TODO(speech): record → sounds/sfeer_intro_2.mp3
    teach:      { text: "En dat ga jij voor ons maken. Geen zorgen, ik ga het je allemaal leren.", src: "sounds/sfeer_intro_2.mp3" },
    // TODO(speech): record → sounds/sfeer_intro_3.mp3 (the beat starts right after this)
    instrument: { text: "Kijk, dit is je muziekinstrument. En we gaan korte liedjes maken van een paar tellen. Ik zal je alvast een ritme geven.", src: "sounds/sfeer_intro_3.mp3" },
    // TODO(speech): record → sounds/sfeer_intro_4.mp3 (then waits for the first note)
    tap:        { text: "Oké, als je nu op het scherm drukt, dan verschijnt er een pianonoot in het liedje.", src: "sounds/sfeer_intro_4.mp3" },
    // TODO(speech): record → sounds/sfeer_intro_5.mp3
    pitch:      { text: "Juist! Deze noot kan hoog en laag zijn, afhankelijk van hoe hoog je op het scherm tikt.", src: "sounds/sfeer_intro_5.mp3" },
    // TODO(speech): record → sounds/sfeer_intro_6.mp3 (then waits for two more notes)
    more:       { text: "Probeer maar wat meer noten toe te voegen!", src: "sounds/sfeer_intro_6.mp3" },
    // TODO(speech): record → sounds/sfeer_intro_7.mp3 (then waits for a note with another instrument)
    switch:     { text: "Juist! Nou, als je een ander instrument wil, moet je rechtsonder in de hoek klikken om te wisselen. Plaats ook wat noten met de gitaar!", src: "sounds/sfeer_intro_7.mp3" },
    // TODO(speech): record → sounds/sfeer_intro_8.mp3 (then waits for a remove)
    remove:     { text: "Kijk! Dat begint al ergens op te lijken. Als laatste kan je linksonder de laatste noot die je geplaatst hebt wissen. Probeer dat ook even!", src: "sounds/sfeer_intro_8.mp3" },
    // TODO(speech): record → sounds/sfeer_intro_9.mp3 (then waits for a shake)
    shake:      { text: "Laatste noot is gewist! Top! Als je klaar bent, schud de telefoon heen en weer. Dan is het nummer af.", src: "sounds/sfeer_intro_9.mp3" },
    // TODO(speech): record → sounds/sfeer_intro_10.mp3 (after the finished song has played back)
    outro:      { text: "Dat klinkt erg goed!", src: "sounds/sfeer_intro_10.mp3" },
} satisfies Record<string, VoiceLine>;

export type IntroLineId = keyof typeof INTRO_LINES;

// --- the full game ------------------------------------------------------------
export const GAME_LINES = {
    // TODO(speech): record → sounds/sfeer_prompts_1.mp3 (start screen → game)
    tapToStart:    { text: "Tik drie keer om te beginnen.", src: null },
    // TODO(speech): record → sounds/sfeer_prompts_2.mp3 (remove pressed with nothing placed)
    nothingPlaced: { text: "nog geen noot geplaatst", src: null },
    // TODO(speech): record → sounds/sfeer_prompts_3.mp3 — said as "stap 3" + "gewist" + instrument name
    erased:        { text: "gewist", src: null },
    // TODO(speech): record → sounds/sfeer_prompts_4.mp3 — said as "stap 3" + "was al leeg"
    alreadyEmpty:  { text: "was al leeg", src: null },
    // TODO(speech): record → sounds/sfeer_prompts_5.mp3 — said as "Je mixtape is klaar, met" + "7 nummers." + "Luister maar."
    mixtapeReady:  { text: "Je mixtape is klaar, met", src: null },
    // TODO(speech): record → sounds/sfeer_prompts_6.mp3
    listen:        { text: "Luister maar.", src: null },
} satisfies Record<string, VoiceLine>;

// --- the briefs: said when a brief starts ("Nummer 2." + say) and when it's done (praise)
export const BRIEF_LINES = {
    vrolijk: {
        // TODO(speech): record → sounds/sfeer_brief_vrolijk.mp3
        say:    { text: "Maak iets vrolijks. Een liedje voor een zonnige dag.", src: null },
        // TODO(speech): record → sounds/sfeer_praise_vrolijk.mp3
        praise: { text: "Mooi! Dat klinkt lekker vrolijk.", src: null },
    },
    stoer: {
        // TODO(speech): record → sounds/sfeer_brief_stoer.mp3
        say:    { text: "Maak iets stoers. Muziek voor een held.", src: null },
        // TODO(speech): record → sounds/sfeer_praise_stoer.mp3
        praise: { text: "Vet. Dat is echt stoer.", src: null },
    },
    spannend: {
        // TODO(speech): record → sounds/sfeer_brief_spannend.mp3
        say:    { text: "Nu iets spannends. Alsof er zo iets gaat gebeuren.", src: null },
        // TODO(speech): record → sounds/sfeer_praise_spannend.mp3
        praise: { text: "Kippenvel! Lekker spannend.", src: null },
    },
    spookachtig: {
        // TODO(speech): record → sounds/sfeer_brief_spookachtig.mp3
        say:    { text: "Maak iets spookachtigs. Muziek voor een spookhuis.", src: null },
        // TODO(speech): record → sounds/sfeer_praise_spookachtig.mp3
        praise: { text: "Brr. Daar krijg ik de rillingen van.", src: null },
    },
    onderwater: {
        // TODO(speech): record → sounds/sfeer_brief_onderwater.mp3
        say:    { text: "Maak muziek voor onder water. Rustig en dromerig.", src: null },
        // TODO(speech): record → sounds/sfeer_praise_onderwater.mp3
        praise: { text: "Het klinkt of ik echt onder water zwem.", src: null },
    },
    feest: {
        // TODO(speech): record → sounds/sfeer_brief_feest.mp3
        say:    { text: "Maak feestmuziek. Iets om lekker op te dansen.", src: null },
        // TODO(speech): record → sounds/sfeer_praise_feest.mp3
        praise: { text: "Feest! Iedereen gaat dansen.", src: null },
    },
    slaapliedje: {
        // TODO(speech): record → sounds/sfeer_brief_slaapliedje.mp3
        say:    { text: "Maak een slaapliedje. Heel rustig en zacht.", src: null },
        // TODO(speech): record → sounds/sfeer_praise_slaapliedje.mp3
        praise: { text: "Zo rustig. Daar word je slaperig van.", src: null },
    },
} satisfies Record<string, { say: VoiceLine; praise: VoiceLine }>;

export type BriefId = keyof typeof BRIEF_LINES;

// --- instrument names: said when switching instrument, and after "gewist" ----
export const INSTRUMENT_LINES: Record<MelodicInstrument, VoiceLine> = {
    // TODO(speech): record each name → sounds/sfeer_instrument_<id>.mp3
    piano:            { text: "piano", src: null },
    electricPiano:    { text: "elektrische piano", src: null },
    distortionGuitar: { text: "rockgitaar", src: null },
    electricBass:     { text: "basgitaar", src: null },
    slapBass:         { text: "slapbas", src: null },
    cello:            { text: "cello", src: null },
    contrabass:       { text: "contrabas", src: null },
    trumpet:          { text: "trompet", src: null },
    synthPad:         { text: "droomklank", src: null },
    steelDrums:       { text: "steeldrum", src: null },
};

// --- numbers ------------------------------------------------------------------
// Index 0 is number 1. A number past the end of a list falls back to
// text-to-speech (the combined/ shell can ask for up to 20 tracks).

// said when a brief starts, before the brief itself
// TODO(speech): record each → sounds/sfeer_nummer_<n>.mp3
export const TRACK_NUMBER_LINES: VoiceLine[] = [
    { text: "Nummer 1.", src: null },
    { text: "Nummer 2.", src: null },
    { text: "Nummer 3.", src: null },
    { text: "Nummer 4.", src: null },
    { text: "Nummer 5.", src: null },
    { text: "Nummer 6.", src: null },
    { text: "Nummer 7.", src: null },
];

// said when a note is removed (a bar has 8 steps)
// TODO(speech): record each → sounds/sfeer_stap_<n>.mp3
export const STEP_LINES: VoiceLine[] = [
    { text: "stap 1", src: null },
    { text: "stap 2", src: null },
    { text: "stap 3", src: null },
    { text: "stap 4", src: null },
    { text: "stap 5", src: null },
    { text: "stap 6", src: null },
    { text: "stap 7", src: null },
    { text: "stap 8", src: null },
];

// said at the end: "Je mixtape is klaar, met" + this + "Luister maar."
// TODO(speech): record each → sounds/sfeer_aantal_<n>.mp3
export const TRACK_COUNT_LINES: VoiceLine[] = [
    { text: "1 nummer.", src: null },
    { text: "2 nummers.", src: null },
    { text: "3 nummers.", src: null },
    { text: "4 nummers.", src: null },
    { text: "5 nummers.", src: null },
    { text: "6 nummers.", src: null },
    { text: "7 nummers.", src: null },
];

/** The line for number `n` (1-based) from one of the lists above. */
export function numbered(lines: VoiceLine[], n: number, fallbackText: string): VoiceLine {
    return lines[n - 1] ?? { text: fallbackText, src: null };
}
