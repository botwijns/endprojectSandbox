import { InputHandler, SCALE_DEGREES } from "./inputHandler.ts";
import { Howler } from "howler";
import { generateDrumPattern, type DrumPattern } from "./music.ts";
import { BRIEFS, briefAt, type Brief, type MelodicInstrument } from "./briefs.ts";
import { speak, earcon, setSpeechEnabled } from "./speech.ts";
import "webaudiofont";
declare const WebAudioFontPlayer: any;
declare const _tone_0000_GeneralUserGS_sf2_file: any; // acoustic grand piano
declare const _tone_0241_GeneralUserGS_sf2_file: any; // nylon guitar
declare const _tone_0321_GeneralUserGS_sf2_file: any; // acoustic bass
declare const _drum_36_1_Chaos_sf2_file: any;         // kick
declare const _drum_38_1_Chaos_sf2_file: any;         // snare
declare const _drum_42_1_Chaos_sf2_file: any;         // hi-hat
// ── WebAudioFont setup ────────────────────────────────────────────────────────
const ctx = new AudioContext();
const player = new WebAudioFontPlayer();

player.loader.decodeAfterLoading(ctx, "_tone_0000_GeneralUserGS_sf2_file");
player.loader.decodeAfterLoading(ctx, "_tone_0241_GeneralUserGS_sf2_file");
player.loader.decodeAfterLoading(ctx, "_tone_0321_GeneralUserGS_sf2_file");
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

type Instrument = keyof typeof instruments;
const INSTRUMENTS: Instrument[] = ["piano", "kick", "snare", "highHat", "guitar", "bass"];
// The drums are generated automatically, so the player only cycles the melodic voices.
const MELODIC_INSTRUMENTS: MelodicInstrument[] = ["piano", "guitar", "bass"];
const INSTRUMENT_COLOR: Record<Instrument, string> = {
    piano:   "#4cafef",
    kick:    "#ff6b6b",
    snare:   "#ffd93d",
    highHat: "#6bcb77",
    guitar:  "#99afff",
    bass:    "#e699ff",
};
const INSTRUMENT_VOLUME: Record<Instrument, number> = {
    piano: 0.6, kick: 0.8, snare: 0.8, highHat: 0.8, guitar: 0.8, bass: 0.8,
};
const INSTRUMENT_LABEL_NL: Record<MelodicInstrument, string> = {
    piano: "piano", guitar: "gitaar", bass: "bas",
};
// Percussive instruments ring at their natural drum pitch.
const DRUM_PITCH: Record<Exclude<Instrument, "piano" | "guitar" | "bass">, number> = {
    kick: 36, snare: 38, highHat: 42,
};

function isMelodic(id: Instrument): id is MelodicInstrument {
    return id === "piano" || id === "guitar" || id === "bass";
}

function scheduleNote(
    id: Instrument, pitch: number, when: number, duration: number, volume = 0.7,
    destination: AudioNode = ctx.destination,
): void {
    player.queueWaveTable(ctx, destination, instruments[id], when, pitch, duration, volume);
}

// Audio needs a user gesture to unlock — the first tap anywhere does it.
window.addEventListener("pointerdown", () => {
    ctx.resume();
    Howler.ctx?.resume();
}, { once: true });

// ── Constants ─────────────────────────────────────────────────────────────────
const STEPS = 8;                      // one 8-step bar (eighth notes)
const ROOT_MIDI = 60;                 // middle C

// In composer mode, each step's audio is panned to match its column — step 0
// (leftmost) plays from the left speaker, step 7 (rightmost) from the right —
// so the sound sweeps across in the same direction the columns represent.
const STEP_PANNERS: AudioNode[] = Array.from({ length: STEPS }, (_, step) => {
    const panner = ctx.createStereoPanner();
    panner.pan.value = -1 + (2 * step) / (STEPS - 1);
    panner.connect(ctx.destination);
    return panner;
});
const REBRIEF_TAP_GUARD_MS = 1200;    // ignore rapid transport taps for re-speaking
const COMPOSER_SLOWDOWN = 1.4;        // composer runs this many times slower than the real tempo
const HOLD_THRESHOLD_MS = 180;        // "threshold" hold-fix: minimum hold before a note sustains
const MIXTAPE_KEY = "p6_mixtape";
const BEST_KEY = "p6_best";
const SPEECH_KEY = "p6_speech";

interface StepSlot { note: number; instrument: Instrument }

