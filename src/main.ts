import { GameLoop } from "./gameLoop.ts";
import { InputHandler } from "./inputHandler.ts";
import { Howler } from "howler";
import "webaudiofont";
declare const WebAudioFontPlayer: any;
declare const _tone_0000_GeneralUserGS_sf2_file: any; // piano
declare const _tone_0040_GeneralUserGS_sf2_file: any; // violin
declare const _drum_36_1_Chaos_sf2_file: any;         // kick
declare const _drum_38_1_Chaos_sf2_file: any;         // snare
declare const _drum_42_1_Chaos_sf2_file: any;         // hi-hat

// ── WebAudioFont setup ────────────────────────────────────────────────────────
const ctx = new AudioContext();
const player = new WebAudioFontPlayer();

player.loader.decodeAfterLoading(ctx, "_tone_0000_GeneralUserGS_sf2_file");
player.loader.decodeAfterLoading(ctx, "_tone_0040_GeneralUserGS_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_36_1_Chaos_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_38_1_Chaos_sf2_file");
player.loader.decodeAfterLoading(ctx, "_drum_42_1_Chaos_sf2_file");

const instruments = {
    piano:   _tone_0000_GeneralUserGS_sf2_file,
    violin:  _tone_0040_GeneralUserGS_sf2_file,
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

// ── Song generation ───────────────────────────────────────────────────────────

type Direction = "left" | "right";

interface Beat {
    index: number;       // beat index within the pattern (0-based)
    time: number;        // absolute AudioContext time
    direction: Direction;
    subdivision: number; // 0 = quarter, 1 = eighth-note offbeat
}

interface Song {
    bpm: number;
    beats: Beat[];           // player-action beats (quarter + occasional eighth notes)
    patternBeats: number;    // total length of pattern in quarter-note beats
    scale: number[];         // MIDI pitches to draw melody from
    melodyNotes: Array<{ pitch: number; beat: number; duration: number }>;
}

const SCALES = {
    minor:      [0, 2, 3, 5, 7, 8, 10],
    major:      [0, 2, 4, 5, 7, 9, 11],
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    pentatonic: [0, 3, 5, 7, 10],
};

function rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateSong(startTime: number): Song {
    const bpm = rand(85, 130);
    const beat = 60 / bpm;
    const patternBeats = 8; // 2 bars of 4/4

    // Pick a random scale and root note
    const scaleType = pick(Object.keys(SCALES)) as keyof typeof SCALES;
    const root = rand(48, 60); // C3–C4 range
    const scale = SCALES[scaleType].map(i => root + i);

    // ── Drum groove ───────────────────────────────────────────────────────────
    // Kick: always on beat 1, randomise beat 3 vs 3-and
    // Snare: always on 2 & 4
    // Hi-hat: every eighth note, occasional 16th flourish

    for (let b = 0; b < patternBeats; b++) {
        const t = startTime + b * beat;
        const beatInBar = b % 4;

        // Kick
        if (beatInBar === 0) scheduleNote("kick", 36, t, beat * 0.4, 0.9);
        if (beatInBar === 2 && Math.random() > 0.4) scheduleNote("kick", 36, t, beat * 0.3, 0.8);
        if (beatInBar === 2 && Math.random() > 0.7) scheduleNote("kick", 36, t + beat * 0.5, beat * 0.2, 0.7); // off-beat kick

        // Snare
        if (beatInBar === 1 || beatInBar === 3) scheduleNote("snare", 38, t, beat * 0.3, 0.85);

        // Hi-hat eighth notes
        scheduleNote("highHat", 42, t,               beat * 0.1, 0.5);
        scheduleNote("highHat", 42, t + beat * 0.5,  beat * 0.1, Math.random() > 0.3 ? 0.35 : 0.55);
    }

    // ── Melody ────────────────────────────────────────────────────────────────
    // Generate a short motif (4 notes) and repeat/vary it across the 8 beats
    const motif: number[] = Array.from({ length: 4 }, () => pick(scale));
    const melodyNotes: Song["melodyNotes"] = [];
    const melodyInstrument: keyof typeof instruments = Math.random() > 0.5 ? "piano" : "violin";

    // Place motif on beats 0,2,4,6 with slight variation on repeat
    for (let rep = 0; rep < 2; rep++) {
        motif.forEach((pitch, i) => {
            const beatPos = rep * 4 + i;
            const variedPitch = rep > 0 && Math.random() > 0.5 ? pick(scale) : pitch;
            const duration = beat * (Math.random() > 0.3 ? 0.9 : 0.45);
            const t = startTime + beatPos * beat;
            scheduleNote(melodyInstrument, variedPitch, t, duration, 0.55);
            melodyNotes.push({ pitch: variedPitch, beat: beatPos, duration });
        });
    }

    // ── Player beats ──────────────────────────────────────────────────────────
    // Every quarter note beat is a player beat. Occasionally add an eighth-note
    // offbeat for variety (more likely at higher BPM).
    const offbeatChance = bpm > 110 ? 0.4 : 0.2;
    const beats: Beat[] = [];

    for (let b = 0; b < patternBeats; b++) {
        const dir: Direction = Math.random() > 0.5 ? "left" : "right";
        beats.push({
            index: b,
            time: startTime + b * beat,
            direction: dir,
            subdivision: 0,
        });
        if (Math.random() < offbeatChance) {
            beats.push({
                index: b,
                time: startTime + b * beat + beat * 0.5,
                direction: Math.random() > 0.5 ? "left" : "right",
                subdivision: 1,
            });
        }
    }

    // Sort by time (offbeats may have been inserted out of order)
    beats.sort((a, b) => a.time - b.time);

    return { bpm, beats, patternBeats, scale, melodyNotes };
}

// ── Rhythm game state ─────────────────────────────────────────────────────────

const HIT_WINDOW    = 0.18;  // ±seconds for a "good" hit
const PERFECT_RATIO = 0.4;   // fraction of HIT_WINDOW for "perfect"

type HitResult = "perfect" | "good" | "miss";

interface RoundResult {
    beatIndex: number;
    result: HitResult;
}

let song: Song | null = null;
let songLoopId: ReturnType<typeof setTimeout> | null = null;
let pendingBeats: Beat[] = [];   // beats not yet hit or passed
let results: RoundResult[] = [];
let score = 0;
let combo = 0;
let gameRunning = false;

// ── UI elements ───────────────────────────────────────────────────────────────
const debug    = !('ontouchstart' in window) && navigator.maxTouchPoints === 0;
const input    = new InputHandler(debug);
const scoreEl  = document.getElementById("score")!;
const phaseEl  = document.getElementById("phase")!;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const logEl    = document.getElementById("log")!;

function log(msg: string): void { logEl.textContent = msg; }
function updateUI(): void {
    scoreEl.textContent = `Score: ${score}`;
}

// ── Song loop ─────────────────────────────────────────────────────────────────

function startSong(): void {
    player.loader.waitLoad(() => {
        const startTime = ctx.currentTime + 0.2;
        song = generateSong(startTime);
        pendingBeats = [...song.beats];
        results = [];

        phaseEl.textContent = `♩ ${song.bpm} BPM — go!`;
        log("left or right — hit the beat!");

        // Loop: reschedule a new pattern when this one ends
        const patternDuration = (song.patternBeats * 60) / song.bpm * 1000;
        songLoopId = setTimeout(() => {
            if (gameRunning) startSong();
        }, patternDuration);
    });
}

function stopSong(): void {
    if (songLoopId !== null) {
        clearTimeout(songLoopId);
        songLoopId = null;
    }
    song = null;
    pendingBeats = [];
}

// ── Hit detection ─────────────────────────────────────────────────────────────

function onPlayerInput(dir: Direction): void {
    if (!song || pendingBeats.length === 0) return;

    const now = ctx.currentTime;

    // Find the nearest pending beat to now, within the hit window
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < pendingBeats.length; i++) {
        const diff = Math.abs(pendingBeats[i].time - now);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }

    if (bestIdx === -1 || bestDiff > HIT_WINDOW) {
        // No beat close enough — miss
        combo = 0;
        log("miss!");
        return;
    }

    const beat = pendingBeats[bestIdx];

    // Wrong direction counts as a miss
    if (beat.direction !== dir) {
        combo = 0;
        pendingBeats.splice(bestIdx, 1);
        log(`wrong direction! (wanted ${beat.direction})`);
        return;
    }

    // Correct direction — rate by timing
    let result: HitResult;
    if (bestDiff < HIT_WINDOW * PERFECT_RATIO) {
        result = "perfect";
        score += 2;
        combo++;
    } else {
        result = "good";
        score += 1;
        combo++;
    }

    // Combo bonus every 8 hits
    if (combo > 0 && combo % 8 === 0) score += 3;

    pendingBeats.splice(bestIdx, 1);
    results.push({ beatIndex: beat.index, result });
    log(`${result}! ${beat.direction} — combo ${combo}`);
    updateUI();
}

