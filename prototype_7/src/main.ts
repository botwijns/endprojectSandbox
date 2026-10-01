import { QuizSession } from "./quizEngine.ts";
import { initAudio, getAudioContext, playSong, playNote, stopAudio, fontsReady } from "./audioPlayback.ts";
import { speak, speakFrom, earcon, positionalCue } from "./speech.ts";
import { InputHandler, zonesFor, type QuizAction, type AnswerIndex, type AnswerZone } from "./inputHandler.ts";
import { KNOWN_SONGS } from "./knownSongs.ts";
import { generateQuestion, generatePreviewSong } from "./questionGenerator.ts";
import { BASE_RATING } from "./rating.ts";
import type { GeneratedSong, Question } from "./types.ts";
import {
    DRUMS_SVG, EAR_SVG, PHONE_ZONES_2_SVG, PHONE_ZONES_4_SVG, TAP_SVG, DOUBLE_TAP_SVG, SHAKE_SVG,
} from "./introIcons.ts";

// ── Eyes-free "wat hoor je?" music quiz ──────────────────────────────────────
// Every question generates a brand-new song from a real music-theory engine and
// asks about something audible in it. Played entirely by ear: the question is
// spoken, the piece plays, and the answers sit either in the four screen
// corners or split left/right (matching the question's option count), read
// out with a positional cue (left/right pan, high/low pitch). Shaking the
// phone repeats the current question.
//
// A start screen offers a guided "oefenlevel" (introduction) next to the real
// quiz - see the introduction section below. Tapping 3× anywhere outside the
// buttons still starts the quiz, so it stays playable without looking.

const QUIZ_LENGTH = 8;
const PROMPT_READ_MS = 2600; // rough time to speak the question before the piece plays
const OPTION_READ_GAP_MS = 1900; // spacing when reading the four options in a row
const RESULT_ADVANCE_MS = 3200; // delay before the next question after an answer

type Phase = "prestart" | "listening" | "answered" | "done";

const input = new InputHandler();
let session: QuizSession | null = null;
let phase: Phase = "prestart";
let pendingTimers: number[] = [];
// Set once a round ends (see endQuiz); only shown in the HUD while phase === "done".
let lastResultsSummary: { category: string; avgDelta: number }[] = [];
let runId = 0;              // bumped on every start/stop so async work can bail out
let loading = false;        // waiting for the instrument fonts before a start
let fontPoll: number | null = null;