// Current scale + loudness come from the active brief.
let currentScale: number[] = BRIEFS[0].scale;
let currentVolume = BRIEFS[0].volume;

function pitchForNote(note: number, scale: number[] = currentScale): number {
    const i = Math.max(0, Math.min(scale.length - 1, note));
    return ROOT_MIDI + scale[i];
}

function pitchForSlot(slot: StepSlot): number {
    return isMelodic(slot.instrument) ? pitchForNote(slot.note) : DRUM_PITCH[slot.instrument];
}

// ── Game state ────────────────────────────────────────────────────────────────
type Phase = "idle" | "composing" | "done";
type Mode = "composer" | "listener";
type HoldFix = "threshold" | "single";
// Pressing the mode control cycles through these in order.
const MODE_ORDER: Mode[] = ["composer", "listener"];

let phase: Phase = "idle";
let mode: Mode = "composer";
let bpm = 0;
let stepDurationMs = 0;
let currentStep = 0;
let lastTransportTapAt = 0;
let pendingIntro = false;             // which start-screen button was pressed

// Two ways of fixing the "quick tap accidentally places two notes" bug,
// switchable from the start screen so they're easy to compare.
let holdFixMode: HoldFix = "threshold";
let holdStartAt = 0;

// While the pad is held in composer mode the note "sustains": each step the
// playhead moves onto gets the same note, so holding longer fills more steps.
let padHeld = false;
let heldNote: number | null = null;

// Guided intro tutorial — one gated step at a time.
type IntroKind = "place" | "remove" | "instrument" | "mode" | "finish";
interface IntroStepDef { kind: IntroKind; prompt: string; praise: string }
const INTRO_STEPS: IntroStepDef[] = [
    { kind: "place", praise: "", prompt:
        "Beweeg je vinger omhoog en omlaag over de linkerkant van het scherm. Tik om een noot te plaatsen." },
    { kind: "remove", praise: "Goed zo! Je hebt een noot geplaatst.", prompt:
        "Linksonder wis je de noot op de huidige stap. Probeer het." },
    { kind: "instrument", praise: "Mooi, gewist.", prompt:
        "In het midden onderin wissel je van instrument. Probeer het." },
    { kind: "mode", praise: "Zo wissel je van instrument.", prompt:
        "Rechtsonder wissel je tussen componeren en luisteren. In luisteren hoor je je nummer op het echte tempo terug. Probeer het." },
    { kind: "finish", praise: "Precies, dat is luisteren.", prompt:
        "Ben je klaar? Tik weer drie keer rechtsboven om het oefenlevel af te ronden." },
];
let introMode = false;
let introStep = 0;

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
const startScreenEl  = document.getElementById("start-screen")!;
const gameScreenEl   = document.getElementById("game-screen")!;
const introBtn       = document.getElementById("intro-btn") as HTMLButtonElement;
const gameBtn        = document.getElementById("game-btn") as HTMLButtonElement;
const stopBtn        = document.getElementById("stop-btn") as HTMLButtonElement;
const speechToggleEl = document.getElementById("speech-toggle") as HTMLInputElement;
const holdfixSingleEl = document.getElementById("holdfix-single") as HTMLInputElement;
const startNoteEl    = document.getElementById("start-note")!;

const gridEl        = document.getElementById("grid")!;
const phaseEl       = document.getElementById("hud-phase")!;
const bpmEl         = document.getElementById("hud-bpm")!;
const instrumentEl  = document.getElementById("hud-instrument")!;
const backingEl     = document.getElementById("hud-backing")!;
const modeEl        = document.getElementById("hud-mode")!;
const holdfixEl     = document.getElementById("hud-holdfix")!;
const orientationEl = document.getElementById("hud-orientation")!;
const logEl         = document.getElementById("log")!;

function log(msg: string) { logEl.textContent = msg; }

// ── Debug: orientation readout ──────────────────────────────────────────────
// Shows the phone's raw orientation sensor values on screen while composing,
// purely so this can be sanity-checked on a real device. Not tied to any
// gameplay mechanic.
let lastOrientationReading: { heading: number | null; alpha: number | null; beta: number | null; gamma: number | null } | null = null;
let orientationListening = false;

function renderOrientationDebug(): void {
    if (phase !== "composing" || mode !== "composer" || !lastOrientationReading) {
        orientationEl.textContent = "";
        return;
    }
    const fmt = (v: number | null) => v === null ? "–" : `${Math.round(v)}°`;
    const { heading, alpha, beta, gamma } = lastOrientationReading;
    orientationEl.textContent =
        `richting: ${fmt(heading)} (α ${fmt(alpha)} · β ${fmt(beta)} · γ ${fmt(gamma)})`;
}

