import { InputHandler, SCALE_DEGREES } from "./inputHandler.ts";
import { ShakeDetector } from "./shake.ts";
import { Howl, Howler } from "howler";
import { generateDrumPattern, type DrumPattern } from "./music.ts";
import { BRIEFS, briefAt, type Brief, type MelodicInstrument } from "./briefs.ts";
import { speak, earcon, setSpeechEnabled, stopSpeech } from "./speech.ts";
import { createIntroLevel, type IntroGate, type IntroLevel } from "./intro/introLevel.ts";
import "webaudiofont";
import { enterFullscreen } from "../../src/fullscreen.ts";
declare const WebAudioFontPlayer: any;
// Each WebAudioFont file assigns one global var (loaded via a <script> tag in
// index.html) — this table maps our instrument keys to those var names, so
// adding an instrument is just one new entry + one new <script> tag instead
// of a hand-written `declare const` per font.
declare global { interface Window { [fontVar: string]: unknown } }
const FONT_VARS = {
    piano:            "_tone_0000_GeneralUserGS_sf2_file",
    electricPiano:    "_tone_0040_GeneralUserGS_sf2_file",
    distortionGuitar: "_tone_0301_GeneralUserGS_sf2_file",
    electricBass:     "_tone_0331_GeneralUserGS_sf2_file",
    slapBass:         "_tone_0361_GeneralUserGS_sf2_file",
    cello:            "_tone_0421_GeneralUserGS_sf2_file",
    contrabass:       "_tone_0430_GeneralUserGS_sf2_file",
    trumpet:          "_tone_0560_GeneralUserGS_sf2_file",
    synthPad:         "_tone_0882_GeneralUserGS_sf2_file",
    steelDrums:       "_tone_1140_Chaos_sf2_file",
    kick:             "_drum_36_1_Chaos_sf2_file",
    snare:            "_drum_38_1_Chaos_sf2_file",
    highHat:          "_drum_42_1_Chaos_sf2_file",
} as const;
type Instrument = keyof typeof FONT_VARS;
const INSTRUMENTS = Object.keys(FONT_VARS) as Instrument[];

// ── WebAudioFont setup ────────────────────────────────────────────────────────
const ctx = new AudioContext();
const player = new WebAudioFontPlayer();

for (const fontVar of Object.values(FONT_VARS)) player.loader.decodeAfterLoading(ctx, fontVar);
const instruments = Object.fromEntries(
    Object.entries(FONT_VARS).map(([key, fontVar]) => [key, window[fontVar]]),
) as Record<Instrument, any>;

// The drums are generated automatically, so the player only cycles the melodic voices.
const MELODIC_INSTRUMENTS: MelodicInstrument[] = [
    "piano", "electricPiano", "distortionGuitar", "electricBass", "slapBass",
    "cello", "contrabass", "trumpet", "synthPad", "steelDrums",
];
const MELODIC_SET = new Set<Instrument>(MELODIC_INSTRUMENTS);
const INSTRUMENT_COLOR: Record<Instrument, string> = {
    piano:            "#4cafef",
    electricPiano:    "#6fd1c5",
    distortionGuitar: "#ff8a3d",
    electricBass:     "#c77dff",
    slapBass:         "#e699ff",
    cello:            "#a0522d",
    contrabass:       "#7a4522",
    trumpet:          "#ffd93d",
    synthPad:         "#8ecae6",
    steelDrums:       "#4caf50",
    kick:             "#ff6b6b",
    snare:            "#ffd93d",
    highHat:          "#6bcb77",
};
const INSTRUMENT_VOLUME: Record<Instrument, number> = {
    piano: 0.6, electricPiano: 0.6, distortionGuitar: 0.5, electricBass: 1, slapBass: 0.7,
    cello: 0.7, contrabass: 0.7, trumpet: 0.6, synthPad: 0.5, steelDrums: 0.7,
    kick: 0.8, snare: 0.8, highHat: 0.8,
};
const INSTRUMENT_LABEL_NL: Record<MelodicInstrument, string> = {
    piano: "piano", electricPiano: "elektrische piano",
    distortionGuitar: "rockgitaar", electricBass: "basgitaar", slapBass: "slapbas",
    cello: "cello", contrabass: "contrabas",
    trumpet: "trompet", synthPad: "droomklank", steelDrums: "steeldrum",
};
// Percussive instruments ring at their natural drum pitch.
const DRUM_PITCH: Record<Exclude<Instrument, MelodicInstrument>, number> = {
    kick: 36, snare: 38, highHat: 42,
};
// Bass-register instruments sound much more natural transposed down from the
// piano-centric register the scales are written in.
const PITCH_OFFSET: Partial<Record<Instrument, number>> = {
    electricBass: -12, slapBass: -12, cello: -12, contrabass: -24,
};

