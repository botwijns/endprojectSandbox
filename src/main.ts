import { AudioManager } from "./audio/audioManager";
import { GameLoop } from "./gameLoop";
import { InputHandler } from "./inputHandler";
import { createInitialState, generateSequence, type Direction } from "./gameState";

const audio = new AudioManager();
const input = new InputHandler();
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

// How long to wait between playing each step during the "watching" phase
const STEP_INTERVAL = 1.0; // seconds
let stepTimer = 0;

function startRound(): void {
    updateUI()
    console.log("Starting Round");
    const length = state.score + 1; // sequence grows each round
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

    if (state.phase === "watching") {
        stepTimer += dt;
        if (stepTimer >= STEP_INTERVAL) {
            stepTimer = 0;
            audio.play(state.sequence[state.currentStep]);
            state.currentStep++;

            if (state.currentStep >= state.sequence.length) {
                state.phase = "repeating";
                state.currentStep = 0;
            }
        }
    }
});

function updateUI(): void {
    scoreEl.textContent = `Score: ${state.score}`;
    phaseEl.textContent = {
        watching:  "Listen carefully...",
        repeating: "Your turn!",
        success:   "Correct!",
        failure:   "Wrong!",
    }[state.phase];
}
input.start();
state.running = true;
startRound();
loop.start();