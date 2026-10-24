// must come first: in the combined flow's no-tap mode it makes this page borrow
// the shell's audio, speech and motion before anything creates its own
import "../../src/embedShared.ts";
import { QuizSession } from "./quizEngine.ts";
import { initAudio, getAudioContext, playSong, playNote, stopAudio, fontsReady } from "./audioPlayback.ts";
import { speak, stopSpeech, earcon, setTalker } from "./speech.ts";
import { createQuizHostScene, type QuizHostScene, type PointTarget } from "./intro/quizHostScene.ts";
import { GAME_LINES, INTRO_LINES, POSITION_LINES, answerLine, letterLine, positionLine, questionLine, type VoiceLine } from "./voiceLines.ts";
import { InputHandler, zonesFor, type QuizAction, type AnswerIndex, type AnswerZone } from "./inputHandler.ts";
import { KNOWN_SONGS } from "./knownSongs.ts";
import { generateQuestion, generatePreviewSong } from "./questionGenerator.ts";
import { BASE_RATING } from "./rating.ts";
import type { GeneratedSong, Question } from "./types.ts";
import { enterFullscreen } from "../../src/fullscreen.ts";
import { getEmbed, setupEmbedStart, embedDone, onEmbedStop, num, numRecord, track, EXPERIMENT_SOUNDS } from "../../src/embed.ts";

// set when the combined/ shell runs this page as one segment of a longer flow
const embed = getEmbed();
import { Howl } from "howler";

// ── Eyes-free "wat hoor je?" music quiz ──────────────────────────────────────
// Every question generates a brand-new song from a real music-theory engine and
// asks about something audible in it. Played entirely by ear: the question is
// spoken, the piece plays, and the answers sit either in the four screen
// corners or split left/right (matching the question's option count), each
// read out by its position name. Shaking the phone repeats the current question.
//
// A start screen offers a scripted "oefenlevel" (introduction) next to the real
// quiz - see the introduction section below. Tapping 3× anywhere outside the
// buttons still starts the quiz, so it stays playable without looking.

const QUIZ_LENGTH = num(embed, "questions", 8, 1, 30); // the combined/ shell can override it
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

// ── Gorilla experiment ───────────────────────────────────────────────────────
// Like prototype 5: an unexpected sound slipped into the game. `experiment`
// picks which one (0 = off, 1 = meow, 2 = bark, 3 = boing). It plays once, on
// the second question (or the `gorillaAt`th), after the question is spoken and
// before the music.
let experiment = num(embed, "experiment", 1, 0, 3);
const GORILLA_QUESTION = num(embed, "gorillaAt", 2, 1, 30);
const gorillaSounds: Howl[] = [
    new Howl({ src: "sounds/meow.mp3" }),
    new Howl({ src: "sounds/bark.mp3" }),
    new Howl({ src: "sounds/boing.mp3" }),
];
let gorillaPlayed = false;

// answer feedback: applause for a right answer, an "aww" for a wrong one
const applauseSound = new Howl({ src: "sounds/applause.mp3" });
const awwSound = new Howl({ src: "sounds/aww.mp3" });
const FEEDBACK_SOUND_MS = 1500; // let the aww mostly finish before revealing the answer
// how often the player asked for the current question again (telemetry)
let repeats = 0;
const GORILLA_GAP_MS = 400; // silence between the gorilla sound and the piece

