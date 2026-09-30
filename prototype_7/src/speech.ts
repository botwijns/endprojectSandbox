// ── Audio-first feedback ─────────────────────────────────────────────────────
// This prototype is meant to be played without looking at the screen, so every
// state change is announced. Three channels:
//   • speak()        — spoken Dutch via the Web Speech API (skipped silently if
//                      the browser has no speechSynthesis).
//   • earcon()       — short non-verbal tones for fast, frequent events / result
//                      feedback where speech alone would be slow.
//   • positionalCue() — a panned, pitched blip that tells you WHERE on screen an
//                      answer sits (left/right = stereo pan, top/bottom = pitch).

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
 * Returns the utterance so callers can hook `onend` (or null if unsupported).
 */
export function speak(text: string): SpeechSynthesisUtterance | null {
    if (typeof speechSynthesis === "undefined") return null;
    try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "nl-NL";
        if (voice) u.voice = voice;
        u.rate = 1.05;
        u.pitch = 1;
        speechSynthesis.speak(u);
        return u;
    } catch {
        // unsupported / blocked — the earcons still carry the essentials
        return null;
    }
}

/**
 * Speak, and try to place the voice on one side of the stereo field. The Web
 * Speech API on most platforms cannot be routed through a StereoPannerNode, so
 * this usually behaves exactly like speak(); positionalCue() is the reliable
 * spatial channel. `pan` is -1 (left) .. 1 (right).
 */
export function speakFrom(text: string, _pan: number): SpeechSynthesisUtterance | null {
    // No portable way to pan speechSynthesis output today — kept as a seam so a
    // future platform (or a pre-rendered-TTS approach) can honour the position.
    return speak(text);
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

/**
 * A short blip that encodes a screen position: stereo pan for left/right, pitch
 * for top/bottom. Played right before each answer is spoken so you can learn the
 * layout by ear.
 */
export function positionalCue(
    ctx: AudioContext,
    pos: { pan: number; pitch: "high" | "low" },
    volume = 0.16,
): void {
    const now = ctx.currentTime + 0.01;
    const dur = 0.14;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pos.pan));
    osc.type = "triangle";
    osc.frequency.value = pos.pitch === "high" ? 880 : 300;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(panner).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
}
