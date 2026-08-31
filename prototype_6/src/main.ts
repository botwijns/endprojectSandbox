import { GameLoop } from "./gameLoop.ts";
import { InputHandler, SCALE_DEGREES } from "./inputHandler.ts";
import { Howler } from "howler";
import {
    generateDrumPattern,
    generateChordProgression,
    type DrumPattern,
    type ChordProgression,
} from "./music.ts";
import "webaudiofont";
declare const WebAudioFontPlayer: any;
declare const _tone_0000_GeneralUserGS_sf2_file: any; // acoustic grand piano
declare const _tone_0040_GeneralUserGS_sf2_file: any; // electric piano (Rhodes) — backing chords
declare const _tone_0241_GeneralUserGS_sf2_file: any; // nylon guitar
declare const _tone_0321_GeneralUserGS_sf2_file: any; // acoustic bass
declare const _tone_1140_Chaos_sf2_file: any;         // steel drums — chord sparkle
declare const _drum_36_1_Chaos_sf2_file: any;         // kick
declare const _drum_38_1_Chaos_sf2_file: any;         // snare
declare const _drum_42_1_Chaos_sf2_file: any;         // hi-hat
// ── WebAudioFont setup ────────────────────────────────────────────────────────
const ctx = new AudioContext();
const player = new WebAudioFontPlayer();

player.loader.decodeAfterLoading(ctx, "_tone_0000_GeneralUserGS_sf2_file");
player.loader.decodeAfterLoading(ctx, "_tone_0040_GeneralUserGS_sf2_file");
player.loader.decodeAfterLoading(ctx, "_tone_0241_GeneralUserGS_sf2_file");
player.loader.decodeAfterLoading(ctx, "_tone_0321_GeneralUserGS_sf2_file");
player.loader.decodeAfterLoading(ctx, "_tone_1140_Chaos_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_36_1_Chaos_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_38_1_Chaos_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_42_1_Chaos_sf2_file");

const instruments = {
    piano:   _tone_0000_GeneralUserGS_sf2_file,
    kick:    _drum_36_1_Chaos_sf2_file,
    snare:   _drum_38_1_Chaos_sf2_file,
    highHat: _drum_42_1_Chaos_sf2_file,
    guitar:  _tone_0241_GeneralUserGS_sf2_file,
    bass:    _tone_0321_GeneralUserGS_sf2_file,
};

// Backing-track voices, kept separate from the playable `instruments` above.
const CHORD_FONT   = _tone_0040_GeneralUserGS_sf2_file; // warm electric piano — the harmony bed
const SPARKLE_FONT = _tone_1140_Chaos_sf2_file;         // steel drums — a bar-end shimmer

type Instrument = keyof typeof instruments;
const INSTRUMENTS: Instrument[] = ["piano", "kick", "snare", "highHat", "guitar", "bass"];
// The drums are generated automatically now, so the player only cycles through
// the melodic voices.
const MELODIC_INSTRUMENTS: Instrument[] = ["piano", "guitar", "bass"];
const INSTRUMENT_COLOR: Record<Instrument, string> = {
    piano:   "#4cafef",
    kick:    "#ff6b6b",
    snare:   "#ffd93d",
    highHat: "#6bcb77",
    guitar: "#99afff",
    bass: "#e699ff",
};
// Percussive instruments always ring at their natural drum pitch; only the
// melodic voices are shifted by the melody the player builds.
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
const STEPS_PER_CHORD = 2;                // one chord per quarter-note beat
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

function emptyPattern(): Record<Instrument, Track> {
    return {
        piano: Array(STEPS).fill(null),
        kick: Array(STEPS).fill(null),
        snare: Array(STEPS).fill(null),
        highHat: Array(STEPS).fill(null),
        guitar: Array(STEPS).fill(null),
        bass: Array(STEPS).fill(null),
    };
}

let pattern: Record<Instrument, Track> = emptyPattern();
let instrumentIndex = 0;
let currentInstrument: Instrument = MELODIC_INSTRUMENTS[0];
let gameRunning = false;
let stepIntervalId: number | null = null;
let endTimeoutId: number | null = null;
let startedAt = 0;

// Auto-generated backing track.
let drumPattern: DrumPattern | null = null;
let progression: ChordProgression = { events: [], label: "—" };