function isMelodic(id: Instrument): id is MelodicInstrument {
    return MELODIC_SET.has(id);
}

function scheduleNote(
    id: Instrument, pitch: number, when: number, duration: number, volume = 0.7,
    destination: AudioNode = ctx.destination,
): void {
    try {
        player.queueWaveTable(ctx, destination, instruments[id], when, pitch, duration, volume);
    } catch {
        // A font can still be mid-decode right after page load (more fonts
        // now means a longer decode window) — skip this one note rather
        // than let it crash the sequencer.
    }
}

// Audio needs a user gesture to unlock — the first tap anywhere does it.
window.addEventListener("pointerdown", () => {
    ctx.resume();
    Howler.ctx?.resume();
}, { once: true });

// ── Gorilla experiment ───────────────────────────────────────────────────────
// Like prototype 5: an unexpected sound slipped into the game. `experiment`
// picks which one (0 = off, 1 = meow, 2 = bark, 3 = boing). It replaces one
// background drum hit during the second melody — not before its fourth loop and
// not on the bar's first drum hit — once per game.
let experiment = 1;
const gorillaSounds: Howl[] = [
    new Howl({ src: "sounds/meow.mp3" }),
    new Howl({ src: "sounds/bark.mp3" }),
    new Howl({ src: "sounds/boing.mp3" }),
];
let gorillaPlayed = false;

// ── Constants ─────────────────────────────────────────────────────────────────
const STEPS = 8;                      // one 8-step bar (eighth notes)
const ROOT_MIDI = 60;                 // middle C

// Each step's audio is panned to match its column — step 0 (leftmost) plays
// from the left speaker, step 7 (rightmost) from the right — so the sound
// sweeps across in the same direction the columns represent.
const STEP_PANNERS: AudioNode[] = Array.from({ length: STEPS }, (_, step) => {
    const panner = ctx.createStereoPanner();
    panner.pan.value = -1 + (2 * step) / (STEPS - 1);
    panner.connect(ctx.destination);
    return panner;
});
const SLOWDOWN = 1;                 // the game runs this many times slower than the real tempo
const HOLD_THRESHOLD_MS = 180;        // minimum hold before a note sustains
const MIXTAPE_KEY = "p6_mixtape";
const BEST_KEY = "p6_best";
const SPEECH_KEY = "p6_speech";

interface StepSlot { note: number; instrument: Instrument }

// Current scale + loudness come from the active brief.
let currentScale: number[] = BRIEFS[0].scale;
let currentVolume = BRIEFS[0].volume;

function pitchForNote(note: number, instrument: Instrument, scale: number[] = currentScale): number {
    const i = Math.max(0, Math.min(scale.length - 1, note));
    return ROOT_MIDI + scale[i] + (PITCH_OFFSET[instrument] ?? 0);
}

function pitchForSlot(slot: StepSlot): number {
    return isMelodic(slot.instrument) ? pitchForNote(slot.note, slot.instrument) : DRUM_PITCH[slot.instrument];
}

// ── Game state ────────────────────────────────────────────────────────────────
type Phase = "idle" | "composing" | "done";

let phase: Phase = "idle";
let bpm = 0;
let stepDurationMs = 0;
let currentStep = 0;
let pendingIntro = false;             // which start-screen button was pressed
let randomNoteMode = false;           // placed notes get a random pitch instead of tap-height