// ── Game loop (prunes missed beats) ──────────────────────────────────────────

const loop = new GameLoop((_dt: number) => {
    if (!gameRunning || !song) return;

    const now = ctx.currentTime;

    // Any beat more than HIT_WINDOW in the past without a hit is a miss
    while (pendingBeats.length > 0 && pendingBeats[0].time < now - HIT_WINDOW) {
        combo = 0;
        log(`miss! (${pendingBeats[0].direction})`);
        pendingBeats.shift();
        updateUI();
    }
});

// ── Input ─────────────────────────────────────────────────────────────────────

input.onAction((action) => {
    if (!gameRunning) return;
    if (action === "moveLeft")  onPlayerInput("left");
    if (action === "moveRight") onPlayerInput("right");
});

// ── Start / stop ──────────────────────────────────────────────────────────────

startBtn.addEventListener("click", async () => {
    if (!gameRunning) {
        ctx.resume();
        Howler.ctx?.resume();

        const granted = await input.requestOrientationPermission();
        if (!granted) {
            startBtn.textContent = "Permission denied — tap to retry";
            return;
        }

        input.start();
        score = 0;
        combo = 0;
        gameRunning = true;
        updateUI();
        startSong();
        loop.start();
        startBtn.textContent = "Stop";
    } else {
        gameRunning = false;
        stopSong();
        loop.stop();
        input.stop();
        phaseEl.textContent = `Final score: ${score}`;
        log("game over");
        startBtn.textContent = "Start";
    }
});