// ── UI ────────────────────────────────────────────────────────────────────────
const inp          = new InputHandler();
const gridEl        = document.getElementById("grid")!;
const phaseEl       = document.getElementById("hud-phase")!;
const bpmEl         = document.getElementById("hud-bpm")!;
const instrumentEl  = document.getElementById("hud-instrument")!;
const backingEl     = document.getElementById("hud-backing")!;
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
            backingEl.textContent = "";
            timerEl.textContent = "";
            break;
        case "composing":
            phaseEl.textContent = "Compose your melody over the beat";
            bpmEl.textContent = `${bpm} BPM`;
            instrumentEl.textContent = `instrument: ${currentInstrument}`;
            backingEl.textContent = drumPattern
                ? `beat: ${drumPattern.name}  |  chords: ${progression.label}`
                : "";
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

// ── Backing track ─────────────────────────────────────────────────────────────
function applyDrumPattern(dp: DrumPattern): void {
    for (let s = 0; s < STEPS; s++) {
        pattern.kick[s]    = dp.kick[s]  ? { note: 0, instrument: "kick" }    : null;
        pattern.snare[s]   = dp.snare[s] ? { note: 0, instrument: "snare" }   : null;
        pattern.highHat[s] = dp.hihat[s] ? { note: 0, instrument: "highHat" } : null;
    }
}

// Collect every melodic note the player has placed, indexed by step, so the
// chord generator can "hear" the melody.
function melodyByStep(): number[][] {
    const out: number[][] = [];
    for (let s = 0; s < STEPS; s++) {
        const notes: number[] = [];
        for (const id of MELODIC_INSTRUMENTS) {
            const slot = pattern[id][s];
            if (slot) notes.push(slot.note);
        }
        out.push(notes);
    }
    return out;
}

// Re-derive the backing chords from the current melody. Called after every edit
// so the harmony follows along as the player builds their loop.
function regenerateChords(): void {
    progression = generateChordProgression(melodyByStep(), STEPS, STEPS_PER_CHORD);
    updateHud();
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

    // Backing chord — struck on its beat boundary, held across the beat with a
    // short lazy strum so it sits behind the melody rather than on top of it.
    const chord = progression.events.find(e => e.step === step);
    if (chord) {
        const beatSec = (stepDurationMs / 1000) * STEPS_PER_CHORD;
        chord.voicing.forEach((midi, i) => {
            player.queueWaveTable(
                ctx, ctx.destination, CHORD_FONT,
                ctx.currentTime + 0.02 + i * 0.018,
                midi,
                beatSec * 1.9,
                0.18
            );
        });
    }

    // A single steel-drum shimmer on the top chord tone at the end of the bar,
    // as a turnaround flourish.
    if (step === STEPS - 1 && progression.events.length > 0) {
        const lastVoicing = progression.events[progression.events.length - 1].voicing;
        const top = lastVoicing[lastVoicing.length - 1];
        player.queueWaveTable(
            ctx, ctx.destination, SPARKLE_FONT,
            ctx.currentTime + 0.02, top + 12, (stepDurationMs / 1000) * 1.4, 0.09
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
    regenerateChords();
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
    regenerateChords();
    log(`step ${currentStep + 1}: nudged to note ${note + 1}`);
    renderGrid();
}

function switchInstrument(): void {
    if (phase !== "composing") return;
    instrumentIndex = (instrumentIndex + 1) % MELODIC_INSTRUMENTS.length;
    currentInstrument = MELODIC_INSTRUMENTS[instrumentIndex];
    log(`switched instrument to ${currentInstrument}`);
    updateHud();
    renderGrid();
}

// ── Start / end ───────────────────────────────────────────────────────────────
function startGame(tappedBpm: number): void {
    bpm = tappedBpm;
    stepDurationMs = (60000 / bpm) / 2; // 8 steps = eighth notes across one bar
    phase = "composing";
    gameRunning = true;
    currentStep = -1;
    pattern = emptyPattern();

    // Generate a drum groove to play the melody on, and start with a clean
    // (empty) chord bed until the player actually plays something.
    drumPattern = generateDrumPattern(STEPS);
    applyDrumPattern(drumPattern);
    progression = { events: [], label: "—" };

    instrumentIndex = 0;
    currentInstrument = MELODIC_INSTRUMENTS[0];
    startedAt = performance.now();
    updateHud();
    renderGrid();
    log(`beat generated: ${drumPattern.name} groove — start playing`);

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
