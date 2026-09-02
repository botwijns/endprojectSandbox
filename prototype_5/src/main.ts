import {GameLoop} from "./gameLoop.ts";
import {InputHandler} from "./inputHandler.ts";
import {createInitialState,  generateNumberSequence, generateSequence} from "./gameState.ts";
import {SynthManager} from "./audio/SynthManager.ts";
import {InstrumentManager, INSTRUMENTS, type InstrumentDef} from "./audio/InstrumentManager.ts";
import {Howl, Howler} from "howler";

const debug= !('ontouchstart' in window) && navigator.maxTouchPoints === 0;
const synth = new SynthManager();
const instruments = new InstrumentManager();
const input = new InputHandler(debug);
const state = createInitialState();
const scoreEl = document.getElementById("score")!;
const phaseEl = document.getElementById("phase")!;
const collectionEl = document.getElementById("collection")!;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const logEl = document.getElementById("log")!;

// total instruments the player must collect (everything except the drums)
const CATCHABLE = INSTRUMENTS.filter(i => !i.isDrum);
const MAX_STRIKES = 3;

// catch-by-ear timing (seconds unless noted)
let biteTimer = 0;             // time since last melody
let nextBiteDelay = 2;         // wait before the next melody
let catchWindowUntil = 0;      // performance.now() timestamp the current window closes
// Reeling is tracked inside InputHandler (on every pointermove, with a circle
// fit for the drifting centre). Here we just mirror the running total.
let crankAngle = 0;           // signed degrees turned this reel-in
let crankVelocity = 0;        // change in crankAngle on the last tick
let isSoundPlaying = false;
const REEL_TARGET = 2 * 360;  // full turns needed to land the fish

function resetCrank(): void {
    crankAngle = 0;
    crankVelocity = 0;
    input.beginCrank();
}

function log(message: string): void {
    logEl.textContent = message;
}
// audio.load("footstep", { src: ["sounds/footstep.webm", "sounds/footstep.mp3"] });
// audio.load("bgm",      { src: ["sounds/bgm.webm", "sounds/bgm.mp3"], loop: true, volume: 0.4 });
// var soundLeft = new Howl({src: ["sounds/left.webm",    "sounds/left.mp3"]})
// audio.load("left",    { src: ["sounds/left.webm",    "sounds/left.mp3"]    });
// var soundRight = new Howl({src: ["sounds/right.webm",   "sounds/right.mp3"]});
// audio.load("right",   { src: ["sounds/right.webm",   "sounds/right.mp3"]   });
var soundSuccess = new Howl({src: ["sounds/success.webm", "sounds/success.mp3"]});
// audio.load("success", { src: ["sounds/success.webm", "sounds/success.mp3"] });
// audio.load("failure", { src: ["sounds/failure.webm", "sounds/failure.mp3"] });
var soundFailure = new Howl({src: ["sounds/failure.webm", "sounds/failure.mp3"]})
// audio.load("walking", { src: ["sounds/walking.webm", "sounds/walking.mp3"] });
// var soundWalking = new Howl({src: ["sounds/walking.webm", "sounds/walking.mp3"] });
// var soundFrog = new Howl({
//     src: ["sounds/frogCroak.webm", "sounds/frogCroak.wav", "sounds/frogCroak.mp3"],
//     loop: true
// })
var soundDobber = new Howl({
    src: ["sounds/dobber-real.mp3", "sounds/dobber-real.webm", "sounds/dobber-real.wav"],
    sprite: {
        land: [500,1500],
        caught: [3900,5000]
    }
})
var soundCaught = new Howl({
    src: ["sounds/fishCaught.webm", "sounds/fishCaught.wav", "sounds/fishCaught.mp3"],
    sprite: {
        caught: [2000, 5000]
    }
})
var soundFishingBackground = new Howl({src: ["sounds/fishing-background.webm", "sounds/fishing-background.mp3","sounds/fishing-background.wav"]})
var soundThrow = new Howl({src: ["sounds/throw-woosh.webm", "sounds/throw-woosh.wav", "sounds/throw-woosh.mp3"]})
var soundFishingReel = new Howl({src: ["sounds/fishingreel.webm", "sounds/fishingreel.mp3","sounds/fishingreel.wav"]})
var soundFishingReelThrow = new Howl({
    src: ["sounds/fishing-reel-throw.webm", "sounds/fishing-reel-throw.wav", "sounds/fishing-reel-throw.mp3"],
    sprite: {
        throw: [0,3000],
        reel: [5200,1000]
    }
})
// var soundBow = new Howl({
//     src: [ "sounds/bow.wav", "sounds/bow.mp3", "sounds/bow.webm"],
//     sprite: {
//         drawShort:    [966,   819],   // 1785 - 966
//         shootShort:   [1905, 3705],   // 5610 - 1905
//         hitShort:     [2801,  472],   // 3273 - 2801
//         drawMedium:   [4423,  889],   // 5312 - 4423
//         shootMedium:  [5340,  840],   // 6180 - 5340
//         hitMedium:    [6349, 1094],   // 7443 - 6349
//         drawLong:     [7492, 1827],   // 9319 - 7492
//         shootLong:    [9474,  784],   // 10258 - 9474
//         hitLong:      [10413, 740],   // 11153 - 10413
//     },
//     onload: () => console.log("bow loaded OK"),
//     onloaderror: (id, err) => console.error("bow LOAD ERROR", id, err),
//     onplayerror: (id, err) => console.error("bow PLAY ERROR", id, err),
//     });
// var soundArm = new Howl({src: ["sounds/arm.webm", "sounds/arm.mp3"]});
// audio.load("bow", {
//     src: ["sounds/bow.webm", "sounds/bow.mp3", "sounds/bow.wav"],
//     sprite: {
//         drawShort: [966, 1785],
//         shootShort: [1905,5610],
//         hitShort: [2801,3273],
//         drawMedium: [4423,5312],
//         shootMedium: [5340,6180],
//         hitMedium: [6349,7443],
//         drawLong: [7492, 9319],
//         shootLong: [9474,10258],
//         hitLong: [10413,11153]
//     }
// })
// How long to wait between playing audiocue
const STEP_INTERVAL = 2.0; // seconds
let stepTimer = 0;
// let volume = 1;
// let rate: number;
// let distance = -1;
var armBeta: number|null = null;
var armBetaBaseline: number|null = null;
// var alpha: number|null = null;
// var armAngleBaseline: number|null = null;
// @ts-ignore
var nextSound: boolean = true;
var nextSoundTimeout: ReturnType<typeof setTimeout> | null = null; // add this
// var armTime: number = 0;
function resetRoundState(): void {
    state.collectedInstruments = [];
    state.activeInstrument = null;
    state.pendingInstrument = null;
    state.strikes = 0;
    biteTimer = 0;
    nextBiteDelay = 2;
    catchWindowUntil = 0;
    resetCrank();
    instruments.stopAll();
}

