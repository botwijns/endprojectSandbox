import type {Howl} from "howler";
import type {FishDef} from "../audio/InstrumentManager.ts";
import {createLakesideScene, type LakesideScene} from "./lakesideScene.ts";
import {createHookReelScene, type HookReelScene} from "./hookReelScene.ts";
import {playLine, preloadLines, stopLine} from "./speech.ts";

// The intro level ("oefenlevel"), told in two scenes:
//  1. On land (Lakeside Cast): the fisherman explains casting and shows it,
//     then the player casts for real with the phone. He mirrors their moves.
//  2. Under water (Hook and Reel): a voice explains what a biting fish sounds
//     like and how reeling works, with a demo of each, then the player catches
//     one fish for real. The hook and reel follow the player's thumb.
// The real cast/listen/reel detection is the game's own phase machine in
// main.ts. This script only pauses/resumes it and is told about every phase
// change, bite and reel tick, so the scenes can follow along.

export interface IntroSounds {
    throw: Howl;
    reelThrow: Howl;  // sprites: throw, reel
    dobber: Howl;     // sprites: land, caught
    reel: Howl;       // the reeling loop
    catching: Howl;   // sprites: success, repeat, failure, escaped
}

export interface IntroDeps {
    land: HTMLElement;     // layer for the lakeside scene
    water: HTMLElement;    // layer for the hook-and-reel scene
    caption: HTMLElement;  // short on-screen hint during the player's turns
    sounds: IntroSounds;
    demoFish: FishDef;
    playMelody(def: FishDef): number; // returns the duration in seconds
    /** Let the game's phase machine run (the player's turn). */
    resume(): void;
    /** Hold the game's phase machine (while the intro explains). */
    pause(): void;
}

export interface IntroLevel {
    start(): void;
    /** The game's phase changed (idle/throwing/waiting/listening/reeling/...). */
    onPhase(phase: string): void;
    /** A fish bit (its melody started). */
    onBite(): void;
    /** The catch window closed without a tap. */
    onBiteMissed(): void;
    /** Reeling tick: progress 0..1 and crank degrees turned this tick. */
    onReel(progress: number, velocity: number): void;
    /** Reeled too slowly: the fish shook loose. */
    onReelAbandoned(): void;
    /** The reel-in finished (with or without a fish). */
    onLanded(): void;
    /** The tutorial fish was landed: freeze the script and show `text`. */
    finish(text: string): void;
    setCaption(text: string): void;
    /** Debug: cut the current speech line short. */
    skipLine(): void;
    destroy(): void;
}

const CAST_TURN_CAPTION = "Jouw beurt! Trek je telefoon naar achteren en zwaai hem dan naar voren.";
const CATCH_TURN_CAPTION = "Jouw beurt! Hoor je een melodie? Raak het scherm aan en draai rondjes met je duim.";

