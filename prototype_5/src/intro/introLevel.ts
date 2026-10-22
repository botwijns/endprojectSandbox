import type {Howl} from "howler";
import type {FishDef} from "../audio/InstrumentManager.ts";
import {createLakesideScene, type LakesideScene} from "./lakesideScene.ts";
import {createHookReelScene, type HookReelScene} from "./hookReelScene.ts";
import {playLine, preloadLines, stopLine} from "./speech.ts";

// The intro level ("oefenlevel"), told in two scenes. Every step is explained
// and shown, then practised by the player before the next one:
//  1. On land (Lakeside Cast): the fisherman explains and shows pulling the rod
//     back -> the player tilts back; he explains and shows the swing -> the
//     player swings forward.
//  2. Under water (Hook and Reel): a voice explains what a biting fish sounds
//     like, with a demo bite -> the player taps on a practice bite; it explains
//     reeling, with a demo reel-in -> the player reels a fish in.
// The practice moves are single gestures detected by main.ts (waitForGesture).
// The game's own phase machine never runs during the intro.

export interface IntroSounds {
    throw: Howl;
    reelThrow: Howl;  // sprites: throw, reel
    dobber: Howl;     // sprites: land, caught
    reel: Howl;       // the reeling loop
    catching: Howl;   // sprites: success, repeat, failure, escaped
}

/** One practice move the intro waits for (see waitForGesture in main.ts). */
export type Gesture = "tiltBack" | "swingForward" | "tap" | "crank";

export interface GestureOptions {
    /** tap: only count a tap while this returns true (e.g. while a fish bites). */
    accept?: () => boolean;
    /** crank: degrees to turn before it counts (default 720, two turns). */
    crankDegrees?: number;
    /** crank: every tick, progress 0..1, degrees turned this tick, and whether a finger is down. */
    onCrank?: (progress: number, velocity: number, touching: boolean) => void;
}

export interface IntroDeps {
    land: HTMLElement;     // layer for the lakeside scene
    water: HTMLElement;    // layer for the hook-and-reel scene
    caption: HTMLElement;  // short on-screen hint during the player's turns
    sounds: IntroSounds;
    demoFish: FishDef;
    playMelody(def: FishDef): number; // returns the duration in seconds
    stopMelody(): void;
    /** Swap the lakeside ambience for the under-water one. */
    goUnderwater(): void;
    /** Resolve once the player has done `gesture`. */
    waitForGesture(gesture: Gesture, opts?: GestureOptions): Promise<void>;
    /** Light up (or switch off) the task-list button in the top-left corner. */
    highlightTaskList(on: boolean): void;
    /** The intro is over: wrap up and go back to the start screen. */
    onFinished(): void;
}

export interface IntroLevel {
    start(): void;
    /** Freeze the script and show `text` (the intro is done). */
    finish(text: string): void;
    /** Debug: cut the current speech line short. */
    skipLine(): void;
    destroy(): void;
}

const TILT_CAPTION = "Jouw beurt! Trek je telefoon rustig naar achteren.";
const SWING_CAPTION = "Jouw beurt! Zwaai je telefoon nu naar voren.";
// const TAP_CAPTION = "Jouw beurt! Raak het scherm aan zodra je de vis hoort.";
const CRANK_CAPTION = "Jouw beurt! Draai rondjes met je duim om de vis binnen te halen.";

