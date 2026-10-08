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
    src: string[] | null;
    placeholderMs: number;
}

export const INTRO_LINES = {
    // --- on land: the fisherman introduces casting -------------------------
    // TODO(speech): greeting + "today I'll teach you how to fish; first we cast the line"
    castIntro:     { src: null, placeholderMs: 3500 },
    // TODO(speech): "first pull the rod back, tilt your phone backwards" (he winds up while saying this)
    castWindUp:    { src: null, placeholderMs: 3000 },
    // TODO(speech): "...and then swing it forward to throw the line out" (he casts right after)
    castSwing:     { src: null, placeholderMs: 3000 },
    // TODO(speech): "now you try: pull your phone back, then swing it forward"
    castYourTurn:  { src: null, placeholderMs: 3000 },

    // --- under water: voice-over about the fish and reeling ----------------
    // TODO(speech): explain the sound of the fish: when a fish bites you hear a melody (demo bite plays after this)
    fishSounds:    { src: null, placeholderMs: 4000 },
    // TODO(speech): explain reeling: tap the screen when you hear the melody, then draw circles with your thumb (reel demo plays after this)
    reelExplain:   { src: null, placeholderMs: 4000 },
    // TODO(speech): "now catch one yourself: listen, tap when you hear a fish, and reel it in"
    catchYourTurn: { src: null, placeholderMs: 3000 },
} satisfies Record<string, SpeechLine>;

export type LineId = keyof typeof INTRO_LINES;

/** Anything with a mouth to animate while a line plays (the lakeside fisherman). */
export interface Talker {
    talk(ms: number): Promise<void>;
    stopTalking(): void;
}

const howls = new Map<LineId, Howl>();
let current: Howl | null = null;
let cancelCurrent: (() => void) | null = null;

/** Start loading every recorded line so the first playback isn't delayed. */
export function preloadLines(): void {
    for (const id of Object.keys(INTRO_LINES) as LineId[]) getHowl(id);
}

function getHowl(id: LineId): Howl | null {
    const line: SpeechLine = INTRO_LINES[id];
    if (!line.src) return null;
    let h = howls.get(id);
    if (!h) {
        h = new Howl({src: line.src, preload: true});
        howls.set(id, h);
    }
    return h;
}

/**
 * Play one line and resolve when it's over (or when stopLine() cancels it).
 * Pass the fisherman as `mouth` to move his mouth for the length of the line;
 * the under-water lines are a voice-over and pass nothing.
 */
export function playLine(id: LineId, mouth?: Talker): Promise<void> {
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

        const howl = getHowl(id);
        if (!howl) {
            // placeholder until the recording exists
            void mouth?.talk(INTRO_LINES[id].placeholderMs);
            const timer = setTimeout(finish, INTRO_LINES[id].placeholderMs);
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