function startRound(): void {
    updateUI()
    console.log("Starting Round");
    resetRoundState();
    const length = state.score + 3; // sequence grows each round
    state.sequence = generateSequence(length);
    state.playerInput = [];
    state.currentStep = 0;
    state.phase = "idle";
    stepTimer = 0;
    state.randomAngles = generateNumberSequence(3, -45,45)
    state.randomDistances = generateNumberSequence(3, 1,5)
    // armTime = 0;
    armBeta = null;
    state.drawnStage = 0
    state.drawn = false;
    state.armed = false;
    if (nextSoundTimeout !== null) {
        clearTimeout(nextSoundTimeout);
        nextSoundTimeout = null;
    }
    nextSound = true;
    soundFishingBackground.play()
    soundFishingBackground.volume(0.3)
    soundFishingBackground.loop(true)
}
// function generateSoundLocation(angle:number, distance:number): number[]{
//     const x = Math.sin(angle)*distance*5;
//     const y = Math.cos(angle)*distance*5;
//     log("x: "+x +" y: "+y + " distance: "+ distance);
//     return [x, y];
// }
// function handleInput(dir: Direction): void {
//     console.log(dir);
//     if (state.phase !== "playing") return;
//     // we always walk first, then we make the sound faster or slower
//     // audio.play("walking")
//     // soundWalking.play()
//     // console.log(dir)
//     // let xAfter = state.player.x
//     // if (dir=="left"){
//     //     xAfter--;
//     // }
//     // else{
//     //     xAfter ++;
//     // }
//     // const newDistance = Math.abs(state.randomNumbers[state.currentStep] - xAfter);
//     // if (newDistance<distance){
//     //     rate+=0.2;
//     // }
//     // else{
//     //     rate-=0.2;
//     // }
//     // distance = newDistance;
// }


