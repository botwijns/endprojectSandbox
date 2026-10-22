import { Howl } from "howler";
import type { VoiceLine } from "./voiceLines.ts";

// ── Audio-first feedback ─────────────────────────────────────────────────────
// This prototype is meant to be played without looking at the screen, so every
// state change is announced. Two channels:
//   • speak()  — a spoken Dutch line from voiceLines.ts: its recording, or the
//                Web Speech API while it has none (skipped silently if the
//                browser has no speechSynthesis).
//   • earcon() — short non-verbal tones for fast, frequent events (placing a
//                note, moving the step cursor) where speech would be too slow.

// Speech can be switched off from the start screen so the same build is easy
// to playtest both with and without the spoken cues. Earcons are unaffected.
let enabled = true;

export function setSpeechEnabled(v: boolean): void {
    enabled = v;
    if (!v) stopSpeech();
}

export function isSpeechEnabled(): boolean {
    return enabled;
}

let voice: SpeechSynthesisVoice | null = null;

function pickVoice(): void {
    if (typeof speechSynthesis === "undefined") return;
    const voices = speechSynthesis.getVoices();
    voice =
        voices.find(v => v.lang?.toLowerCase().startsWith("nl")) ??
        voices.find(v => v.default) ??
        voices[0] ??
        null;
}

if (typeof speechSynthesis !== "undefined") {
    pickVoice();
    speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

/** Anything with a mouth to animate while a line is spoken (the campfire fisherman). */
export interface Talker {
    talk(ms: number): Promise<void>;
    stopTalking(): void;
}

// Rough length of a spoken line, used to move the mouth and as the wait when
// speech is off or unsupported, so the intro still runs at a natural pace.
const MS_PER_CHAR = 65;

const estimateMs = (text: string) => Math.max(800, text.length * MS_PER_CHAR);

const howls = new Map<VoiceLine, Howl>();

function howlFor(line: VoiceLine): Howl | null {
    if (!line.src) return null;
    let h = howls.get(line);
    if (!h) {
        h = new Howl({ src: line.src, preload: true });
        howls.set(line, h);
    }
    return h;
}

/** One piece of a sentence being said; `stop` cuts it off without calling `done`. */
type Part = (done: () => void, mouth?: Talker) => { stop(): void };

/** Wait as long as `text` would take to say (speech off or unsupported). */
const silentPart = (text: string): Part => (done, mouth) => {
    const ms = estimateMs(text);
    void mouth?.talk(ms);
    const timer = window.setTimeout(done, ms);
    return { stop: () => window.clearTimeout(timer) };
};

/** Read `text` out with the Web Speech API. */
const ttsPart = (text: string): Part => (done, mouth) => {
    if (typeof speechSynthesis === "undefined") return silentPart(text)(done, mouth);
    const estimate = estimateMs(text);
    let timer = 0;
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        done();
    };
    void mouth?.talk(estimate);
    try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "nl-NL";
        if (voice) u.voice = voice;
        u.rate = 1.05;
        u.pitch = 1;
        const startedAt = performance.now();
        u.onend = finish;
        u.onerror = e => {
            // Cut off (after stop() this is a no-op): done now.
            // Refused by the engine (no voice, not allowed yet, ...): still
            // give the line its natural length, so the intro keeps its pace.
            if (e.error === "interrupted" || e.error === "canceled") { finish(); return; }
            window.clearTimeout(timer);
            timer = window.setTimeout(finish, Math.max(0, estimate - (performance.now() - startedAt)));
        };
        speechSynthesis.speak(u);
        // Some browsers drop `onend` now and then — never let the intro stall on it.
        timer = window.setTimeout(finish, estimate * 2 + 2000);
    } catch {
        timer = window.setTimeout(finish, estimate);
    }
    return { stop: () => { finished = true; window.clearTimeout(timer); } };
};