// ── Screens ─────────────────────────────────────────────────────────────────
const startScreenEl = document.getElementById("start-screen")!;
const gameScreenEl = document.getElementById("game-screen")!;
const startNoteEl = document.getElementById("start-note")!;
const introBtn = document.getElementById("intro-btn") as HTMLButtonElement;
const gameBtn = document.getElementById("game-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const instructionEl = document.getElementById("instruction")!;
const introStageEl = document.getElementById("intro-stage")!;
const introSceneEl = document.getElementById("intro-scene")!;
const zoneEls = ["zone-a", "zone-b", "zone-c", "zone-d"].map(id => document.getElementById(id)!);

// ── Quiz host (intro only) ──────────────────────────────────────────────────
// During the oefenlevel the quiz show host (intro/quizHostScene.ts) stands
// behind the screen: he talks along with every spoken line, the stage
// speakers play along with every piece, he points at each answer's side or
// corner as it is read out (and that zone's outline lights up), and the
// audience claps for a right answer and goes "awww" for a wrong one.
let hostScene: QuizHostScene | null = null;
let pointCount = 0; // bumped by every hostPoint(), so only the latest one turns its outline off
const HOST_POINT_MS = OPTION_READ_GAP_MS - 300; // put the arm down just before the next option
const NOTE_MUSIC_MS = 700;                      // speakers pulse this long for one answer note

const POINT_TARGETS: Record<2 | 4, PointTarget[]> = {
    2: ["left", "right"],
    4: ["top-left", "top-right", "bottom-left", "bottom-right"],
};

function showHostScene(): void {
    hideHostScene();
    introStageEl.hidden = false;
    document.body.classList.add("intro-scene");
    hostScene = createQuizHostScene(introSceneEl);
    setTalker(hostScene);
}

function hideHostScene(): void {
    if (!hostScene) return;
    setTalker(null);
    hostScene.destroy();
    hostScene = null;
    introStageEl.hidden = true;
    document.body.classList.remove("intro-scene");
    litZone(null);
}

/** Outline one answer zone brighter while the host points at it (or none). */
function litZone(index: number | null): void {
    zoneEls.forEach((el, i) => el.classList.toggle("zone-lit", i === index));
}

/** The host points at answer `index` of a `count`-answer layout, and its zone lights up. */
function hostPoint(index: number, count: number, holdMs = HOST_POINT_MS): void {
    if (!hostScene) return;
    const target = POINT_TARGETS[count <= 2 ? 2 : 4][index];
    if (!target) return;
    litZone(index);
    // the outline goes out with the arm - unless a newer point took over
    const myPoint = ++pointCount;
    void hostScene.point(target, holdMs).then(() => { if (myPoint === pointCount) litZone(null); });
}

/** Play a whole piece (the stage speakers play along). Returns its duration in ms. */
function playSongOnStage(song: GeneratedSong): number {
    const ms = playSong(song);
    void hostScene?.playMusic(ms);
    return ms;
}

/** The ms a Howl lasts, or `fallback` while its length isn't known yet. */
function soundMs(sound: Howl, fallback: number): number {
    return sound.duration() > 0 ? sound.duration() * 1000 : fallback;
}

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
        hud.progress.textContent = introQuestion
            ? `oefenvraag ${Math.min(practiceIndex + 1, PRACTICE.length)} / ${PRACTICE.length}`
            : "uitleg";
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
            const rating = Math.round(session.ratingFor(session.current.category));
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
    gorillaSounds.forEach(s => s.stop());
    applauseSound.stop();
    awwSound.stop();
    stopSpeech();
    hostScene?.stopMusic();
    hostScene?.stopPointing();
    hostScene?.stopAudience();
    litZone(null);
}

/**
 * Speak, then run `fn` once the speech ends (speak() never stalls on a
 * missing/silent speech engine). `fn` doesn't run when the line is cut off,
 * e.g. by silenceEverything().
 */
function speakThen(line: VoiceLine, fn: () => void): void {
    void speak(line).then(said => { if (said) fn(); });
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
    let ms: number;
    if (introMode && introPair) {
        // the drums question: the same piece twice, with and without drums
        const [first, second] = introPair;
        const firstMs = playSongOnStage(first);
        later(() => playSongOnStage(second), firstMs + PAIR_GAP_MS);
        ms = firstMs * 2 + PAIR_GAP_MS; // both halves are the same piece, so equally long
    } else {
        ms = playSongOnStage(q.song);
    }
    later(() => cue("listen"), ms + 120);
    return ms;
}