export function createIntroLevel(deps: IntroDeps): IntroLevel {
    const {sounds} = deps;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    preloadLines(); // only the intro's own lines; the game's load when first played
    const fisherman: LakesideScene = createLakesideScene(deps.land);
    const water: HookReelScene = createHookReelScene(deps.water);
    // only the scene on screen animates: drawing both every frame made the intro lag
    water.setPaused(true);

    function sleep(ms: number): Promise<void> {
        return new Promise(res => {
            const t = setTimeout(() => { timers.delete(t); res(); }, ms);
            timers.add(t);
        });
    }

    function showLayer(which: "land" | "water"): void {
        deps.land.classList.toggle("active", which === "land");
        deps.water.classList.toggle("active", which === "water");
    }

    function setCaption(text: string): void {
        deps.caption.textContent = text;
        deps.caption.hidden = text === "";
    }

    /** The bobber's out: reel it back to the rod tip, with the reel sound. */
    // async function reelBackIn(): Promise<void> {
    //     sounds.reel.loop(true);
    //     sounds.reel.play();
    //     await fisherman.reelIn();
    //     sounds.reel.loop(false);
    //     sounds.reel.stop();
    // }

    /** The fisherman casts, with the same sounds as the game's real cast
     *  (see the "throwing" phase in main.ts). Resolves when the bobber lands. */
    async function castWithSounds(): Promise<void> {
        sounds.throw.stop();
        sounds.throw.play();
        const throwId = sounds.reelThrow.play("throw");
        await fisherman.swing();
        sounds.reelThrow.stop(throwId);
        sounds.dobber.play("land");
    }

    /** A fish bites: the same cue as in the game (dobber + the fish's melody).
     *  Returns the melody's length in ms. */
    function bite(): number {
        water.showBite(true);
        const id = sounds.dobber.play("caught");
        sounds.dobber.volume(0.8, id);
        return deps.playMelody(deps.demoFish) * 1000;
    }

    // --- 1. on land: explain, show and practise the cast ----------------------
    async function explainCast(): Promise<void> {
        showLayer("land");
        setCaption("");
        await sleep(900); // let the scene fade in
        if (destroyed) return;

        await playLine("castIntro", fisherman);
        if (destroyed) return;

        // show: he pulls the rod back while explaining it
        const windLine = playLine("castWindUp", fisherman);
        await sleep(7000);
        if (destroyed) return;
        sounds.throw.play();
        await castWithSounds();
        sounds.reel.play()
        await fisherman.reelIn();
        sounds.reel.stop();
        await windLine;
        if (destroyed) return;

        if (destroyed) return;

        // practise: the player tilts back, he copies it
        setCaption(TILT_CAPTION);
        await deps.waitForGesture("tiltBack");
        if (destroyed) return;
        setCaption("");
        sounds.throw.play();
        await fisherman.windUp();
        await sleep(600);
        if (destroyed) return;

        // show: the swing forward (the rod is still held back)
        await playLine("castSwing", fisherman);
        if (destroyed) return;
        // await castWithSounds();
        // await sleep(1500);
        // if (destroyed) return;

        // practise: get the rod back up, then the player swings forward
        // await reelBackIn();
        // if (destroyed) return;
        // await fisherman.windUp();
        // if (destroyed) return;
        setCaption(SWING_CAPTION);
        await deps.waitForGesture("swingForward");
        if (destroyed) return;
        setCaption("");
        await castWithSounds();
        if (destroyed) return;

        // the task-list button lights up during this line
        deps.highlightTaskList(true);
        await playLine("castYourTurn", fisherman);
        deps.highlightTaskList(false);
        await sleep(500);
        if (destroyed) return;

        void explainWater();
    }

    // --- 2. under water: explain, show and practise the bite and the reeling --
    async function explainWater(): Promise<void> {
        deps.goUnderwater();
        water.setPaused(false);
        showLayer("water");
        await sleep(1000);
        if (destroyed) return;
        fisherman.setPaused(true); // faded out by now (0.8s cross-fade)

        // show: what a biting fish sounds like
        await playLine("fishSounds");
        if (destroyed) return;
        await sleep(bite() + 1200);
        if (destroyed) return;
        // water.showEscape(); // this one gets away, so the player can hook the next
        await sleep(2000);
        if (destroyed) return;

        // // practise: tap while a fish bites; a missed one swims off and another comes
        // setCaption(TAP_CAPTION);
        // let biting = false, hooked = false;
        // const tapped = deps.waitForGesture("tap", {accept: () => biting}).then(() => { hooked = true; });
        // while (!destroyed && !hooked) {
        //     const ms = bite();
        //     biting = true;
        //     await Promise.race([tapped, sleep(ms + 600)]);
        //     biting = false;
        //     if (hooked || destroyed) break;
        //     water.showEscape();
        //     await sleep(2500);
        // }
        // if (destroyed) return;
        // deps.stopMelody();
        // setCaption("");

        // show: reeling in — the reel spins and the hooked fish is pulled up and out
        await playLine("reelExplain");
        if (destroyed) return;
        water.showReel();
        sounds.reel.loop(true);
        sounds.reel.play();
        await sleep(2700);
        sounds.reel.loop(false);
        sounds.reel.stop();
        if (destroyed) return;
        // sounds.catching.play("success");
        await sleep(3000); // the hook comes back down with fresh bait
        if (destroyed) return;

        // practise: another fish bites and gets hooked, the player reels it in
        await playLine("catchYourTurn");
        if (destroyed) return;
        await sleep(bite() + 400);
        if (destroyed) return;
        setCaption(CRANK_CAPTION);
        let reeling = false;
        const stopReelSound = () => {
            sounds.reel.loop(false);
            sounds.reel.stop();
            sounds.reel.rate(1);
            reeling = false;
        };
        await deps.waitForGesture("crank", {
            crankDegrees: 720,
            onCrank: (progress, velocity, touching) => {
                water.driveReel(progress, velocity);
                // same reel sound as the game: on while touching, faster when cranking faster
                if (touching && !reeling) {
                    sounds.reel.loop(true);
                    sounds.reel.play();
                    reeling = true;
                } else if (!touching && reeling) stopReelSound();
                if (reeling) sounds.reel.rate(Math.min(2, Math.max(0.7, 0.7 + Math.abs(velocity) / 8)));
            },
        });
        stopReelSound();
        if (destroyed) return;
        setCaption("");
        water.land();
        // sounds.catching.play("success");
        await sleep(2500);
        if (destroyed) return;

        await playLine("endTutorial");
        if (destroyed) return;
        deps.onFinished();
    }

    return {
        start() { void explainCast(); },

        finish(text) { setCaption(text); },
        skipLine: stopLine,

        destroy() {
            destroyed = true;
            stopLine();
            deps.highlightTaskList(false);
            for (const t of timers) clearTimeout(t);
            timers.clear();
            fisherman.destroy();
            water.destroy();
            deps.land.classList.remove("active");
            deps.water.classList.remove("active");
            setCaption("");
        },
    };
}
