// ── Eyes-free input for the music quiz ───────────────────────────────────────
// Answers live either in the four corners of the screen (4-option questions) or
// split left/right (2-option questions) - whichever matches the current
// question's option count. Before the quiz starts (and after it ends) three
// quick taps anywhere start a run. Shaking the phone repeats the current
// question (prompt + song). Layout fractions live here and are mirrored by the
// dashed guides in index.html.

import { ShakeDetector } from "../../src/shake.ts";

export type AnswerIndex = number;

export interface AnswerZone {
  index: AnswerIndex;
  letter: string;
}

const SIDES_2: AnswerZone[] = [
  { index: 0, letter: "A" }, // links
  { index: 1, letter: "B" }, // rechts
];

const CORNERS_4: AnswerZone[] = [
  { index: 0, letter: "A" }, // linksboven
  { index: 1, letter: "B" }, // rechtsboven
  { index: 2, letter: "C" }, // linksonder
  { index: 3, letter: "D" }, // rechtsonder
];

/** The active set of answer zones for a question with `count` options (2 or 4). */
export function zonesFor(count: number): AnswerZone[] {
  return count <= 2 ? SIDES_2 : CORNERS_4;
}

export type QuizAction =
    | { type: "start" }
    | { type: "optionPreview"; index: AnswerIndex }
    | { type: "optionCommit"; index: AnswerIndex }
    | { type: "repeat" };

type ActionCallback = (action: QuizAction) => void;

const TAP_MAX_GAP_MS = 1500; // taps further apart than this reset the start-tap sequence
const SELECT_WINDOW_MS = 1500; // a second tap on the same corner within this commits it

type Zone =
    | { kind: "answer"; index: AnswerIndex }
    | { kind: "dead" };

export class InputHandler {
    private callbacks: ActionCallback[] = [];
    private quizEnabled = false;
    // While false every tap and shake is ignored - used while the intro's
    // preview panel (Herhaal/Volgende) owns the screen.
    private active = true;
    private answerCount: number = 4;

    // Pre-start / post-end: count quick taps anywhere.
    private startTaps: number[] = [];

    // Arm/commit tracking for answer zones.
    private armedIndex: AnswerIndex | null = null;
    private armedAt = 0;

    // Shake detection - shared with prototype 6 so a shake feels the same in both.
    private shake = new ShakeDetector();

    constructor() {
        this.shake.onShake(() => {
            if (this.active) this.emit({ type: "repeat" });
        });
    }

    start(): void {
        document.body.addEventListener("pointerdown", this.handlePointerDown);
    }

    stop(): void {
        document.body.removeEventListener("pointerdown", this.handlePointerDown);
        this.shake.stop();
    }

    onAction(cb: ActionCallback): void {
        this.callbacks.push(cb);
    }

    /** Enable zone routing (during a run) or fall back to start-tap counting. */
    setQuizEnabled(enabled: boolean): void {
        this.quizEnabled = enabled;
        this.startTaps = [];
        this.armedIndex = null;
    }

    /** Ignore (false) or resume (true) all taps and shakes, without touching quiz/start-tap mode. */
    setActive(active: boolean): void {
        this.active = active;
        this.startTaps = [];
        this.armedIndex = null;
    }

    /** Switch the hit-test layout to match the current question's option count (2 or 4). */
    setAnswerCount(count: number): void {
        this.answerCount = count;
    }

    /** Forget the armed zone (call after each question so a stale tap can't commit). */
    resetArmed(): void {
        this.armedIndex = null;
    }

    /**
     * Starts listening for shake gestures. Must be called from inside a
     * user-gesture handler - iOS Safari gates DeviceMotionEvent behind an
     * explicit permission prompt.
     */
    async enableMotion(): Promise<void> {
        await this.shake.start();
    }

    private emit(action: QuizAction): void {
        this.callbacks.forEach(cb => cb(action));
    }

    private zoneFor(x: number, y: number): Zone {
        const xf = x / window.innerWidth;
        const yf = y / window.innerHeight;

        if (this.answerCount <= 2) {
            return { kind: "answer", index: xf < 0.5 ? 0 : 1 };
        }
        const left = xf < 0.5;
        const top = yf < 0.5;
        return { kind: "answer", index: top ? (left ? 0 : 1) : (left ? 2 : 3) };
    }

    private registerStartTap(): void {
        const now = performance.now();
        const last = this.startTaps[this.startTaps.length - 1];
        if (last !== undefined && now - last > TAP_MAX_GAP_MS) this.startTaps = [];
        this.startTaps.push(now);
        if (this.startTaps.length >= 3) {
            this.startTaps = [];
            this.emit({ type: "start" });
        }
    }

    private handlePointerDown = (e: PointerEvent): void => {
        if (!this.active) return;
        // on-screen buttons/links (start screen, intro helpers) are not answer or start taps
        if (e.target instanceof Element && e.target.closest("[data-ui]")) return;
        if (!this.quizEnabled) {
            this.registerStartTap();
            return;
        }

        const zone = this.zoneFor(e.clientX, e.clientY);
        if (zone.kind === "dead") return;

        const now = performance.now();
        if (this.armedIndex === zone.index && now - this.armedAt <= SELECT_WINDOW_MS) {
            this.armedIndex = null;
            this.emit({ type: "optionCommit", index: zone.index });
        } else {
            this.armedIndex = zone.index;
            this.armedAt = now;
            this.emit({ type: "optionPreview", index: zone.index });
        }
    };
}
