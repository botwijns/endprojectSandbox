import {GameLoop} from "./gameLoop.ts";
import {InputHandler} from "./inputHandler.ts";
import {createInitialState, generateNumberSequence, generateSequence, type State} from "./gameState.ts";
import {SynthManager} from "./audio/SynthManager.ts";
import {InstrumentManager, FISH, fishById, type FishDef} from "./audio/InstrumentManager.ts";
import {Howl, Howler} from "howler";
import { enterFullscreen } from "../../src/fullscreen.ts";
import { getEmbed, setupEmbedStart, embedDone, num } from "../../src/embed.ts";
import {createIntroLevel, type IntroLevel, type Gesture, type GestureOptions} from "./intro/introLevel.ts";
import {FISH_NAME_LINES, playGameLine, playSpeech, stopLine} from "./intro/speech.ts";

const debug= !('ontouchstart' in window) && navigator.maxTouchPoints === 0;
const synth = new SynthManager();
const instruments = new InstrumentManager();
const input = new InputHandler(debug);
const state = createInitialState();
const scoreEl = document.getElementById("score")!;
const collectionEl = document.getElementById("collection")!;
const logEl = document.getElementById("log")!;
const instructionEl = document.getElementById("instruction")!;
const startScreenEl = document.getElementById("start-screen")!;
const gameScreenEl = document.getElementById("game-screen")!;
const startNoteEl = document.getElementById("start-note")!;
const introBtn = document.getElementById("intro-btn") as HTMLButtonElement;
const gameBtn = document.getElementById("game-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const introStageEl = document.getElementById("intro-stage")!;
const introLandEl = document.getElementById("intro-land")!;
const introWaterEl = document.getElementById("intro-water")!;
const introCaptionEl = document.getElementById("intro-caption")!;
const taskListBtn = document.getElementById("tasklist-btn") as HTMLButtonElement;

// --- days and the task list ---------------------------------------------------
// The full game is split into days. Every day gets a random task list of fish to
// catch; tapping the top-left corner reads out the fish still on it. Fish that
// aren't on the list can bite too — catching one just releases it again.
// set when the combined/ shell runs this page as one segment of a longer flow;
// it can override the day settings and the experiment below
const embed = getEmbed();
const DAY_CONFIG = {
    fishFirstDay: num(embed, "fishFirstDay", 3, 1, FISH.length),  // fish on the list on day 1
    days: num(embed, "days", 3, 1, 10),                           // the game ends after this many days
    maxExtraPerDay: num(embed, "maxExtraPerDay", 1, 0, 5),        // each next day adds 0..this many fish (capped at the number of fish)
};
const LIST_BITE_CHANCE = 0.6; // share of bites that are a fish still on today's list
let experiment = num(embed, "experiment", 1, 0, 3);
// --- introduction level -----------------------------------------------------
// The intro is a guided, spoken tutorial in two animated scenes (see
// src/intro/introLevel.ts). Each step is explained and shown, then the player
// practises just that movement (tilt back, swing forward, tap, reel), detected
// by waitForGesture() below. The game's phase machine stays paused throughout.
let gameRunning = false;   // a round (intro or full game) is currently active
let introMode = false;     // currently playing the guided tutorial
let introComplete = false; // the tutorial fish has been landed — freeze play
let intro: IntroLevel | null = null;
let runId = 0;             // bumped on every start/stop so async work can bail out
let endTimer: ReturnType<typeof setTimeout> | null = null; // the end of the intro or the last day

const INTRO_DONE_TEXT =
    "🎉 Goed gedaan! Je hebt je eerste vis gevangen. Terug naar het startscherm...";

const PHASE_HINTS: Record<string, string> = {
    idle:      "Trek je telefoon naar achteren om de hengel terug te halen.",
    throwing:  "Gooi je telefoon naar voren om uit te werpen.",
    listening: "Luister. Hoor je een vis van je lijstje? Raak het scherm aan.",
    reeling:   "Draai met je duim rondjes op het scherm om binnen te halen.",
    success:   "Gevangen! 🎣",
    failure:   "Ontsnapt...",
};

function updateInstruction(): void {
    // during the intro the scenes, the speech and the intro caption do the talking
    instructionEl.textContent = introMode ? "" : PHASE_HINTS[state.phase] ?? "";
}

function setPhase(phase: State["phase"]): void {
    state.phase = phase;
}

/** The sensor's beta wraps from 180 to -180 when the phone is tilted far back
 *  (over the shoulder). Comparing raw readings across that wrap looks like a
 *  ~360° jump forward, which used to fire the forward cast mid-backswing.
 *  This tracker accumulates the shortest per-frame step instead, giving a
 *  continuous angle (starting at 180 + beta, the old normalized scale) that
 *  can go past 360 or below 0 without jumping. */
function createBetaUnwrapper() {
    let lastRaw: number | null = null;
    let unwrapped: number | null = null;
    return {
        read(raw: number | null): number | null {
            if (raw === null) return unwrapped;
            if (lastRaw === null || unwrapped === null) {
                unwrapped = 180 + raw;
            } else {
                unwrapped += ((raw - lastRaw + 540) % 360) - 180;
            }
            lastRaw = raw;
            return unwrapped;
        },
        reset(): void {
            lastRaw = null;
            unwrapped = null;
        },
    };
}

function finishIntro(): void {
    // the intro's last line has played: drop back to the start screen once the
    // congratulations have had a moment to register.
    introComplete = true;
    intro?.finish(INTRO_DONE_TEXT);
    soundFishingUnderwater.fade(soundFishingUnderwater.volume() as number, 0, 1600);
    endTimer = setTimeout(() => {
        stopGame();
        if (embed) { embedDone(); return; }
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
    runId++;                       // invalidate any in-flight async start-up
    introComplete = false;
    intro?.destroy();              // stops the intro script, its speech and both scenes
    intro = null;
    cancelGesture();
    introStageEl.hidden = true;
    if (endTimer !== null) { clearTimeout(endTimer); endTimer = null; }
    speechToken++;                 // cancel any task-list / feedback speech
    announcing = false;
    castPaused = false;
    stopLine();
    taskListBtn.hidden = true;
    taskListBtn.classList.remove("lit");
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
    state.score = 0;
    state.day = 0;
    gorillaPlayed = false;
    state.taskList = [];
    state.caughtToday = [];

    showGameScreen();
    input.start();
    startRound();                  // phase -> idle, background music on
    gameRunning = true;
    loop.start();                  // safe to start immediately: the loop no-ops
                                    // while state.running is false — it stays false
                                    // for the whole intro (only practice gestures run)

    if (asIntro) {
        // the intro script drives everything from here on
        introStageEl.hidden = false;
        intro = createIntroLevel({
            land: introLandEl,
            water: introWaterEl,
            caption: introCaptionEl,
            sounds: {
                throw: soundThrow,
                reelThrow: soundFishingReelThrow,
                dobber: soundDobber,
                reel: soundFishingReel,
                catching: soundCatching,
            },
            demoFish: fishById("trumpetfish")!,
            playMelody: def => instruments.playMelody(def),
            stopMelody: () => instruments.stopAll(),
            goUnderwater: () => {
                // the same ambience switch as when the bobber lands in the game
                soundFishingBackground.stop();
                soundFishingUnderwater.play();
                soundFishingUnderwater.volume(0.3);
                soundFishingUnderwater.loop(true);
            },
            waitForGesture,
            highlightTaskList: on => taskListBtn.classList.toggle("lit", on),
            onFinished: () => finishIntro(),
        });
        intro.start();
        updateUI();
        return;
    }

    state.running = true;
    startDay(1);
}

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Fish on today's list that haven't been caught yet. */
function remainingFish(): FishDef[] {
    return state.taskList
        .filter(id => !state.caughtToday.includes(id))
        .map(id => fishById(id)!);
}

/** Draw a fresh task list for `day` and read it out. */
function startDay(day: number): void {
    const count = day === 1
        ? DAY_CONFIG.fishFirstDay
        : state.taskList.length + Math.floor(Math.random() * (DAY_CONFIG.maxExtraPerDay + 1));
    state.day = day;
    state.taskList = shuffle(FISH).slice(0, Math.max(1, Math.min(count, FISH.length))).map(f => f.id);
    state.caughtToday = [];
    log(`Dag ${day}`);
    updateUI();
    void announceTaskList("dayStart");
}

// --- spoken sequences ----------------------------------------------------------
// The task list and the catch feedback are spoken (recorded lines, see
// intro/speech.ts). While a sequence plays no fish bites, so the player can
// listen without missing one. A newer sequence or stopGame() cancels it.
// Sequences started with `pauseCast` (the task list, and the lines leading into
// a new day) also pause the cast detection, so the player can't throw out
// until they've heard the full list.
let announcing = false;
let castPaused = false;
let speechToken = 0;

function wait(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
}

async function speak(steps: (alive: () => boolean) => Promise<void>, pauseCast = false): Promise<void> {
    const token = ++speechToken;
    const myRun = runId;
    const alive = () => token === speechToken && myRun === runId;
    announcing = true;
    castPaused = pauseCast;
    // whatever was biting swims off while we talk
    instruments.stopAll();
    state.activeFish = null;
    try {
        await steps(alive);
    } finally {
        if (token === speechToken) {
            announcing = false;
            castPaused = false;
            biteTimer = 0;
            nextBiteDelay = 2 + Math.random() * 1.5;
            updateUI();
        }
    }
}

/** Read out the fish still on today's list: each fish's name, then its sound. */
function announceTaskList(opening: "dayStart" | "taskListIntro"): Promise<void> {
    return speak(async alive => {
        await playGameLine(opening);
        for (const fish of remainingFish()) {
            if (!alive()) return;
            await playSpeech(FISH_NAME_LINES[fish.id]);
            if (!alive()) return;
            const sec = instruments.playMelody(fish);
            await wait(sec * 1000 + 700);
        }
    }, true);
}

/** The top-left corner: repeat the remaining fish. Tapping again starts over. */
function onTaskListTap(): void {
    if (!gameRunning || introMode || !state.running) return;
    if (state.phase === "reeling") return;            // hands are busy reeling
    if (remainingFish().length === 0) return;         // the day is wrapping up
    void announceTaskList("taskListIntro");
}

/** Last day done: let the final line ring out, then back to the start screen. */
function finishGame(): void {
    state.running = false;
    soundFishingBackground.fade(soundFishingBackground.volume() as number, 0, 1600);
    endTimer = setTimeout(() => {
        const score = state.score;
        stopGame();
        if (embed) { embedDone({ score, days: DAY_CONFIG.days }); return; }
        startNoteEl.hidden = false;
        startNoteEl.textContent = `✅ Alle ${DAY_CONFIG.days} dagen voltooid! Je ving ${score} vissen.`;
    }, 2200);
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
// add gorrilla sounds to the game, it has three sounds: meow, bark, and boing
var gorillaMeow = new Howl ({src: "sounds/meow.mp3"})
var gorillaBark = new Howl ({src: "sounds/bark.mp3"})
var gorillaBoing = new Howl ({src: "sounds/boing.mp3"})
var gorillaSounds: Howl[] = [gorillaMeow, gorillaBark, gorillaBoing]
let gorillaPlayed = false; // the gorilla sound plays only once per game
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
var soundFishingUnderwater = new Howl({src: ["sounds/underwater.webm", "sounds/underwater.mp3"]})
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
// furthest-back tilt reached during the throwing phase; the cast needs a real forward swing from here
var throwPeakBeta: number|null = null;
const gameBeta = createBetaUnwrapper();
// @ts-ignore
var nextSound: boolean = true;
var nextSoundTimeout: ReturnType<typeof setTimeout> | null = null; // add this
// var armTime: number = 0;
function resetRoundState(): void {
    state.activeFish = null;
    state.pendingFish = null;
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
    armBetaBaseline = null;
    throwPeakBeta = null;
    gameBeta.reset();
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



// --- intro practice gestures ---------------------------------------------------
// Between its explanations the intro asks the player to do one movement at a
// time (tilt back, swing forward, tap, reel). Those are detected here, on their
// own, while the real phase machine stays paused — so a practice move never
// leaves the game half-way through a cast.
const PRACTICE_TILT = 10;      // degrees, same threshold as the real cast
interface Practice {
    gesture: Gesture;
    opts: GestureOptions;
    resolve: () => void;
    base: number | null;       // tiltBack: where the phone started
    peak: number | null;       // swingForward: furthest-back tilt seen
    lastCrank: number;
}
let practice: Practice | null = null;
const practiceBeta = createBetaUnwrapper();

function waitForGesture(gesture: Gesture, opts: GestureOptions = {}): Promise<void> {
    cancelGesture();
    practiceBeta.reset();
    if (gesture === "crank") resetCrank();
    return new Promise(resolve => {
        practice = {gesture, opts, resolve, base: null, peak: null, lastCrank: 0};
    });
}

/** Drop a pending gesture without resolving it (stopGame / a newer gesture). */
function cancelGesture(): void {
    practice = null;
}

function completeGesture(): void {
    const p = practice;
    practice = null;
    p?.resolve();
}

function tickPractice(): void {
    const p = practice;
    if (!p) return;
    if (p.gesture === "crank") {
        const total = Math.abs(input.getCrankDegrees());
        const target = p.opts.crankDegrees ?? 720;
        p.opts.onCrank?.(Math.min(1, total / target), total - p.lastCrank, input.getPointer() !== null);
        p.lastCrank = total;
        if (total >= target) completeGesture();
        return;
    }
    if (p.gesture === "tap") return; // handled by onPracticePress
    const beta = practiceBeta.read(input.getOrientation().beta);
    if (beta === null) return;
    if (p.gesture === "tiltBack") {
        if (p.base === null) p.base = beta;
        if (beta - p.base > PRACTICE_TILT) completeGesture();
    } else {
        // swingForward: a forward swing from the furthest-back point, so it
        // works whether the phone is still tilted back or held level
        if (p.peak === null || beta > p.peak) p.peak = beta;
        if (p.peak - beta > PRACTICE_TILT) completeGesture();
    }
}

function onPracticePress(): void {
    if (practice?.gesture !== "tap") return;
    if (practice.opts.accept && !practice.opts.accept()) return; // tapped during silence
    completeGesture();
}

const loop = new GameLoop((dt) => {
    if (introComplete) return; // tutorial fish landed — hold everything still
    if (practice) { tickPractice(); return; } // an intro practice move is being detected
    if (!state.running) return;

    const orientation = input.getOrientation();
    // unwrapped so a big swing over the shoulder (beta wrapping 180 -> -180) doesn't look like a jump forward
    const beta = gameBeta.read(orientation.beta);
    console.log(beta)
    stepTimer += dt;
    if (castPaused && (state.phase == "idle" || state.phase == "throwing")) {
        // the task list is being read: ignore movement, and drop a half-done
        // backswing. The baseline is re-taken once the list is over, so moving
        // during it doesn't fire a cast the moment it ends.
        if (state.phase == "throwing") {
            soundThrow.stop()
            setPhase("idle")
            updateUI()
        }
        armBetaBaseline = null
        armBeta = null
        throwPeakBeta = null
        stepTimer = 0
    }
    else if (state.phase =="idle" && beta!==null){
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
            setPhase("throwing")
            throwPeakBeta = beta
            updateUI()
        }
        //play experiment sound when experiment is called
        if (experiment>0&&!gorillaPlayed&&state.day==2&&remainingFish().length==1){
            gorillaPlayed = true
            var gorilla:Howl = gorillaSounds[experiment-1];
            gorilla.play()
            gorilla.volume(0.5)
        }
    }
    //wait a tick between phases
    else if(state.phase == "throwing"&&armBetaBaseline!==null && beta!==null){
        if (throwPeakBeta === null || beta > throwPeakBeta) throwPeakBeta = beta
        // cast once the phone is back near the baseline AND actually swung forward from its furthest-back point
        if (beta-armBetaBaseline<2 && throwPeakBeta-beta>10){
            //in case the sound still plays, we stop and play the sound again for the actual throw
            soundThrow.stop()
            soundThrow.play()
            soundFishingReelThrow.play("throw")
            // set state to waiting to ensure it waits without changing the armbetabaseline
            setPhase("waiting")
            setTimeout(() => {
                soundFishingReelThrow.stop()
                soundDobber.play("land")
                setTimeout(() =>{
                    //stop background of outside water and switch to underwater sound
                    soundFishingUnderwater.play()
                    soundFishingUnderwater.volume(0.3)
                    soundFishingUnderwater.loop(true)
                    soundFishingBackground.stop()
                    }, 500
                )
                stepTimer=0
                biteTimer=0
                nextBiteDelay = 1.5 + Math.random()*2
                setPhase("listening")
                log("luister goed...")
                updateUI()
            },1000)
        }
    }
    else if (state.phase == "listening"){
        // Every so often a fish "bites" by playing its sound. The player taps
        // while they hear one from today's list to catch it. Other fish can be
        // reeled in too, but they're released again. Bites hold off while the
        // task list (or other feedback) is being spoken.
        if (!announcing) biteTimer += dt;

        // close the catch window once the melody (+ grace) is over
        if (state.activeFish !== null && performance.now() > catchWindowUntil) {
            state.activeFish = null;
            log("...weg. luister opnieuw");
        }

        if (!announcing && state.activeFish === null && biteTimer >= nextBiteDelay) {
            biteTimer = 0;
            nextBiteDelay = 4 + Math.random() * 2.6;
            spawnBite();
        }
    }
    else if (state.phase == "reeling"){
        stepTimer += dt;
        const touching = input.getPointer() !== null;
        //during reeling, set the armBaseBetabaseline to the current beta, this is to have a better baseline

        if (armBetaBaseline!==null && beta!==null){
            armBetaBaseline = beta;
        }

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
            state.pendingFish = null;
            resetCrank();
            setPhase("listening");
            biteTimer = 0;
            nextBiteDelay = 2;
            log("de vis is los! luister opnieuw");
            updateUI();
        } else {
            log("binnenhalen: " + Math.round(Math.abs(crankAngle)) + "°");
        }
    }
});

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Pick a fish to "bite" and play its sound, opening the catch window. */
function spawnBite(): void {
    // mostly a fish that's still on the list, otherwise one that isn't
    const remaining = remainingFish();
    const others = FISH.filter(f => !remaining.includes(f));
    const def = remaining.length > 0 && (others.length === 0 || Math.random() < LIST_BITE_CHANCE)
        ? pick(remaining)
        : pick(others);

    // the bobber dips — an audible "something's there" cue alongside the sound
    const dobberId = soundDobber.play("caught");
    soundDobber.volume(0.8, dobberId);

    const melodyDur = instruments.playMelody(def);
    state.activeFish = def.id;
    // window stays open for the sound plus a short grace period to react
    catchWindowUntil = performance.now() + melodyDur * 1000 + 600;
    log("🎣 er bijt iets...");
}

/**
 * The player commits by touching the screen: whatever is on the hook right now
 * (a fish they heard, or nothing) gets reeled in. Whether it was
 * the right call is only revealed once the reel-in finishes.
 */
function startReeling(): void {
    if (!state.running || state.phase !== "listening" || announcing) return;
    state.pendingFish = state.activeFish; // may be null (touched during silence)
    state.activeFish = null;
    instruments.stopAll();
    resetCrank();
    stepTimer = 0;
    setPhase("reeling");
    log("binnenhalen!");
    updateUI();
}

/** Land whatever was on the hook — the outcome (and any mistake sound) happens here. */
function resolveReel(): void {
    soundFishingReel.loop(false);
    soundFishingReel.stop();
    isSoundPlaying = false;
    soundCaught.play("caught");
    soundFishingUnderwater.stop()
    soundFishingBackground.play()
    soundFishingBackground.volume(0.3)
    soundFishingBackground.loop(true)
    const def = state.pendingFish ? fishById(state.pendingFish) ?? null : null;
    state.pendingFish = null;
    resetCrank();

    setPhase("idle");
    biteTimer = 0;
    nextBiteDelay = 1.5 + Math.random() * 2;

    if (!def) {
        // reeled in an empty hook — the miss lands now, not when you touched
        soundCatching.play("escaped")
        log("niks aan de haak...");
    } else if (state.taskList.includes(def.id) && !state.caughtToday.includes(def.id)) {
        state.caughtToday.push(def.id);
        state.score++;
        soundCaught.stop()
        soundCatching.play("success")
        log(`${def.label} gevangen! Die stond op je lijstje.`);
        const dayDone = remainingFish().length === 0;
        void speak(async alive => {
            await wait(1200); // let the catch sound land first
            if (!alive()) return;
            await playGameLine("onList");
            if (!alive() || !dayDone) return;
            await playGameLine("dayDone");
            if (!alive()) return;
            if (state.day >= DAY_CONFIG.days) {
                await playGameLine("gameDone");
                if (alive()) finishGame();
            } else {
                await wait(800);
                if (alive()) startDay(state.day + 1);
            }
        }, dayDone); // the day is over: no casting until the next list has been read
    } else {
        // not on today's list (or already caught) — it goes back in the water
        const already = state.caughtToday.includes(def.id);
        soundCatching.play("escaped")
        log(`${def.label} — ${already ? "die had je al" : "staat niet op je lijstje"}, terug het water in`);
        void speak(async alive => {
            await wait(1000);
            if (alive()) await playGameLine(already ? "alreadyCaught" : "notOnList");
        });
    }
    updateUI();
}

input.onPress(startReeling);
input.onPress(onPracticePress);

if (debug) {
    (window as any).__game = {
        state, FISH, DAY_CONFIG,
        playFish: (id: string) => { const f = fishById(id); return f ? instruments.playMelody(f) : 0; },
        crank: () => ({ crankAngle, crankVelocity, center: input.getCrankCenter() }),
    };
    // keyboard shortcuts so the mechanic can be tested on desktop
    window.addEventListener("keydown", (e) => {
        // n: skip the intro's current speech line (handy while they're placeholders)
        if (e.key === "n") { intro?.skipLine(); stopLine(); return; }
        // k: read out the task list, as if the top-left corner was tapped
        if (e.key === "k") { onTaskListTap(); return; }
        // an intro practice move: t = the tilt/swing, l or space = the tap/reel
        if (practice) {
            if (e.key === " ") e.preventDefault();
            if (e.key === "t" && (practice.gesture === "tiltBack" || practice.gesture === "swingForward")) completeGesture();
            else if ((e.key === "l" || e.key === " ") && practice.gesture === "tap") onPracticePress();
            else if (e.key === " " && practice.gesture === "crank") {
                practice.opts.onCrank?.(1, 30, false);
                completeGesture();
            }
            return;
        }
        if (!state.running) return;
        if (e.key === "t" && state.phase === "idle" && !castPaused) {
            soundThrow.play();
            setPhase("throwing");
            // fake a backswing peak so the flat desktop beta counts as the forward swing on the next tick
            throwPeakBeta = (armBetaBaseline ?? 0) + 90;
            updateUI();
        } else if (e.key === "l") {
            biteTimer = 0;
            nextBiteDelay = 1;
            setPhase("listening");
            updateUI();
        } else if (e.key === " ") {
            e.preventDefault();
            startReeling();
        }
    });
}

function updateUI(): void {
    scoreEl.textContent = `Score: ${state.score}`;

    // today's list; the fish on the hook stays hidden until the reel-in resolves
    const list = state.taskList
        .map(id => `${state.caughtToday.includes(id) ? "✅" : "⬜"} ${fishById(id)?.label ?? id}`)
        .join("   ");
    collectionEl.textContent = state.day > 0 ? `Dag ${state.day}/${DAY_CONFIG.days}   |   ${list}` : "";
    // shown in the intro too, so the fisherman can point it out (it lights up)
    taskListBtn.hidden = !gameRunning;

    // the tutorial only asks for one fish — the full collection tracker would
    // just be noise, so hide it and the score until the real game starts
    collectionEl.hidden = introMode;
    scoreEl.hidden = introMode;

    updateInstruction();
}
// starting from a button click (a user gesture) is when fullscreen is allowed
introBtn.addEventListener("click", () => { startNoteEl.hidden = true; void enterFullscreen(); startGame(true); });
gameBtn.addEventListener("click", () => { startNoteEl.hidden = true; void enterFullscreen(); startGame(false); });
stopBtn.addEventListener("click", () => stopGame());
taskListBtn.addEventListener("click", () => onTaskListTap());

// run by the combined/ shell: skip the menu, start straight into the requested mode
if (embed) {
    stopBtn.hidden = true;
    setupEmbedStart(embed, () => startGame(embed.mode === "intro"));
}