const loop = new GameLoop((dt) => {
    if (!state.running) return;

    const orientation = input.getOrientation();
    //if beta is smaller than zero, we have crossed the z plane, to prevent errors, we will update the beta to a number that is always positive
    const beta = orientation.beta !== null
        ? 180 + orientation.beta
        : orientation.beta;
    // console.log(beta, gamma)
    stepTimer += dt;
    if (state.phase =="idle" && beta!==null){
        //only do this if beta is not null:
        if (armBetaBaseline== null){
            //set both to be at least something if it is null right now.
            armBetaBaseline = beta
            armBeta = beta
        }
        //idle so we wait for them to throw the line out.
        //each two seconds we record the orientation.
        if (stepTimer >= STEP_INTERVAL) {
            stepTimer = 0;
            // we compare to STEP_INTERVAL-2*STEP_INTERVAL seconds ago. when it hits 2*STEP_INTERVAL seconds, we reset it to the one of STEP_INTERVAL seconds ago
            armBetaBaseline = armBeta
            armBeta = beta
        }
        if (armBetaBaseline!==null && beta-armBetaBaseline>10){
            //if this is the case, the line is being thrown back, we do the following:
            // we play the sound of throwing the line back
            // we change the state to throwing, as we change the state, the baseline remains the same for the rest of the round
            soundThrow.play()
            state.phase = "throwing"
            updateUI()
        }
    }
    //wait a tick between phases
    else if(state.phase == "throwing"&&armBetaBaseline!==null && beta!==null){
        // all parameters are set, so we only check if the beta difference gets lower than 2?
        if (beta-armBetaBaseline<2){
            //in case the sound still plays, we stop and play the sound again for the actual throw
            soundThrow.stop()
            soundThrow.play()
            soundFishingReelThrow.play("throw")
            armBetaBaseline = null
            // set beta to null to ensure that we stay in this state for a little longer without triggering the next state
            setTimeout(() => {
                soundFishingReelThrow.stop()
                soundDobber.play("land")
                stepTimer=0
                biteTimer=0
                nextBiteDelay = 1.5 + Math.random()*2
                state.phase = "listening"
                log("luister goed...")
                updateUI()
            },1000)
        }
    }
    else if (state.phase == "listening"){
        // A fish = an instrument. Every so often one "bites" by playing its
        // melody. The player must tap while they hear a non-drum instrument to
        // catch it. Drums are a trap. Collect every catchable instrument to win.
        biteTimer += dt;

        // close the catch window once the melody (+ grace) is over
        if (state.activeInstrument !== null && performance.now() > catchWindowUntil) {
            state.activeInstrument = null;
            log("...weg. luister opnieuw");
        }

        if (state.activeInstrument === null && biteTimer >= nextBiteDelay) {
            biteTimer = 0;
            nextBiteDelay = 1.8 + Math.random() * 2.6;
            spawnBite();
        }

    }
    else if (state.phase == "reeling"){
        stepTimer += dt;
        const touching = input.getPointer() !== null;

        // reeling engages the instant the screen is touched
        if (touching && !isSoundPlaying) {
            soundFishingReel.loop(true);
            soundFishingReel.play();
            isSoundPlaying = true;
        } else if (!touching && isSoundPlaying) {
            soundFishingReel.loop(false);
            soundFishingReel.stop();
            isSoundPlaying = false;
        }

        // crank total is accumulated in InputHandler on every pointermove
        const total = input.getCrankDegrees();
        crankVelocity = total - crankAngle;
        crankAngle = total;

        // faster cranking -> faster reel sound
        if (isSoundPlaying) {
            soundFishingReel.rate(Math.min(2, Math.max(0.7, 0.7 + Math.abs(crankVelocity) / 8)));
        }

        // reeled in — two full turns — the outcome is revealed now
        if (Math.abs(crankAngle) >= REEL_TARGET) {
            resolveReel();
        } else if (stepTimer > 10 * STEP_INTERVAL) {
            // took too long — the fish shakes loose, keep fishing
            soundFishingReel.loop(false);
            soundFishingReel.stop();
            isSoundPlaying = false;
            soundFailure.play();
            state.pendingInstrument = null;
            resetCrank();
            state.phase = "idle";
            biteTimer = 0;
            nextBiteDelay = 2;
            log("de vis is los! luister opnieuw");
            updateUI();
        } else {
            log("binnenhalen: " + Math.round(Math.abs(crankAngle)) + "°");
        }
    }
    if (state.phase === "success" || state.phase =="failure") {
        state.currentStep = state.currentStep + 1;
        // create new target locations
        if (state.currentStep>2) {
            state.currentStep = 0
            state.randomAngles = generateNumberSequence(3,-45,45)
            state.randomDistances= generateNumberSequence(3,1,3)
        }

        resetRoundState()
        state.phase = "idle"
        updateUI()
    }
});

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Pick an instrument to "bite" and play its melody, opening the catch window. */
function spawnBite(): void {
    const drum = INSTRUMENTS.find(i => i.isDrum)!;
    const needed = CATCHABLE.filter(i => !state.collectedInstruments.includes(i.id));

    // ~25% drum trap; otherwise prefer a not-yet-unlocked instrument, but an
    // already-unlocked one can still bite (it just won't award a point).
    const roll = Math.random();
    let def: InstrumentDef;
    if (roll < 0.25 || needed.length === 0) {
        def = roll < 0.25 ? drum : pick(CATCHABLE);
    } else if (roll < 0.75) {
        def = pick(needed);
    } else {
        def = pick(CATCHABLE);
    }

    // the bobber dips — an audible "something's there" cue alongside the melody
    const dobberId = soundDobber.play("caught");
    soundDobber.volume(0.8, dobberId);

    const melodyDur = instruments.playMelody(def);
    state.activeInstrument = def.id;
    // window stays open for the melody plus a short grace period to react
    catchWindowUntil = performance.now() + melodyDur * 1000 + 600;
    log("🎣 er bijt iets...");
}