// Announces one answer option: either the spoken text or - for "hear the
// note" questions - the position name followed by the actual tone.
function announceOption(index: AnswerIndex, zone: AnswerZone): void {
    const q = currentQuestion();
    if (!q) return;
    const audio = q.audioOptions?.[index];
    hostPoint(index, q.options.length);
    // the intro names the position ("links: ..."), the quiz its letter ("A. ...")
    const position =  positionLine(index, q.options.length);
    if (audio) {
        speak(position);
        later(() => {
            playNote(audio.instrument, audio.pitch);
            void hostScene?.playMusic(NOTE_MUSIC_MS);
        }, 470);
    } else {
        speak(position, answerLine(q.options[index]));
    }
}

function readOptions(): void {
    const q = currentQuestion();
    if (!q) return;
    const zones = zonesFor(q.options.length);
    zones.forEach((zone, i) => {
        later(() => announceOption(i, zone), i * OPTION_READ_GAP_MS);
    });
    if (introMode) later(armAnswerHint, zones.length * OPTION_READ_GAP_MS);
}

function setAnswerLayoutClass(count: number): void {
    document.body.classList.toggle("answers-2", count <= 2);
    document.body.classList.toggle("answers-4", count > 2);
}

// ── Introduction level ──────────────────────────────────────────────────────
// A scripted tutorial: the quiz host welcomes the player and explains how to
// answer (lighting up the left and right side as he names them) and how to
// hear a question again, then asks two practice questions - "which piece has
// drums?" (two answers: the first or the second time the piece plays) and
// "how many notes?" (four answers, one in each corner, which he points out
// first). If the player doesn't answer, a hint appears on screen. A wrong
// answer is explained and asked again with a fresh song; answering both
// correctly completes the intro and returns to the start screen.
let introMode = false;       // currently playing the guided tutorial
let introZones = false;      // the host has pointed out the answer zones, so show them
let practiceIndex = 0;       // index into PRACTICE
let introQuestion: Question | null = null;
// the drums question's two plays: [first, second], one of them without drums
let introPair: [GeneratedSong, GeneratedSong] | null = null;
let hintTimer: number | null = null;

const INTRO_DONE_TEXT = "🎉 Goed gedaan! Je kent nu de quiz. Terug naar het startscherm...";
const PAIR_GAP_MS = 900;         // silence between the two plays of the drums question
const ANSWER_HINT_MS = 6000;     // no answer this long after the options: show the hint
const PREVIEW_BARS = 2;          // keeps the drums question's two plays short

const PRACTICE_RATING = BASE_RATING - 200; // aim well below neutral: the easiest songs the generator can make
const PRACTICE_MAX_BARS = 3;                // ...but keep them short - for some traits "easiest" means "longest"

/** The practice questions: what the host asks, and the on-screen hint when no answer comes. */
const PRACTICE: { prompt: VoiceLine; make: () => Question; hint: string }[] = [
    {
        prompt: INTRO_LINES.drumsQuestion,
        make: drumsQuestion,
        hint: "Klik twee keer links of rechts om antwoord te geven en schud om de vraag opnieuw te horen.",
    },
    {
        prompt: INTRO_LINES.notesQuestion,
        make: () => generateQuestion({
            playerRatings: {},
            forcedTraitId: "melody-note-count",
            targetRating: PRACTICE_RATING,
            maxBars: PRACTICE_MAX_BARS,
        }),
        hint: "Klik twee keer op een hoek om antwoord te geven en schud om de vraag opnieuw te horen.",
    },
];

