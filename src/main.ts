import { GameLoop } from "./gameLoop.ts";
import { InputHandler } from "./inputHandler.ts";
import { Howler } from "howler";
import "webaudiofont";
declare const WebAudioFontPlayer: any;
declare const _tone_0000_GeneralUserGS_sf2_file: any; // piano
declare const _drum_36_1_Chaos_sf2_file: any;         // kick
declare const _drum_38_1_Chaos_sf2_file: any;         // snare
declare const _drum_42_1_Chaos_sf2_file: any;         // hi-hat

// ── WebAudioFont setup ────────────────────────────────────────────────────────
const ctx = new AudioContext();
const player = new WebAudioFontPlayer();

player.loader.decodeAfterLoading(ctx, "_tone_0000_GeneralUserGS_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_36_1_Chaos_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_38_1_Chaos_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_42_1_Chaos_sf2_file");

const instruments = {
    piano:   _tone_0000_GeneralUserGS_sf2_file,
    kick:    _drum_36_1_Chaos_sf2_file,
    snare:   _drum_38_1_Chaos_sf2_file,
    highHat: _drum_42_1_Chaos_sf2_file,
};

function scheduleNote(
    id: keyof typeof instruments,
    pitch: number,
    when: number,
    duration: number,
    volume = 0.7
): void {
    player.queueWaveTable(ctx, ctx.destination, instruments[id], when, pitch, duration, volume);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const BPM         = 90;
const BEAT        = 60 / BPM;
const HIT_WINDOW  = 1;   // ±seconds for a valid hit
const PERFECT_W   = HIT_WINDOW;
const AUDIO_LATENCY = 0.15; // seconds — tune this to your headphones (100–200ms typical)
// Pitches used as direction cues during listen phase
const PITCH_LEFT  = 48;  // low C — left
const PITCH_RIGHT = 60;  // middle C — right

// ── Types ─────────────────────────────────────────────────────────────────────
type Direction = "left" | "right";
type Phase = "idle" | "listen" | "play" | "result";

interface Beat {
    time: number;       // absolute ctx time during current phase
    direction: Direction;
}

// ── Game state ────────────────────────────────────────────────────────────────
let phase: Phase         = "idle";
let patternLength        = 4;           // grows each round
let pattern: Direction[] = [];          // the sequence to remember
let pendingBeats: Beat[] = [];          // beats awaiting player input
let score                = 0;
let combo                = 0;
let gameRunning          = false;
// let phaseEndTime         = 0;           // ctx time when current phase ends
let songLoopId: ReturnType<typeof setTimeout> | null = null;

// ── UI ────────────────────────────────────────────────────────────────────────
const debug    = !('ontouchstart' in window) && navigator.maxTouchPoints === 0;
const inp      = new InputHandler(debug);
const scoreEl  = document.getElementById("score")!;
const phaseEl  = document.getElementById("phase")!;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const logEl    = document.getElementById("log")!;

function log(msg: string)   { logEl.textContent  = msg; }
function updateUI()         { scoreEl.textContent = `Score: ${score}`; }

// ── Drum groove ───────────────────────────────────────────────────────────────
// Schedules one bar of 4/4 drums starting at `startTime`.
// Called for both listen and play phases.
function scheduleDrums(startTime: number, bars: number): void {
    const totalBeats = bars * 4;
    for (let b = 0; b < totalBeats; b++) {
        const t          = startTime + b * BEAT;
        const beatInBar  = b % 4;

        // Kick: beat 1, beat 3 (with variation)
        if (beatInBar === 0) scheduleNote("kick",    36, t,              BEAT * 0.4, 0.9);
        if (beatInBar === 2) scheduleNote("kick",    36, t,              BEAT * 0.3, 0.8);

        // Snare: beats 2 & 4
        if (beatInBar === 1 || beatInBar === 3)
            scheduleNote("snare",   38, t, BEAT * 0.3, 0.85);

        // Hi-hat: every eighth note
        scheduleNote("highHat", 42, t,              BEAT * 0.1, 0.5);
        scheduleNote("highHat", 42, t + BEAT * 0.5, BEAT * 0.1, 0.35);
    }
}

// ── Pattern generation ────────────────────────────────────────────────────────
function generatePattern(length: number): Direction[] {
    return Array.from({ length }, () => Math.random() > 0.5 ? "left" : "right");
}

// ── Listen phase ──────────────────────────────────────────────────────────────
// Plays drums + a piano cue note for each beat in the pattern.
// Low note = left, high note = right.
function startListenPhase(): void {
    phase = "listen";
    phaseEl.textContent = "👂 Listen…";
    log("remember the sequence!");

    const bars      = Math.ceil(patternLength / 4);
    const startTime = ctx.currentTime + 0.3;

    scheduleDrums(startTime, bars);

    // Schedule one cue note per pattern beat, on quarter-note slots
    pattern.forEach((dir, i) => {
        const pitch = dir === "left" ? PITCH_LEFT : PITCH_RIGHT;
        scheduleNote("piano", pitch, startTime + i * BEAT, BEAT * 0.7, 0.7);
    });

    // After pattern plays out, move to play phase (with a 1-beat gap)
    const listenDuration = (patternLength + 1) * BEAT * 1000;
    // phaseEndTime = startTime + patternLength * BEAT;
    songLoopId = setTimeout(() => {
        if (gameRunning) startPlayPhase();
    }, listenDuration);
}

// ── Play phase ────────────────────────────────────────────────────────────────
// Drums only. Player must reproduce the pattern from memory.
function startPlayPhase(): void {
    phase = "play";
    phaseEl.textContent = "🎮 Your turn!";
    log("reproduce the sequence");
    const COUNTDOWN = [3, 2, 1];
    const TICK = 800; // ms per countdown step

    COUNTDOWN.forEach((n, i) => {
        setTimeout(() => {
            if (!gameRunning) return;
            phaseEl.textContent = `${n}…`;
        }, i * TICK);
    });

    setTimeout(() => {
        if (!gameRunning) return;
        phaseEl.textContent = "🎮 Your turn!";

        const bars      = Math.ceil(patternLength / 4);
        const startTime = ctx.currentTime + 0.3;

        scheduleDrums(startTime, bars);

        // Build pending beats — same quarter-note grid as listen phase
        pendingBeats = pattern.map((direction, i) => ({
            time: startTime + i * BEAT,
            direction,
        }));

        // After the pattern window closes, evaluate any remaining missed beats
        const playDuration = (patternLength + 1) * BEAT * 1000;
        songLoopId = setTimeout(() => {
            if (gameRunning) endPlayPhase();
        }, playDuration);
    }, COUNTDOWN.length * TICK);

}

// ── End of play phase ─────────────────────────────────────────────────────────
function endPlayPhase(): void {
    // Any remaining pending beats are misses
    if (pendingBeats.length > 0) {
        combo = 0;
        log(`missed ${pendingBeats.length} beat(s)!`);
        pendingBeats = [];
    }

    phase = "result";
    phaseEl.textContent = `Round done — score: ${score}`;

    // Grow pattern every round, cap at 16
    patternLength = Math.min(patternLength + 1, 16);

    // Short pause then next round
    songLoopId = setTimeout(() => {
        if (gameRunning) startRound();
    }, 1500);
}

// ── Round entry point ─────────────────────────────────────────────────────────
function startRound(): void {
    pattern = generatePattern(patternLength);
    player.loader.waitLoad(() => startListenPhase());
}

// ── Hit detection ─────────────────────────────────────────────────────────────
function onPlayerInput(dir: Direction): void {
    if (phase !== "play" || pendingBeats.length === 0) return;

    const now = ctx.currentTime;

    // Find nearest pending beat within the hit window
    let bestIdx  = -1;
    let bestDiff = Infinity;
    pendingBeats.forEach((b, i) => {
        const diff = Math.abs(b.time - (now - AUDIO_LATENCY));
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    });

    if (bestIdx === -1 || bestDiff > HIT_WINDOW) {
        combo = 0;
        log("miss! (too early or too late)");
        return;
    }

    const beat = pendingBeats[bestIdx];

    if (beat.direction !== dir) {
        combo = 0;
        pendingBeats.splice(bestIdx, 1);
        log(`wrong direction! (wanted ${beat.direction})`);
        return;
    }

    // Correct hit
    const perfect = bestDiff < PERFECT_W;
    score += perfect ? 2 : 1;
    combo++;
    if (combo > 0 && combo % 4 === 0) score += 2; // combo bonus

    pendingBeats.splice(bestIdx, 1);
    log(`${perfect ? "perfect" : "good"}! combo ${combo}`);
    updateUI();
}

// ── Game loop — prunes overdue beats ──────────────────────────────────────────
const loop = new GameLoop((_dt: number) => {
    if (!gameRunning || phase !== "play") return;
    const now = ctx.currentTime;
    while (pendingBeats.length > 0 && pendingBeats[0].time < now - HIT_WINDOW) {
        combo = 0;
        log(`missed ${pendingBeats[0].direction}!`);
        pendingBeats.shift();
        updateUI();
    }
});

// ── Input ─────────────────────────────────────────────────────────────────────
inp.onAction((action) => {
    if (!gameRunning) return;
    if (action === "moveLeft")  onPlayerInput("left");
    if (action === "moveRight") onPlayerInput("right");
});

// ── Start / stop ──────────────────────────────────────────────────────────────
startBtn.addEventListener("click", async () => {
    if (!gameRunning) {
        ctx.resume();
        Howler.ctx?.resume();

        const granted = await inp.requestOrientationPermission();
        if (!granted) {
            startBtn.textContent = "Permission denied — tap to retry";
            return;
        }

        inp.start();
        score         = 0;
        combo         = 0;
        patternLength = 4;
        gameRunning   = true;
        updateUI();
        startRound();
        loop.start();
        startBtn.textContent = "Stop";
    } else {
        gameRunning = false;
        if (songLoopId) { clearTimeout(songLoopId); songLoopId = null; }
        pendingBeats = [];
        phase        = "idle";
        loop.stop();
        inp.stop();
        phaseEl.textContent = `Final score: ${score}`;
        log("game over");
        startBtn.textContent = "Start";
    }
});