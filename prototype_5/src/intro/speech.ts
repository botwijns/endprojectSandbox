import {Howl} from "howler";

// The fisherman's recorded lines for the intro level. Each line is one audio
// file (paths are relative to /public, like the other sounds). While `src` is
// still null the line is a silent placeholder that just waits `placeholderMs`,
// so the intro can be played through before the recordings exist.
//
// TODO(speech): record each line and fill in its `src`, e.g.
//   castIntro: { src: ["sounds/intro/cast-intro.webm", "sounds/intro/cast-intro.mp3"], placeholderMs: 3500 },
// `placeholderMs` is only used while `src` is null.

export interface SpeechLine {
    src: string | string[] | null;
    placeholderMs: number;
}

export const INTRO_LINES = {
    // --- on land: the fisherman introduces casting -------------------------
    // TODO(speech): greeting + "today I'll teach you how to fish; first we cast the line"
    castIntro:     { src: ["sounds/intro_vissen_1.mp3"], placeholderMs: 3500 },
    // TODO(speech): "first pull the rod back, tilt your phone backwards" (he winds up while saying this)
    castWindUp:    { src: ["sounds/intro_vissen_2.mp3"], placeholderMs: 3000 },
    // TODO(speech): "...and then swing it forward to throw the line out" (he casts right after)
    castSwing:     { src: ["sounds/intro_vissen_3.mp3"], placeholderMs: 3000 },
    // TODO(speech): "now you try: pull your phone back, then swing it forward"
    castYourTurn:  { src: ["sounds/intro_vissen_4.mp3"], placeholderMs: 3000 },

    // --- under water: voice-over about the fish and reeling ----------------
    // TODO(speech): explain the sound of the fish: when a fish bites you hear a melody (demo bite plays after this)
    fishSounds:    { src: ["sounds/intro_vissen_5.mp3"], placeholderMs: 4000 },
    // TODO(speech): explain reeling: tap the screen when you hear the melody, then draw circles with your thumb (reel demo plays after this)
    reelExplain:   { src: ["sounds/intro_vissen_6.mp3"], placeholderMs: 4000 },
    // TODO(speech): "now catch one yourself: listen, tap when you hear a fish, and reel it in"
    catchYourTurn: { src: ["sounds/intro_vissen_7.mp3"], placeholderMs: 3000 },
    endTutorial:   { src: ["sounds/intro_vissen_8.mp3"], placeholderMs: 3000 },
} satisfies Record<string, SpeechLine>;

export type LineId = keyof typeof INTRO_LINES;

// --- the full game: the day's task list --------------------------------------
export const GAME_LINES = {
    // TODO(speech): "Een nieuwe dag! Vandaag moet je deze vissen vangen:" (the list follows)
    dayStart:      { src: "sounds/prompts_vissen_1.mp3", placeholderMs: 3000 },
    // TODO(speech): "Je moet nog vangen:" (played when the top-left corner is tapped; the list follows)
    taskListIntro: { src: "sounds/prompts_vissen_2.mp3", placeholderMs: 1500 },
    // TODO(speech): "Die stond op je lijstje!"
    onList:        { src: "sounds/prompts_vissen_3.mp3", placeholderMs: 1500 },
    // TODO(speech): "Die staat niet op je lijstje, terug het water in."
    notOnList:     { src: "sounds/prompts_vissen_4.mp3", placeholderMs: 2500 },
    // TODO(speech): "Die heb je vandaag al gevangen, terug het water in."
    alreadyCaught: { src: "sounds/prompts_vissen_5.mp3", placeholderMs: 2500 },
    // TODO(speech): "Je lijstje is af! Tijd om naar huis te gaan."
    dayDone:       { src: "sounds/prompts_vissen_6.mp3", placeholderMs: 2500 },
    // TODO(speech): "Alle dagen voltooid! Goed gevist."
    gameDone:      { src: "sounds/prompts_vissen_7.mp3", placeholderMs: 2500 },
} satisfies Record<string, SpeechLine>;

export type GameLineId = keyof typeof GAME_LINES;

