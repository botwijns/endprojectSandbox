import {GameLoop} from "./gameLoop.ts";
import {InputHandler} from "./inputHandler.ts";
import {createInitialState, type Direction, generateNumberSequence, generateSequence} from "./gameState.ts";
import {NOTE, SynthManager} from "./audio/SynthManager.ts";
import {Howl, Howler} from "howler";

const debug = false
const synth = new SynthManager();
const input = new InputHandler(debug);
const state = createInitialState();
const scoreEl = document.getElementById("score")!;
const phaseEl = document.getElementById("phase")!;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const logEl = document.getElementById("log")!;

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
var soundFailure = new Howl({src: ["sounds/failure.webm", "sounds/failure.mp3"]})
// audio.load("walking", { src: ["sounds/walking.webm", "sounds/walking.mp3"] });
// var soundWalking = new Howl({src: ["sounds/walking.webm", "sounds/walking.mp3"] });
var soundFrog = new Howl({
    src: ["sounds/frogCroak.webm", "sounds/frogCroak.wav", "sounds/frogCroak.mp3"],
    loop: true
})
var soundBow = new Howl({
    src: [ "sounds/bow.wav", "sounds/bow.mp3", "sounds/bow.webm"],
    sprite: {
        drawShort:    [966,   819],   // 1785 - 966
        shootShort:   [1905, 3705],   // 5610 - 1905
        hitShort:     [2801,  472],   // 3273 - 2801
        drawMedium:   [4423,  889],   // 5312 - 4423
        shootMedium:  [5340,  840],   // 6180 - 5340
        hitMedium:    [6349, 1094],   // 7443 - 6349
        drawLong:     [7492, 1827],   // 9319 - 7492
        shootLong:    [9474,  784],   // 10258 - 9474
        hitLong:      [10413, 740],   // 11153 - 10413
    },
    onload: () => console.log("bow loaded OK"),
    onloaderror: (id, err) => console.error("bow LOAD ERROR", id, err),
    onplayerror: (id, err) => console.error("bow PLAY ERROR", id, err),
    });
var soundArm = new Howl({src: ["sounds/arm.webm", "sounds/arm.mp3"]});
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
var alpha: number|null = null;
var armAngleBaseline: number|null = null;
function startRound(): void {
    updateUI()
    console.log("Starting Round");
    const length = state.score + 3; // sequence grows each round
    state.sequence = generateSequence(length);
    state.playerInput = [];
    state.currentStep = 0;
    state.phase = "watching";
    stepTimer = 0;
    state.randomAngles = generateNumberSequence(3, -45,45)
    state.randomDistances = generateNumberSequence(3, 1,3)
}
function generateSoundLocation(angle:number, distance:number): number[]{
    const x = Math.sin(angle)*distance;
    const y = Math.cos(angle)*distance;
    return [x, y];
}
function handleInput(dir: Direction): void {
    console.log(dir);
    if (state.phase !== "playing") return;
    // we always walk first, then we make the sound faster or slower
    // audio.play("walking")
    // soundWalking.play()
    // console.log(dir)
    // let xAfter = state.player.x
    // if (dir=="left"){
    //     xAfter--;
    // }
    // else{
    //     xAfter ++;
    // }
    // const newDistance = Math.abs(state.randomNumbers[state.currentStep] - xAfter);
    // if (newDistance<distance){
    //     rate+=0.2;
    // }
    // else{
    //     rate-=0.2;
    // }
    // distance = newDistance;
}

input.onAction((action) => {
    // audio.resume();
    Howler.ctx?.resume();
    if (action === "moveLeft")  {
        state.armed = true
        soundArm.play()
    }
    if (action === "moveRight") handleInput("right");
    if (action === "interact") {
        state.phase = "watching"
    }
    if (action === "shoot") {
        if (state.drawn){
            soundBow.play("shootShort")
            console.log("shooting bow")
            state.drawn = false;
            if (alpha!==null && armAngleBaseline!==null&& state.drawnStage==state.randomDistances[state.currentStep]&& (Math.abs(state.randomAngles[state.currentStep]-(armAngleBaseline-alpha))<5)){
                state.phase = "success"
                setTimeout(() =>soundBow.play("hitShort"), 500);
            }
            else{
                // shot misses! failure sound is played, but based on which side you need to move to, its either on the left or right. the volume indicates if you need to aim further or closer
                console.log("miss!")
                const volume = 1-(state.drawnStage-state.randomDistances[state.currentStep])/3
                setTimeout(() => {
                    if (alpha !== null && armAngleBaseline !== null) {
                        soundFailure.volume(volume)
                        if (state.randomAngles[state.currentStep]-(armAngleBaseline-alpha) < 0) {
                            soundFailure.pos(1, 0)
                        } else {
                            soundFailure.pos(-1, 0)
                        }
                        soundFailure.play()
                    }
                }, 500);
            }
        }

        state.armed = false
        // ensure sound stops when arming is stopped
        soundArm.stop()
        armBeta = null
    }
});

