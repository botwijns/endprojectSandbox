import {GameLoop} from "./gameLoop.ts";
import {InputHandler} from "./inputHandler.ts";
import {createInitialState,  generateNumberSequence, generateSequence} from "./gameState.ts";
import {SynthManager} from "./audio/SynthManager.ts";
import {Howl, Howler} from "howler";

const debug= !('ontouchstart' in window) && navigator.maxTouchPoints === 0;
const synth = new SynthManager();
const input = new InputHandler(debug);
const state = createInitialState();
const scoreEl = document.getElementById("score")!;
const phaseEl = document.getElementById("phase")!;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const logEl = document.getElementById("log")!;
let crankAngle =0;
let prevJoyAngle: number | null = null
let crankVelocity = 0;        // degrees/frame, decays over time
const VELOCITY_DECAY = 0.85;  // multiplied each frame — tune this (0.9 = slower decay, 0.7 = faster)
const VELOCITY_MIN = 0.3;     // below this we consider it stopped — tune this too
let isSoundPlaying = false;
function getJoystickAngle(): number | null {
    const { x, y, active } = input.getJoystick();
    if (!active) return null;
    // Only register as crank input if the stick is pushed far enough
    if (Math.hypot(x, y) < 0.2) return null;
    return Math.atan2(y, x) * (180 / Math.PI); // -180 to 180
}