let holdStartAt = 0;

// While the pad is held the note "sustains": each step the playhead moves
// onto gets the same note, so holding longer fills more steps.
let padHeld = false;
let heldNote: number | null = null;

// The remove button undoes notes in the order they were placed (not whatever
// happens to be under the playhead right now), so pressing it repeatedly
// walks back through everything the player just did. Capped so idle noodling
// over a long session can't grow this forever.
const MAX_UNDO_DEPTH = 32;
const placedNoteStack: { instrument: MelodicInstrument; step: number }[] = [];

// Repeated nudges/holds on the same step are refining one note, not placing
// several — collapse those into the stack's existing top entry so undoing
// doesn't cost more than one press per note the player actually intended.
function recordPlacedNote(instrument: MelodicInstrument, step: number): void {
    const top = placedNoteStack[placedNoteStack.length - 1];
    if (top && top.instrument === instrument && top.step === step) return;
    placedNoteStack.push({ instrument, step });
    if (placedNoteStack.length > MAX_UNDO_DEPTH) placedNoteStack.shift();
}

// Guided intro (src/intro/introLevel.ts): the campfire fisherman unlocks the
// controls one at a time, so stray taps can't do anything he hasn't explained.
// The intro plays with piano and guitar only.
const INTRO_INSTRUMENTS: MelodicInstrument[] = ["piano", "distortionGuitar"];
let introMode = false;
let intro: IntroLevel | null = null;
const introAllowed = new Set<IntroGate>();
// While > 0 the intro is replaying the finished song: counts down one per step.
let replayStepsLeft = 0;
let replayDone: (() => void) | null = null;

function tutorialAllows(gate: IntroGate): boolean {
    return !introMode || introAllowed.has(gate);
}

type Track = (StepSlot | null)[];
function emptyPattern(): Record<Instrument, Track> {
    return Object.fromEntries(
        INSTRUMENTS.map(id => [id, Array(STEPS).fill(null)]),
    ) as Record<Instrument, Track>;
}

let pattern: Record<Instrument, Track> = emptyPattern();
let currentInstrument: MelodicInstrument = MELODIC_INSTRUMENTS[0];
let stepIntervalId: number | null = null;

let briefIndex = 0;
let currentBrief: Brief = BRIEFS[0];
let drumPattern: DrumPattern | null = null;
let briefLoop = 0;                    // full bars played in the current brief (1 = first loop)

interface MixtapeTrack {
    brief: string;
    notes: [number, number, MelodicInstrument][];
    groove: DrumPattern;
    volume: number;
}
let mixtape: MixtapeTrack[] = [];

// ── UI ────────────────────────────────────────────────────────────────────────
const inp            = new InputHandler();
const shake           = new ShakeDetector();
const startScreenEl  = document.getElementById("start-screen")!;
const gameScreenEl   = document.getElementById("game-screen")!;
const introBtn       = document.getElementById("intro-btn") as HTMLButtonElement;
const gameBtn        = document.getElementById("game-btn") as HTMLButtonElement;
const stopBtn        = document.getElementById("stop-btn") as HTMLButtonElement;
const speechToggleEl = document.getElementById("speech-toggle") as HTMLInputElement;
const randomNoteToggleEl = document.getElementById("random-note-toggle") as HTMLInputElement;
const startNoteEl    = document.getElementById("start-note")!;

const gridEl        = document.getElementById("grid")!;
const phaseEl       = document.getElementById("hud-phase")!;
const bpmEl         = document.getElementById("hud-bpm")!;
const instrumentEl  = document.getElementById("hud-instrument")!;
const backingEl     = document.getElementById("hud-backing")!;
const logEl         = document.getElementById("log")!;
const hudEl         = document.getElementById("hud")!;
const zoneRemoveEl  = document.querySelector("#zone-strip > div:nth-child(1)")!;
const zoneInstrEl   = document.querySelector("#zone-strip > div:nth-child(2)")!;
const introStageEl  = document.getElementById("intro-stage")!;
const introSceneEl  = document.getElementById("intro-scene")!;
const pitchTopEl    = document.getElementById("pitch-edge-top")!;
const pitchBottomEl = document.getElementById("pitch-edge-bottom")!;