function handleOrientationDebug(e: DeviceOrientationEvent): void {
    // iOS exposes a ready-made compass heading; elsewhere derive one from
    // alpha (which increases counter-clockwise, so flip it).
    const compass = (e as any).webkitCompassHeading;
    const heading = typeof compass === "number"
        ? compass
        : (e.alpha !== null ? (360 - e.alpha) % 360 : null);
    lastOrientationReading = { heading, alpha: e.alpha, beta: e.beta, gamma: e.gamma };
    renderOrientationDebug();
}

// Must be called from inside a user-gesture handler — iOS Safari gates
// DeviceOrientationEvent behind an explicit permission prompt.
function startOrientationDebug(): void {
    if (orientationListening) return;
    const DOE = (window as any).DeviceOrientationEvent;
    const attach = () => {
        window.addEventListener("deviceorientationabsolute", handleOrientationDebug as EventListener);
        window.addEventListener("deviceorientation", handleOrientationDebug as EventListener);
        orientationListening = true;
    };
    if (DOE && typeof DOE.requestPermission === "function") {
        DOE.requestPermission().then((result: string) => {
            if (result === "granted") attach();
        }).catch(() => { /* not actually iOS, or the prompt was denied/unsupported */ });
    } else {
        attach();
    }
}

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

// The grid only ever showed where notes *actually* land, but in composer mode
// that's the playhead, not wherever you tapped — confusing for a sighted
// tester. Hide it there; it stays visible (and accurate) in listener mode.
function renderGrid(): void {
    gridEl.style.display = mode === "composer" ? "none" : "grid";
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
            phaseEl.textContent = "Tik 3× rechtsboven om te beginnen";
            bpmEl.textContent = instrumentEl.textContent = backingEl.textContent = modeEl.textContent = holdfixEl.textContent = "";
            break;
        case "composing":
            phaseEl.textContent = introMode ? "Oefenlevel — volg de aanwijzingen" : `Opdracht: ${currentBrief.say}`;
            bpmEl.textContent = mode === "listener"
                ? `${bpm} BPM`
                : `${Math.round(bpm / COMPOSER_SLOWDOWN)} BPM (langzaam)`;
            instrumentEl.textContent = `instrument: ${INSTRUMENT_LABEL_NL[currentInstrument]}`;
            backingEl.textContent = drumPattern ? `beat: ${drumPattern.name}` : "";
            modeEl.textContent = mode === "composer" ? "componeren" : "luisteren";
            holdfixEl.textContent = holdFixMode === "threshold" ? "aanhouden: vertraagd" : "aanhouden: uit";
            break;
        case "done":
            phaseEl.textContent = "Je mixtape is klaar! Tik 3× rechtsboven voor een nieuwe.";
            break;
    }
    renderOrientationDebug();
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
// Composer runs slowed down, so there's time to place/check each note.
// Listener plays the song back at its real tempo.
function currentStepMs(): number {
    return stepDurationMs * (mode === "listener" ? 1 : COMPOSER_SLOWDOWN);
}

function startSequencer(): void {
    if (stepIntervalId !== null) window.clearInterval(stepIntervalId);
    stepIntervalId = window.setInterval(tick, currentStepMs());
}

function stopSequencer(): void {
    if (stepIntervalId !== null) { window.clearInterval(stepIntervalId); stepIntervalId = null; }
}

function playStep(step: number): void {
    const destination = mode === "composer" ? STEP_PANNERS[step] : ctx.destination;
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
    // A held pad press in composer mode paints the same note onto each new
    // step — but only once the hold has lasted past HOLD_THRESHOLD_MS (the
    // "threshold" fix), so a quick tap that happens to straddle a tick never
    // gets an accidental second note. The "single" fix disables this
    // entirely: a touch always places exactly one note.
    const longEnough = holdFixMode === "threshold" && (performance.now() - holdStartAt) >= HOLD_THRESHOLD_MS;
    if (phase === "composing" && mode === "composer" && padHeld && heldNote !== null && longEnough) {
        pattern[currentInstrument][currentStep] = { note: heldNote, instrument: currentInstrument };
    }
    playStep(currentStep);
    renderGrid();
}

