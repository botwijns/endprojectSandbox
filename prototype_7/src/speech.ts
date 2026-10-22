import { Howl } from "howler";
import type { VoiceLine } from "./voiceLines.ts";

// ── Audio-first feedback ─────────────────────────────────────────────────────
// This prototype is meant to be played without looking at the screen, so every
// state change is announced. Two channels:
//   • speak()        — a spoken Dutch line from voiceLines.ts: its recording, or
//                      the Web Speech API while it has none (skipped silently if
//                      the browser has no speechSynthesis).
//   • earcon()       — short non-verbal tones for fast, frequent events / result
//                      feedback where speech alone would be slow.

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

// Chrome (Android especially) tends to drop an utterance that's spoken right
// after cancel() interrupted another one, so give a cancel a moment to settle.
const CANCEL_SETTLE_MS = 120;
let lastCancelAt = -Infinity;
// bumped by every speak()/stopSpeech(), so a delayed or retried utterance
// never plays after something newer took over
let generation = 0;
let pendingTimer = 0;
// stops the sentence being said right now (its recording, or its timers)
let cancelCurrent: (() => void) | null = null;

/** Anything with a mouth to animate while a line is spoken (the intro's quiz host). */
export interface Talker {
    talk(ms: number): unknown;
    stopTalking(): void;
}
let talker: Talker | null = null;
// rough length of a spoken line; the mouth moves for at most about twice this,
// in case a sentence never reports that it ended
const MS_PER_CHAR = 65;

/** Move `t`'s mouth along with every line spoken from now on (null: nobody). */
export function setTalker(t: Talker | null): void {
    talker?.stopTalking();
    talker = t;
}

/**
 * Stop whatever this page is saying (and drop a line waiting to be spoken).
 * Only cancels speechSynthesis when this page actually has speech going: in the
 * combined/ shell the shell's own announcement shares Chrome's speech queue,
 * and an extra cancel() would cut it off and can swallow our next utterance.
 */
export function stopSpeech(): void {
    generation++;
    window.clearTimeout(pendingTimer);
    const cancel = cancelCurrent;
    cancelCurrent = null;
    cancel?.();
    talker?.stopTalking();
    if (typeof speechSynthesis === "undefined") return;
    if (!speechSynthesis.speaking && !speechSynthesis.pending) return;
    speechSynthesis.cancel();
    lastCancelAt = performance.now();
}

/** speechSynthesis.speak(u), once a recent cancel() has settled. */
function queue(u: SpeechSynthesisUtterance, gen: number): void {
    const wait = CANCEL_SETTLE_MS - (performance.now() - lastCancelAt);
    const go = () => {
        if (gen !== generation) return;
        try { speechSynthesis.speak(u); } catch { /* earcons still carry the essentials */ }
    };
    if (wait > 0) pendingTimer = window.setTimeout(go, wait);
    else go();
}

/** One piece of a sentence being said; `stop` cuts it off without calling `done`. */
type Part = (gen: number, done: () => void) => { stop(): void };

/** Read `text` out with the Web Speech API. */
const ttsPart = (text: string): Part => (gen, done) => {
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        done();
    };
    // a missing or silent speech engine never stalls the flow
    const timer = window.setTimeout(finish, Math.max(1500, text.length * 75));
    if (typeof speechSynthesis !== "undefined") {
        try {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = "nl-NL";
            if (voice) u.voice = voice;
            u.rate = 1.05;
            u.pitch = 1;
            let retried = false;
            u.onstart = () => console.debug("[p7 speech] start:", text);
            u.onend = finish;
            u.onerror = e => {
                console.warn(`[p7 speech] ${e.error}:`, text);
                // cut off by someone else (another frame's cancel, a hiccup in the
                // engine) rather than by a newer line of ours: try it once more
                if ((e.error === "interrupted" || e.error === "canceled") && !retried && gen === generation) {
                    retried = true;
                    lastCancelAt = performance.now();
                    queue(u, gen);
                }
            };
            queue(u, gen);
        } catch {
            // unsupported / blocked — the earcons still carry the essentials
        }
    }
    return { stop() { finished = true; window.clearTimeout(timer); } };
};

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

/** Play a line's recording; a recording that fails to load is read out instead. */
const recordingPart = (line: VoiceLine, howl: Howl): Part => (gen, done) => {
    let stopped = false;
    let soundId: number | undefined;
    let fallback: { stop(): void } | null = null;
    const start = () => {
        if (stopped) return;
        soundId = howl.play();
        howl.once("end", () => { if (!stopped) done(); }, soundId);
    };
    const failed = () => { if (!stopped) fallback = ttsPart(line.text)(gen, done); };
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

/**
 * Say a sentence made of one or more lines, back to back. Cancels whatever is
 * currently being said so the latest state always wins (announcements are
 * status, not a queue). Resolves true once it has been said, or false when it
 * was cut off by stopSpeech() / a newer speak().
 */
export function speak(...lines: VoiceLine[]): Promise<boolean> {
    stopSpeech();
    const gen = generation;
    // while none of the lines is recorded, say them as one natural utterance
    const parts: Part[] = lines.every(l => !l.src)
        ? [ttsPart(lines.map(l => l.text).join(" "))]
        : lines.map(l => {
            const howl = howlFor(l);
            return howl ? recordingPart(l, howl) : ttsPart(l.text);
        });
    // the host talks until the sentence has been said (stopSpeech() cuts him off)
    const chars = lines.reduce((n, l) => n + l.text.length, 0);
    void talker?.talk(Math.max(500, chars * MS_PER_CHAR) * 2 + 2000);
    const said = new Promise<boolean>(resolve => {
        let current: { stop(): void } | null = null;
        let over = false;
        const cancel = () => {
            over = true;
            current?.stop();
            resolve(false);
        };
        cancelCurrent = cancel;
        const next = (i: number) => {
            if (over) return;
            if (i >= parts.length) {
                over = true;
                if (cancelCurrent === cancel) cancelCurrent = null;
                resolve(true);
                return;
            }
            current = parts[i](gen, () => next(i + 1));
        };
        next(0);
    });
    void said.then(ok => { if (ok && gen === generation) talker?.stopTalking(); });
    return said;
}

export type Earcon =
    | "start" | "done" | "listen" | "select" | "correct" | "wrong";

// Each earcon is one or more quick sine blips, kept distinct in contour so
// they're tellable apart by ear.
const PATTERNS: Record<Earcon, { freq: number; at: number; dur: number }[]> = {
    start:   [{ freq: 392, at: 0,    dur: 0.10 }, { freq: 587, at: 0.11, dur: 0.14 }],
    listen:  [{ freq: 520, at: 0,    dur: 0.06 }],
    select:  [{ freq: 660, at: 0,    dur: 0.07 }],
    correct: [{ freq: 523, at: 0,    dur: 0.10 }, { freq: 659, at: 0.10, dur: 0.10 }, { freq: 784, at: 0.20, dur: 0.16 }],
    wrong:   [{ freq: 330, at: 0,    dur: 0.12 }, { freq: 247, at: 0.12, dur: 0.20 }],
    done:    [{ freq: 523, at: 0,    dur: 0.11 }, { freq: 659, at: 0.11, dur: 0.11 }, { freq: 784, at: 0.22, dur: 0.22 }],
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