// The name of every fish, said before its sound when the task list is read out.
// Keyed by the fish id in audio/InstrumentManager.ts.
export const FISH_NAME_LINES: Record<string, SpeechLine> = {
    trumpetfish: { src: "sounds/vissen_namen_1.mp3", placeholderMs: 1000 },
    guitarfish:  { src: "sounds/vissen_namen_2.mp3", placeholderMs: 1000 },
    fiddlerray:  { src: "sounds/vissen_namen_3.mp3", placeholderMs: 1000 },
    seabass:     { src: "sounds/vissen_namen_4.mp3", placeholderMs: 1000 },
    drumfish:    { src: "sounds/vissen_namen_5.mp3", placeholderMs: 1000 },
    hammerhead:  { src: "sounds/vissen_namen_6.mp3", placeholderMs: 1000 },
    sawfish:     { src: "sounds/vissen_namen_7.mp3", placeholderMs: 1000 },
    pufferfish:  { src: "sounds/vissen_namen_8.mp3", placeholderMs: 1000 },
    parrotfish:  { src: "sounds/vissen_namen_9.mp3", placeholderMs: 1000 },
    seahorse:    { src: "sounds/vissen_namen_10.mp3", placeholderMs: 1000 },
    // TODO(speech): "Kikvorsvis"
    frogfish:    { src: "sounds/vissen_namen_11.mp3", placeholderMs: 1000 },
    swordfish:   { src: "sounds/vissen_namen_12.mp3", placeholderMs: 1000 },
};

/** Anything with a mouth to animate while a line plays (the lakeside fisherman). */
export interface Talker {
    talk(ms: number): Promise<void>;
    stopTalking(): void;
}

const howls = new Map<SpeechLine, Howl>();
let current: Howl | null = null;
let cancelCurrent: (() => void) | null = null;

/** Start loading the intro's recorded lines so the first playback isn't delayed.
 *  (Not the game's: decoding all of them at once made the intro's start stutter.) */
export function preloadLines(): void {
    for (const line of Object.values(INTRO_LINES) as SpeechLine[]) getHowl(line);
}

function getHowl(line: SpeechLine): Howl | null {
    if (!line.src) return null;
    let h = howls.get(line);
    if (!h) {
        h = new Howl({src: line.src, preload: true});
        howls.set(line, h);
    }
    return h;
}

/** Play one intro line — see playSpeech(). */
export function playLine(id: LineId, mouth?: Talker): Promise<void> {
    return playSpeech(INTRO_LINES[id], mouth);
}

/** Play one game line — see playSpeech(). */
export function playGameLine(id: GameLineId): Promise<void> {
    return playSpeech(GAME_LINES[id]);
}

/**
 * Play one line and resolve when it's over (or when stopLine() cancels it).
 * Pass the fisherman as `mouth` to move his mouth for the length of the line;
 * the under-water lines are a voice-over and pass nothing.
 */
export function playSpeech(line: SpeechLine, mouth?: Talker): Promise<void> {
    stopLine();
    return new Promise<void>(resolve => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            current = null;
            cancelCurrent = null;
            mouth?.stopTalking();
            resolve();
        };
        cancelCurrent = () => { current?.stop(); finish(); };

        const howl = getHowl(line);
        if (!howl) {
            // placeholder until the recording exists
            void mouth?.talk(line.placeholderMs);
            const timer = setTimeout(finish, line.placeholderMs);
            cancelCurrent = () => { clearTimeout(timer); finish(); };
            return;
        }
        current = howl;
        const start = () => {
            if (done) return;
            const soundId = howl.play();
            void mouth?.talk(howl.duration(soundId) * 1000);
            howl.once("end", finish, soundId);
        };
        if (howl.state() === "loaded") start();
        else {
            howl.once("load", start);
            howl.once("loaderror", finish); // a missing file shouldn't stall the intro
        }
    });
}

/** Cut off whatever line is playing; its playLine() promise resolves. */
export function stopLine(): void {
    cancelCurrent?.();
}