function previewSlot(slot: StepSlot, step?: number): void {
    const destination = mode === "composer" && step !== undefined ? STEP_PANNERS[step] : ctx.destination;
    scheduleNote(slot.instrument, pitchForSlot(slot), ctx.currentTime + 0.01, 0.25, 0.6 * currentVolume, destination);
}

// ── Composing actions ────────────────────────────────────────────────────────
function setNote(note: number): void {
    if (phase !== "composing" || mode === "listener") return;
    const step = currentStep;

    const slot: StepSlot = { note, instrument: currentInstrument };
    pattern[currentInstrument][step] = slot;
    heldNote = note;
    previewSlot(slot, step);
    earcon(ctx, "place");
    log(`stap ${step + 1}: noot ${note + 1} (${INSTRUMENT_LABEL_NL[currentInstrument]})`);
    renderGrid();
    introAdvance("place");
}

function nudgeNote(direction: 1 | -1): void {
    if (phase !== "composing" || mode === "listener") return;
    const step = currentStep;

    const existing = pattern[currentInstrument][step]
        ?? { note: Math.floor(SCALE_DEGREES / 2), instrument: currentInstrument };
    const note = Math.max(0, Math.min(SCALE_DEGREES - 1, existing.note + direction));
    const slot: StepSlot = { note, instrument: currentInstrument };
    pattern[currentInstrument][step] = slot;
    heldNote = note; // a sustain in progress follows the new pitch
    previewSlot(slot, step);
    earcon(ctx, "place");
    log(`stap ${step + 1}: naar noot ${note + 1}`);
    renderGrid();
}

// Dedicated remove: clears the note on the current (playhead) step straight
// away — no separate erase mode.
function removeNote(): void {
    if (phase !== "composing" || mode === "listener") return;
    const step = currentStep;
    const had = pattern[currentInstrument][step] !== null;
    pattern[currentInstrument][step] = null;
    earcon(ctx, "erase");
    speak(had ? `stap ${step + 1} gewist` : `stap ${step + 1} was al leeg`);
    log(had ? `stap ${step + 1} gewist` : `stap ${step + 1} was al leeg`);
    renderGrid();
    introAdvance("remove");
}