function log(msg: string) { logEl.textContent = msg; }

const cellEls: HTMLDivElement[][] = [];
for (let s = 0; s < STEPS; s++) {
    cellEls.push([]);
    for (let r = 0; r < SCALE_DEGREES; r++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.style.gridColumn = String(s + 1);
        cell.style.gridRow = String(SCALE_DEGREES - r);
        gridEl.appendChild(cell);
        cellEls[s].push(cell);
    }
}

// The grid stays hidden — all feedback is audio (and, in the intro, the
// campfire scene). It's kept in the DOM as a debugging aid.
function renderGrid(): void {
    gridEl.style.display = "none";
    for (let s = 0; s < STEPS; s++) {
        const slot = pattern[currentInstrument][s];
        for (let r = 0; r < SCALE_DEGREES; r++) {
            const cell = cellEls[s][r];
            const filled = !!slot && slot.note === r;
            const onPlayhead = s === currentStep && phase === "composing";
            cell.classList.toggle("current", onPlayhead);
            cell.style.background = filled ? INSTRUMENT_COLOR[slot!.instrument] : "";
        }
    }
}

function updateHud(): void {
    switch (phase) {
        case "idle":
            phaseEl.textContent = "Tik 3× om te beginnen";
            bpmEl.textContent = instrumentEl.textContent = backingEl.textContent = "";
            break;
        case "composing":
            phaseEl.textContent = introMode ? "Oefenlevel — volg de aanwijzingen" : `Opdracht: ${currentBrief.say}`;
            bpmEl.textContent = `${Math.round(bpm / SLOWDOWN)} BPM (langzaam)`;
            instrumentEl.textContent = `instrument: ${INSTRUMENT_LABEL_NL[currentInstrument]}`;
            backingEl.textContent = drumPattern ? `beat: ${drumPattern.name}` : "";
            break;
        case "done":
            phaseEl.textContent = "Je mixtape is klaar! Tik 3× voor een nieuwe.";
            break;
    }
}

// ── Drums ────────────────────────────────────────────────────────────────────
function applyDrumPattern(dp: DrumPattern): void {
    for (let s = 0; s < STEPS; s++) {
        pattern.kick[s]    = dp.kick[s]  ? { note: 0, instrument: "kick" }    : null;
        pattern.snare[s]   = dp.snare[s] ? { note: 0, instrument: "snare" }   : null;
        pattern.highHat[s] = dp.hihat[s] ? { note: 0, instrument: "highHat" } : null;
    }
}

// ── Sequencer ─────────────────────────────────────────────────────────────────
// The game runs slowed down, so there's time to place/check each note.
function currentStepMs(): number {
    return stepDurationMs * SLOWDOWN;
}

function startSequencer(): void {
    if (stepIntervalId !== null) window.clearInterval(stepIntervalId);
    stepIntervalId = window.setInterval(tick, currentStepMs());
}

function stopSequencer(): void {
    if (stepIntervalId !== null) { window.clearInterval(stepIntervalId); stepIntervalId = null; }
}

function hasDrumHit(step: number): boolean {
    return !!(pattern.kick[step] || pattern.snare[step] || pattern.highHat[step]);
}

// The gorilla takes the place of a drum hit on the fourth loop (or later) of
// the second melody, and never the bar's first drum hit.
function gorillaReplacesDrums(step: number): boolean {
    if (experiment <= 0 || gorillaPlayed || introMode || briefIndex !== 1 || briefLoop < 4) return false;
    if (!hasDrumHit(step)) return false;
    for (let s = 0; s < step; s++) if (hasDrumHit(s)) return true;
    return false;
}

