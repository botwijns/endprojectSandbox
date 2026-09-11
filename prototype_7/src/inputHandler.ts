// ── Eyes-free input for the music quiz ───────────────────────────────────────
// Four answers live in the four corners of the screen. A horizontal band across
// the middle repeats the question (left third) or the music (right third).
// Before the quiz starts (and after it ends) three quick taps anywhere start a
// run. All layout fractions live here and are mirrored by the dashed guides in
// index.html.

export type CornerIndex = 0 | 1 | 2 | 3;

/** Corner index → letter + where its positional cue should sound. */
export const CORNERS: { index: CornerIndex; letter: string; pan: number; pitch: "high" | "low" }[] = [
    { index: 0, letter: "A", pan: -0.8, pitch: "high" }, // linksboven
    { index: 1, letter: "B", pan: 0.8, pitch: "high" }, // rechtsboven
    { index: 2, letter: "C", pan: -0.8, pitch: "low" }, // linksonder
    { index: 3, letter: "D", pan: 0.8, pitch: "low" }, // rechtsonder
];

export type QuizAction =
    | { type: "start" }
    | { type: "optionPreview"; index: CornerIndex }
    | { type: "optionCommit"; index: CornerIndex }
    | { type: "repeatPrompt" }
    | { type: "replayPiece" };

type ActionCallback = (action: QuizAction) => void;

// Layout fractions — keep in sync with index.html's visual guides.
const MID_TOP = 0.38; // middle band starts here
const MID_BOTTOM = 0.62; // middle band ends here
const MID_LEFT = 0.34; // "repeat question" cell ends here
const MID_RIGHT = 0.66; // "repeat music" cell starts here

const TAP_MAX_GAP_MS = 1500; // taps further apart than this reset the start-tap sequence
const SELECT_WINDOW_MS = 1500; // a second tap on the same corner within this commits it

type Zone =
    | { kind: "corner"; index: CornerIndex }
    | { kind: "repeatPrompt" }
    | { kind: "replayPiece" }
    | { kind: "dead" };

export class InputHandler {
    private callbacks: ActionCallback[] = [];
    private quizEnabled = false;

    // Pre-start / post-end: count quick taps anywhere.
    private startTaps: number[] = [];

    // Arm/commit tracking for the corners.
    private armedCorner: CornerIndex | null = null;
    private armedAt = 0;

    start(): void {
        document.body.addEventListener("pointerdown", this.handlePointerDown);
    }

    stop(): void {
        document.body.removeEventListener("pointerdown", this.handlePointerDown);
    }

    onAction(cb: ActionCallback): void {
        this.callbacks.push(cb);
    }

    /** Enable zone routing (during a run) or fall back to start-tap counting. */
    setQuizEnabled(enabled: boolean): void {
        this.quizEnabled = enabled;
        this.startTaps = [];
        this.armedCorner = null;
    }

    /** Forget the armed corner (call after each question so a stale tap can't commit). */
    resetArmed(): void {
        this.armedCorner = null;
    }

    private emit(action: QuizAction): void {
        this.callbacks.forEach(cb => cb(action));
    }

    private zoneFor(x: number, y: number): Zone {
        const xf = x / window.innerWidth;
        const yf = y / window.innerHeight;

        if (yf >= MID_TOP && yf <= MID_BOTTOM) {
            if (xf < MID_LEFT) return { kind: "repeatPrompt" };
            if (xf > MID_RIGHT) return { kind: "replayPiece" };
            return { kind: "dead" };
        }
        const left = xf < 0.5;
        const top = yf < MID_TOP;
        const index = (top ? (left ? 0 : 1) : (left ? 2 : 3)) as CornerIndex;
        return { kind: "corner", index };
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
        switch (zone.kind) {
            case "repeatPrompt":
                this.emit({ type: "repeatPrompt" });
                return;
            case "replayPiece":
                this.emit({ type: "replayPiece" });
                return;
            case "dead":
                return;
            case "corner": {
                const now = performance.now();
                if (this.armedCorner === zone.index && now - this.armedAt <= SELECT_WINDOW_MS) {
                    this.armedCorner = null;
                    this.emit({ type: "optionCommit", index: zone.index });
                } else {
                    this.armedCorner = zone.index;
                    this.armedAt = now;
                    this.emit({ type: "optionPreview", index: zone.index });
                }
                return;
            }
        }
    };
}