function toggleMode(): void {
    if (phase !== "composing") return;
    const i = (MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length;
    mode = MODE_ORDER[i];
    startSequencer();                 // apply the slowdown (or lack of it) for the new mode
    earcon(ctx, "mode");
    if (mode === "composer") {
        speak("componeren, langzamer");
    } else {
        speak("luisteren, op tempo");
        introAdvance("mode");
    }
    updateHud();
    renderGrid();
}

function switchInstrument(): void {
    if (phase !== "composing") return;
    const i = (MELODIC_INSTRUMENTS.indexOf(currentInstrument) + 1) % MELODIC_INSTRUMENTS.length;
    currentInstrument = MELODIC_INSTRUMENTS[i];
    earcon(ctx, "instrument");
    speak(INSTRUMENT_LABEL_NL[currentInstrument]);
    updateHud();
    renderGrid();
    introAdvance("instrument");
}

// ── Briefs / mixtape ─────────────────────────────────────────────────────────
function loadBrief(index: number): void {
    briefIndex = index;
    currentBrief = briefAt(index);
    currentScale = currentBrief.scale;
    currentVolume = currentBrief.volume;
    currentInstrument = currentBrief.instrument;
    mode = "composer";

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

// Play every saved track back to back — melody *and* its drum groove, each at
// the loudness the brief asked for.
function playMedley(): void {
    let when = ctx.currentTime + 0.6;
    const stepDur = stepDurationMs / 1000;
    for (const track of mixtape) {
        const scale = BRIEFS.find(b => b.id === track.brief)?.scale ?? currentScale;
        for (const [step, note, id] of track.notes) {
            player.queueWaveTable(ctx, ctx.destination, instruments[id],
                when + step * stepDur, pitchForNote(note, scale), stepDur * 0.9,
                INSTRUMENT_VOLUME[id] * track.volume);
        }
        for (let s = 0; s < STEPS; s++) {
            const w = when + s * stepDur;
            if (track.groove.kick[s])
                player.queueWaveTable(ctx, ctx.destination, instruments.kick, w, DRUM_PITCH.kick, stepDur * 0.9, INSTRUMENT_VOLUME.kick * track.volume);
            if (track.groove.snare[s])
                player.queueWaveTable(ctx, ctx.destination, instruments.snare, w, DRUM_PITCH.snare, stepDur * 0.9, INSTRUMENT_VOLUME.snare * track.volume);
            if (track.groove.hihat[s])
                player.queueWaveTable(ctx, ctx.destination, instruments.highHat, w, DRUM_PITCH.highHat, stepDur * 0.9, INSTRUMENT_VOLUME.highHat * track.volume);
        }
        when += STEPS * stepDur + stepDur; // a beat of space between tracks
    }
}

function persistMixtape(): void {
    try {
        localStorage.setItem(MIXTAPE_KEY, JSON.stringify(mixtape));
        const best = Math.max(mixtape.length, Number(localStorage.getItem(BEST_KEY) ?? 0));
        localStorage.setItem(BEST_KEY, String(best));
    } catch { /* private mode / disabled — non-fatal */ }
}

// ── Guided intro (gated tutorial) ───────────────────────────────────────────
// Reuses the first real brief as a backdrop — nothing from the intro is saved.
function startIntro(): void {
    const brief = BRIEFS[0];
    currentBrief = brief;
    currentScale = brief.scale;
    currentVolume = brief.volume;
    currentInstrument = brief.instrument;
    mode = "composer";

    drumPattern = generateDrumPattern(STEPS, brief.grooveStyle);
    applyDrumPattern(drumPattern);

    introMode = true;
    introStep = 0;

    startSequencer();
    updateHud();
    renderGrid();
    speak(`Welkom bij het oefenlevel. ${INTRO_STEPS[0].prompt}`);
    log(INTRO_STEPS[0].prompt);
}

// Advances the tutorial only if `kind` is exactly the step currently being
// waited on — self-guarding, so repeating an already-passed action (or doing
// the wrong thing) is silently ignored rather than skipping steps.
function introAdvance(kind: IntroKind): void {
    if (!introMode) return;
    if (INTRO_STEPS[introStep]?.kind !== kind) return;

    introStep++;
    if (introStep >= INTRO_STEPS.length) {
        finishIntro();
        return;
    }
    const next = INTRO_STEPS[introStep];
    earcon(ctx, "done");
    speak(`${next.praise} ${next.prompt}`.trim());
    log(next.prompt);
}

function finishIntro(): void {
    stopSequencer();
    earcon(ctx, "done");
    speak("Goed gedaan! Je kent nu alle knoppen. Terug naar het startscherm.");
    window.setTimeout(() => {
        phase = "idle";
        introMode = false;
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
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    showStartScreen();
    startNoteEl.classList.add("hidden");
}

function applyStartOptions(): void {
    setSpeechEnabled(speechToggleEl.checked);
    try { localStorage.setItem(SPEECH_KEY, speechToggleEl.checked ? "1" : "0"); } catch { /* ignore */ }
    holdFixMode = holdfixSingleEl.checked ? "single" : "threshold";
}

try {
    const savedSpeech = localStorage.getItem(SPEECH_KEY);
    if (savedSpeech !== null) speechToggleEl.checked = savedSpeech === "1";
} catch { /* ignore */ }
setSpeechEnabled(speechToggleEl.checked);

introBtn.addEventListener("click", () => {
    applyStartOptions();
    pendingIntro = true;
    startNoteEl.classList.add("hidden");
    showGameScreen();
    updateHud();
    speak("Tik drie keer rechtsboven om te beginnen.");
});
gameBtn.addEventListener("click", () => {
    applyStartOptions();
    pendingIntro = false;
    startNoteEl.classList.add("hidden");
    showGameScreen();
    updateHud();
    speak("Tik drie keer rechtsboven om te beginnen.");
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

    startOrientationDebug();

    if (asIntro) {
        startIntro();
    } else {
        introMode = false;
        loadBrief(0);   // starts the sequencer
    }
    earcon(ctx, "start");
}

function reBrief(): void {
    const now = performance.now();
    if (now - lastTransportTapAt < REBRIEF_TAP_GUARD_MS) return;
    lastTransportTapAt = now;
    speak(currentBrief.say);
}

// ── Input wiring ──────────────────────────────────────────────────────────────
inp.onAction((action) => {
    switch (action.type) {
        case "bpmSet":
            if (phase === "idle" || phase === "done") startGame(action.bpm, pendingIntro);
            else if (phase === "composing") {
                if (introMode) introAdvance("finish");
                else finishTrack();
            }
            break;
        case "transportTap":
            if (phase === "composing" && !introMode) reBrief();
            break;
        case "noteSet":   setNote(action.note); break;
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
        case "modeToggle":       toggleMode(); break;
    }
});

updateHud();
renderGrid();