function playStep(step: number): void {
    const destination = STEP_PANNERS[step];
    const gorillaStep = gorillaReplacesDrums(step);
    if (gorillaStep) {
        const gorilla = gorillaSounds[experiment - 1];
        gorilla.volume(0.5);
        gorilla.play();
        gorillaPlayed = true;
    }
    for (const instrument of INSTRUMENTS) {
        const slot = pattern[instrument][step];
        if (!slot) continue;
        if (gorillaStep && !isMelodic(slot.instrument)) continue;
        scheduleNote(
            slot.instrument,
            pitchForSlot(slot),
            ctx.currentTime + 0.02,
            (currentStepMs() / 1000) * 0.9,
            INSTRUMENT_VOLUME[slot.instrument] * currentVolume,
            destination,
        );
    }
}

function tick(): void {
    currentStep = (currentStep + 1) % STEPS;
    if (currentStep === 0) briefLoop++;
    // A held pad press paints the same note onto each new step — but only
    // once the hold has lasted past HOLD_THRESHOLD_MS, so a quick tap that
    // happens to straddle a tick never gets an accidental second note.
    const longEnough = (performance.now() - holdStartAt) >= HOLD_THRESHOLD_MS;
    if (phase === "composing" && padHeld && heldNote !== null && longEnough) {
        pattern[currentInstrument][currentStep] = { note: heldNote, instrument: currentInstrument };
        recordPlacedNote(currentInstrument, currentStep);
    }
    playStep(currentStep);
    drumAlong(currentStep);
    renderGrid();
    if (replayStepsLeft > 0 && --replayStepsLeft === 0) {
        // let the last step ring out before the intro moves on
        stopSequencer();
        const done = replayDone;
        replayDone = null;
        window.setTimeout(() => done?.(), currentStepMs());
    }
}

// In the intro the campfire fisherman plays the groove on his hand drum:
// kick in the middle, snare on the rim, hi-hat as a soft rim tap.
function drumAlong(step: number): void {
    if (!intro) return;
    if (pattern.kick[step])         void intro.scene.hit({ zone: "center", vel: 0.95 });
    else if (pattern.snare[step])   void intro.scene.hit({ zone: "edge", vel: 0.9 });
    else if (pattern.highHat[step]) void intro.scene.hit({ zone: "edge", vel: 0.4 });
}

// The step a tap writes to: the live playhead (which is -1 until the first tick).
function tapStep(): number {
    return Math.max(0, currentStep);
}

function previewSlot(slot: StepSlot, step?: number): void {
    const destination = step !== undefined ? STEP_PANNERS[step] : ctx.destination;
    scheduleNote(slot.instrument, pitchForSlot(slot), ctx.currentTime + 0.01, 0.25, 0.6 * currentVolume, destination);
}

// ── Composing actions ────────────────────────────────────────────────────────
function setNote(note: number): void {
    if (phase !== "composing" || !tutorialAllows("place")) return;
    const step = tapStep();

    const slot: StepSlot = { note, instrument: currentInstrument };
    pattern[currentInstrument][step] = slot;
    heldNote = note;
    recordPlacedNote(currentInstrument, step);
    previewSlot(slot, step);
    earcon(ctx, "place");
    log(`stap ${step + 1}: noot ${note + 1} (${INSTRUMENT_LABEL_NL[currentInstrument]})`);
    renderGrid();
    if (introMode) {
        intro?.notify("place");
        if (currentInstrument !== INTRO_INSTRUMENTS[0]) intro?.notify("placeOther");
    }
}

function nudgeNote(direction: 1 | -1): void {
    if (phase !== "composing" || !tutorialAllows("place")) return;
    const step = tapStep();

    const existing = pattern[currentInstrument][step]
        ?? { note: Math.floor(SCALE_DEGREES / 2), instrument: currentInstrument };
    const note = Math.max(0, Math.min(SCALE_DEGREES - 1, existing.note + direction));
    const slot: StepSlot = { note, instrument: currentInstrument };
    pattern[currentInstrument][step] = slot;
    heldNote = note; // a sustain in progress follows the new pitch
    recordPlacedNote(currentInstrument, step);
    previewSlot(slot, step);
    earcon(ctx, "place");
    log(`stap ${step + 1}: naar noot ${note + 1}`);
    renderGrid();
}

