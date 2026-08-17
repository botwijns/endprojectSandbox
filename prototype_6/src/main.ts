import { GameLoop } from "./gameLoop.ts";
import { InputHandler, SCALE_DEGREES } from "./inputHandler.ts";
import { Howler } from "howler";
import "webaudiofont";
declare const WebAudioFontPlayer: any;
declare const _tone_0000_GeneralUserGS_sf2_file: any; // piano
declare const _drum_36_1_Chaos_sf2_file: any;         // kick
declare const _drum_38_1_Chaos_sf2_file: any;         // snare
declare const _drum_42_1_Chaos_sf2_file: any;         // hi-hat
declare const _tone_0241_GeneralUserGS_sf2_file: any; // guitar
declare  const _tone_0321_GeneralUserGS_sf2_file: any; // bass
// ── WebAudioFont setup ────────────────────────────────────────────────────────
const ctx = new AudioContext();
const player = new WebAudioFontPlayer();

player.loader.decodeAfterLoading(ctx, "_tone_0000_GeneralUserGS_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_36_1_Chaos_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_38_1_Chaos_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_42_1_Chaos_sf2_file");
player.loader.decodeAfterLoading(ctx, "_tone_0321_GeneralUserGS_sf2_file");
player.loader.decodeAfterLoading(ctx, "_tone_0241_GeneralUserGS_sf2_file");

const instruments = {
    piano:   _tone_0000_GeneralUserGS_sf2_file,
    kick:    _drum_36_1_Chaos_sf2_file,
    snare:   _drum_38_1_Chaos_sf2_file,
    highHat: _drum_42_1_Chaos_sf2_file,
    guitar: _tone_0241_GeneralUserGS_sf2_file,
    bass: _tone_0321_GeneralUserGS_sf2_file,
};

type Instrument = keyof typeof instruments;
const INSTRUMENTS: Instrument[] = ["piano", "kick", "snare", "highHat", "guitar", "bass"];
const INSTRUMENT_COLOR: Record<Instrument, string> = {
    piano:   "#4cafef",
    kick:    "#ff6b6b",
    snare:   "#ffd93d",
    highHat: "#6bcb77",
    guitar: "#99afff",
    bass: "#e699ff",
};
// Percussive instruments always ring at their natural drum pitch; only piano
// notes are actually shifted by the melody the player builds.
const DRUM_PITCH: Record<Exclude<Instrument, "piano" | "guitar" | "bass">, number> = {
    kick: 36,
    snare: 38,
    highHat: 42,
};

function scheduleNote(
    id: Instrument,
    pitch: number,
    when: number,
    duration: number,
    volume = 0.7
): void {
    player.queueWaveTable(ctx, ctx.destination, instruments[id], when, pitch, duration, volume);
}

// Audio needs a user gesture to unlock — the very first tap anywhere does it,
// since there's no "start" button in this game.
window.addEventListener("pointerdown", () => {
    ctx.resume();
    Howler.ctx?.resume();
}, { once: true });

// ── Constants ─────────────────────────────────────────────────────────────────
const STEPS = 8;                          // one 8-step bar (eighth notes)
const GAME_DURATION_MS = 3 * 60 * 1000;   // session length: a few minutes
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11, 12]; // scale degree -> semitones from root
const ROOT_MIDI = 60; // middle C

interface StepSlot { note: number; instrument: Instrument }

function pitchForNote(note: number): number {
    const degree = MAJOR_SCALE[Math.max(0, Math.min(MAJOR_SCALE.length - 1, note))];
    return ROOT_MIDI + degree;
}

function pitchForSlot(slot: StepSlot): number {
    return slot.instrument === "piano" || slot.instrument === "guitar" || slot.instrument === "bass"? pitchForNote(slot.note) : DRUM_PITCH[slot.instrument];
}

// ── Game state ────────────────────────────────────────────────────────────────
type Phase = "idle" | "composing" | "ended";

let phase: Phase = "idle";
let bpm = 0;
let stepDurationMs = 0;
let currentStep = 0;
type Track = (StepSlot | null)[];

let pattern: Record<Instrument, Track> = {
    piano: Array(STEPS).fill(null),
    kick: Array(STEPS).fill(null),
    snare: Array(STEPS).fill(null),
    highHat: Array(STEPS).fill(null),
    guitar: Array(STEPS).fill(null),
    bass: Array(STEPS).fill(null),
};
let instrumentIndex = 0;
let currentInstrument: Instrument = INSTRUMENTS[0];
let gameRunning = false;
let stepIntervalId: number | null = null;
let endTimeoutId: number | null = null;
let startedAt = 0;

// ── UI ────────────────────────────────────────────────────────────────────────
const inp          = new InputHandler();
const gridEl        = document.getElementById("grid")!;
const phaseEl       = document.getElementById("hud-phase")!;
const bpmEl         = document.getElementById("hud-bpm")!;
const instrumentEl  = document.getElementById("hud-instrument")!;
const timerEl       = document.getElementById("hud-timer")!;
const logEl         = document.getElementById("log")!;

function log(msg: string) { logEl.textContent = msg; }

// Build the STEPS x SCALE_DEGREES cell grid once, up front.
const cellEls: HTMLDivElement[][] = [];
for (let s = 0; s < STEPS; s++) {
    cellEls.push([]);
    for (let r = 0; r < SCALE_DEGREES; r++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.style.gridColumn = String(s + 1);
        cell.style.gridRow = String(SCALE_DEGREES - r); // row 0 = bottom = lowest note
        gridEl.appendChild(cell);
        cellEls[s].push(cell);
    }
}