// ── Screens ─────────────────────────────────────────────────────────────────
const startScreenEl = document.getElementById("start-screen")!;
const gameScreenEl = document.getElementById("game-screen")!;
const startNoteEl = document.getElementById("start-note")!;
const introBtn = document.getElementById("intro-btn") as HTMLButtonElement;
const gameBtn = document.getElementById("game-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const instructionEl = document.getElementById("instruction")!;
const stepIconEl = document.getElementById("step-icon")!;
const previewPanelEl = document.getElementById("preview-panel")!;
const previewIconSlotEl = document.getElementById("preview-icon-slot")!;
const previewRepeatBtn = document.getElementById("preview-repeat-btn") as HTMLButtonElement;
const previewNextBtn = document.getElementById("preview-next-btn") as HTMLButtonElement;
const practiceAssistEl = document.getElementById("practice-assist")!;
const repeatQuestionBtn = document.getElementById("repeat-question-btn") as HTMLButtonElement;
const readOptionsBtn = document.getElementById("read-options-btn") as HTMLButtonElement;

// ── HUD (sighted debug aid only) ─────────────────────────────────────────────
const hud = {
    phase: document.getElementById("hud-phase")!,
    progress: document.getElementById("hud-progress")!,
    score: document.getElementById("hud-score")!,
    tier: document.getElementById("hud-tier")!,
    results: document.getElementById("hud-results")!,
};

// Dev-only song picker: force every question in the next round to use one
// specific known song, to audition it against the quiz's trait questions
// before leaving it in the random rotation. "Willekeurig" = normal random mix.
const songPicker = document.getElementById("hud-song-picker") as HTMLSelectElement;
songPicker.appendChild(new Option("Willekeurig", ""));
for (const song of KNOWN_SONGS) {
    songPicker.appendChild(new Option(`${song.title} (${song.composer})`, song.id));
}

function renderHud(): void {
    if (introMode) {
        hud.phase.textContent = "oefenlevel";
        hud.progress.textContent = introDemoActive
            ? `voorbeeld ${Math.min(previewIndex + 1, PREVIEW_STEPS.length)} / ${PREVIEW_STEPS.length}`
            : `oefenvraag ${Math.min(practiceIndex + 1, PRACTICE.length)} / ${PRACTICE.length}`;
        hud.score.textContent = "";
        hud.tier.textContent = "";
        hud.results.textContent = "";
        return;
    }
    const label: Record<Phase, string> = {
        prestart: "tik 3× om te starten",
        listening: "luisteren",
        answered: "beantwoord",
        done: "klaar — tik 3× voor een nieuwe ronde",
    };
    hud.phase.textContent = label[phase];
    if (session) {
        const { current, total } = session.progress;
        const shown = Math.min(current, total);
        hud.progress.textContent = phase === "done" ? `${total} / ${total}` : `vraag ${shown} / ${total}`;
        hud.score.textContent = `score ${session.score}`;
        if (session.current) {
            const rating = Math.round(session.ratingFor(session.current.traitId));
            const songRating = Math.round(session.current.songRating);
            hud.tier.textContent = `rating ${rating} vs song ${songRating}`;
        } else {
            hud.tier.textContent = "";
        }
        hud.results.textContent = phase === "done" && lastResultsSummary.length
            ? "beste: " + lastResultsSummary.map(s => `${s.category} (+${Math.round(s.avgDelta)})`).join(", ")
            : "";
    } else {
        hud.progress.textContent = "";
        hud.score.textContent = "";
        hud.tier.textContent = "";
        hud.results.textContent = "";
    }
}

// ── Timer helpers ───────────────────────────────────────────────────────────
function later(fn: () => void, ms: number): void {
    pendingTimers.push(window.setTimeout(fn, ms));
}
function clearPending(): void {
    pendingTimers.forEach(t => window.clearTimeout(t));
    pendingTimers = [];
}
function silenceEverything(): void {
    clearPending();
    stopAudio();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/**
 * Speak, then run `fn` once the speech ends - or after a length-based
 * fallback, so a missing/silent speech engine never stalls the flow. `fn` runs
 * at most once (a cancelled utterance can still fire onend), and the fallback
 * is a pending timer, so silenceEverything() drops it.
 */
function speakThen(text: string, fn: () => void): void {
    let fired = false;
    const go = () => {
        if (fired) return;
        fired = true;
        fn();
    };
    const u = speak(text);
    if (u) u.onend = go;
    later(go, Math.max(1500, text.length * 75));
}

// ── Audio helpers ───────────────────────────────────────────────────────────
function cue(kind: Parameters<typeof earcon>[1]): void {
    const ctx = getAudioContext();
    if (ctx) earcon(ctx, kind);
}

/** The question being asked right now - a practice question during the intro. */
function currentQuestion(): Question | undefined {
    return introMode ? introQuestion ?? undefined : session?.current;
}

function playPiece(): number {
    const q = currentQuestion();
    if (!q) return 0;
    stopAudio();
    const ms = playSong(q.song);
    later(() => cue("listen"), ms + 120);
    return ms;
}

// Announces one answer option: a positional cue, then either the spoken text
// or - for "hear the note" questions - the letter followed by the actual tone.
function announceOption(index: AnswerIndex, zone: AnswerZone): void {
    const q = currentQuestion();
    if (!q) return;
    const ctx = getAudioContext();
    if (ctx) positionalCue(ctx, zone);
    const audio = q.audioOptions?.[index];
    if (audio) {
        later(() => speakFrom(`${zone.letter}.`, zone.pan), 180);
        later(() => playNote(audio.instrument, audio.pitch), 650);
    } else {
        const opt = q.options[index];
        later(() => speakFrom(`${zone.letter}. ${opt}`, zone.pan), 180);
    }
}

function readOptions(): void {
    const q = currentQuestion();
    if (!q) return;
    const zones = zonesFor(q.options.length);
    zones.forEach((zone, i) => {
        later(() => announceOption(i, zone), i * OPTION_READ_GAP_MS);
    });
    if (introMode) {
        // all options heard - now it's the player's turn to tap
        later(() => {
            if (introStep === "listen") setIntroStep("tap");
        }, zones.length * OPTION_READ_GAP_MS);
    }
}

function setAnswerLayoutClass(count: number): void {
    document.body.classList.toggle("answers-2", count <= 2);
    document.body.classList.toggle("answers-4", count > 2);
}

// ── Introduction level ──────────────────────────────────────────────────────
// A guided tutorial, in the same shape as prototype 5's: first a player-paced
// preview (Herhaal / Volgende) that lets the player hear a piece with and
// without drums and learn where the answers sit by their beeps, then two real
// practice questions - one with two answers (left/right), one with four
// (corners) - with a "Stap X van 4" instruction and icon for each step. A
// wrong answer is explained and asked again with a fresh song; answering both
// correctly completes the intro and returns to the start screen.
let introMode = false;       // currently playing the guided tutorial
let introDemoActive = false; // in the player-paced preview
let previewIndex = 0;        // index into PREVIEW_STEPS while introDemoActive is true
let previewSong: GeneratedSong | null = null;
let practiceIndex = 0;       // index into PRACTICE
let introQuestion: Question | null = null;
let leadInPending = false;   // speak the practice question's lead-in on its first ask only

type IntroStep = "listen" | "tap" | "commit" | "corners" | "done";
let introStep: IntroStep | null = null;
let lastRenderedStepIcon: IntroStep | null = null; // avoids restarting ambient icon loops

const INTRO_DONE_TEXT = "🎉 Goed gedaan! Je kent nu de quiz. Terug naar het startscherm...";

// what to do right now, keyed by step
const INTRO_STEPS: Record<IntroStep, string> = {
    listen:  "Stap 1 van 4 — Luister naar de vraag, het stukje muziek en de antwoorden.",
    tap:     "Stap 2 van 4 — Tik één keer op een kant om dat antwoord te horen.",
    commit:  "Stap 3 van 4 — Tik twee keer op dezelfde kant om het te kiezen.",
    corners: "Stap 4 van 4 — Nu zijn er vier hoeken. Schud je telefoon om de vraag opnieuw te horen.",
    done:    INTRO_DONE_TEXT,
};

const PRACTICE_RATING = BASE_RATING - 200; // aim well below neutral: the easiest songs the generator can make
const PRACTICE_MAX_BARS = 3;                // ...but keep them short - for some traits "easiest" means "longest"

const PRACTICE: { traitId: string; leadIn: string }[] = [
    { traitId: "has-drums", leadIn: "Eerste oefenvraag." },
    {
        traitId: "melody-instrument-family",
        leadIn: "Nu zijn er vier antwoorden, één in elke hoek. Hoog piepje is boven, laag piepje is onder. " +
            "Wil je de vraag nog eens horen? Schud dan je telefoon.",
    },
];

type PreviewIcon = "drums" | "no-drums" | "zones-2" | "zones-4";
interface PreviewStep { icon: PreviewIcon; caption: string; play: () => number; }

const ZONE_CUE_GAP_MS = 1400;

const PREVIEW_STEPS: PreviewStep[] = [
    {
        icon: "drums",
        caption: "Luister eerst. Dit is een stukje muziek mét drums.",
        play: () => playSong(previewSong!),
    },
    {
        icon: "no-drums",
        caption: "En dit is hetzelfde stukje zónder drums.",
        play: () => playSong({ ...previewSong!, drums: undefined }),
    },
    {
        icon: "zones-2",
        caption: "Soms zijn er twee antwoorden: links en rechts. Elke kant heeft een eigen piepje.",
        play: () => playZoneCues(2),
    },
    {
        icon: "zones-4",
        caption: "Soms zijn er vier antwoorden, één in elke hoek. Boven piept hoog, onder piept laag.",
        play: () => playZoneCues(4),
    },
];

/** Plays every zone's positional cue + name in turn, lighting it up on the icon. Returns the duration in ms. */
function playZoneCues(count: number): number {
    const zones = zonesFor(count);
    zones.forEach((zone, i) => {
        later(() => {
            const ctx = getAudioContext();
            if (ctx) positionalCue(ctx, zone);
            setLitZone(i);
            later(() => speakFrom(zone.letter, zone.pan), 180);
        }, i * ZONE_CUE_GAP_MS);
    });
    later(() => setLitZone(null), zones.length * ZONE_CUE_GAP_MS);
    return zones.length * ZONE_CUE_GAP_MS;
}

function setLitZone(index: number | null): void {
    for (let i = 0; i < 4; i++) previewIconSlotEl.classList.toggle(`lit-${i}`, i === index);
}

/** Remove+re-add a class via a forced reflow so its CSS animation restarts
 *  even when the class was already present (a plain re-add is a no-op). */
function restartAnimation(el: Element, className: string): void {
    el.classList.remove(className);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(className);
}

const PREVIEW_ICON_SVG: Record<PreviewIcon, string> = {
    "drums": DRUMS_SVG,
    "no-drums": DRUMS_SVG,
    "zones-2": PHONE_ZONES_2_SVG,
    "zones-4": PHONE_ZONES_4_SVG,
};
const PREVIEW_ICON_CLASS: Record<PreviewIcon, string> = {
    "drums": "icon-drums",
    "no-drums": "icon-drums crossed",
    "zones-2": "icon-zones",
    "zones-4": "icon-zones",
};

/** Icon shown in the player-paced preview panel. */
function renderPreviewIcon(kind: PreviewIcon | null): void {
    previewIconSlotEl.innerHTML = kind === null ? "" : PREVIEW_ICON_SVG[kind];
    previewIconSlotEl.className = kind === null ? "" : PREVIEW_ICON_CLASS[kind];
}

/** Toggle the preview icon's "currently playing" animation. */
function setPreviewIconPlaying(playing: boolean): void {
    if (playing) restartAnimation(previewIconSlotEl, "playing");
    else previewIconSlotEl.classList.remove("playing");
}

/**
 * Persistent icon shown above the instruction during the practice questions -
 * ear while listening, a tapping finger, a double tap, and a shaking phone for
 * the four-corner question. Only re-injected when the step actually changes,
 * so the ambient loops don't restart on every update.
 */
function renderStepIcon(): void {
    const step = introMode && !introDemoActive ? introStep : null;
    if (step === lastRenderedStepIcon) return;
    lastRenderedStepIcon = step;
    const icons: Record<IntroStep, [string, string]> = {
        listen:  [EAR_SVG, "icon-ear listening"],
        tap:     [TAP_SVG, "icon-tap"],
        commit:  [DOUBLE_TAP_SVG, "icon-tap"],
        corners: [SHAKE_SVG, "icon-shake"],
        done:    ["", ""],
    };
    const [svg, cls] = step ? icons[step] : ["", ""];
    stepIconEl.innerHTML = svg;
    stepIconEl.className = cls;
}

function updateInstruction(text?: string): void {
    if (text !== undefined) {
        instructionEl.textContent = text;
        return;
    }
    if (introDemoActive) return; // the preview owns the instruction text
    instructionEl.textContent = introMode && introStep ? INTRO_STEPS[introStep] : "";
}

/** Re-sync everything the intro shows on screen with the current state. */
function updateIntroUI(): void {
    updateInstruction();
    renderStepIcon();
    // the assist buttons only make sense while a practice question is open -
    // and not on the last one: four corners plus buttons is too crowded on a
    // phone, and by then the player repeats the question by shaking instead
    const lastPractice = practiceIndex >= PRACTICE.length - 2;
    practiceAssistEl.hidden = !(introMode && !introDemoActive && phase === "listening" && !lastPractice);
    // the dashed answer guides only matter while a question can be answered
    document.body.classList.toggle("no-zones", startScreenEl.hidden === false || introDemoActive);
}

function setIntroStep(step: IntroStep): void {
    introStep = step;
    updateIntroUI();
}

/** Show (and, once the caption has been spoken, play) one preview step. */
function showPreviewStep(index: number, myRun: number): void {
    if (myRun !== runId || !introDemoActive) return;
    silenceEverything();
    previewIndex = index;
    const step = PREVIEW_STEPS[index];
    renderPreviewIcon(step.icon);
    updateInstruction(step.caption);
    renderHud();
    speakThen(step.caption, () => {
        if (previewIndex === index) playPreviewStep(myRun);
    });
}

/** Herhaal: (re)play the current preview step's sound from the start. Always
 *  safe to call repeatedly - never stacks audio or leaks timers. */
function playPreviewStep(myRun: number): void {
    if (myRun !== runId || !introDemoActive || previewIndex >= PREVIEW_STEPS.length) return;
    silenceEverything();
    setLitZone(null);
    setPreviewIconPlaying(true);
    const ms = PREVIEW_STEPS[previewIndex].play();
    later(() => setPreviewIconPlaying(false), ms + 200);
}

/** Volgende: move to the next preview step, or - once every step has been
 *  shown - start the practice questions. */
function advancePreview(myRun: number): void {
    if (myRun !== runId || !introDemoActive || previewIndex >= PREVIEW_STEPS.length) return;
    const nextIndex = previewIndex + 1;
    if (nextIndex < PREVIEW_STEPS.length) {
        showPreviewStep(nextIndex, myRun);
        return;
    }
    silenceEverything();
    previewIndex = PREVIEW_STEPS.length; // ignores further Herhaal/Volgende clicks
    previewPanelEl.hidden = true;
    renderPreviewIcon(null);
    const text = "Klaar? Daar gaan we — volg de aanwijzingen.";
    updateInstruction(text);
    speakThen(text, () => startPractice(myRun));
}

function startPractice(myRun: number): void {
    if (myRun !== runId || !introMode) return;
    introDemoActive = false;
    practiceIndex = 0;
    input.setActive(true);
    input.setQuizEnabled(true);
    nextPracticeQuestion(true);
    presentQuestion();
}

/** A fresh, easy question for the current practice slot. */
function nextPracticeQuestion(firstAsk: boolean): void {
    introQuestion = generateQuestion({
        playerRatings: {},
        forcedTraitId: PRACTICE[practiceIndex].traitId,
        targetRating: PRACTICE_RATING,
        maxBars: PRACTICE_MAX_BARS,
    });
    leadInPending = firstAsk;
}

function finishIntro(): void {
    // both practice questions done - congratulate, then drop back to the start
    // screen once that has had a moment to register.
    const myRun = runId;
    phase = "answered";
    input.setActive(false);
    setIntroStep("done");
    cue("done");
    later(() => speak("Goed gedaan! Je kent nu de quiz. Terug naar het startscherm."), 400);
    later(() => {
        if (myRun !== runId) return;
        stopGame();
        startNoteEl.hidden = false;
        startNoteEl.textContent = "✅ Oefenlevel voltooid! Druk op ‘Start quiz’ voor de echte quiz.";
        introBtn.textContent = "Oefenlevel opnieuw";
    }, 4600);
}

function showStartScreen(): void {
    gameScreenEl.hidden = true;
    startScreenEl.hidden = false;
}

function showGameScreen(): void {
    startScreenEl.hidden = true;
    gameScreenEl.hidden = false;
}

/** Full teardown - stop everything and return to the start screen. */
function stopGame(): void {
    runId++; // invalidate any in-flight preview / timers
    silenceEverything();
    if (fontPoll !== null) { window.clearInterval(fontPoll); fontPoll = null; }
    loading = false;
    introMode = false;
    introDemoActive = false;
    introQuestion = null;
    introStep = null;
    previewIndex = 0;
    practiceIndex = 0;
    session = null;
    lastResultsSummary = [];
    phase = "prestart";
    input.setQuizEnabled(false);
    input.setActive(true);
    introBtn.disabled = false;
    gameBtn.disabled = false;
    previewPanelEl.hidden = true;
    renderPreviewIcon(null);
    instructionEl.textContent = "";
    showStartScreen();
    updateIntroUI();
    renderHud();
}

function waitForFonts(): Promise<void> {
    return new Promise(resolve => {
        fontPoll = window.setInterval(() => {
            if (!fontsReady()) return;
            window.clearInterval(fontPoll!);
            fontPoll = null;
            resolve();
        }, 300);
    });
}

/** Shared start path for both the intro and the full quiz. */
async function startGame(asIntro: boolean): Promise<void> {
    if (loading || introMode || phase === "listening" || phase === "answered") return;
    const myRun = ++runId;

    // must run inside the user gesture: audio unlock + iOS motion permission
    initAudio();
    getAudioContext()?.resume();
    input.enableMotion();
    cue("start");

    if (!fontsReady()) {
        loading = true;
        introBtn.disabled = true;
        gameBtn.disabled = true;
        startNoteEl.hidden = false;
        startNoteEl.textContent = "Instrumenten laden…";
        speak("Instrumenten laden, momentje.");
        await waitForFonts();
        if (myRun !== runId) return;
        loading = false;
        introBtn.disabled = false;
        gameBtn.disabled = false;
    }
    startNoteEl.hidden = true;
    showGameScreen();

    if (asIntro) {
        // player-paced preview: Herhaal/Volgende drive it from here on, and
        // advancePreview() starts the practice questions once the player has
        // clicked through every step. Taps/shakes are ignored until then.
        introMode = true;
        introDemoActive = true;
        introStep = null;
        input.setQuizEnabled(false);
        input.setActive(false);
        previewSong = generatePreviewSong();
        previewPanelEl.hidden = false;
        updateIntroUI();
        showPreviewStep(0, myRun);
        return;
    }

    updateIntroUI();
    beginQuiz();
}

// ── Question lifecycle ──────────────────────────────────────────────────────
function presentQuestion(): void {
    const q = currentQuestion();
    if (!q) return;
    silenceEverything();
    input.resetArmed();
    phase = "listening";
    input.setAnswerCount(q.options.length);
    setAnswerLayoutClass(q.options.length);

    let prompt = q.prompt;
    let readMs = PROMPT_READ_MS;
    if (introMode) {
        const leadIn = leadInPending ? PRACTICE[practiceIndex].leadIn : "";
        leadInPending = false;
        if (leadIn) {
            prompt = `${leadIn} ${prompt}`;
            readMs += leadIn.length * 65;
        }
        setIntroStep(practiceIndex === 0 ? "listen" : "corners");
    }
    renderHud();
    updateIntroUI();

    // Speech is fire-and-forget status; fixed timers drive the flow so a missing
    // or slow speech-synthesis engine never stalls the quiz.
    speak(prompt);
    later(() => {
        const ms = playPiece();
        later(readOptions, ms + 700);
    }, readMs);
}

function previewOption(index: AnswerIndex): void {
    const q = currentQuestion();
    if (phase !== "listening" || !q) return;
    // The player is navigating now — stop auto-reading the remaining options.
    clearPending();
    const zone = zonesFor(q.options.length)[index];
    announceOption(index, zone);
    if (introMode && (introStep === "listen" || introStep === "tap")) setIntroStep("commit");
}

/** Spoken + earcon feedback after an answer. */
function giveFeedback(q: Question, correct: boolean): void {
    if (correct) {
        cue("correct");
        speak("Goed.");
        return;
    }
    cue("wrong");
    const correctAudio = q.audioOptions?.[q.options.indexOf(q.correctAnswer)];
    if (correctAudio) {
        later(() => speak("Fout. Dit was de juiste noot:"), 500);
        later(() => playNote(correctAudio.instrument, correctAudio.pitch), 1300);
    } else {
        later(() => speak(`Fout. Het was ${q.correctAnswer}.`), 500);
    }
}

function commitOption(index: AnswerIndex): void {
    const q = currentQuestion();
    if (phase !== "listening" || !q) return;
    const chosen = q.options[index];
    silenceEverything();
    phase = "answered";

    if (introMode) {
        const correct = chosen === q.correctAnswer;
        updateIntroUI();
        giveFeedback(q, correct);
        if (!correct) {
            // same kind of question again, with a fresh song
            later(() => speak("Probeer het nog eens met een nieuw stukje."), 2600);
            later(() => { nextPracticeQuestion(false); presentQuestion(); }, 5200);
        } else if (practiceIndex + 1 < PRACTICE.length) {
            later(() => { practiceIndex++; nextPracticeQuestion(true); presentQuestion(); }, RESULT_ADVANCE_MS);
        } else {
            later(finishIntro, 1200);
        }
        return;
    }

    if (!session) return;
    const answered = session.submitAnswer(chosen);
    renderHud();
    giveFeedback(q, answered.correct);

    const advance = () => {
        if (!session) return;
        if (session.isFinished) endQuiz();
        else presentQuestion();
    };
    later(advance, RESULT_ADVANCE_MS);
}

function beginQuiz(): void {
    lastResultsSummary = [];
    session = new QuizSession(QUIZ_LENGTH, songPicker.value || undefined);
    input.setQuizEnabled(true);
    speak("Daar gaan we. Luister goed.");
    later(presentQuestion, 1600);
}

function endQuiz(): void {
    if (!session) return;
    silenceEverything();
    phase = "done";
    input.setQuizEnabled(false);
    const total = session.history.length;
    const score = session.score;
    lastResultsSummary = session.performanceSummary().filter(s => s.avgDelta > 0);
    renderHud();
    cue("done");
    later(() => speak(`Klaar. Je had ${score} van de ${total} goed.`), 500);
    if (lastResultsSummary.length > 0) {
        const names = lastResultsSummary.slice(0, 3).map(s => s.category).join(", ");
        later(() => speak(`Je scoorde het best op: ${names}.`), 3200);
    }
}

// ── Wire input ──────────────────────────────────────────────────────────────
input.onAction((action: QuizAction) => {
    switch (action.type) {
        case "start":
            // 3 taps: start (or restart, once a round is done) the real quiz
            startGame(false);
            return;
        case "optionPreview":
            previewOption(action.index);
            return;
        case "optionCommit":
            commitOption(action.index);
            return;
        case "repeat":
            if (phase === "listening") presentQuestion();
            return;
    }
});

introBtn.addEventListener("click", () => { startNoteEl.hidden = true; startGame(true); });
gameBtn.addEventListener("click", () => { startNoteEl.hidden = true; startGame(false); });
stopBtn.addEventListener("click", () => stopGame());
previewRepeatBtn.addEventListener("click", () => playPreviewStep(runId));
previewNextBtn.addEventListener("click", () => advancePreview(runId));
repeatQuestionBtn.addEventListener("click", () => { if (phase === "listening") presentQuestion(); });
readOptionsBtn.addEventListener("click", () => {
    if (phase !== "listening") return;
    clearPending();
    stopAudio();
    readOptions();
});

input.start();
updateIntroUI();
renderHud();