// Dedicated remove: undoes notes in the order they were placed — not
// whatever's under the playhead right now — so it works even if the
// playhead has already moved on by the time you react, and pressing it
// repeatedly walks back through everything just placed.
function removeNote(): void {
    if (phase !== "composing" || !tutorialAllows("remove")) return;
    const entry = placedNoteStack.pop();
    if (!entry) {
        if (!introMode) speak("nog geen noot geplaatst");
        log("nog geen noot geplaatst");
        return;
    }
    const { instrument, step } = entry;
    const had = pattern[instrument][step] !== null;
    pattern[instrument][step] = null;
    earcon(ctx, "erase");
    const msg = had
        ? `stap ${step + 1} gewist (${INSTRUMENT_LABEL_NL[instrument]})`
        : `stap ${step + 1} was al leeg`;
    if (!introMode) speak(msg); // in the intro the fisherman reacts instead
    log(msg);
    renderGrid();
    if (introMode) intro?.notify("remove");
}

function switchInstrument(): void {
    if (phase !== "composing" || !tutorialAllows("instrument")) return;
    const options = introMode ? INTRO_INSTRUMENTS : currentBrief.instruments;
    const i = (options.indexOf(currentInstrument) + 1) % options.length;
    currentInstrument = options[i];
    earcon(ctx, "instrument");
    speak(INSTRUMENT_LABEL_NL[currentInstrument]);
    updateHud();
    renderGrid();
}

// ── Briefs / mixtape ─────────────────────────────────────────────────────────
function loadBrief(index: number): void {
    briefIndex = index;
    currentBrief = briefAt(index);
    currentScale = currentBrief.scale;
    currentVolume = currentBrief.volume;
    currentInstrument = currentBrief.instruments[0];
    placedNoteStack.length = 0; // the previous brief's pattern is about to be cleared
    briefLoop = 0;

    // fresh groove for the new vibe; the player's melody is kept
    drumPattern = generateDrumPattern(STEPS, currentBrief.grooveStyle);
    applyDrumPattern(drumPattern);

    startSequencer();                 // (re)start at composer speed for the new brief
    updateHud();
    renderGrid();
    speak(`Nummer ${mixtape.length + 1}. ${currentBrief.say}`);
}

function finishTrack(): void {
    if (phase !== "composing" || !drumPattern) return;

    const notes: MixtapeTrack["notes"] = [];
    for (const id of MELODIC_INSTRUMENTS) {
        pattern[id].forEach((slot, step) => {
            if (slot) notes.push([step, slot.note, id]);
        });
    }
    mixtape.push({ brief: currentBrief.id, notes, groove: drumPattern, volume: currentVolume });
    persistMixtape();

    earcon(ctx, "done");
    speak(currentBrief.praise);
    log(`nummer ${mixtape.length} opgeslagen`);

    // clear the melody so the next brief starts on a blank canvas
    for (const id of MELODIC_INSTRUMENTS) pattern[id] = Array(STEPS).fill(null);

    window.setTimeout(() => {
        if (mixtape.length >= BRIEFS.length) {
            endSession();
        } else {
            loadBrief(briefIndex + 1);
        }
    }, 2200);
}

function endSession(): void {
    phase = "done";
    stopSequencer();
    updateHud();
    renderGrid();
    speak(`Je mixtape is klaar, met ${mixtape.length} nummers. Luister maar.`);
    playMedley();
}

// Play every saved track back to back, each looped MEDLEY_REPEATS times so
// a short riff gets a real moment to land — melody *and* its drum groove,
// each at the loudness the brief asked for.
const MEDLEY_REPEATS = 2;