/** Play a line's recording; a recording that fails to load is read out instead. */
const recordingPart = (line: VoiceLine, howl: Howl): Part => (done, mouth) => {
    let stopped = false;
    let soundId: number | undefined;
    let fallback: { stop(): void } | null = null;
    const start = () => {
        if (stopped) return;
        soundId = howl.play();
        void mouth?.talk(howl.duration(soundId) * 1000);
        howl.once("end", () => { if (!stopped) done(); }, soundId);
    };
    const failed = () => { if (!stopped) fallback = ttsPart(line.text)(done, mouth); };
    if (howl.state() === "loaded") start();
    else {
        howl.once("load", start);
        howl.once("loaderror", failed);
    }
    return {
        stop() {
            stopped = true;
            if (soundId !== undefined) howl.stop(soundId);
            fallback?.stop();
        },
    };
};

/** How a sentence is said: one recording per line, or one utterance while none are recorded. */
function partsFor(lines: VoiceLine[]): Part[] {
    const text = lines.map(l => l.text).join(" ");
    if (!enabled) return [silentPart(text)];
    if (lines.every(l => !l.src)) return [ttsPart(text)];
    return lines.map(l => {
        const howl = howlFor(l);
        return howl ? recordingPart(l, howl) : ttsPart(l.text);
    });
}

let cancelCurrent: (() => void) | null = null;

/**
 * Say a sentence made of one or more lines, back to back, and resolve when it
 * has been said (or cut off by stopSpeech() / another speakLine()). Pass the
 * fisherman as `mouth` to move his mouth for the length of the lines.
 */
export function speakLine(lines: VoiceLine | VoiceLine[], mouth?: Talker): Promise<void> {
    stopSpeech();
    const parts = partsFor(Array.isArray(lines) ? lines : [lines]);
    return new Promise<void>(resolve => {
        let current: { stop(): void } | null = null;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            if (cancelCurrent === cancel) cancelCurrent = null;
            mouth?.stopTalking();
            resolve();
        };
        const cancel = () => { current?.stop(); finish(); };
        cancelCurrent = cancel;
        const next = (i: number) => {
            if (finished) return;
            if (i >= parts.length) { finish(); return; }
            current = parts[i](() => next(i + 1), mouth);
        };
        next(0);
    });
}

/**
 * Say a sentence (fire-and-forget). Cuts off whatever is currently being said
 * so the latest state always wins (announcements are status, not a queue).
 */
export function speak(...lines: VoiceLine[]): void {
    if (!enabled) return;
    void speakLine(lines);
}

/** Cut off whatever is being said; a pending speakLine() resolves. */
export function stopSpeech(): void {
    cancelCurrent?.();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

export type Earcon = "place" | "preview" | "erase" | "step" | "mode" | "instrument" | "done" | "start";

// Each earcon is one or more quick sine blips. Kept deliberately distinct in
// contour so they're tellable apart by ear: placing rises, erasing falls, etc.
const PATTERNS: Record<Earcon, { freq: number; at: number; dur: number }[]> = {
    place:      [{ freq: 660, at: 0,    dur: 0.09 }],
    // a softer, shorter blip for "this is what's under your finger right now,
    // nothing is written yet" — distinguishable from the firmer "place" cue.
    preview:    [{ freq: 660, at: 0,    dur: 0.045 }],
    erase:      [{ freq: 400, at: 0,    dur: 0.08 }, { freq: 260, at: 0.08, dur: 0.12 }],
    step:       [{ freq: 520, at: 0,    dur: 0.05 }],
    mode:       [{ freq: 480, at: 0,    dur: 0.08 }, { freq: 720, at: 0.09, dur: 0.10 }],
    instrument: [{ freq: 600, at: 0,    dur: 0.07 }, { freq: 600, at: 0.10, dur: 0.07 }],
    done:       [{ freq: 523, at: 0,    dur: 0.11 }, { freq: 659, at: 0.11, dur: 0.11 }, { freq: 784, at: 0.22, dur: 0.18 }],
    start:      [{ freq: 392, at: 0,    dur: 0.10 }, { freq: 587, at: 0.11, dur: 0.14 }],
};

/** Play a non-verbal cue on the shared AudioContext. */
export function earcon(ctx: AudioContext, kind: Earcon, volume = 0.18): void {
    const now = ctx.currentTime + 0.01;
    for (const blip of PATTERNS[kind]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = blip.freq;
        const start = now + blip.at;
        const end = start + blip.dur;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(end + 0.02);
    }
}
