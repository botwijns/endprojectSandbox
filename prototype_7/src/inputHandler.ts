// ── Eyes-free input for the music quiz ───────────────────────────────────────
// Answers live either in the four corners of the screen (4-option questions) or
// split left/right (2-option questions) - whichever matches the current
// question's option count. Before the quiz starts (and after it ends) three
// quick taps anywhere start a run. Shaking the phone repeats the current
// question (prompt + song). Layout fractions live here and are mirrored by the
// dashed guides in index.html.

export type AnswerIndex = number;

export interface AnswerZone {
  index: AnswerIndex;
  letter: string;
  pan: number; // -1 (left) .. 1 (right)
  pitch: "high" | "low";
}

const SIDES_2: AnswerZone[] = [
  { index: 0, letter: "A", pan: -0.8, pitch: "high" }, // links
  { index: 1, letter: "B", pan: 0.8, pitch: "high" }, // rechts
];

const CORNERS_4: AnswerZone[] = [
  { index: 0, letter: "A", pan: -0.8, pitch: "high" }, // linksboven
  { index: 1, letter: "B", pan: 0.8, pitch: "high" }, // rechtsboven
  { index: 2, letter: "C", pan: -0.8, pitch: "low" }, // linksonder
  { index: 3, letter: "D", pan: 0.8, pitch: "low" }, // rechtsonder
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

const SHAKE_THRESHOLD = 15; // m/s² jump between consecutive samples - tune against a real device
const SHAKE_COOLDOWN_MS = 1200; // ignore further shakes for this long after one fires

type Zone =
    | { kind: "answer"; index: AnswerIndex }
    | { kind: "dead" };

export class InputHandler {
    private callbacks: ActionCallback[] = [];
    private quizEnabled = false;
    private answerCount: number = 4;

    // Pre-start / post-end: count quick taps anywhere.
    private startTaps: number[] = [];

    // Arm/commit tracking for answer zones.
    private armedIndex: AnswerIndex | null = null;
    private armedAt = 0;

    // Shake detection.
    private lastMotionMagnitude: number | null = null;
    private lastShakeAt = 0;

    start(): void {
        document.body.addEventListener("pointerdown", this.handlePointerDown);
    }

    stop(): void {
        document.body.removeEventListener("pointerdown", this.handlePointerDown);
        window.removeEventListener("devicemotion", this.handleMotion);
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
        const DME = (window as any).DeviceMotionEvent;
        if (DME && typeof DME.requestPermission === "function") {
            try {
                const result = await DME.requestPermission();
                if (result !== "granted") return;
            } catch {
                return; // not actually iOS, or the prompt was denied/unsupported
            }
        }
        window.addEventListener("devicemotion", this.handleMotion);
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

    private handleMotion = (e: DeviceMotionEvent): void => {
        const acc = e.acceleration ?? e.accelerationIncludingGravity;
        if (!acc) return;
        const magnitude = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
        const delta = this.lastMotionMagnitude === null ? 0 : Math.abs(magnitude - this.lastMotionMagnitude);
        this.lastMotionMagnitude = magnitude;

        const now = performance.now();
        if (delta > SHAKE_THRESHOLD && now - this.lastShakeAt > SHAKE_COOLDOWN_MS) {
            this.lastShakeAt = now;
            this.emit({ type: "repeat" });
        }
    };
}