function playMedley(): void {
    let when = ctx.currentTime + 0.6;
    const stepDur = stepDurationMs / 1000;
    for (const track of mixtape) {
        const scale = BRIEFS.find(b => b.id === track.brief)?.scale ?? currentScale;
        for (let repeat = 0; repeat < MEDLEY_REPEATS; repeat++) {
            const loopStart = when + repeat * STEPS * stepDur;
            for (const [step, note, id] of track.notes) {
                player.queueWaveTable(ctx, ctx.destination, instruments[id],
                    loopStart + step * stepDur, pitchForNote(note, id, scale), stepDur * 0.9,
                    INSTRUMENT_VOLUME[id] * track.volume);
            }
            for (let s = 0; s < STEPS; s++) {
                const w = loopStart + s * stepDur;
                if (track.groove.kick[s])
                    player.queueWaveTable(ctx, ctx.destination, instruments.kick, w, DRUM_PITCH.kick, stepDur * 0.9, INSTRUMENT_VOLUME.kick * track.volume);
                if (track.groove.snare[s])
                    player.queueWaveTable(ctx, ctx.destination, instruments.snare, w, DRUM_PITCH.snare, stepDur * 0.9, INSTRUMENT_VOLUME.snare * track.volume);
                if (track.groove.hihat[s])
                    player.queueWaveTable(ctx, ctx.destination, instruments.highHat, w, DRUM_PITCH.highHat, stepDur * 0.9, INSTRUMENT_VOLUME.highHat * track.volume);
            }
        }
        when += MEDLEY_REPEATS * STEPS * stepDur + stepDur; // a beat of space before the next track
    }
}

function persistMixtape(): void {
    try {
        localStorage.setItem(MIXTAPE_KEY, JSON.stringify(mixtape));
        const best = Math.max(mixtape.length, Number(localStorage.getItem(BEST_KEY) ?? 0));
        localStorage.setItem(BEST_KEY, String(best));
    } catch { /* private mode / disabled — non-fatal */ }
}

// ── Guided intro (campfire fisherman) ───────────────────────────────────────
// Reuses the first real brief as a backdrop — nothing from the intro is saved.
// The script itself lives in intro/introLevel.ts; this only hands it hooks
// into the composer.

function startIntro(): void {
    const brief = BRIEFS[0];
    currentBrief = brief;
    currentScale = brief.scale;
    currentVolume = brief.volume;
    currentInstrument = INTRO_INSTRUMENTS[0];
    placedNoteStack.length = 0;

    drumPattern = generateDrumPattern(STEPS, brief.grooveStyle);
    applyDrumPattern(drumPattern);

    introMode = true;
    introAllowed.clear();
    hudEl.classList.add("hidden");
    introStageEl.hidden = false;
    log("");

    // The sequencer stays silent until the fisherman starts the rhythm.
    intro = createIntroLevel({
        stage: introSceneEl,
        stepMs: currentStepMs,
        startBeat: () => { currentStep = -1; startSequencer(); },
        allow: gate => { introAllowed.add(gate); },
        lock: () => { introAllowed.clear(); padHeld = false; heldNote = null; },
        highlight: zone => {
            zoneInstrEl.classList.toggle("zone-highlight", zone === "instrument");
            zoneRemoveEl.classList.toggle("zone-highlight", zone === "remove");
        },
        showPitchEdges: on => {
            pitchTopEl.classList.toggle("hidden", !on);
            pitchBottomEl.classList.toggle("hidden", !on);
        },
        replaySong: bars => new Promise<void>(resolve => {
            stopSequencer();
            currentStep = -1;
            replayStepsLeft = bars * STEPS;
            replayDone = resolve;
            startSequencer();
        }),
        finished: finishIntro,
    });
    intro.start();
}

function endIntro(): void {
    intro?.destroy();
    intro = null;
    introMode = false;
    introAllowed.clear();
    replayStepsLeft = 0;
    replayDone = null;
    introStageEl.hidden = true;
    hudEl.classList.remove("hidden");
}

function finishIntro(): void {
    stopSequencer();
    phase = "idle";
    endIntro();
    showStartScreen();
    startNoteEl.classList.remove("hidden");
    startNoteEl.textContent = "Oefenlevel voltooid! Druk op ‘Start spel’ voor het hele spel.";
}

// Debug keys for testing on a desktop: "n" cuts the fisherman's current line
// short, "s" acts as a phone shake (desktops have no motion sensor).
window.addEventListener("keydown", e => {
    if (e.key === "n" && introMode) intro?.skipLine();
    if (e.key === "s") onShake();
});