export function createIntroLevel(deps: IntroDeps): IntroLevel {
    const {sounds} = deps;
    // "explain-cast" -> "player-cast" -> "explain-water" -> "player-catch"
    let stage: "explain-cast" | "player-cast" | "explain-water" | "player-catch" | "done" = "explain-cast";
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    preloadLines();
    const fisherman: LakesideScene = createLakesideScene(deps.land);
    const water: HookReelScene = createHookReelScene(deps.water);

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

    // --- 1. on land: explain and show the cast --------------------------------
    async function explainCast(): Promise<void> {
        showLayer("land");
        setCaption("");
        await sleep(900); // let the scene fade in
        if (destroyed) return;

        // TODO(speech): castIntro — greeting + introduce casting
        await playLine("castIntro", fisherman);
        if (destroyed) return;

        // TODO(speech): castWindUp — he pulls the rod back while explaining it
        const windLine = playLine("castWindUp", fisherman);
        await sleep(700);
        if (destroyed) return;
        sounds.throw.play();
        await fisherman.windUp();
        await windLine;
        if (destroyed) return;

        // TODO(speech): castSwing — "and swing it forward", then he casts
        await playLine("castSwing", fisherman);
        if (destroyed) return;
        // same sounds as the game's real cast (see the "throwing" phase in main.ts)
        sounds.throw.stop();
        sounds.throw.play();
        const throwId = sounds.reelThrow.play("throw");
        await fisherman.swing(); // resolves when the bobber lands
        if (destroyed) return;
        sounds.reelThrow.stop(throwId);
        sounds.dobber.play("land");
        await sleep(1500);
        if (destroyed) return;

        // reel the bobber back in, so the player can cast it themselves
        sounds.reel.loop(true);
        sounds.reel.play();
        await fisherman.reelIn();
        sounds.reel.loop(false);
        sounds.reel.stop();
        if (destroyed) return;

        // TODO(speech): castYourTurn — "now you try"
        await playLine("castYourTurn", fisherman);
        if (destroyed) return;

        stage = "player-cast";
        setCaption(CAST_TURN_CAPTION);
        deps.resume(); // the game's idle/throwing detection takes over
    }

    // --- 2. under water: explain the fish sound and reeling -------------------
    async function explainWater(): Promise<void> {
        stage = "explain-water";
        setCaption("");
        await sleep(1400); // let the splash play out on land first
        if (destroyed) return;
        showLayer("water");
        await sleep(1000);
        if (destroyed) return;

        // TODO(speech): fishSounds — explain what a biting fish sounds like
        await playLine("fishSounds");
        if (destroyed) return;
        // demo bite: the same cue as a real bite (dobber + the fish's melody)
        water.showBite(true);
        const dobberId = sounds.dobber.play("caught");
        sounds.dobber.volume(0.8, dobberId);
        const melodySec = deps.playMelody(deps.demoFish);
        await sleep(melodySec * 1000 + 1200);
        if (destroyed) return;

        // TODO(speech): reelExplain — explain tapping + reeling with your thumb
        await playLine("reelExplain");
        if (destroyed) return;
        // demo reel-in: the reel spins and the fish is pulled up and out
        water.showReel();
        sounds.reel.loop(true);
        sounds.reel.play();
        await sleep(2700);
        sounds.reel.loop(false);
        sounds.reel.stop();
        if (destroyed) return;
        sounds.catching.play("success");
        await sleep(3000); // the hook comes back down with fresh bait
        if (destroyed) return;

        // TODO(speech): catchYourTurn — "now catch one yourself"
        await playLine("catchYourTurn");
        if (destroyed) return;

        stage = "player-catch";
        setCaption(CATCH_TURN_CAPTION);
        deps.resume(); // the game's listening/reeling takes over
    }

    return {
        start() { void explainCast(); },

        onPhase(phase) {
            if (destroyed) return;
            if (stage === "player-cast" || stage === "player-catch") {
                // the fisherman copies the player's cast
                if (phase === "throwing") void fisherman.windUp();
                else if (phase === "waiting") void fisherman.swing();
            }
            if (phase === "listening") {
                if (stage === "player-cast") {
                    // first real cast landed: hold the game and explain the water part
                    deps.pause();
                    void explainWater();
                } else if (stage === "player-catch") {
                    // a re-cast after an empty reel-in: straight back under water
                    void sleep(1400).then(() => { if (!destroyed) showLayer("water"); });
                    setCaption(CATCH_TURN_CAPTION);
                }
            } else if (phase === "idle" && stage === "player-catch") {
                // reeled in an empty hook: the line is back on land, cast again
                void sleep(2500).then(() => {
                    if (destroyed || stage !== "player-catch") return;
                    void fisherman.reelIn(); // ready for the next cast
                    showLayer("land");
                    setCaption(CAST_TURN_CAPTION);
                });
            }
        },

        onBite() { if (stage === "player-catch") water.showBite(true); },
        onBiteMissed() { if (stage === "player-catch") water.showEscape(); },
        onReel(progress, velocity) { if (stage === "player-catch") water.driveReel(progress, velocity); },
        onReelAbandoned() {
            if (stage !== "player-catch") return;
            water.showEscape();
            water.dropHook();
        },
        onLanded() { if (stage === "player-catch") water.land(); },

        finish(text) {
            stage = "done";
            setCaption(text);
        },
        setCaption,
        skipLine: stopLine,

        destroy() {
            destroyed = true;
            stopLine();
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
