import { QuizSession } from "./quizEngine.ts";
import { initAudio, getAudioContext, playSong, playNote, stopAudio, fontsReady } from "./audioPlayback.ts";
import { speak, speakFrom, earcon, positionalCue } from "./speech.ts";
import { InputHandler, zonesFor, type QuizAction, type AnswerIndex, type AnswerZone } from "./inputHandler.ts";
import { KNOWN_SONGS } from "./knownSongs.ts";

// ── Eyes-free "wat hoor je?" music quiz ──────────────────────────────────────
// Every question generates a brand-new song from a real music-theory engine and
// asks about something audible in it. Played entirely by ear: the question is
// spoken, the piece plays, and the answers sit either in the four screen
// corners or split left/right (matching the question's option count), read
// out with a positional cue (left/right pan, high/low pitch). Shaking the
// phone repeats the current question.

const QUIZ_LENGTH = 8;
const PROMPT_READ_MS = 2600; // rough time to speak the question before the piece plays
const OPTION_READ_GAP_MS = 1900; // spacing when reading the four options in a row
const RESULT_ADVANCE_MS = 3200; // delay before the next question after an answer

type Phase = "prestart" | "listening" | "answered" | "done";

const input = new InputHandler();
let session: QuizSession | null = null;
let phase: Phase = "prestart";
let pendingTimers: number[] = [];

// ── HUD (sighted debug aid only) ─────────────────────────────────────────────
const hud = {
    phase: document.getElementById("hud-phase")!,
    progress: document.getElementById("hud-progress")!,
    score: document.getElementById("hud-score")!,
    armed: document.getElementById("hud-armed")!,
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
    } else {
        hud.progress.textContent = "";
        hud.score.textContent = "";
    }
    hud.armed.textContent = "";
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

// ── Audio helpers ───────────────────────────────────────────────────────────
function cue(kind: Parameters<typeof earcon>[1]): void {
    const ctx = getAudioContext();
    if (ctx) earcon(ctx, kind);
}

function playPiece(): number {
    if (!session?.current) return 0;
    stopAudio();
    const ms = playSong(session.current.song);
    later(() => cue("listen"), ms + 120);
    return ms;
}

// Announces one answer option: a positional cue, then either the spoken text
// or - for "hear the note" questions - the letter followed by the actual tone.
function announceOption(index: AnswerIndex, zone: AnswerZone): void {
    if (!session?.current) return;
    const q = session.current;
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
    if (!session?.current) return;
    const zones = zonesFor(session.current.options.length);
    zones.forEach((zone, i) => {
        later(() => announceOption(i, zone), i * OPTION_READ_GAP_MS);
    });
}

function setAnswerLayoutClass(count: number): void {
    document.body.classList.toggle("answers-2", count <= 2);
    document.body.classList.toggle("answers-4", count > 2);
}

// ── Question lifecycle ──────────────────────────────────────────────────────
function presentQuestion(): void {
    if (!session) return;
    silenceEverything();
    input.resetArmed();
    phase = "listening";
    renderHud();

    const q = session.current!;
    input.setAnswerCount(q.options.length);
    setAnswerLayoutClass(q.options.length);

    // Speech is fire-and-forget status; fixed timers drive the flow so a missing
    // or slow speech-synthesis engine never stalls the quiz.
    speak(q.prompt);
    later(() => {
        const ms = playPiece();
        later(readOptions, ms + 700);
    }, PROMPT_READ_MS);
}

function previewOption(index: AnswerIndex): void {
    if (phase !== "listening" || !session?.current) return;
    // The player is navigating now — stop auto-reading the remaining options.
    clearPending();
    const zone = zonesFor(session.current.options.length)[index];
    announceOption(index, zone);
}

function commitOption(index: AnswerIndex): void {
    if (phase !== "listening" || !session?.current) return;
    const q = session.current;
    const chosen = q.options[index];
    silenceEverything();
    phase = "answered";

    const answered = session.submitAnswer(chosen);
    renderHud();

    if (answered.correct) {
        cue("correct");
        speak("Goed.");
    } else {
        cue("wrong");
        const correctAudio = q.audioOptions?.[q.options.indexOf(q.correctAnswer)];
        if (correctAudio) {
            later(() => speak("Fout. Dit was de juiste noot:"), 500);
            later(() => playNote(correctAudio.instrument, correctAudio.pitch), 1300);
        } else {
            later(() => speak(`Fout. Het was ${q.correctAnswer}.`), 500);
        }
    }

    const advance = () => {
        if (!session) return;
        if (session.isFinished) endQuiz();
        else presentQuestion();
    };
    later(advance, RESULT_ADVANCE_MS);
}

function beginQuiz(): void {
    session = new QuizSession(QUIZ_LENGTH, "mixed", songPicker.value || undefined);
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
    renderHud();
    cue("done");
    later(() => speak(`Klaar. Je had ${score} van de ${total} goed.`), 500);
}

function handleStart(): void {
    if (phase === "listening" || phase === "answered") return;
    initAudio();
    getAudioContext()?.resume();
    input.enableMotion();
    cue("start");
    if (fontsReady()) {
        beginQuiz();
        return;
    }
    speak("Instrumenten laden, momentje.");
    const poll = window.setInterval(() => {
        if (fontsReady()) {
            window.clearInterval(poll);
            beginQuiz();
        }
    }, 300);
}

// ── Wire input ──────────────────────────────────────────────────────────────
input.onAction((action: QuizAction) => {
    switch (action.type) {
        case "start":
            handleStart();
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

input.start();
renderHud();