/**
 * The player commits by touching the screen: whatever is on the hook right now
 * (a melody they heard, the drums, or nothing) gets reeled in. Whether it was
 * the right call is only revealed once the reel-in finishes.
 */
function startReeling(): void {
    if (!state.running || state.phase !== "listening") return;

    state.pendingInstrument = state.activeInstrument; // may be null (touched during silence)
    state.activeInstrument = null;
    instruments.stopAll();
    resetCrank();
    stepTimer = 0;
    state.phase = "reeling";
    log("binnenhalen!");
    updateUI();
}

/** Land whatever was on the hook — the outcome (and any mistake sound) happens here. */
function resolveReel(): void {
    soundFishingReel.loop(false);
    soundFishingReel.stop();
    isSoundPlaying = false;
    soundCaught.play("caught");

    const id = state.pendingInstrument;
    const def = id ? INSTRUMENTS.find(i => i.id === id) ?? null : null;
    state.pendingInstrument = null;
    resetCrank();

    state.phase = "idle";
    biteTimer = 0;
    nextBiteDelay = 1.5 + Math.random() * 2;

    if (!def) {
        // reeled in an empty hook — the miss lands now, not when you touched
        soundFailure.volume(0.5);
        soundFailure.play();
        soundFailure.volume(1);
        log("niks aan de haak...");
    } else if (def.isDrum) {
        // the drums were the wrong call — the strike lands now
        state.strikes++;
        soundFailure.play();
        log(`fout ${state.strikes}/${MAX_STRIKES} — dat waren de drums!`);
        if (state.strikes >= MAX_STRIKES) state.phase = "failure";
    } else {
        const firstTime = !state.collectedInstruments.includes(def.id);
        if (firstTime) {
            state.collectedInstruments.push(def.id);
            state.score++;
        }
        soundCaught.stop()
        soundSuccess.play();
        log(firstTime ? `${def.label} gevangen!` : `${def.label} — al vrij, geen punt`);
        if (state.collectedInstruments.length >= CATCHABLE.length) state.phase = "success";
    }
    updateUI();
}

input.onPress(startReeling);

if (debug) {
    (window as any).__game = { state, INSTRUMENTS, crank: () => ({ crankAngle, crankVelocity, center: input.getCrankCenter() }) };
    // keyboard shortcuts so the ear mechanic can be tested on desktop
    window.addEventListener("keydown", (e) => {
        if (!state.running) return;
        if (e.key === "t" && state.phase === "idle") {
            soundThrow.play();
            state.phase = "throwing";
        } else if (e.key === "l") {
            biteTimer = 0;
            nextBiteDelay = 1;
            state.phase = "listening";
            updateUI();
        } else if (e.key === " ") {
            e.preventDefault();
            startReeling();
        }
    });
}

function updateUI(): void {
    scoreEl.textContent = `Score: ${state.score}`;
    phaseEl.textContent = {
        listening: "Luister goed...",
        reeling:   "binnenhalen!",
        success:   "gevangen!",
        failure:   "ontsnapt!",
        idle:      "idle",
        throwing:  "uitgooien!"
    }[state.phase];

    // the instrument on the hook stays hidden until the reel-in resolves
    const caught = CATCHABLE
        .map(i => `${state.collectedInstruments.includes(i.id) ? "✅" : "⬜"} ${i.label}`)
        .join("   ");
    collectionEl.textContent =
        `${caught}   |   drums: ${state.strikes}/${MAX_STRIKES}`;
}
let gameRunning = false;

startBtn.addEventListener("click", async () => {
    if (!gameRunning) {
        Howler.ctx?.resume();
        synth.resume();
        instruments.resume();

        const granted = await input.requestOrientationPermission();
        if (!granted) {
            startBtn.textContent = "Permission denied — tap to retry";
            return;
        }

        if (!instruments.isReady()) {
            startBtn.disabled = true;
            startBtn.textContent = "Instrumenten laden…";
            await instruments.preload();
            startBtn.disabled = false;
        }

        input.start();
        state.running = true;
        startRound();
        loop.start();
        startBtn.textContent = "Stop";
        gameRunning = true;
        updateUI();
    } else {
        state.running = false;
        input.stop();
        loop.stop();
        Howler.stop()
        // soundFrog.stop();
        // synth.stopAll();
        instruments.stopAll();
        soundFishingBackground.stop();
        startBtn.textContent = "Start";
        gameRunning = false;
    }
});