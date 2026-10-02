import {GameLoop} from "./gameLoop.ts";
import {InputHandler} from "./inputHandler.ts";
import {createInitialState,  generateNumberSequence, generateSequence} from "./gameState.ts";
import {SynthManager} from "./audio/SynthManager.ts";
import {InstrumentManager, INSTRUMENTS, type InstrumentDef} from "./audio/InstrumentManager.ts";
import {Howl, Howler} from "howler";
import { enterFullscreen } from "../../src/fullscreen.ts";

const debug= !('ontouchstart' in window) && navigator.maxTouchPoints === 0;
const synth = new SynthManager();
const instruments = new InstrumentManager();
const input = new InputHandler(debug);
const state = createInitialState();
const scoreEl = document.getElementById("score")!;
const collectionEl = document.getElementById("collection")!;
const logEl = document.getElementById("log")!;
const instructionEl = document.getElementById("instruction")!;
const startScreenEl = document.getElementById("start-screen")!;
const gameScreenEl = document.getElementById("game-screen")!;
const startNoteEl = document.getElementById("start-note")!;
const introBtn = document.getElementById("intro-btn") as HTMLButtonElement;
const gameBtn = document.getElementById("game-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const stepIconEl = document.getElementById("step-icon")!;
const previewPanelEl = document.getElementById("preview-panel")!;
const previewIconSlotEl = document.getElementById("preview-icon-slot")!;
const previewRepeatBtn = document.getElementById("preview-repeat-btn") as HTMLButtonElement;
const previewNextBtn = document.getElementById("preview-next-btn") as HTMLButtonElement;
const listeningAssistEl = document.getElementById("listening-assist")!;
const repeatSoundBtn = document.getElementById("repeat-sound-btn") as HTMLButtonElement;
const forceBiteBtn = document.getElementById("force-bite-btn") as HTMLButtonElement;

// total instruments the player must collect (everything except the drums)
const CATCHABLE = INSTRUMENTS.filter(i => !i.isDrum);
const MAX_STRIKES = 3;

// --- introduction level -----------------------------------------------------
// The intro is a guided tutorial: it first plays a demo of a catchable fish and
// of the drum trap so the player knows what each sounds like, then the on-screen
// instruction walks them through every phase. Drums never bite during the intro
// and landing a single fish completes it, returning to the start screen.
let gameRunning = false;   // a round (intro or full game) is currently active
let introMode = false;     // currently playing the guided tutorial
let introComplete = false; // the tutorial fish has been landed — freeze play
let introDemoActive = false; // the current segment is an "explain" slide (loop paused)
let segmentIndex = 0;      // index into INTRO_SEGMENTS
let lastRenderedStepIconPhase: string | null = null; // avoids restarting ambient icon loops
let runId = 0;             // bumped on every start/stop so async work can bail out
let demoTimer: ReturnType<typeof setTimeout> | null = null;
let introEndTimer: ReturnType<typeof setTimeout> | null = null;

// a practice drill (isolated, ungraded rep of one physical action) is active
let activeDrill: DrillKind | null = null;
let drillCueActive = false;   // true during a drill's brief post-success celebration

// fresh, drill-scoped detection state — never read/written by the real phase
// machine further down, which keeps its own armBeta/armBetaBaseline etc.
let drillTiltBaseline: number | null = null;
let drillThrowMin: number | null = null;
let drillThrowMax: number | null = null;
let drillListenWindowUntil = 0;
let drillListenHooked = false;
let drillCrankAngle = 0;
const DRILL_REEL_TARGET = 360; // one full turn — a drill rep, not a full fight

const INTRO_DONE_TEXT =
    "🎉 Goed gedaan! Je hebt je eerste vis gevangen. Terug naar het startscherm...";

// what to do right now, keyed by phase
const INTRO_STEPS: Record<string, string> = {
    idle:      "Stap 1 van 4 — Trek je telefoon rustig naar achteren, alsof je een hengel terughaalt.",
    throwing:  "Stap 2 van 4 — Gooi je telefoon naar voren om de lijn uit te werpen.",
    listening: "Stap 3 van 4 — Luister. Hoor je een instrument een melodie spelen? Raak dan het scherm aan. Hoor je stilte? Wacht op de volgende.",
    reeling:   "Stap 4 van 4 — Draai met je duim rondjes op het scherm tot de vis binnen is.",
    success:   "Gevangen!",
    failure:   "De vis ontsnapte — geen zorgen, je hoort de volgende zo weer.",
};

const PHASE_HINTS: Record<string, string> = {
    idle:      "Trek je telefoon naar achteren om de hengel terug te halen.",
    throwing:  "Gooi je telefoon naar voren om uit te werpen.",
    listening: "Luister. Melodie? Raak het scherm aan. Drums of stilte? Doe niks.",
    reeling:   "Draai met je duim rondjes op het scherm om binnen te halen.",
    success:   "Gevangen! 🎣",
    failure:   "Ontsnapt...",
};

function updateInstruction(text?: string): void {
    if (text !== undefined) {
        instructionEl.textContent = text;
        return;
    }
    if (introDemoActive || activeDrill !== null) return; // explain/drill own the text
    if (introComplete) {
        instructionEl.textContent = INTRO_DONE_TEXT;
        return;
    }
    const table = introMode ? INTRO_STEPS : PHASE_HINTS;
    instructionEl.textContent = table[state.phase] ?? "";
}

// --- hand-drawn tutorial icons (inline SVG, no external assets) ------------
// Flat, bold-outline pictograms meant to be read at a glance by a young
// player. Animation is driven by CSS classes toggled from here — see the
// matching keyframes (fish-wiggle/note-float/drum-shake/wave-pulse/
// phone-tilt-*/reel-spin) in style.css.

const FISH_SVG = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
  <g class="fish-tail"><path d="M30 30 L8 14 L8 46 Z" fill="#3d8fc4"/></g>
  <g class="fish-body">
    <ellipse cx="58" cy="30" rx="28" ry="15" fill="#4fa3d1"/>
    <circle cx="76" cy="25" r="2.6" fill="#0a2540"/>
  </g>
  <g class="note"><ellipse cx="58" cy="14" rx="3.5" ry="2.6" fill="#0a2540"/><rect x="61" y="4" width="1.6" height="10" fill="#0a2540"/></g>
  <g class="note"><ellipse cx="72" cy="10" rx="3.5" ry="2.6" fill="#0a2540"/><rect x="75" y="0" width="1.6" height="10" fill="#0a2540"/></g>
  <g class="note"><ellipse cx="44" cy="12" rx="3.5" ry="2.6" fill="#0a2540"/><rect x="47" y="2" width="1.6" height="10" fill="#0a2540"/></g>
</svg>`;

const DRUMS_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g class="drum-body">
    <line x1="30" y1="8" x2="46" y2="34" stroke="#5a3a22" stroke-width="4" stroke-linecap="round"/>
    <line x1="70" y1="8" x2="54" y2="34" stroke="#5a3a22" stroke-width="4" stroke-linecap="round"/>
    <rect x="20" y="35" width="60" height="40" fill="#c0392b"/>
    <ellipse cx="50" cy="35" rx="30" ry="10" fill="#e8c39e"/>
    <ellipse cx="50" cy="75" rx="30" ry="10" fill="#8f2418"/>
  </g>
  <g class="no-overlay">
    <circle cx="50" cy="50" r="44" fill="none" stroke="#e63946" stroke-width="7"/>
    <line x1="18" y1="18" x2="82" y2="82" stroke="#e63946" stroke-width="7"/>
  </g>
</svg>`;

const EAR_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M60 18 C40 18 24 34 24 55 C24 74 36 88 52 88 C58 88 61 82 56 78 C46 74 38 65 38 54 C38 40 48 30 61 30 C69 30 74 36 71 43" fill="none" stroke="#2f2f2f" stroke-width="6" stroke-linecap="round"/>
  <path class="wave" d="M78 38 Q90 55 78 72" fill="none" stroke="#2f7fbf" stroke-width="5" stroke-linecap="round"/>
  <path class="wave" d="M84 32 Q96 55 84 78" fill="none" stroke="#2f7fbf" stroke-width="5" stroke-linecap="round"/>
  <path class="wave" d="M90 26 Q99 55 90 84" fill="none" stroke="#2f7fbf" stroke-width="5" stroke-linecap="round"/>
</svg>`;

const PHONE_SVG = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
  <rect x="4" y="8" width="92" height="44" rx="9" fill="#333333"/>
  <rect x="11" y="13" width="70" height="34" rx="3" fill="#bfe3ff"/>
  <circle cx="90" cy="30" r="3" fill="#666666"/>
</svg>`;

const REEL_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g class="reel-arc">
    <circle cx="50" cy="50" r="42" fill="none" stroke="#888888" stroke-width="6" stroke-dasharray="200 64"/>
    <polygon points="82,20 92,26 80,32" fill="#888888"/>
  </g>
  <circle class="reel-progress" cx="50" cy="50" r="35" fill="none" stroke="#2e7d32" stroke-width="6" stroke-linecap="round"/>
</svg>`;

/** Remove+re-add a class via a forced reflow so its CSS animation restarts
 *  even when the class was already present (a plain re-add is a no-op). */
function restartAnimation(el: Element, className: string): void {
    el.classList.remove(className);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(className);
}

const ICON_BASE_CLASS: Record<ExplainSegment["icon"], string> = {
    fish: "icon-fish", drums: "icon-drums", ear: "icon-ear",
    phone: "icon-phone", reel: "icon-reel",
};

/** Icon shown in the player-paced explain panel (fish/drums/ear/phone/reel). */
function renderExplainIcon(seg: ExplainSegment | null): void {
    if (seg === null) {
        previewIconSlotEl.innerHTML = "";
        previewIconSlotEl.className = "";
        return;
    }
    previewIconSlotEl.innerHTML =
        seg.icon === "fish" ? FISH_SVG :
        seg.icon === "drums" ? DRUMS_SVG :
        seg.icon === "ear" ? EAR_SVG :
        seg.icon === "phone" ? PHONE_SVG : REEL_SVG;
    previewIconSlotEl.className = ICON_BASE_CLASS[seg.icon];
}

/** Toggle the explain icon's "currently playing" animation (ear uses its own
 *  ambient "listening" pulse as the playing indicator). */
function setExplainIconPlaying(playing: boolean, icon: ExplainSegment["icon"]): void {
    previewIconSlotEl.className = ICON_BASE_CLASS[icon];
    if (playing) restartAnimation(previewIconSlotEl, icon === "ear" ? "listening" : "playing");
}

/**
 * Persistent icon shown next to the instruction text — during a practice
 * drill (tilt/throw/listen/reel) or during the real (physical) final-level
 * phases — phone-tilt for idle/throwing, ear for listening, reel-arrow for
 * reeling. Skipped entirely outside the intro, and only re-injected when the
 * phase/drill actually changes, so ambient loops (ear pulse, phone tilt-back)
 * don't restart on every updateUI() call.
 */
function renderStepIcon(): void {
    if (activeDrill !== null) {
        const key = "drill:" + activeDrill;
        if (key === lastRenderedStepIconPhase) return;
        lastRenderedStepIconPhase = key;
        if (activeDrill === "tilt") {
            stepIconEl.innerHTML = PHONE_SVG;
            stepIconEl.className = "icon-phone tilt-back";
        } else if (activeDrill === "throw") {
            stepIconEl.innerHTML = PHONE_SVG;
            stepIconEl.className = "icon-phone swing-demo";
        } else if (activeDrill === "listen") {
            stepIconEl.innerHTML = EAR_SVG;
            stepIconEl.className = "icon-ear listening";
        } else {
            stepIconEl.innerHTML = REEL_SVG;
            stepIconEl.className = "icon-reel spinning";
            stepIconEl.style.setProperty("--reel-progress", "0");
        }
        return;
    }
    if (!introMode || introDemoActive || introComplete) {
        if (lastRenderedStepIconPhase !== null) {
            stepIconEl.innerHTML = "";
            stepIconEl.className = "";
            lastRenderedStepIconPhase = null;
        }
        return;
    }
    if (state.phase === lastRenderedStepIconPhase) return;
    lastRenderedStepIconPhase = state.phase;

    if (state.phase === "idle") {
        stepIconEl.innerHTML = PHONE_SVG;
        stepIconEl.className = "icon-phone tilt-back";
    } else if (state.phase === "throwing") {
        stepIconEl.innerHTML = PHONE_SVG;
        stepIconEl.className = "icon-phone tilt-forward";
    } else if (state.phase === "listening") {
        stepIconEl.innerHTML = EAR_SVG;
        stepIconEl.className = "icon-ear listening";
    } else if (state.phase === "reeling") {
        stepIconEl.innerHTML = REEL_SVG;
        stepIconEl.className = "icon-reel spinning";
        stepIconEl.style.setProperty("--reel-progress", "0");
    } else {
        stepIconEl.innerHTML = "";
        stepIconEl.className = "";
    }
}

/** Live crank progress (0..1), driving the reel icon's progress ring on every
 *  tick — no timer needed. No-ops when the reel icon isn't currently shown. */
function setReelProgress(progress: number): void {
    if (stepIconEl.className.includes("icon-reel")) {
        stepIconEl.style.setProperty("--reel-progress", String(progress));
    }
}

function clearDemoTimer(): void {
    if (demoTimer !== null) { clearTimeout(demoTimer); demoTimer = null; }
}

// --- the intro script: explain every action, practice it, then put it all
// together for real -----------------------------------------------------
type DrillKind = "tilt" | "throw" | "listen" | "reel";
interface ExplainSegment {
    type: "explain"; id: string; mode: "sound" | "motion";
    icon: "fish" | "drums" | "ear" | "phone" | "reel";
    caption: string;
    soundDef?: InstrumentDef;   // required when mode === "sound"
    motionClass?: string;       // required when mode === "motion"
}
interface DrillSegment { type: "drill"; id: string; drill: DrillKind; }
type Segment = ExplainSegment | DrillSegment;

const INTRO_SEGMENTS: Segment[] = [
    { type: "explain", id: "sound-fish", mode: "sound", icon: "fish",
      soundDef: INSTRUMENTS.find(i => i.id === "guitar")!,
      caption: "Luister eerst. Dít is een vis — een melodie. Zó eentje wil je vangen:" },
    { type: "explain", id: "sound-drums", mode: "sound", icon: "drums",
      soundDef: INSTRUMENTS.find(i => i.isDrum)!,
      caption: "En dít zijn de drums — een kale dreun, geen melodie. Die laat je zwemmen:" },
    { type: "explain", id: "tilt-explain", mode: "motion", icon: "phone", motionClass: "tilt-back",
      caption: "Zo trek je de hengel terug: kantel je telefoon rustig naar achteren." },
    { type: "drill", id: "tilt-drill", drill: "tilt" },
    { type: "explain", id: "throw-explain", mode: "motion", icon: "phone", motionClass: "swing-demo",
      caption: "En zo gooi je uit: eerst naar achteren, dan met een zwaai naar voren." },
    { type: "drill", id: "throw-drill", drill: "throw" },
    { type: "explain", id: "listen-explain", mode: "sound", icon: "ear",
      soundDef: INSTRUMENTS.find(i => i.id === "piano")!,
      caption: "Zo klinkt een vis die bijt. Hoor je dit? Raak dan meteen het scherm aan." },
    { type: "drill", id: "listen-drill", drill: "listen" },
    { type: "explain", id: "reel-explain", mode: "motion", icon: "reel", motionClass: "demo-spin",
      caption: "Binnenhalen doe je door met je duim rondjes te draaien op het scherm." },
    { type: "drill", id: "reel-drill", drill: "reel" },
];

const DRILL_INSTRUCTIONS: Record<DrillKind, string> = {
    tilt:   "Nu jij! Kantel je telefoon naar achteren.",
    throw:  "Nu jij! Zwaai je telefoon naar voren.",
    listen: "Nu jij! Tik op het scherm zodra je de melodie hoort.",
    reel:   "Nu jij! Draai met je duim rondjes op het scherm.",
};
const DRILL_DONE_TEXT: Record<DrillKind, string> = {
    tilt:   "Goed geoefend! 🎉",
    throw:  "Goed geoefend! 🎉",
    listen: "Precies op tijd! 🎉",
    reel:   "Goed geoefend! 🎉",
};

/** Pure: plays an explain segment's sound once + starts its icon's "playing"
 *  animation. Schedules nothing itself — callers decide what happens next.
 *  Returns the duration in ms (0 if the samples weren't ready yet). */
function playExplainSoundOnce(seg: ExplainSegment, myRun: number): number {
    if (myRun !== runId) return 0;
    instruments.stopAll();
    setExplainIconPlaying(true, seg.icon);
    return instruments.playMelody(seg.soundDef!) * 1000;
}

function stopExplainIconPlaying(seg: ExplainSegment): void {
    setExplainIconPlaying(false, seg.icon);
}

/** Sound segments' automatic first playback: wait 1s, play, wait 1s, play
 *  again — gives a young player a moment to get ready before each sound. */
function pacedAutoPlay(seg: ExplainSegment, myRun: number): void {
    clearDemoTimer();
    const segIdx = segmentIndex;
    const stillValid = () => myRun === runId && segmentIndex === segIdx;
    demoTimer = setTimeout(() => {
        demoTimer = null;
        if (!stillValid()) return;
        const dur1 = playExplainSoundOnce(seg, myRun);
        demoTimer = setTimeout(() => {
            demoTimer = null;
            if (!stillValid()) return;
            stopExplainIconPlaying(seg);
            demoTimer = setTimeout(() => {
                demoTimer = null;
                if (!stillValid()) return;
                const dur2 = playExplainSoundOnce(seg, myRun);
                demoTimer = setTimeout(() => {
                    demoTimer = null;
                    if (!stillValid()) return;
                    stopExplainIconPlaying(seg);
                }, dur2);
            }, 1000);
        }, dur1);
    }, 1000);
}

/** Motion segments' automatic first playback: wait 1s, then start the
 *  (already-infinite) CSS loop — there's no natural "second play" for a loop. */
function pacedDemoStart(seg: ExplainSegment, myRun: number): void {
    clearDemoTimer();
    const segIdx = segmentIndex;
    demoTimer = setTimeout(() => {
        demoTimer = null;
        if (myRun !== runId || segmentIndex !== segIdx) return;
        restartAnimation(previewIconSlotEl, seg.motionClass!);
    }, 1000);
}

/** Herhaal: always instant, never paced — a deliberate replay shouldn't make
 *  the player wait through the slow first-time pacing again. */
function repeatExplain(myRun: number): void {
    if (myRun !== runId) return;
    const seg = INTRO_SEGMENTS[segmentIndex];
    if (seg.type !== "explain") return;
    clearDemoTimer();
    instruments.stopAll();
    if (seg.mode === "sound") {
        const dur = playExplainSoundOnce(seg, myRun);
        const segIdx = segmentIndex;
        demoTimer = setTimeout(() => {
            demoTimer = null;
            if (myRun !== runId || segmentIndex !== segIdx) return;
            stopExplainIconPlaying(seg);
        }, dur);
    } else {
        restartAnimation(previewIconSlotEl, seg.motionClass!);
    }
}

/** Show one segment: an explain slide (caption + paced demo) or a drill
 *  (hands off to startDrill). */
function enterSegment(index: number, myRun: number): void {
    if (myRun !== runId) return;
    segmentIndex = index;
    const seg = INTRO_SEGMENTS[index];
    previewPanelEl.hidden = seg.type !== "explain";
    if (seg.type === "explain") {
        introDemoActive = true;
        renderExplainIcon(seg);
        updateInstruction(seg.caption);
        if (seg.mode === "sound") pacedAutoPlay(seg, myRun);
        else pacedDemoStart(seg, myRun);
    } else {
        introDemoActive = false;
        renderExplainIcon(null);
        startDrill(seg.drill, myRun);
    }
    updateUI();
}

/** Volgende, and also reached automatically from a drill's success: advance
 *  to the next segment, or — once the script is done — start the final level. */
function advanceSegment(myRun: number): void {
    if (myRun !== runId) return;
    clearDemoTimer();
    instruments.stopAll();
    const next = segmentIndex + 1;
    if (next>= 2) {previewNextBtn.textContent = "Probeer het zelf"}
    else{ previewNextBtn.textContent = "Volgende"}
    if (next >= INTRO_SEGMENTS.length) { startFinalLevel(myRun); return; }
    enterSegment(next, myRun);
}

/** The real, continuous cast-to-catch run — unchanged phase machine, same
 *  hints/icons, landing the one real scored fish via finishIntro(). */
function startFinalLevel(myRun: number): void {
    if (myRun !== runId) return;
    previewPanelEl.hidden = true;
    renderExplainIcon(null);
    introDemoActive = false;
    activeDrill = null;
    updateInstruction("Klaar? Daar gaan we — volg de aanwijzingen.");
    demoTimer = setTimeout(() => {
        demoTimer = null;
        if (myRun !== runId) return;
        lastRenderedStepIconPhase = null;
        state.running = true;
        updateUI();
    }, 1200);
}

// --- the four practice drills: isolated, ungraded reps, entirely separate
// from the real phase machine (which keeps its own armBeta/state.phase/etc
// untouched until the final level begins) --------------------------------

function getNormalizedBeta(): number | null {
    const o = input.getOrientation();
    return o.beta !== null ? 180 + o.beta : null;
}

function tickTiltDrill(): void {
    const beta = getNormalizedBeta();
    if (beta === null) return;
    if (drillTiltBaseline === null) { drillTiltBaseline = beta; return; }
    if (beta - drillTiltBaseline > 10) completeDrill("tilt");
}

function tickThrowDrill(): void {
    const beta = getNormalizedBeta();
    if (beta === null) return;
    if (drillThrowMin === null || beta < drillThrowMin) drillThrowMin = beta;
    if (drillThrowMax === null || beta > drillThrowMax) drillThrowMax = beta;
    if (drillThrowMax - drillThrowMin > 10) completeDrill("throw");
}

/** Force a practice bite immediately (no random wait) — always a catchable
 *  instrument, exactly like spawnBite()'s introMode branch, but entirely
 *  local to the drill (never touches state.activeInstrument). */
function forceDrillBite(myRun: number): void {
    if (myRun !== runId || activeDrill !== "listen") return;
    const def = pick(CATCHABLE);
    const dobberId = soundDobber.play("caught");
    soundDobber.volume(0.8, dobberId);
    const dur = instruments.playMelody(def);
    drillListenWindowUntil = performance.now() + dur * 1000 + 600;
}

function tickListenDrill(): void {
    // a miss just quietly re-forces another bite — no strikes, ever, in a drill
    if (performance.now() > drillListenWindowUntil) forceDrillBite(runId);
}

function onDrillListenPress(): void {
    if (activeDrill !== "listen" || drillCueActive || drillListenHooked) return;
    if (performance.now() <= drillListenWindowUntil) {
        drillListenHooked = true;
        completeDrill("listen");
    }
}

function tickReelDrill(): void {
    drillCrankAngle = input.getCrankDegrees();
    setReelProgress(Math.min(1, Math.abs(drillCrankAngle) / DRILL_REEL_TARGET));
    if (Math.abs(drillCrankAngle) >= DRILL_REEL_TARGET) completeDrill("reel");
}

function tickDrill(): void {
    if (drillCueActive) return; // blocks re-detection during the success pause
    if (activeDrill === "tilt") tickTiltDrill();
    else if (activeDrill === "throw") tickThrowDrill();
    else if (activeDrill === "listen") tickListenDrill();
    else if (activeDrill === "reel") tickReelDrill();
}

function startDrill(drill: DrillKind, myRun: number): void {
    if (myRun !== runId) return;
    activeDrill = drill;
    drillCueActive = false;
    lastRenderedStepIconPhase = null; // force a fresh icon render for this drill
    if (drill === "tilt") {
        drillTiltBaseline = null;
    } else if (drill === "throw") {
        drillThrowMin = null;
        drillThrowMax = null;
    } else if (drill === "listen") {
        drillListenHooked = false;
        forceDrillBite(myRun);
    } else {
        resetCrank();
        drillCrankAngle = 0;
    }
    updateInstruction(DRILL_INSTRUCTIONS[drill]);
    renderStepIcon();
    updateUI();
}

/** A drill succeeded: confirm it audibly + visually, then hand off to the
 *  next segment. Every drill completion plays a clear success sound — the
 *  motion-only drills (tilt/throw/reel) produce no sound of their own, so
 *  this is the player's only audible "yes, that was it" cue for them. */
function completeDrill(drill: DrillKind): void {
    if (activeDrill !== drill || drillCueActive) return;
    drillCueActive = true;
    soundCatching.play("success");
    updateInstruction(DRILL_DONE_TEXT[drill]);
    if (drill === "throw") {
        // a one-shot forward flourish for the brief celebration beat
        stepIconEl.innerHTML = PHONE_SVG;
        stepIconEl.className = "icon-phone tilt-forward";
        lastRenderedStepIconPhase = "drill:throw:done";
    }
    const myRun = runId;
    const segIdx = segmentIndex;
    clearDemoTimer();
    demoTimer = setTimeout(() => {
        demoTimer = null;
        if (myRun !== runId || segmentIndex !== segIdx) return;
        drillCueActive = false;
        activeDrill = null;
        advanceSegment(myRun);
    }, 900);
}

/** Herhaal geluid (intro only): replay the melody currently on the hook,
 *  without extending the catch window — it helps identify what's biting, it
 *  doesn't remove the mechanic's time pressure. */
function repeatListeningSound(): void {
    if (!introMode || state.phase !== "listening" || state.activeInstrument === null) return;
    const def = INSTRUMENTS.find(i => i.id === state.activeInstrument);
    if (!def) return;
    instruments.stopAll();
    instruments.playMelody(def);
}

/** Nog een vis laten bijten (intro only): force a bite immediately instead of
 *  waiting for the random timer. The button is disabled while a bite is
 *  already active (see updateUI/the loop) rather than interrupting it. */
function forceBite(): void {
    if (!introMode || state.phase !== "listening" || state.activeInstrument !== null) return;
    biteTimer = 0;
    spawnBite();
    updateUI();
}

function finishIntro(): void {
    // land the tutorial fish, then drop back to the start screen once the catch
    // sound and the congratulations have had a moment to register.
    introComplete = true;
    updateInstruction();
    soundFishingBackground.fade(soundFishingBackground.volume() as number, 0, 1600);
    introEndTimer = setTimeout(() => {
        stopGame();
        startNoteEl.hidden = false;
        startNoteEl.textContent = "✅ Oefenlevel voltooid! Druk op ‘Start spel’ voor het hele spel.";
        introBtn.textContent = "Oefenlevel opnieuw";
    }, 2200);
}

function showStartScreen(): void {
    gameScreenEl.hidden = true;
    startScreenEl.hidden = false;
}

function showGameScreen(): void {
    startScreenEl.hidden = true;
    gameScreenEl.hidden = false;
}

/** Full teardown — stop everything and return to the start screen. */
function stopGame(): void {
    runId++;                       // invalidate any in-flight explain/drill timers
    introDemoActive = false;
    introComplete = false;
    segmentIndex = 0;
    activeDrill = null;
    drillCueActive = false;
    drillTiltBaseline = null;
    drillThrowMin = null;
    drillThrowMax = null;
    drillListenWindowUntil = 0;
    drillListenHooked = false;
    drillCrankAngle = 0;
    clearDemoTimer();
    if (introEndTimer !== null) { clearTimeout(introEndTimer); introEndTimer = null; }
    state.running = false;
    input.stop();
    loop.stop();
    Howler.stop();
    instruments.stopAll();
    soundFishingBackground.stop();
    gameRunning = false;
    introBtn.disabled = false;
    gameBtn.disabled = false;
    instructionEl.textContent = "";
    log("");
    previewPanelEl.hidden = true;
    renderExplainIcon(null);
    listeningAssistEl.hidden = true;
    stepIconEl.innerHTML = "";
    stepIconEl.className = "";
    lastRenderedStepIconPhase = null;
    showStartScreen();
}

/** Shared start path for both the intro and the full game. */
async function startGame(asIntro: boolean): Promise<void> {
    if (gameRunning) return;
    const myRun = ++runId;

    Howler.ctx?.resume();
    synth.resume();
    instruments.resume();

    const granted = await input.requestOrientationPermission();
    if (myRun !== runId) return;
    if (!granted) {
        startNoteEl.hidden = false;
        startNoteEl.textContent = "Geen toegang tot de bewegingssensor — tik nogmaals om opnieuw te proberen.";
        return;
    }

    if (!instruments.isReady()) {
        introBtn.disabled = true;
        gameBtn.disabled = true;
        startNoteEl.hidden = false;
        startNoteEl.textContent = "Instrumenten laden…";
        await instruments.preload();
        if (myRun !== runId) return;
        introBtn.disabled = false;
        gameBtn.disabled = false;
    }
    startNoteEl.hidden = true;

    introMode = asIntro;
    introComplete = false;
    introDemoActive = false;     // enterSegment()/the else-branch below set this correctly
    activeDrill = null;
    drillCueActive = false;
    segmentIndex = 0;
    state.score = 0;
    state.collectedInstruments = [];

    showGameScreen();
    input.start();
    startRound();                  // phase -> idle, background music on
    gameRunning = true;
    loop.start();                  // safe to start immediately: the loop no-ops
                                    // whenever introComplete is false, activeDrill is
                                    // null, and state.running is false — exactly the
                                    // case during every explain segment below

    if (asIntro) {
        // the intro script (explain -> drill, four times, then the final level)
        // drives state.running/activeDrill/introDemoActive from here on
        enterSegment(0, myRun);
        return;
    }

    state.running = true;
    updateUI();
}

// catch-by-ear timing (seconds unless noted)
let biteTimer = 0;             // time since last melody
let nextBiteDelay = 2;         // wait before the next melody
let catchWindowUntil = 0;      // performance.now() timestamp the current window closes
// Reeling is tracked inside InputHandler (on every pointermove, with a circle
// fit for the drifting centre). Here we just mirror the running total.
let crankAngle = 0;           // signed degrees turned this reel-in
let crankVelocity = 0;        // change in crankAngle on the last tick
let isSoundPlaying = false;
const REEL_TARGET = 3 * 360;  // full turns needed to land the fish

function resetCrank(): void {
    crankAngle = 0;
    crankVelocity = 0;
    input.beginCrank();
}

function log(message: string): void {
    logEl.textContent = message;
}
// audio.load("footstep", { src: ["sounds/footstep.webm", "sounds/footstep.mp3"] });
// audio.load("bgm",      { src: ["sounds/bgm.webm", "sounds/bgm.mp3"], loop: true, volume: 0.4 });
// var soundLeft = new Howl({src: ["sounds/left.webm",    "sounds/left.mp3"]})
// audio.load("left",    { src: ["sounds/left.webm",    "sounds/left.mp3"]    });
// var soundRight = new Howl({src: ["sounds/right.webm",   "sounds/right.mp3"]});
// audio.load("right",   { src: ["sounds/right.webm",   "sounds/right.mp3"]   });
// var soundSuccess = new Howl({src: ["sounds/success.webm", "sounds/success.mp3"]});
// audio.load("success", { src: ["sounds/success.webm", "sounds/success.mp3"] });
// audio.load("failure", { src: ["sounds/failure.webm", "sounds/failure.mp3"] });
// var soundFailure = new Howl({src: ["sounds/failure.webm", "sounds/failure.mp3"]})
// audio.load("walking", { src: ["sounds/walking.webm", "sounds/walking.mp3"] });
// var soundWalking = new Howl({src: ["sounds/walking.webm", "sounds/walking.mp3"] });
// var soundFrog = new Howl({
//     src: ["sounds/frogCroak.webm", "sounds/frogCroak.wav", "sounds/frogCroak.mp3"],
//     loop: true
// })
var soundCatching = new Howl({
    src: ["sounds/vissen vangen_edited.mp3"],
    sprite: {
        success: [0,1586],
        repeat: [1586,1742],
        failure: [3328,2680],
        escaped: [6008,1545]
}})
var soundDobber = new Howl({
    src: ["sounds/dobber-real.mp3", "sounds/dobber-real.webm", "sounds/dobber-real.wav"],
    sprite: {
        land: [500,1500],
        caught: [3900,5000]
    }
})
var soundCaught = new Howl({
    src: ["sounds/fishCaught.webm", "sounds/fishCaught.wav", "sounds/fishCaught.mp3"],
    sprite: {
        caught: [2000, 5000]
    }
})
var soundFishingBackground = new Howl({src: ["sounds/fishing-background.webm", "sounds/fishing-background.mp3","sounds/fishing-background.wav"]})
var soundFishingUnderwater = new Howl({src: ["sounds/underwater.webm", "sounds/underwater.mp3"]})
var soundThrow = new Howl({src: ["sounds/throw-woosh.webm", "sounds/throw-woosh.wav", "sounds/throw-woosh.mp3"]})
var soundFishingReel = new Howl({src: ["sounds/fishingreel.webm", "sounds/fishingreel.mp3","sounds/fishingreel.wav"]})
var soundFishingReelThrow = new Howl({
    src: ["sounds/fishing-reel-throw.webm", "sounds/fishing-reel-throw.wav", "sounds/fishing-reel-throw.mp3"],
    sprite: {
        throw: [0,3000],
        reel: [5200,1000]
    }
})
const STEP_INTERVAL = 4.0; // seconds
let stepTimer = 0;
var armBeta: number|null = null;
var armBetaBaseline: number|null = null;
// @ts-ignore
var nextSound: boolean = true;
var nextSoundTimeout: ReturnType<typeof setTimeout> | null = null; // add this
// var armTime: number = 0;
function resetRoundState(): void {
    state.collectedInstruments = [];
    state.activeInstrument = null;
    state.pendingInstrument = null;
    state.strikes = 0;
    biteTimer = 0;
    nextBiteDelay = 2;
    catchWindowUntil = 0;
    resetCrank();
    instruments.stopAll();
}

function startRound(): void {
    updateUI()
    console.log("Starting Round");
    resetRoundState();
    const length = state.score + 3; // sequence grows each round
    state.sequence = generateSequence(length);
    state.playerInput = [];
    state.currentStep = 0;
    state.phase = "idle";
    stepTimer = 0;
    state.randomAngles = generateNumberSequence(3, -45,45)
    state.randomDistances = generateNumberSequence(3, 1,5)
    // armTime = 0;
    armBeta = null;
    state.drawnStage = 0
    state.drawn = false;
    state.armed = false;
    if (nextSoundTimeout !== null) {
        clearTimeout(nextSoundTimeout);
        nextSoundTimeout = null;
    }
    nextSound = true;
    soundFishingBackground.play()
    soundFishingBackground.volume(0.3)
    soundFishingBackground.loop(true)
}



const loop = new GameLoop((dt) => {
    if (introComplete) return; // tutorial fish landed — hold everything still
    if (activeDrill !== null) { tickDrill(); return; } // drill detection takes over
    if (!state.running) return;

    const orientation = input.getOrientation();
    //if beta is smaller than zero, we have crossed the z plane, to prevent errors, we will update the beta to a number that is always positive
    const beta = orientation.beta !== null
        ? 180 + orientation.beta
        : orientation.beta;
    // console.log(beta, gamma)
    stepTimer += dt;
    if (state.phase =="idle" && beta!==null){
        //only do this if beta is not null:
        if (armBetaBaseline== null){
            //set both to be at least something if it is null right now.
            armBetaBaseline = beta
            armBeta = beta
        }
        //idle so we wait for them to throw the line out.
        //each two seconds we record the orientation.
        if (stepTimer >= STEP_INTERVAL) {
            stepTimer = 0;
            // we compare to STEP_INTERVAL-2*STEP_INTERVAL seconds ago. when it hits 2*STEP_INTERVAL seconds, we reset it to the one of STEP_INTERVAL seconds ago
            armBetaBaseline = armBeta
            armBeta = beta
        }
        if (armBetaBaseline!==null && beta-armBetaBaseline>10){
            //if this is the case, the line is being thrown back, we do the following:
            // we play the sound of throwing the line back
            // we change the state to throwing, as we change the state, the baseline remains the same for the rest of the round
            soundThrow.play()
            state.phase = "throwing"
            updateUI()
        }
    }
    //wait a tick between phases
    else if(state.phase == "throwing"&&armBetaBaseline!==null && beta!==null){
        // all parameters are set, so we only check if the beta difference gets lower than 2?
        if (beta-armBetaBaseline<2){
            //in case the sound still plays, we stop and play the sound again for the actual throw
            soundThrow.stop()
            soundThrow.play()
            soundFishingReelThrow.play("throw")
            // set state to waiting to ensure it waits without changing the armbetabaseline
            state.phase = "waiting"
            setTimeout(() => {
                soundFishingReelThrow.stop()
                soundDobber.play("land")
                setTimeout(() =>{
                    //stop background of outside water and switch to underwater sound
                    soundFishingUnderwater.play()
                    soundFishingUnderwater.volume(0.3)
                    soundFishingUnderwater.loop(true)
                    soundFishingBackground.stop()
                    }, 1500
                )
                stepTimer=0
                biteTimer=0
                nextBiteDelay = 1.5 + Math.random()*2
                state.phase = "listening"
                log("luister goed...")
                updateUI()
            },1000)
        }
    }
    else if (state.phase == "listening"){
        // A fish = an instrument. Every so often one "bites" by playing its
        // melody. The player must tap while they hear a non-drum instrument to
        // catch it. Drums are a trap. Collect every catchable instrument to win.
        biteTimer += dt;

        // close the catch window once the melody (+ grace) is over
        if (state.activeInstrument !== null && performance.now() > catchWindowUntil) {
            state.activeInstrument = null;
            log("...weg. luister opnieuw");
        }

        if (state.activeInstrument === null && biteTimer >= nextBiteDelay) {
            biteTimer = 0;
            nextBiteDelay = 4 + Math.random() * 2.6;
            spawnBite();
        }

        if (introMode) {
            repeatSoundBtn.disabled = state.activeInstrument === null;
            forceBiteBtn.disabled = state.activeInstrument !== null;
        }
    }
    else if (state.phase == "reeling"){
        stepTimer += dt;
        const touching = input.getPointer() !== null;
        //during reeling, set the armBaseBetabaseline to the current beta, this is to have a better baseline

        if (armBetaBaseline!==null && beta!==null){
            armBetaBaseline = beta;
        }

        // reeling engages the instant the screen is touched
        if (touching && !isSoundPlaying) {
            soundFishingReel.loop(true);
            soundFishingReel.play();
            isSoundPlaying = true;
        } else if (!touching && isSoundPlaying) {
            soundFishingReel.loop(false);
            soundFishingReel.stop();
            isSoundPlaying = false;
        }

        // crank total is accumulated in InputHandler on every pointermove
        const total = input.getCrankDegrees();
        crankVelocity = total - crankAngle;
        crankAngle = total;

        // faster cranking -> faster reel sound
        if (isSoundPlaying) {
            soundFishingReel.rate(Math.min(2, Math.max(0.7, 0.7 + Math.abs(crankVelocity) / 8)));
        }

        if (introMode) {
            setReelProgress(Math.min(1, Math.abs(crankAngle) / REEL_TARGET));
        }

        // reeled in — two full turns — the outcome is revealed now
        if (Math.abs(crankAngle) >= REEL_TARGET) {
            resolveReel();
        } else if (stepTimer > 10 * STEP_INTERVAL) {
            // took too long — the fish shakes loose, keep fishing
            soundFishingReel.loop(false);
            soundFishingReel.stop();
            isSoundPlaying = false;
            // soundFailure.play();
            soundCatching.play("escaped")
            state.pendingInstrument = null;
            resetCrank();
            state.phase = "listening";
            biteTimer = 0;
            nextBiteDelay = 2;
            log("de vis is los! luister opnieuw");
            updateUI();
        } else {
            log("binnenhalen: " + Math.round(Math.abs(crankAngle)) + "°");
        }
    }
    if (state.phase === "success" || state.phase =="failure") {
        state.currentStep = state.currentStep + 1;
        // create new target locations
        if (state.currentStep>2) {
            state.currentStep = 0
            state.randomAngles = generateNumberSequence(3,-45,45)
            state.randomDistances= generateNumberSequence(3,1,3)
        }

        resetRoundState()
        state.phase = "idle"
        updateUI()
    }
});

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Pick an instrument to "bite" and play its melody, opening the catch window. */
function spawnBite(): void {
    const drum = INSTRUMENTS.find(i => i.isDrum)!;
    const needed = CATCHABLE.filter(i => !state.collectedInstruments.includes(i.id));

    // the tutorial never uses the drum trap — a catchable fish always bites
    if (introMode) {
        const def = pick(needed.length ? needed : CATCHABLE);
        const dobberId = soundDobber.play("caught");
        soundDobber.volume(0.8, dobberId);
        const melodyDur = instruments.playMelody(def);
        state.activeInstrument = def.id;
        catchWindowUntil = performance.now() + melodyDur * 1000 + 600;
        log("🎣 er bijt iets — raak het scherm aan!");
        return;
    }

    // ~25% drum trap; otherwise prefer a not-yet-unlocked instrument, but an
    // already-unlocked one can still bite (it just won't award a point).
    const roll = Math.random();
    let def: InstrumentDef;
    if (roll < 0.25 || needed.length === 0) {
        def = roll < 0.25 ? drum : pick(CATCHABLE);
    } else if (roll < 0.75) {
        def = pick(needed);
    } else {
        def = pick(CATCHABLE);
    }

    // the bobber dips — an audible "something's there" cue alongside the melody
    const dobberId = soundDobber.play("caught");
    soundDobber.volume(0.8, dobberId);

    const melodyDur = instruments.playMelody(def);
    state.activeInstrument = def.id;
    // window stays open for the melody plus a short grace period to react
    catchWindowUntil = performance.now() + melodyDur * 1000 + 600;
    log("🎣 er bijt iets...");
}

/**
 * The player commits by touching the screen: whatever is on the hook right now
 * (a melody they heard, the drums, or nothing) gets reeled in. Whether it was
 * the right call is only revealed once the reel-in finishes.
 */
function startReeling(): void {
    if (!state.running || state.phase !== "listening") return;
    state.pendingInstrument = state.activeInstrument; // may be null (touched during silence)
    state.activeInstrument = null;
    instruments.stopAll();
    resetCrank();
    stepTimer = 0;
    state.phase = "reeling";
    log("binnenhalen!");
    updateUI();
}

/** Land whatever was on the hook — the outcome (and any mistake sound) happens here. */
function resolveReel(): void {
    soundFishingReel.loop(false);
    soundFishingReel.stop();
    isSoundPlaying = false;
    soundCaught.play("caught");
    soundFishingUnderwater.stop()
    soundFishingBackground.play()
    soundFishingBackground.volume(0.3)
    soundFishingBackground.loop(true)
    const id = state.pendingInstrument;
    const def = id ? INSTRUMENTS.find(i => i.id === id) ?? null : null;
    state.pendingInstrument = null;
    resetCrank();

    state.phase = "idle";
    biteTimer = 0;
    nextBiteDelay = 1.5 + Math.random() * 2;

    if (!def) {
        // reeled in an empty hook — the miss lands now, not when you touched
        // soundFailure.volume(0.5);
        // soundFailure.play();
        // soundFailure.volume(1);
        soundCatching.play("escaped")
        log("niks aan de haak...");
    } else if (def.isDrum) {
        // the drums were the wrong call — the strike lands now
        state.strikes++;
        soundCatching.play("failure");
        log(`fout ${state.strikes}/${MAX_STRIKES} — dat waren de drums!`);
        if (state.strikes >= MAX_STRIKES) state.phase = "failure";
    } else {
        const firstTime = !state.collectedInstruments.includes(def.id);
        if (firstTime) {
            state.collectedInstruments.push(def.id);
            state.score++;
        }
        soundCaught.stop()
        soundCatching.play("success")
        log(firstTime ? `${def.label} gevangen!` : `${def.label} — al vrij, geen punt`);
        if (introMode) {
            // one fish is all the tutorial asks for
            finishIntro();
        } else if (state.collectedInstruments.length >= CATCHABLE.length) {
            state.phase = "success";
        }
    }
    updateUI();
}

input.onPress(startReeling);
input.onPress(onDrillListenPress);

if (debug) {
    (window as any).__game = {
        state, INSTRUMENTS,
        crank: () => ({ crankAngle, crankVelocity, center: input.getCrankCenter() }),
        activeDrill: () => activeDrill,
        segmentIndex: () => segmentIndex,
    };
    // keyboard shortcuts so the mechanic can be tested on desktop
    window.addEventListener("keydown", (e) => {
        // drive whichever practice drill is active first — on desktop, mouse-driven
        // debug orientation always reports beta:0, so there's no real tilt signal
        if (activeDrill === "tilt" && e.key === "t") { completeDrill("tilt"); return; }
        if (activeDrill === "throw" && e.key === "t") { completeDrill("throw"); return; }
        if (activeDrill === "listen" && e.key === "l") { onDrillListenPress(); return; }
        if (activeDrill === "reel" && e.key === " ") {
            e.preventDefault();
            drillCrankAngle = DRILL_REEL_TARGET;
            completeDrill("reel");
            return;
        }
        if (!state.running) return;
        if (e.key === "t" && state.phase === "idle") {
            soundThrow.play();
            state.phase = "throwing";
            updateUI();
        } else if (e.key === "l") {
            biteTimer = 0;
            nextBiteDelay = 1;
            state.phase = "listening";
            updateUI();
        } else if (e.key === " ") {
            e.preventDefault();
            startReeling();
        }
    });
}

function updateUI(): void {
    scoreEl.textContent = `Score: ${state.score}`;

    // the instrument on the hook stays hidden until the reel-in resolves
    const caught = CATCHABLE
        .map(i => `${state.collectedInstruments.includes(i.id) ? "✅" : "⬜"} ${i.label}`)
        .join("   ");
    collectionEl.textContent =
        `${caught}   |   drums: ${state.strikes}/${MAX_STRIKES}`;

    // the tutorial only asks for one fish — the full collection tracker would
    // just be noise, so hide it and the score until the real game starts
    collectionEl.hidden = introMode;
    scoreEl.hidden = introMode;

    // the listening-step assist buttons only make sense mid-tutorial, while
    // there's actually something (or nothing yet) to react to
    listeningAssistEl.hidden = !(introMode && state.phase === "listening");

    renderStepIcon();
    updateInstruction();
}
// starting from a button click (a user gesture) is when fullscreen is allowed
introBtn.addEventListener("click", () => { startNoteEl.hidden = true; void enterFullscreen(); startGame(true); });
gameBtn.addEventListener("click", () => { startNoteEl.hidden = true; void enterFullscreen(); startGame(false); });
stopBtn.addEventListener("click", () => stopGame());
previewRepeatBtn.addEventListener("click", () => repeatExplain(runId));
previewNextBtn.addEventListener("click", () => advanceSegment(runId));
repeatSoundBtn.addEventListener("click", () => repeatListeningSound());
forceBiteBtn.addEventListener("click", () => forceBite());