function shortestAngleDelta(from: number, to: number): number {
    // Wraps the delta into -180..180 so crossing the ±180 boundary doesn't
    // produce a huge jump
    let delta = to - from;
    if (delta > 180)  delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
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
})
var soundFishingBackground = new Howl({src: ["sounds/fishing-background.webm", "sounds/fishing-background.mp3","sounds/fishing-background.wav"]})
var soundThrow = new Howl({src: ["sounds/throw-woosh.webm", "sounds/throw-woosh.wav", "sounds/throw-woosh.mp3"]})
var soundFishingReel = new Howl({src: ["sounds/fishingreel.webm", "sounds/fishingreel.mp3","sounds/fishingreel.wav"]})
var soundFishingReelThrow = new Howl({
    src: ["sounds/fishing-reel-throw.webm", "sounds/fishing-reel-throw.wav", "sounds/fishing-reel-throw.mp3"],
    sprite: {
        throw: [0,1000],
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
function startRound(): void {
    updateUI()
    console.log("Starting Round");
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

// input.onAction((action) => {
//     // audio.resume();
//     Howler.ctx?.resume();
//     if (action === "moveLeft")  {
//         log("arm")
//         state.armed = true
//         soundArm.play()
//     }
//     if (action === "moveRight"){
//         log("arm")
//         state.armed = true
//         soundArm.play()
//     }
//     if (action === "interact") {
//         state.phase = "waiting"
//     }
//     if (action === "shoot") {
//         state.armed = false
//         soundArm.stop()
//         armBeta = null
//         armTime =0
//         // log("shot")
//         if (nextSoundTimeout !== null) {
//             clearTimeout(nextSoundTimeout);
//             nextSoundTimeout = null;
//         }
//         nextSound = true;
//         if (state.drawn){
//             //stop the sound of the drawn bow
//             synth.stopAll()
//             soundBow.play("shootShort")
//             console.log("shooting bow")
//             state.drawn = false;
//             if (alpha!==null && armAngleBaseline!==null&& state.drawnStage==state.randomDistances[state.currentStep]&& (Math.abs(state.randomAngles[state.currentStep]-(armAngleBaseline-alpha))<20)){
//                 state.phase = "success"
//                 state.score++
//                 setTimeout(() =>soundBow.play("hitShort"), 500);
//             }
//             else{
//                 // shot misses! failure sound is played, but based on which side you need to move to, its either on the left or right. the volume indicates if you need to aim further or closer
//                 console.log("miss!")
//                 log("aimed at: "+alpha + "with baseline at: " + armAngleBaseline + " distance: " + state.drawnStage)
//                 const volume = 1-(state.drawnStage-state.randomDistances[state.currentStep])/3
//                 setTimeout(() => {
//                     if (alpha !== null && armAngleBaseline !== null) {
//                         soundFailure.volume(volume)
//                         if (state.randomAngles[state.currentStep]-(armAngleBaseline-alpha) < 0) {
//                             soundFailure.pos(1, 0)
//                         } else {
//                             soundFailure.pos(-1, 0)
//                         }
//                         soundFailure.play()
//                     }
//                 }, 500);
//             }
//             state.drawnStage = 0
//         }
//
//
//         // ensure sound stops when arming is stopped
//     }
// });

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
                soundDobber.play("land")
                stepTimer=0
                state.phase = "waiting"
                updateUI()
            },1000)
        }
    }
    else if (state.phase =="waiting"){
        //waiting for a randomly defined moment, between 2 and 10 seconds when you hear the float go under
        stepTimer+=dt
        if (stepTimer>=STEP_INTERVAL*state.randomDistances[state.currentStep]){
            //start playing the sound for being caught
            soundCaught.play()
            state.phase = "reeling"
            stepTimer = 0
            updateUI()
        }
        // armAngleBaseline = orientation.alpha
        // state.phase = "reeling"
        // let coords = generateSoundLocation(state.randomAngles[state.currentStep],state.randomDistances[state.currentStep])
        // soundFrog.play()
        // soundFrog.pos(coords[0],coords[1])
        // soundFrog.volume(1)
        // console.log("frog at:")
        // console.log(coords[0], coords[1])
        // log("angle: "+ state.randomAngles[state.currentStep] + "distance: " + state.randomDistances[state.currentStep])

    }
    else if (state.phase =="reeling"){
        stepTimer+=dt
        const joyAngle = getJoystickAngle();

        if (joyAngle !== null && prevJoyAngle !== null) {
            const delta = shortestAngleDelta(prevJoyAngle, joyAngle);
            crankVelocity = delta;          // new input overrides decay
            crankAngle += delta;
        } else {
            crankVelocity *= VELOCITY_DECAY; // no input — let it coast
        }

        prevJoyAngle = joyAngle;

        const isMoving = Math.abs(crankVelocity) > VELOCITY_MIN;

        if (isMoving && !isSoundPlaying) {
            soundFishingReel.play();
            isSoundPlaying = true;
        } else if (!isMoving && isSoundPlaying) {
            soundFishingReel.stop();
            isSoundPlaying = false;
        }

        // success if crank is rotated n times withing m seconds?
        if (Math.abs(crankAngle) >= 2*360){
            state.phase = "success"
            crankAngle = 0
            soundSuccess.play()
            soundFishingReel.stop();
            isSoundPlaying = false;
            state.score++
            updateUI()
        }
        if (stepTimer>10*STEP_INTERVAL){
            crankAngle = 0
            state.phase = "failure"
            soundFishingReel.stop();
            isSoundPlaying = false;
            soundFailure.play()
            updateUI()
        }
        // Use crankAngle however you need — e.g. drive a gear, a drum, a wheel
        log("crank: " + crankAngle.toFixed(1) + " °");
        //TODO: add yank or move feature for more interesting reeling?
        //TODO: capture devicemovement to calculate score?
    }
    // alpha = orientation.alpha
    // if (state.armed && armBeta == null) {
    //     armBeta = beta;
    //     armTime = 0;
    //     nextSound = true;  // reset on fresh arm
    //     if (nextSoundTimeout !== null) {
    //         clearTimeout(nextSoundTimeout);  // cancel any leftover timeout
    //         nextSoundTimeout = null;
    //     }
    // }
    // armTime += dt;
    // if (beta!== null && armBeta!== null && armTime > 0.3 && (beta-armBeta) > 10 && !state.drawn &&state.armed) {
    //     log(beta+" "+ armBeta + armTime + state.drawn +state.armed)
    //     const id = soundBow.play("drawShort");
    //     console.log("play() returned:", id);
    //     // audio.play("bow", 1,"drawShort")
    //     console.log("drawing bow")
    //     console.log("bow drawn to first state")
    //     state.drawn = true;
    //     if (nextSoundTimeout !== null) clearTimeout(nextSoundTimeout); // cancel any pending reset
    //     nextSound = false;
    //     nextSoundTimeout = setTimeout(() => { nextSound = true; }, 819);
    //     //wait with setting the drawn state unitl the sound is done
    // }

    // if (beta!== null && armBeta!== null && armTime > 0.3 && state.drawn &&nextSound &&state.armed) {
    //     //check if the bow is drawn to the next state
    //     if ((beta-armBeta) >=10 &&(beta-armBeta) <20){
    //         //bow drawn to first state
    //         if (state.drawnStage!=1) {
    //             synth.stopAll()
    //             synth.playNote(NOTE.C4)
    //             state.drawnStage = 1
    //         }
    //     }
    //     else if ((beta-armBeta) >=20 &&(beta-armBeta) <30){
    //         //bow drawn to second state
    //         console.log("drawing bow to second state")
    //         if(state.drawnStage!=2) {
    //             synth.stopAll()
    //             synth.playNote(NOTE.D4)
    //             state.drawnStage = 2
    //         }
    //     }
    //     else if ((beta-armBeta) >=30 &&(beta-armBeta) <40){
    //         //bow drawn to third state
    //         console.log("drawing bow to third state")
    //         if (state.drawnStage!=3){
    //             synth.stopAll()
    //             synth.playNote(NOTE.E4)
    //             state.drawnStage = 3
    //
    //         }
    //     }
    // }
    if (state.phase === "success" || state.phase =="failure") {
        state.currentStep = state.currentStep + 1;
        // create new target locations
        if (state.currentStep>2) {
            state.currentStep = 0
            state.randomAngles = generateNumberSequence(3,-45,45)
            state.randomDistances= generateNumberSequence(3,1,3)
        }

        state.phase = "idle"
        updateUI()
    }
});

function updateUI(): void {
    scoreEl.textContent = `Score: ${state.score}`;
    phaseEl.textContent = {
        waiting:  "Luister goed...",
        reeling: "reeling!",
        success:   "gevangen!",
        failure:   "ontsnapt!",
        idle:   "idle",
        throwing: "throwing!"
    }[state.phase];
}
let gameRunning = false;

startBtn.addEventListener("click", async () => {
    if (!gameRunning) {
        Howler.ctx?.resume();
        synth.resume();

        const granted = await input.requestOrientationPermission();
        if (!granted) {
            startBtn.textContent = "Permission denied — tap to retry";
            return;
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
        soundFishingBackground.stop();
        startBtn.textContent = "Start";
        gameRunning = false;
    }
});