/** "In welk liedje zitten er drums?": one short piece, played with and without drums in a random order. */
function drumsQuestion(): Question {
    const song = generatePreviewSong(PREVIEW_BARS);
    const noDrums: GeneratedSong = { ...song, drums: undefined };
    const drumsFirst = Math.random() < 0.5;
    introPair = drumsFirst ? [song, noDrums] : [noDrums, song];
    const options = [INTRO_LINES.firstSong.text, INTRO_LINES.secondSong.text];
    return {
        id: `intro-drums-${Date.now()}`,
        traitId: "intro-drums",
        category: "Ritme",
        difficulty: "easy",
        prompt: INTRO_LINES.drumsQuestion.text,
        options,
        correctAnswer: options[drumsFirst ? 0 : 1],
        song,
        songRating: PRACTICE_RATING,
    };
}

/** Show the dashed answer zones whenever an answer can be given - or the host is pointing them out. */
function updateZones(): void {
    document.body.classList.toggle("no-zones", !startScreenEl.hidden || (introMode && !introZones));
}

/** Clear the on-screen answer hint (and its timer). */
function clearAnswerHint(): void {
    if (hintTimer !== null) window.clearTimeout(hintTimer);
    hintTimer = null;
    if (introMode) instructionEl.textContent = "";
}

/** (Re)start the countdown to the on-screen hint for the current practice question. */
function armAnswerHint(): void {
    if (hintTimer !== null) window.clearTimeout(hintTimer);
    const myRun = runId;
    hintTimer = window.setTimeout(() => {
        hintTimer = null;
        if (myRun !== runId || !introMode || phase !== "listening") return;
        instructionEl.textContent = PRACTICE[practiceIndex].hint;
    }, ANSWER_HINT_MS);
}

/**
 * Say a sentence piece by piece; a piece with a `zone` lights that answer zone
 * up (and the host points at it) as it starts, and it stays lit until the next
 * one. Resolves false when cut off (the intro was stopped).
 */
async function sayPointing(count: 2 | 4, parts: { line: VoiceLine; zone?: number }[]): Promise<boolean> {
    setAnswerLayoutClass(count);
    introZones = true;
    updateZones();
    for (const { line, zone } of parts) {
        if (zone !== undefined) hostPoint(zone, count, Infinity);
        if (!await speak(line)) return false;
    }
    hostScene?.stopPointing();
    litZone(null);
    return true;
}

/** The opening monologue, up to the first practice question. */
async function runIntroScript(myRun: number): Promise<void> {
    const alive = () => myRun === runId && introMode;
    if (!await speak(INTRO_LINES.welcome) || !alive()) return;
    const explained = await sayPointing(2, [
        { line: INTRO_LINES.howToAnswer },
        { line: INTRO_LINES.howLeft, zone: 0 },
        { line: INTRO_LINES.howRight, zone: 1 },
    ]);
    if (!explained || !alive()) return;
    if (!await speak(INTRO_LINES.shake) || !alive()) return;
    if (!await speak(INTRO_LINES.letsGo) || !alive()) return;
    startPractice();
}

/** After the drums question: point out the four corners, then ask the second question. */
async function explainFourAnswers(myRun: number): Promise<void> {
    if (myRun !== runId || !introMode) return;
    const explained = await sayPointing(4, [
        { line: INTRO_LINES.fourAnswers },
        ...POSITION_LINES[4].map((line, zone) => ({ line, zone })),
    ]);
    if (!explained || myRun !== runId || !introMode) return;
    practiceIndex++;
    nextPracticeQuestion();
    presentQuestion();
}

function startPractice(): void {
    practiceIndex = 0;
    input.setActive(true);
    input.setQuizEnabled(true);
    nextPracticeQuestion();
    presentQuestion();
}

/** A fresh, easy question for the current practice slot. */
function nextPracticeQuestion(): void {
    clearAnswerHint();
    introPair = null;
    introQuestion = PRACTICE[practiceIndex].make();
}