const loop = new GameLoop((dt) => {
    if (!state.running) return;

    const orientation = input.getOrientation();
    //if beta is smaller than zero, we have crossed the z plane, to prevent errors, we will update the beta to a number that keeps increasing and is always positive
    const beta = orientation.beta !== null && orientation.beta < 0
        ? 180 - orientation.beta
        : orientation.beta;
    // console.log(beta, gamma)
    log("alpha:" + orientation.alpha + " beta: " + orientation.beta + " gamma: " + orientation.gamma);
    if (state.phase =="watching"){
        //set baseline for alpha orientation at the beginning of each round
        armAngleBaseline = orientation.alpha
        alpha = orientation.alpha
        state.phase = "playing"
        let coords = generateSoundLocation(state.randomAngles[state.currentStep],state.randomDistances[state.currentStep])
        soundFrog.play()
        soundFrog.pos(coords[0],coords[1])
        soundFrog.volume(1)
        console.log("frog at:")
        console.log(coords[0], coords[1])

    }
    if (state.armed && armBeta==null){
        //if state was just armed, measure the orientation and set the beta for arming to the current beta
        armBeta = beta;
    }
    if (beta!== null && armBeta!== null && (armBeta-beta) > 10 && !state.drawn) {

        const id = soundBow.play("drawShort");
        console.log("play() returned:", id);
        // audio.play("bow", 1,"drawShort")
        console.log("drawing bow")
        console.log("bow drawn to first state")
        //wait with setting the drawn state unitl the sound is done
        setTimeout(() =>{state.drawn = true;},819)
    }

    if (beta!== null && armBeta!== null && state.drawn) {
        //check if the bow is drawn to the next state
        if ((armBeta-beta) >=10 &&(armBeta-beta) <20){
            //bow drawn to first state
            synth.stopAll()
            synth.playNote(NOTE.C4)
            state.drawnStage = 1
        }
        if ((armBeta-beta) >=20 &&(armBeta-beta) <30){
            //bow drawn to second state
            console.log("drawing bow to second state")
            synth.stopAll()
            synth.playNote(NOTE.D4)
            state.drawnStage = 2
        }
        else if ((armBeta-beta) >=30 &&(armBeta-beta) <40){
            //bow drawn to third state
            console.log("drawing bow to third state")
            synth.stopAll()
            synth.playNote(NOTE.E4)
            state.drawnStage = 3
        }
    }
    if (state.phase === "success") {
        state.score++
        state.currentStep = state.currentStep + 1;
        // create new target locations
        if (state.currentStep>2) {
            state.currentStep = 0
            state.randomAngles = generateNumberSequence(3,-45,45)
            state.randomDistances= generateNumberSequence(3,1,3)
        }

        // stepTimer += dt;
        // if (stepTimer >= STEP_INTERVAL) {
        //     stepTimer = 0;
        //     audio.play(state.sequence[state.currentStep]);
        //     state.currentStep++;
        //
        //     if (state.currentStep >= state.sequence.length) {
        //         state.phase = "repeating";
        //         state.currentStep = 0;
        //     }
        // }
        state.phase = "watching"
    }
    else{
        stepTimer += dt;
        if (stepTimer >= STEP_INTERVAL) {
            stepTimer = 0;
        }
    }
});

function updateUI(): void {
    scoreEl.textContent = `Score: ${state.score}`;
    phaseEl.textContent = {
        watching:  "Luister goed...",
        playing: "Jouw beurt!",
        success:   "Raak!",
        failure:   "Fout!",
    }[state.phase];
}
startBtn.addEventListener("click", async () => {
    // Unlock AudioContext on the user gesture
    Howler.ctx?.resume();
    // audio.resume();
    synth.resume();

    // Request orientation permission
    const granted = await input.requestOrientationPermission();
    if (!granted) {
        startBtn.textContent = "Permission denied — tap to retry";
        return;
    }



    input.start();
    state.running = true;
    startRound();
    loop.start();
// Hide the button once the game starts
    startBtn.style.display = "none";
    updateUI();
});