function renderGrid(): void {
    for (let s = 0; s < STEPS; s++) {
        const slot = pattern[currentInstrument][s];
        for (let r = 0; r < SCALE_DEGREES; r++) {
            const cell = cellEls[s][r];
            const filled = !!slot && slot.note === r;
            cell.classList.toggle("current", s === currentStep && phase === "composing");
            cell.style.background = filled ? INSTRUMENT_COLOR[slot!.instrument] : "";
        }
    }
}

function updateHud(): void {
    switch (phase) {
        case "idle":
            phaseEl.textContent = "Tap the top-right corner 3x to set the tempo and start";
            bpmEl.textContent = "";
            instrumentEl.textContent = "";
            timerEl.textContent = "";
            break;
        case "composing":
            phaseEl.textContent = "Compose your melody";
            bpmEl.textContent = `${bpm} BPM`;
            instrumentEl.textContent = `instrument: ${currentInstrument}`;
            break;
        case "ended":
            phaseEl.textContent = "Time's up! Nice loop.";
            timerEl.textContent = "";
            break;
    }
}

function updateTimer(remainingMs: number): void {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");
    timerEl.textContent = `${mm}:${ss}`;
}

// ── Sequencer ─────────────────────────────────────────────────────────────────
function playStep(step: number): void {
    for (const instrument of INSTRUMENTS) {
        const slot = pattern[instrument][step];
        if (!slot) continue;

        scheduleNote(
            slot.instrument,
            pitchForSlot(slot),
            ctx.currentTime + 0.02,
            (stepDurationMs / 1000) * 0.9,
            0.8
        );
    }
}

function tick(): void {
    currentStep = (currentStep + 1) % STEPS;
    playStep(currentStep);
    renderGrid();
}

function previewNote(slot: StepSlot): void {
    // Instant feedback for whatever was just placed/nudged, independent of the loop.
    scheduleNote(slot.instrument, pitchForSlot(slot), ctx.currentTime + 0.01, 0.25, 0.6);
}

function setNote(note: number): void {
    if (phase !== "composing") return;
    const slot: StepSlot = { note, instrument: currentInstrument };
    pattern[currentInstrument][currentStep] = slot;
    previewNote(slot);
    log(`step ${currentStep + 1}: note ${note + 1} (${currentInstrument})`);
    renderGrid();
}

function nudgeNote(direction: 1 | -1): void {
    if (phase !== "composing") return;
    const existing = pattern[currentInstrument][currentStep] ?? { note: Math.floor(SCALE_DEGREES / 2), instrument: currentInstrument };
    const note = Math.max(0, Math.min(SCALE_DEGREES - 1, existing.note + direction));
    const slot: StepSlot = { note, instrument: existing.instrument };
    pattern[currentInstrument][currentStep] = slot;
    previewNote(slot);
    log(`step ${currentStep + 1}: nudged to note ${note + 1}`);
    renderGrid();
}

function switchInstrument(): void {
    if (phase !== "composing") return;
    instrumentIndex = (instrumentIndex + 1) % INSTRUMENTS.length;
    currentInstrument = INSTRUMENTS[instrumentIndex];
    log(`switched instrument to ${currentInstrument}`);
    updateHud();
}

// ── Start / end ───────────────────────────────────────────────────────────────
function startGame(tappedBpm: number): void {
    bpm = tappedBpm;
    stepDurationMs = (60000 / bpm) / 2; // 8 steps = eighth notes across one bar
    phase = "composing";
    gameRunning = true;
    currentStep = -1;
    pattern = {
        piano: Array(STEPS).fill(null),
        kick: Array(STEPS).fill(null),
        snare: Array(STEPS).fill(null),
        highHat: Array(STEPS).fill(null),
        guitar: Array(STEPS).fill(null),
        bass: Array(STEPS).fill(null),
    };
    instrumentIndex = 0;
    currentInstrument = INSTRUMENTS[0];
    startedAt = performance.now();
    updateHud();
    renderGrid();

    stepIntervalId = window.setInterval(tick, stepDurationMs);
    loop.start(100);
    endTimeoutId = window.setTimeout(endGame, GAME_DURATION_MS);
}

function endGame(): void {
    gameRunning = false;
    if (stepIntervalId !== null) { window.clearInterval(stepIntervalId); stepIntervalId = null; }
    if (endTimeoutId !== null) { window.clearTimeout(endTimeoutId); endTimeoutId = null; }
    loop.stop();
    phase = "ended";
    updateHud();
    renderGrid();
    log("game over — tap the top-right corner 3x to play again");
    phase = "idle"; // ready for a fresh triple-tap to restart
}

// ── Game loop — drives the countdown display ──────────────────────────────────
const loop = new GameLoop((_dt: number) => {
    if (!gameRunning) return;
    updateTimer(GAME_DURATION_MS - (performance.now() - startedAt));
});

// ── Input ─────────────────────────────────────────────────────────────────────
inp.onAction((action) => {
    switch (action.type) {
        case "bpmSet":
            if (phase === "idle") startGame(action.bpm);
            break;
        case "noteSet":
            setNote(action.note);
            break;
        case "noteNudge":
            nudgeNote(action.direction);
            break;
        case "instrumentSwitch":
            switchInstrument();
            break;
    }
});

inp.start();
updateHud();
renderGrid();
