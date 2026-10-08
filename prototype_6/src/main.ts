import { InputHandler, SCALE_DEGREES } from "./inputHandler.ts";
import { ShakeDetector } from "./shake.ts";
import { Howler } from "howler";
import { generateDrumPattern, type DrumPattern } from "./music.ts";
import { BRIEFS, briefAt, type Brief, type MelodicInstrument } from "./briefs.ts";
import { speak, earcon, setSpeechEnabled } from "./speech.ts";
import "webaudiofont";
import { enterFullscreen } from "../../src/fullscreen.ts";
import { getEmbed, setupEmbedStart, embedDone, num, bool, strList } from "../../src/embed.ts";

// set when the combined/ shell runs this page as one segment of a longer flow
const embed = getEmbed();
// how many briefs make up the mixtape, and (optionally) which ones in which order
const SONG_COUNT = num(embed, "songCount", BRIEFS.length, 1, 20);
const BRIEF_ORDER: Brief[] = (strList(embed, "briefs") ?? [])
    .map(id => BRIEFS.find(b => b.id === id))
    .filter((b): b is Brief => b !== undefined);

function briefFor(index: number): Brief {
    return BRIEF_ORDER.length ? BRIEF_ORDER[index % BRIEF_ORDER.length] : briefAt(index);
}
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

// Guided intro tutorial — a card per step with a Volgende button. Steps with
// a `gate` keep Volgende disabled until the player has done that action once;
// the last step (shake) has no Volgende at all — the shake itself finishes it.
type TutGate = "place" | "instrument" | "remove" | "finish";
type TutVisual = "song" | "track" | "pitch" | "tap" | "instrument" | "remove" | "shake";
interface TutStep { visual: TutVisual; gate: TutGate | null; text: string; praise?: string }
const TUTORIAL_STEPS: TutStep[] = [
    { visual: "song", gate: null, text:
        "Je gaat zo je eigen liedje maken. We leggen stap voor stap uit hoe dat werkt." },
    { visual: "track", gate: null, text:
        "Dit is je spoor: acht tellen die steeds opnieuw rondgaan. Het vakje dat oplicht is de tel waar je nu bent. Hierop bouw je je liedje." },
    { visual: "pitch", gate: null, text:
        "Hoe hoger op het scherm, hoe hoger de noot. Luister: de piano gaat alle noten omhoog en weer omlaag." },
    { visual: "tap", gate: "place", praise: "Goed zo! Je hebt een noot geplaatst.", text:
        "Tik op het scherm om een noot te plaatsen, precies op de tel die je dan hoort. Hoe hoger je tikt, hoe hoger de noot. Probeer het!" },
    { visual: "instrument", gate: "instrument", praise: "Mooi, zo wissel je van instrument.", text:
        "Rechtsonder wissel je van instrument. Probeer het!" },
    { visual: "remove", gate: "remove", praise: "Goed, die noot is gewist.", text:
        "Linksonder wis je de laatst geplaatste noot. Probeer het!" },
    { visual: "shake", gate: "finish", text:
        "Klaar met je liedje? Schud je telefoon om het in te leveren. Probeer het nu!" },
];
// Indices of the steps that unlock each control, so earlier steps (which are
// only explaining) can't be disturbed by stray taps.
const TUT_PLACE_STEP = TUTORIAL_STEPS.findIndex(s => s.gate === "place");
const TUT_INSTRUMENT_STEP = TUTORIAL_STEPS.findIndex(s => s.gate === "instrument");
const TUT_REMOVE_STEP = TUTORIAL_STEPS.findIndex(s => s.gate === "remove");
const TUT_PITCH_STEP = TUTORIAL_STEPS.findIndex(s => s.visual === "pitch");
const TUT_TRACK_STEP = TUTORIAL_STEPS.findIndex(s => s.visual === "track");
let introMode = false;
let tutStep = 0;
let pitchDemoUp = true;               // direction of the piano scale demo in the pitch step

