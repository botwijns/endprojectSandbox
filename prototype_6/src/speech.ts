// ── Audio-first feedback ─────────────────────────────────────────────────────
// This prototype is meant to be played without looking at the screen, so every
// state change is announced. Two channels:
//   • speak()  — spoken Dutch via the Web Speech API (skipped silently if the
//                browser has no speechSynthesis).
//   • earcon() — short non-verbal tones for fast, frequent events (placing a
//                note, moving the step cursor) where speech would be too slow.

// Speech can be switched off from the start screen so the same build is easy
// to playtest both with and without the spoken cues. Earcons are unaffected.
let enabled = true;

export function setSpeechEnabled(v: boolean): void {
    enabled = v;
    if (!v && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
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

/**
 * Speak a short Dutch phrase. Cancels whatever is currently being said so the
 * latest state always wins (announcements are status, not a queue).
 */
export function speak(text: string): void {
    if (!enabled || typeof speechSynthesis === "undefined") return;
    try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "nl-NL";
        if (voice) u.voice = voice;
        u.rate = 1.05;
        u.pitch = 1;
        speechSynthesis.speak(u);
    } catch {
        // unsupported / blocked — the earcons still carry the essentials
    }
}

/** Anything with a mouth to animate while a line is spoken (the campfire fisherman). */
export interface Talker {
    talk(ms: number): Promise<void>;
    stopTalking(): void;
}

// Rough length of a spoken line, used to move the mouth and as the wait when
// speech is off or unsupported, so the intro still runs at a natural pace.
const MS_PER_CHAR = 65;

let cancelLine: (() => void) | null = null;

/**
 * Speak one intro line and resolve when it has been said (or cut off by
 * stopSpeech() / another speak()). Pass the fisherman as `mouth` to move his
 * mouth for the length of the line.
 */
export function speakLine(text: string, mouth?: Talker): Promise<void> {
    cancelLine?.();
    return new Promise<void>(resolve => {
        const estimate = Math.max(800, text.length * MS_PER_CHAR);
        let done = false;
        let timer = 0;
        const finish = () => {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            if (cancelLine === cancel) cancelLine = null;
            mouth?.stopTalking();
            resolve();
        };
        const cancel = () => finish();
        cancelLine = cancel;
        void mouth?.talk(estimate);

        if (!enabled || typeof speechSynthesis === "undefined") {
            timer = window.setTimeout(finish, estimate);
            return;
        }
        try {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = "nl-NL";
            if (voice) u.voice = voice;
            u.rate = 1.05;
            u.pitch = 1;
            const startedAt = performance.now();
            u.onend = finish;
            u.onerror = e => {
                // Cut off on purpose (stopSpeech / a newer line): done now.
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
    });
}

/** Cut off whatever is being said; a pending speakLine() resolves. */
export function stopSpeech(): void {
    cancelLine?.();
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
