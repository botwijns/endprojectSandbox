import { GameLoop } from "./gameLoop.ts";
import { InputHandler } from "./inputHandler.ts";
import { createInitialState, generateSequence, type Direction } from "./gameState.ts";
import { SynthManager } from "./audio/SynthManager.ts";
import {Howl , Howler} from "howler";
const debug = true
const synth = new SynthManager();
const input = new InputHandler(debug);
const state = createInitialState();
const scoreEl = document.getElementById("score")!;
const phaseEl = document.getElementById("phase")!;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
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
var soundWalking = new Howl({src: ["sounds/walking.webm", "sounds/walking.mp3"] });
var soundBow = new Howl({
    src: [ "sounds/bow_fixed.wav"],
    html5: true,
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
let rate = 1;
let distance = 0;

function startRound(): void {
    updateUI()
    console.log("Starting Round");
    const length = state.score + 3; // sequence grows each round
    state.sequence = generateSequence(length);
    state.playerInput = [];
    state.currentStep = 0;
    state.phase = "watching";
    stepTimer = 0;
    distance = state.randomNumbers[0];
}

function handleInput(dir: Direction): void {
    console.log(dir);
    if (state.phase !== "repeating") return;
    // we always walk first, then we make the sound faster or slower
    // audio.play("walking")
    soundWalking.play()
    console.log(dir)
    let xAfter = state.player.x
    if (dir=="left"){
        xAfter--;
    }
    else{
        xAfter ++;
    }
    const newDistance = Math.abs(state.randomNumbers[state.currentStep] - xAfter);
    if (newDistance<distance){
        rate+=0.2;
    }
    else{
        rate-=0.2;
    }
    distance = newDistance;
}

input.onAction((action) => {
    // audio.resume();
    Howler.ctx?.resume();
    if (action === "moveLeft")  handleInput("left");
    if (action === "moveRight") handleInput("right");
    if (action === "interact") {
        state.phase = "watching"
    }
});

const loop = new GameLoop((dt) => {
    if (!state.running) return;

    const orientation = input.getOrientation();
    const gamma = orientation.gamma
    // console.log(beta, gamma)
    // if (gamma !== null && gamma < -20) handleInput("left");
    // if (gamma !== null && gamma > 20)  handleInput("right");

    // if (beta !== null && beta> 20) synth.playNote(NOTE.C4);
    if (gamma!== null && gamma > 20 && !state.drawn) {
        state.drawn = true;
        const id = soundBow.play("drawShort");
        console.log("play() returned:", id);
        // audio.play("bow", 1,"drawShort")
        console.log("drawing bow")
    }
    if (gamma!== null && gamma <20 && state.drawn) {
        state.drawn = false;
        soundBow.play("shootShort");
        // audio.play("bow", 1,"shootShort");
        console.log("shooting bow")
        if (distance == 0){
            // shot hits!
            state.phase = "success";
            // setTimeout(() =>audio.play("bow", 1,"hitShort"), 500);
            setTimeout(() =>soundBow.play("hitShort"), 500);
        }
        else{
            // shot misses!
            console.log("miss!")
            state.phase = "failure";
            // setTimeout(() => audio.play("failure"), 500);
            setTimeout(() =>soundFailure.play(), 500);
        }
    }
    if (state.phase === "success") {
        state.score++
        state.currentStep = state.currentStep + 1;
        // create new target locations
        if (state.currentStep>2) {
            state.currentStep = 0
            state.randomNumbers = [Math.floor(Math.random()*10 - 5), Math.floor(Math.random()*10 - 5), Math.floor(Math.random()*10 - 5)]
        }
        state.player.x = 0;
        distance = state.randomNumbers[state.currentStep];
        rate = 1;
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
        state.phase = "repeating"
    }
    else if (state.phase == "failure"){
        //reset to the old target again
        state.player.x = 0;
        distance = state.randomNumbers[state.currentStep];
        rate = 1;
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
        repeating: "Jouw beurt!",
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