// ── Start screen ─────────────────────────────────────────────────────────────
// The gesture zones cover the *entire* viewport, and the pad zone in
// particular calls setPointerCapture() on every touch — which steals the
// click from any real HTML control (like the start-screen buttons) that
// happens to sit inside it. So the InputHandler only listens while the game
// screen is actually showing; the start screen's buttons/checkbox/radios get
// completely normal clicks the rest of the time.
function showStartScreen(): void {
    inp.stop();
    gameScreenEl.classList.add("hidden");
    startScreenEl.classList.remove("hidden");
}

function showGameScreen(): void {
    startScreenEl.classList.add("hidden");
    gameScreenEl.classList.remove("hidden");
    inp.start();
}

function stopGame(): void {
    stopSequencer();
    phase = "idle";
    endIntro();
    stopSpeech();
    showStartScreen();
    startNoteEl.classList.add("hidden");
}

function applyStartOptions(): void {
    setSpeechEnabled(speechToggleEl.checked);
    try { localStorage.setItem(SPEECH_KEY, speechToggleEl.checked ? "1" : "0"); } catch { /* ignore */ }
    randomNoteMode = randomNoteToggleEl.checked;
}

try {
    const savedSpeech = localStorage.getItem(SPEECH_KEY);
    if (savedSpeech !== null) speechToggleEl.checked = savedSpeech === "1";
} catch { /* ignore */ }
setSpeechEnabled(speechToggleEl.checked);

// The tutorial starts straight away at the first brief's tempo — no 3-tap
// start before a tutorial that hasn't explained the controls yet. This click
// is a real user gesture, so audio unlock + iOS motion permission work here.
introBtn.addEventListener("click", () => {
    void enterFullscreen();
    applyStartOptions();
    pendingIntro = true;
    startNoteEl.classList.add("hidden");
    showGameScreen();
    startGame(BRIEFS[0].tempo, true);
});
gameBtn.addEventListener("click", () => {
    void enterFullscreen();
    applyStartOptions();
    pendingIntro = false;
    startNoteEl.classList.add("hidden");
    showGameScreen();
    updateHud();
    speak("Tik drie keer om te beginnen.");
});
stopBtn.addEventListener("click", stopGame);

// ── Start ─────────────────────────────────────────────────────────────────────
function startGame(tappedBpm: number, asIntro: boolean): void {
    // blend the player's tapped tempo with the brief's target so it stays on-vibe
    bpm = Math.round((tappedBpm + BRIEFS[0].tempo) / 2);
    stepDurationMs = (60000 / bpm) / 2;

    phase = "composing";
    currentStep = -1;
    pattern = emptyPattern();
    mixtape = [];
    gorillaPlayed = false;

    void shake.start();

    if (asIntro) {
        startIntro();
    } else {
        introMode = false;
        loadBrief(0);   // starts the sequencer
    }
    earcon(ctx, "start");
}

// Finishing a track (and advancing the guided intro's last step) is driven
// exclusively by a phone shake — there's no tap gesture for it, so a quick
// run of note-placement taps can never accidentally trigger it.
function onShake(): void {
    if (phase !== "composing") return;
    if (introMode) intro?.notify("shake");
    else finishTrack();
}
shake.onShake(onShake);

// ── Input wiring ──────────────────────────────────────────────────────────────
inp.onAction((action) => {
    switch (action.type) {
        case "bpmSet":
            if (phase === "idle" || phase === "done") startGame(action.bpm, pendingIntro);
            break;
        case "noteSet":   setNote(randomNoteMode ? Math.floor(Math.random() * SCALE_DEGREES) : action.note); break;
        case "padHold":
            if (action.held) {
                padHeld = true;
                holdStartAt = performance.now();
            } else {
                padHeld = false;
                heldNote = null;
            }
            break;
        case "noteNudge":        nudgeNote(action.direction); break;
        case "noteRemove":       removeNote(); break;
        case "instrumentSwitch": switchInstrument(); break;
    }
});

updateHud();
renderGrid();
