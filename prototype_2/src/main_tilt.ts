import { AudioManager } from "./audio/audioManager.ts";
import { GameLoop } from "./gameLoop.ts";
import { InputHandler } from "./inputHandler.ts";
import { createInitialState, generateSequence, type Direction } from "./gameState.ts";
import { SynthManager, NOTE } from "./audio/SynthManager.ts";

const synth = new SynthManager();
const audio = new AudioManager();
const input = new InputHandler(true);
const state = createInitialState();
const scoreEl = document.getElementById("score")!;
const phaseEl = document.getElementById("phase")!;
// audio.load("footstep", { src: ["sounds/footstep.webm", "sounds/footstep.mp3"] });
// audio.load("bgm",      { src: ["sounds/bgm.webm", "sounds/bgm.mp3"], loop: true, volume: 0.4 });

audio.load("left",    { src: ["sounds/left.webm",    "sounds/left.mp3"]    });
audio.load("right",   { src: ["sounds/right.webm",   "sounds/right.mp3"]   });
audio.load("success", { src: ["sounds/success.webm", "sounds/success.mp3"] });
audio.load("failure", { src: ["sounds/failure.webm", "sounds/failure.mp3"] });
// input.onAction((action) => {
//     if (action === "moveLeft")  {
//         state.player.x -= 1;
//
//     }
//     if (action === "moveRight") state.player.x += 1;
//     if (action === "interact")  {
//         audio.play("footstep");
//         state.player.y +=1;
//     }
//     if (action === "pause")     state.running = !state.running;
// });
//
// const loop = new GameLoop((dt) => {
//     if (!state.running) return;
//     // update entities, check collisions, etc.
//     state.entities.forEach(e => {
//         audio.playAt(e.soundId, e.x, state.player.x);
//     });
// });
//
// input.start();
// audio.play("bgm");
// state.running = true;
// loop.start();

// How long to wait between playing each step
const chord = [NOTE.E4, NOTE.GS4 ,NOTE.B4]
const STEP_INTERVAL = 1.0; // seconds
let stepTimer = 0;
let wait_count = 0; //amount of steps during counting that is being measured
let average_orientation = 0;
let twoSeconds = false
let baseline = 0;
function startRound(): void {
    updateUI()
    console.log("Starting Round");
    console.log(state.randomNumbers)
    const length = 5; // sequence grows each round
    state.sequence = generateSequence(length);
    state.playerInput = [];
    state.currentStep = 0;
    state.phase = "watching";
    stepTimer = 0;
}

function handleInput(dir: Direction): void {
    console.log(dir);
    if (state.phase !== "repeating") return;

    audio.play(dir);
    state.playerInput.push(dir);

    const expected = state.sequence[state.playerInput.length - 1];
    if (dir !== expected) {
        state.phase = "failure";
        setTimeout(() => audio.play("failure"), 500);
        state.score = 0;
        setTimeout(() => startRound(), 500);
        return;
    }

    if (state.playerInput.length === state.sequence.length) {
        console.log("sucess");
        state.phase = "success";
        state.score++;
        setTimeout(() => audio.play("success"), 500);
        setTimeout(() => startRound(), 500);
    }
}

input.onAction((action) => {
    audio.resume();
    if (action === "moveLeft")  handleInput("left");
    if (action === "moveRight") handleInput("right");
    if (action === "interact") {
        state.phase = "watching"
    }
});

const loop = new GameLoop((dt) => {
    if (!state.running) return;
    const {beta, gamma} = input.getOrientation()
    // console.log(beta, gamma)
    // check every half second if the average orientation of the last half second is roughly equal to the chosen location
    // if (gamma !== null && gamma < -20) handleInput("left");
    // if (gamma !== null && gamma > 20)  handleInput("right");
    // if (beta !== null && beta> 20) synth.playNote(NOTE.C4);
    wait_count += 1;
    if (gamma!== null){
        average_orientation = (average_orientation*wait_count+gamma)/(wait_count+1);
    }
    stepTimer += dt;
    if (state.phase === "watching") {
        // when waiting, for permission, the current orientation is being used to calculate an average for how you hold your phone right now
        if (stepTimer >= STEP_INTERVAL) {
            // five seconds is enough to orient so we make state.sequence.length =5
            stepTimer = 0;
            // audio.play(state.sequence[state.currentStep]);
            state.currentStep++;

            if (state.currentStep >= state.sequence.length) {
                console.log("baseline is:")
                console.log(average_orientation)
                console.log(state.randomNumbers[0])
                state.phase = "repeating";
                state.currentStep = 0;
                // reset the environment to check for the average orientation every second. store the first five seconds for Baseline
                wait_count = 0;
                baseline = average_orientation;
                average_orientation = 0;
            }
        }
    } else{
        if (gamma!== null){
            if (Math.abs(gamma-baseline+state.randomNumbers[state.currentStep])<10){
                console.log("stay here!")
            }
        }
        if (stepTimer >= (STEP_INTERVAL)) {

            console.log(beta, gamma)
            // check every second if the average of last second was close enough to the target
            stepTimer = 0;
            // audio.play(state.sequence[state.currentStep]);
            if (Math.abs(average_orientation-baseline+state.randomNumbers[state.currentStep])<10){
                console.log("new hit!")
                state.currentStep++;
            }
            average_orientation = 0;
            wait_count = 0;

            if (twoSeconds && state.currentStep >0) {
                console.log("success!")
                for (let i = 0; i <= state.currentStep; i++) {
                    console.log(chord[i])
                    synth.playNote(chord[i])
                }
            }
            // flip seconds count
            twoSeconds = !twoSeconds
        }
    }
});

function updateUI(): void {
    scoreEl.textContent = `Score: ${state.score}`;
    phaseEl.textContent = {
        watching:  "Luister goed...",
        repeating: "Jouw beurt!",
        success:   "Klopt!",
        failure:   "Fout!",
    }[state.phase];
}
input.start();
state.running = true;
startRound();
console.log(chord[0])
loop.start();