function finishIntro(): void {
    // both practice questions done - congratulate, then drop back to the start
    // screen once that has had a moment to register.
    const myRun = runId;
    phase = "answered";
    input.setActive(false);
    instructionEl.textContent = INTRO_DONE_TEXT;
    cue("done");
    later(() => embed ? speak(INTRO_LINES.done) : speak(INTRO_LINES.done, INTRO_LINES.backToStart), 400);
    later(() => {
        if (myRun !== runId) return;
        stopGame();
        if (embed) { embedDone(); return; }
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
    hideHostScene();
    if (fontPoll !== null) { window.clearInterval(fontPoll); fontPoll = null; }
    loading = false;
    clearAnswerHint();
    introMode = false;
    introZones = false;
    introQuestion = null;
    introPair = null;
    practiceIndex = 0;
    session = null;
    lastResultsSummary = [];
    phase = "prestart";
    input.setQuizEnabled(false);
    input.setActive(true);
    introBtn.disabled = false;
    gameBtn.disabled = false;
    instructionEl.textContent = "";
    showStartScreen();
    updateZones();
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
        speak(GAME_LINES.loading);
        await waitForFonts();
        if (myRun !== runId) return;
        loading = false;
        introBtn.disabled = false;
        gameBtn.disabled = false;
    }
    startNoteEl.hidden = true;
    showGameScreen();

    if (asIntro) {
        // the host talks the player through it; taps/shakes are ignored until
        // the first practice question is asked
        introMode = true;
        input.setQuizEnabled(false);
        input.setActive(false);
        showHostScene();
        updateZones();
        renderHud();
        void runIntroScript(myRun);
        return;
    }

    updateZones();
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

    // the intro asks its practice questions in the host's own words
    const prompt = introMode ? PRACTICE[practiceIndex].prompt : questionLine(q.traitId, q.prompt);
    renderHud();
    updateZones();

    // Speech is fire-and-forget status; fixed timers drive the flow so a missing
    // or slow speech-synthesis engine never stalls the quiz.
    speak(prompt);
    const startPiece = () => {
        const ms = playPiece();
        later(readOptions, ms + 700);
    };
    later(() => {
        if (experiment > 0 && !gorillaPlayed && !introMode && session?.progress.current === GORILLA_QUESTION) {
            gorillaPlayed = true;
            const gorilla = gorillaSounds[experiment - 1];
            gorilla.volume(0.5);
            gorilla.play();
            track("gorilla", { sound: EXPERIMENT_SOUNDS[experiment - 1], question: session.progress.current });
            const gorillaMs = gorilla.duration() > 0 ? gorilla.duration() * 1000 : 1500;
            later(startPiece, gorillaMs + GORILLA_GAP_MS);
        } else {
            startPiece();
        }
    }, PROMPT_READ_MS);
}

/** The player asked to hear the question again. */
function repeatQuestion(): void {
    repeats++;
    presentQuestion();
}

function previewOption(index: AnswerIndex): void {
    const q = currentQuestion();
    if (phase !== "listening" || !q) return;
    // The player is navigating now — stop auto-reading the remaining options.
    clearPending();
    const zone = zonesFor(q.options.length)[index];
    announceOption(index, zone);
    if (introMode) armAnswerHint();
}

/** Applause/aww + earcon feedback after an answer; a wrong answer also reveals the right one. */
function giveFeedback(q: Question, correct: boolean): void {
    if (correct) {
        cue("correct");
        applauseSound.play();
        void hostScene?.clap(soundMs(applauseSound, 3000));
        return;
    }
    cue("wrong");
    awwSound.play();
    void hostScene?.awww(soundMs(awwSound, 2200));
    const correctAudio = q.audioOptions?.[q.options.indexOf(q.correctAnswer)];
    if (correctAudio) {
        later(() => speak(GAME_LINES.rightNote), FEEDBACK_SOUND_MS);
        later(() => playNote(correctAudio.instrument, correctAudio.pitch), FEEDBACK_SOUND_MS + 800);
    } else {
        later(() => speak(GAME_LINES.itWas, answerLine(q.correctAnswer)), FEEDBACK_SOUND_MS);
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
        clearAnswerHint();
        giveFeedback(q, correct);
        if (!correct) {
            // same kind of question again, with a fresh song
            later(() => speak(INTRO_LINES.tryAgain), 3600);
            later(() => { nextPracticeQuestion(); presentQuestion(); }, 6200);
        } else if (practiceIndex + 1 < PRACTICE.length) {
            later(() => speak(INTRO_LINES.wellDone), 300);
            const myRun = runId;
            later(() => void explainFourAnswers(myRun), RESULT_ADVANCE_MS);
        } else {
            later(finishIntro, 1200);
        }
        return;
    }

    if (!session) return;
    const answered = session.submitAnswer(chosen);
    track("question_answered", {
        number: session.history.length,
        total: session.progress.total,
        category: q.category,
        traitId: q.traitId,
        difficulty: q.difficulty,
        prompt: q.prompt,
        options: q.options,
        correctAnswer: q.correctAnswer,
        chosenAnswer: chosen,
        correct: answered.correct,
        repeats,
        songRating: q.songRating,
        correctSoFar: session.score,
        ratings: session.ratings,
    });
    repeats = 0;
    renderHud();
    giveFeedback(q, answered.correct);

    const advance = () => {
        if (!session) return;
        if (session.isFinished) endQuiz();
        else presentQuestion();
    };
    // a wrong answer gets the aww plus the right answer, so give it a bit longer
    later(advance, answered.correct ? RESULT_ADVANCE_MS : RESULT_ADVANCE_MS + 1000);
}

function beginQuiz(): void {
    lastResultsSummary = [];
    // in the combined flow, start from the ratings a previous quiz part ended on
    session = new QuizSession(QUIZ_LENGTH, songPicker.value || undefined, numRecord(embed, "ratings") ?? undefined);
    gorillaPlayed = false;
    repeats = 0;
    track("game_start", { questions: QUIZ_LENGTH, experiment, startRatings: session.ratings });
    input.setQuizEnabled(true);
    speak(GAME_LINES.quizStart);
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
    track("game_end", { score, total, ratings: session.ratings });
    renderHud();
    cue("done");
    // hand back to the combined/ shell after the closing cue (and the last
    // answer's feedback), with the ratings so a later quiz part can carry on from them
    if (embed) {
        const myRun = runId;
        const ratings = session.ratings;
        later(() => {
            if (myRun !== runId) return;
            stopGame();
            embedDone({ score, total, ratings });
        }, 2500);
    }
}

// ── Wire input ──────────────────────────────────────────────────────────────
input.onAction((action: QuizAction) => {
    switch (action.type) {
        case "start":
            // 3 taps: start (or restart, once a round is done) the real quiz
            void enterFullscreen();
            startGame(false);
            return;
        case "optionPreview":
            previewOption(action.index);
            return;
        case "optionCommit":
            commitOption(action.index);
            return;
        case "repeat":
            if (phase === "listening") repeatQuestion();
            return;
    }
});

// starting from a button click (a user gesture) is when fullscreen is allowed
introBtn.addEventListener("click", () => { startNoteEl.hidden = true; void enterFullscreen(); startGame(true); });
gameBtn.addEventListener("click", () => { startNoteEl.hidden = true; void enterFullscreen(); startGame(false); });
stopBtn.addEventListener("click", () => stopGame());

input.start();
updateZones();
renderHud();

// run by the combined/ shell: skip the menu, start straight into the requested mode
if (embed) {
    // the shell sends "stop" before removing this page (segment over or skipped)
    onEmbedStop(stopGame);
    songPicker.hidden = true;
    stopBtn.hidden = true;
    setupEmbedStart(embed, () => (embed.mode === "intro" ? introBtn : gameBtn).click());
}