function tutorialAllows(gate: Exclude<TutGate, "finish">): boolean {
    if (!introMode) return true;
    const unlockAt = gate === "place" ? TUT_PLACE_STEP
        : gate === "instrument" ? TUT_INSTRUMENT_STEP
        : TUT_REMOVE_STEP;
    return tutStep >= unlockAt;
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
const tutorialEl    = document.getElementById("tutorial")!;
const tutProgressEl = document.getElementById("tut-progress")!;
const tutVisualEl   = document.getElementById("tut-visual")!;
const tutTextEl     = document.getElementById("tut-text")!;
const tutNextBtn    = document.getElementById("tut-next") as HTMLButtonElement;
const pitchGuideEl  = document.getElementById("pitch-guide")!;

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

// The grid stays hidden in the real game — all feedback is audio. Only the
// tutorial shows it (from the pitch step on), so height ↔ pitch is visible.
function renderGrid(): void {
    gridEl.style.display = introMode && tutStep >= TUT_PITCH_STEP ? "" : "none";
    for (let s = 0; s < STEPS; s++) {
        // The tutorial shows every melodic voice, so a note placed before an
        // instrument switch stays visible until the remove step wipes it.
        const slot = pattern[currentInstrument][s]
            ?? (introMode ? MELODIC_INSTRUMENTS.map(id => pattern[id][s]).find(x => x) ?? null : null);
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

function playStep(step: number): void {
    const destination = STEP_PANNERS[step];
    for (const instrument of INSTRUMENTS) {
        const slot = pattern[instrument][step];
        if (!slot) continue;
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
    // A held pad press paints the same note onto each new step — but only
    // once the hold has lasted past HOLD_THRESHOLD_MS, so a quick tap that
    // happens to straddle a tick never gets an accidental second note.
    const longEnough = (performance.now() - holdStartAt) >= HOLD_THRESHOLD_MS;
    if (phase === "composing" && padHeld && heldNote !== null && longEnough) {
        pattern[currentInstrument][currentStep] = { note: heldNote, instrument: currentInstrument };
        recordPlacedNote(currentInstrument, currentStep);
    }
    // Pitch demo: the piano walks up through all notes over one bar, then
    // back down over the next, alternating for as long as the step is shown.
    if (introMode && tutStep === TUT_PITCH_STEP && currentStep === 0) {
        pitchDemoUp = !pitchDemoUp;
        writePitchDemo();
    }
    playStep(currentStep);
    renderGrid();
    renderTutorialPlayhead();
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
    tutorialGate("place");
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
        speak("nog geen noot geplaatst");
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
    speak(msg);
    log(msg);
    renderGrid();
    tutorialGate("remove");
}

function switchInstrument(): void {
    if (phase !== "composing" || !tutorialAllows("instrument")) return;
    const options = currentBrief.instruments;
    const i = (options.indexOf(currentInstrument) + 1) % options.length;
    currentInstrument = options[i];
    earcon(ctx, "instrument");
    speak(INSTRUMENT_LABEL_NL[currentInstrument]);
    updateHud();
    renderGrid();
    tutorialGate("instrument");
}

// ── Briefs / mixtape ─────────────────────────────────────────────────────────
function loadBrief(index: number): void {
    briefIndex = index;
    currentBrief = briefFor(index);
    currentScale = currentBrief.scale;
    currentVolume = currentBrief.volume;
    currentInstrument = currentBrief.instruments[0];
    placedNoteStack.length = 0; // the previous brief's pattern is about to be cleared

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
        if (mixtape.length >= SONG_COUNT) {
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
    const medleySeconds = playMedley();
    // hand back to the combined/ shell once the medley has played out
    if (embed) window.setTimeout(() => embedDone({ tracks: mixtape.length }), (medleySeconds + 1.5) * 1000);
}

// Play every saved track back to back, each looped MEDLEY_REPEATS times so
// a short riff gets a real moment to land — melody *and* its drum groove,
// each at the loudness the brief asked for.
const MEDLEY_REPEATS = 2;

/** Schedules the medley; returns how long it takes, in seconds. */
function playMedley(): number {
    const start = ctx.currentTime;
    let when = start + 0.6;
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
    return when - start;
}

function persistMixtape(): void {
    try {
        localStorage.setItem(MIXTAPE_KEY, JSON.stringify(mixtape));
        const best = Math.max(mixtape.length, Number(localStorage.getItem(BEST_KEY) ?? 0));
        localStorage.setItem(BEST_KEY, String(best));
    } catch { /* private mode / disabled — non-fatal */ }
}

// ── Guided intro (step-by-step tutorial) ────────────────────────────────────
// Reuses the first real brief as a backdrop — nothing from the intro is saved.
// Unlike the real game, the tutorial is *visual* too: a card per step with a
// small pictogram, and (from the pitch step on) the note grid itself.

const SONG_SVG = `<svg class="tut-notes" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g class="note"><ellipse cx="24" cy="70" rx="10" ry="7.5" fill="#4cafef"/><rect x="31" y="30" width="4" height="40" fill="#4cafef"/></g>
  <g class="note"><ellipse cx="54" cy="60" rx="10" ry="7.5" fill="#ff8a3d"/><rect x="61" y="20" width="4" height="40" fill="#ff8a3d"/></g>
  <g class="note"><ellipse cx="82" cy="74" rx="10" ry="7.5" fill="#4caf50"/><rect x="89" y="34" width="4" height="40" fill="#4caf50"/></g>
</svg>`;

const TAP_SVG = `<svg class="tut-tap" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="14" y="8" width="72" height="84" rx="8" fill="none" stroke="#bbb" stroke-width="3" stroke-dasharray="6 5"/>
  <circle class="ripple" cx="50" cy="30" r="20" fill="none" stroke="#4cafef" stroke-width="4"/>
  <circle cx="50" cy="30" r="9" fill="#4cafef"/>
</svg>`;

/** Arrow pointing to a bottom corner, for the instrument/remove steps. */
function cornerArrowSvg(side: "left" | "right"): string {
    const flip = side === "left" ? ` transform="translate(100 0) scale(-1 1)"` : "";
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g${flip}>
  <line x1="22" y1="22" x2="74" y2="74" stroke="#4cafef" stroke-width="8" stroke-linecap="round"/>
  <polygon points="86,86 52,80 80,52" fill="#4cafef"/></g></svg>`;
}

const SHAKE_SVG = `<svg class="tut-shake" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g class="phone">
    <rect x="32" y="12" width="36" height="76" rx="7" fill="#333"/>
    <rect x="37" y="20" width="26" height="56" rx="2" fill="#bfe3ff"/>
    <circle cx="50" cy="82" r="3" fill="#666"/>
  </g>
  <path d="M18 34 q-8 16 0 32 M82 34 q8 16 0 32" fill="none" stroke="#4cafef" stroke-width="4" stroke-linecap="round"/>
</svg>`;

let trackTileEls: HTMLDivElement[] = [];

function renderTutorialVisual(visual: TutVisual): void {
    trackTileEls = [];
    switch (visual) {
        case "song":       tutVisualEl.innerHTML = SONG_SVG; break;
        case "pitch":      tutVisualEl.innerHTML = ""; break; // the grid + #pitch-guide are the visual
        case "tap":        tutVisualEl.innerHTML = TAP_SVG; break;
        case "instrument": tutVisualEl.innerHTML = cornerArrowSvg("right"); break;
        case "remove":     tutVisualEl.innerHTML = cornerArrowSvg("left"); break;
        case "shake":      tutVisualEl.innerHTML = SHAKE_SVG; break;
        case "track": {
            const row = document.createElement("div");
            row.className = "track-row";
            for (let s = 0; s < STEPS; s++) {
                const tile = document.createElement("div");
                tile.className = "tile";
                row.appendChild(tile);
                trackTileEls.push(tile);
            }
            tutVisualEl.replaceChildren(row);
            break;
        }
    }
    tutVisualEl.style.width = visual === "track" ? "100%" : "";
}

/** Lights the playhead's tile in the track-row visual (no-op otherwise). */
function renderTutorialPlayhead(): void {
    trackTileEls.forEach((tile, s) => tile.classList.toggle("on", s === currentStep));
}

function writePitchDemo(): void {
    pattern.piano = Array.from({ length: STEPS }, (_, s): StepSlot => ({
        note: pitchDemoUp ? s : SCALE_DEGREES - 1 - s,
        instrument: "piano",
    }));
}

function showTutorialStep(index: number): void {
    tutStep = index;
    const step = TUTORIAL_STEPS[index];

    tutProgressEl.textContent = `Stap ${index + 1} van ${TUTORIAL_STEPS.length}`;
    tutTextEl.textContent = step.text;
    renderTutorialVisual(step.visual);
    zoneInstrEl.classList.toggle("zone-highlight", step.gate === "instrument");
    zoneRemoveEl.classList.toggle("zone-highlight", step.gate === "remove");
    tutNextBtn.classList.toggle("hidden", step.gate === "finish");
    tutNextBtn.disabled = step.gate !== null;
    pitchGuideEl.classList.toggle("hidden", index < TUT_PITCH_STEP);

    // The beat only starts once the track itself is introduced.
    if (index === TUT_TRACK_STEP) startSequencer();
    // Restart the bar so the demo always opens with a full climb up: the
    // first tick lands on step 0, which flips pitchDemoUp to true.
    if (index === TUT_PITCH_STEP) {
        currentInstrument = "piano";
        pitchDemoUp = false;
        currentStep = -1;
        startSequencer();
    }
    // The player builds on an empty piano track, not on the scale demo.
    if (index === TUT_PLACE_STEP) {
        pattern.piano = Array(STEPS).fill(null);
        placedNoteStack.length = 0;
    }

    renderGrid();
    renderTutorialPlayhead();
    speak(step.text);
    log("");
}

function startIntro(): void {
    const brief = BRIEFS[0];
    currentBrief = brief;
    currentScale = brief.scale;
    currentVolume = brief.volume;
    currentInstrument = "piano";
    placedNoteStack.length = 0;

    drumPattern = generateDrumPattern(STEPS, brief.grooveStyle);
    applyDrumPattern(drumPattern);

    introMode = true;
    hudEl.classList.add("hidden");
    tutorialEl.classList.remove("hidden");
    // The sequencer stays silent until the track step (see showTutorialStep).
    showTutorialStep(0);
}

function hideTutorial(): void {
    tutorialEl.classList.add("hidden");
    hudEl.classList.remove("hidden");
    zoneInstrEl.classList.remove("zone-highlight");
    zoneRemoveEl.classList.remove("zone-highlight");
    pitchGuideEl.classList.add("hidden");
    trackTileEls = [];
    tutStep = 0;
}

// Unlocks Volgende once the player has done what the current step asks —
// self-guarding, so repeating an already-passed action (or doing an action
// another step is about) is silently ignored. The shake step has no Volgende:
// the shake itself finishes the practice.
function tutorialGate(kind: TutGate): void {
    if (!introMode) return;
    const step = TUTORIAL_STEPS[tutStep];
    if (step?.gate !== kind) return;

    if (kind === "finish") {
        finishIntro();
        return;
    }
    if (!tutNextBtn.disabled) return; // already unlocked — don't repeat the praise
    tutNextBtn.disabled = false;
    earcon(ctx, "done");
    const prefix = kind === "instrument" ? `${INSTRUMENT_LABEL_NL[currentInstrument]}. ` : "";
    speak(`${prefix}${step.praise ?? ""} Druk op volgende.`);
}

tutNextBtn.addEventListener("click", () => {
    if (!introMode || tutNextBtn.disabled) return;
    if (tutStep + 1 < TUTORIAL_STEPS.length) showTutorialStep(tutStep + 1);
});

function finishIntro(): void {
    stopSequencer();
    earcon(ctx, "done");
    speak(embed ? "Goed gedaan! Je kent nu alle knoppen." : "Goed gedaan! Je kent nu alle knoppen. Terug naar het startscherm.");
    window.setTimeout(() => {
        if (embed) {
            phase = "idle";
            introMode = false;
            hideTutorial();
            inp.stop();
            embedDone();
            return;
        }
        phase = "idle";
        introMode = false;
        hideTutorial();
        showStartScreen();
        startNoteEl.classList.remove("hidden");
        startNoteEl.textContent = "Oefenlevel voltooid! Druk op ‘Start spel’ voor het hele spel.";
    }, 2200);
}

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
    introMode = false;
    hideTutorial();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
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
// the combined/ shell sets these per segment instead of the checkboxes
if (embed) {
    speechToggleEl.checked = bool(embed, "speech", speechToggleEl.checked);
    randomNoteToggleEl.checked = bool(embed, "randomNote", false);
}
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
    startGame(briefFor(0).tempo, true);
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
    bpm = Math.round((tappedBpm + briefFor(0).tempo) / 2);
    stepDurationMs = (60000 / bpm) / 2;

    phase = "composing";
    currentStep = -1;
    pattern = emptyPattern();
    mixtape = [];

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
shake.onShake(() => {
    if (phase !== "composing") return;
    if (introMode) tutorialGate("finish");
    else finishTrack();
});

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

// run by the combined/ shell: skip the menu, start straight into the requested mode
if (embed) {
    stopBtn.hidden = true;
    setupEmbedStart(embed, () => (embed.mode === "intro" ? introBtn : gameBtn).click());
}
