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
const logEl = document.getElementById("log")!;
const instructionEl = document.getElementById("instruction")!;
const startScreenEl = document.getElementById("start-screen")!;
const gameScreenEl = document.getElementById("game-screen")!;
const startNoteEl = document.getElementById("start-note")!;
const introBtn = document.getElementById("intro-btn") as HTMLButtonElement;
const gameBtn = document.getElementById("game-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;

// total instruments the player must collect (everything except the drums)
const CATCHABLE = INSTRUMENTS.filter(i => !i.isDrum);
const MAX_STRIKES = 3;

// --- introduction level -----------------------------------------------------
// The intro is a guided tutorial: it first plays a demo of a catchable fish and
// of the drum trap so the player knows what each sounds like, then the on-screen
// instruction walks them through every phase. Drums never bite during the intro
// and landing a single fish completes it, returning to the start screen.
let gameRunning = false;   // a round (intro or full game) is currently active
let introMode = false;     // currently playing the guided tutorial
let introComplete = false; // the tutorial fish has been landed — freeze play
let introDemoActive = false; // playing the "this is a fish / these are drums" demo
let runId = 0;             // bumped on every start/stop so async work can bail out
let demoTimer: ReturnType<typeof setTimeout> | null = null;
let introEndTimer: ReturnType<typeof setTimeout> | null = null;

const INTRO_DONE_TEXT =
    "🎉 Goed gedaan! Je hebt je eerste vis gevangen. Terug naar het startscherm...";

// what to do right now, keyed by phase
const INTRO_STEPS: Record<string, string> = {
    idle:      "Stap 1 van 4 — Trek je telefoon rustig naar achteren, alsof je een hengel terughaalt.",
    throwing:  "Stap 2 van 4 — Gooi je telefoon naar voren om de lijn uit te werpen.",
    listening: "Stap 3 van 4 — Luister. Hoor je een instrument een melodie spelen? Raak dan het scherm aan. Hoor je stilte? Wacht op de volgende.",
    reeling:   "Stap 4 van 4 — Draai met je duim rondjes op het scherm tot de vis binnen is.",
    success:   "Gevangen!",
    failure:   "De vis ontsnapte — geen zorgen, je hoort de volgende zo weer.",
};

const PHASE_HINTS: Record<string, string> = {
    idle:      "Trek je telefoon naar achteren om de hengel terug te halen.",
    throwing:  "Gooi je telefoon naar voren om uit te werpen.",
    listening: "Luister. Melodie? Raak het scherm aan. Drums of stilte? Doe niks.",
    reeling:   "Draai met je duim rondjes op het scherm om binnen te halen.",
    success:   "Gevangen! 🎣",
    failure:   "Ontsnapt...",
};

function updateInstruction(text?: string): void {
    if (text !== undefined) {
        instructionEl.textContent = text;
        return;
    }
    if (introDemoActive) return;      // the demo owns the instruction text
    if (introComplete) {
        instructionEl.textContent = INTRO_DONE_TEXT;
        return;
    }
    const table = introMode ? INTRO_STEPS : PHASE_HINTS;
    instructionEl.textContent = table[state.phase] ?? "";
}

/**
 * Play a short listening demo: a catchable fish's melody, then the drum trap,
 * each with a caption, so the player learns the difference before fishing.
 * Resolves when done; bails out immediately if the session is stopped (runId).
 */
function runIntroDemo(myRun: number): Promise<void> {
    return new Promise((resolve) => {
        const goodFish = INSTRUMENTS.find(i => i.id === "guitar")!;
        const drums = INSTRUMENTS.find(i => i.isDrum)!;
        const steps: { text: string; def: InstrumentDef; gap: number }[] = [
            { text: "Luister eerst. Dít is een vis — een melodie. Zó eentje wil je vangen:", def: goodFish, gap: 5000 },
            { text: "En dít zijn de drums — een kale dreun, geen melodie. Die laat je zwemmen:", def: drums, gap: 5000 },
            { text: "Nog een keer de vis (vangen)...", def: goodFish, gap: 2000 },
            { text: "...en de drums (níét vangen).", def: drums, gap: 2000 },
        ];

        introDemoActive = true;
        let i = 0;
        const step = (): void => {
            if (myRun !== runId) { resolve(); return; }   // stopped mid-demo
            if (i >= steps.length) {
                introDemoActive = false;
                instructionEl.textContent = "Klaar? Daar gaan we — volg de aanwijzingen.";
                demoTimer = setTimeout(resolve, 1300);
                return;
            }
            const s = steps[i++];
            instructionEl.textContent = s.text;
            const dur = instruments.playMelody(s.def);
            demoTimer = setTimeout(step, dur * 1000 + s.gap);
        };
        step();
    });
}

function finishIntro(): void {
    // land the tutorial fish, then drop back to the start screen once the catch
    // sound and the congratulations have had a moment to register.
    introComplete = true;
    updateInstruction();
    soundFishingBackground.fade(soundFishingBackground.volume() as number, 0, 1600);
    introEndTimer = setTimeout(() => {
        stopGame();
        startNoteEl.hidden = false;
        startNoteEl.textContent = "✅ Oefenlevel voltooid! Druk op ‘Start spel’ voor het hele spel.";
        introBtn.textContent = "Oefenlevel opnieuw";
    }, 2200);
}

function showStartScreen(): void {
    gameScreenEl.hidden = true;
    startScreenEl.hidden = false;
}

function showGameScreen(): void {
    startScreenEl.hidden = true;
    gameScreenEl.hidden = false;
}

/** Full teardown — stop everything and return to the start screen. */
function stopGame(): void {
    runId++;                       // invalidate any in-flight demo / timers
    introDemoActive = false;
    introComplete = false;
    if (demoTimer !== null) { clearTimeout(demoTimer); demoTimer = null; }
    if (introEndTimer !== null) { clearTimeout(introEndTimer); introEndTimer = null; }
    state.running = false;
    input.stop();
    loop.stop();
    Howler.stop();
    instruments.stopAll();
    soundFishingBackground.stop();
    gameRunning = false;
    introBtn.disabled = false;
    gameBtn.disabled = false;
    instructionEl.textContent = "";
    log("");
    showStartScreen();
}

/** Shared start path for both the intro and the full game. */
async function startGame(asIntro: boolean): Promise<void> {
    if (gameRunning) return;
    const myRun = ++runId;

    Howler.ctx?.resume();
    synth.resume();
    instruments.resume();

    const granted = await input.requestOrientationPermission();
    if (myRun !== runId) return;
    if (!granted) {
        startNoteEl.hidden = false;
        startNoteEl.textContent = "Geen toegang tot de bewegingssensor — tik nogmaals om opnieuw te proberen.";
        return;
    }

    if (!instruments.isReady()) {
        introBtn.disabled = true;
        gameBtn.disabled = true;
        startNoteEl.hidden = false;
        startNoteEl.textContent = "Instrumenten laden…";
        await instruments.preload();
        if (myRun !== runId) return;
        introBtn.disabled = false;
        gameBtn.disabled = false;
    }
    startNoteEl.hidden = true;

    introMode = asIntro;
    introComplete = false;
    introDemoActive = asIntro;   // suppress the step text until the demo is done
    state.score = 0;
    state.collectedInstruments = [];

    showGameScreen();
    input.start();
    startRound();                  // phase -> idle, background music on (loop not running yet)
    gameRunning = true;

    if (asIntro) {
        await runIntroDemo(myRun);
        if (myRun !== runId) return; // stopped during the demo
    }

    state.running = true;
    loop.start();
    updateUI();
}

// catch-by-ear timing (seconds unless noted)
let biteTimer = 0;             // time since last melody
let nextBiteDelay = 2;         // wait before the next melody
let catchWindowUntil = 0;      // performance.now() timestamp the current window closes
// Reeling is tracked inside InputHandler (on every pointermove, with a circle
// fit for the drifting centre). Here we just mirror the running total.
let crankAngle = 0;           // signed degrees turned this reel-in
let crankVelocity = 0;        // change in crankAngle on the last tick
let isSoundPlaying = false;
const REEL_TARGET = 3 * 360;  // full turns needed to land the fish

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
// var soundSuccess = new Howl({src: ["sounds/success.webm", "sounds/success.mp3"]});
// audio.load("success", { src: ["sounds/success.webm", "sounds/success.mp3"] });
// audio.load("failure", { src: ["sounds/failure.webm", "sounds/failure.mp3"] });
// var soundFailure = new Howl({src: ["sounds/failure.webm", "sounds/failure.mp3"]})
// audio.load("walking", { src: ["sounds/walking.webm", "sounds/walking.mp3"] });
// var soundWalking = new Howl({src: ["sounds/walking.webm", "sounds/walking.mp3"] });
// var soundFrog = new Howl({
//     src: ["sounds/frogCroak.webm", "sounds/frogCroak.wav", "sounds/frogCroak.mp3"],
//     loop: true
// })
var soundCatching = new Howl({
    src: ["sounds/vissen vangen_edited.mp3"],
    sprite: {
        success: [0,1586],
        repeat: [1586,1742],
        failure: [3328,2680],
        escaped: [6008,1545]
}})
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
const STEP_INTERVAL = 4.0; // seconds
let stepTimer = 0;
var armBeta: number|null = null;
var armBetaBaseline: number|null = null;
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



const loop = new GameLoop((dt) => {
    if (!state.running) return;
    if (introComplete) return; // tutorial fish landed — hold everything still

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
            nextBiteDelay = 4 + Math.random() * 2.6;
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
            // soundFailure.play();
            soundCatching.play("escaped")
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

    // the tutorial never uses the drum trap — a catchable fish always bites
    if (introMode) {
        const def = pick(needed.length ? needed : CATCHABLE);
        const dobberId = soundDobber.play("caught");
        soundDobber.volume(0.8, dobberId);
        const melodyDur = instruments.playMelody(def);
        state.activeInstrument = def.id;
        catchWindowUntil = performance.now() + melodyDur * 1000 + 600;
        log("🎣 er bijt iets — raak het scherm aan!");
        return;
    }

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
        // soundFailure.volume(0.5);
        // soundFailure.play();
        // soundFailure.volume(1);
        soundCatching.play("escaped")
        log("niks aan de haak...");
    } else if (def.isDrum) {
        // the drums were the wrong call — the strike lands now
        state.strikes++;
        soundCatching.play("failure");
        log(`fout ${state.strikes}/${MAX_STRIKES} — dat waren de drums!`);
        if (state.strikes >= MAX_STRIKES) state.phase = "failure";
    } else {
        const firstTime = !state.collectedInstruments.includes(def.id);
        if (firstTime) {
            state.collectedInstruments.push(def.id);
            state.score++;
        }
        soundCaught.stop()
        soundCatching.play("success")
        log(firstTime ? `${def.label} gevangen!` : `${def.label} — al vrij, geen punt`);
        if (introMode) {
            // one fish is all the tutorial asks for
            finishIntro();
        } else if (state.collectedInstruments.length >= CATCHABLE.length) {
            state.phase = "success";
        }
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
            updateUI();
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

    // the tutorial only asks for one fish — the full collection tracker would
    // just be noise, so hide it and the score until the real game starts
    collectionEl.hidden = introMode;
    scoreEl.hidden = introMode;

    updateInstruction();
}
introBtn.addEventListener("click", () => { startNoteEl.hidden = true; startGame(true); });
gameBtn.addEventListener("click", () => { startNoteEl.hidden = true; startGame(false); });
stopBtn.addEventListener("click", () => stopGame());