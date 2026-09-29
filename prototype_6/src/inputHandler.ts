// Number of pitch rows available on the note pad (one octave-ish of a scale).
export const SCALE_DEGREES = 8;

const MIN_BPM = 60;
const MAX_BPM = 200;
const TAP_MAX_GAP_MS = 1500;   // taps further apart than this reset the tempo-tap sequence
const SWIPE_STEP_PX = 44;      // px of vertical drag needed to emit one pitch nudge

export type GameAction =
    | { type: "bpmSet"; bpm: number }        // 3 quick taps anywhere on the pad
    | { type: "noteSet"; note: number }      // tap on the pad
    | { type: "padHold"; held: boolean }     // pad pressed / released (for sustained notes)
    | { type: "noteNudge"; direction: 1 | -1 } // vertical swipe on the pad
    | { type: "noteRemove" }                  // bottom strip — left half
    | { type: "instrumentSwitch" };           // bottom strip — right half

type ActionCallback = (action: GameAction) => void;

type Zone = "pad" | "ctrlRemove" | "ctrlInstrument" | "ctrlStop";

// Layout fractions — kept in one place so index.html's visual guides can match.
const STRIP_Y = 0.86;          // bottom control strip starts here
const STRIP_SPLIT = 0.5;       // remove | instrument boundary

// Excludes the top-center Stop button from the pad zone, so its native click
// isn't stolen by the pad's setPointerCapture().
const CTRL_STOP_X0 = 0.40;
const CTRL_STOP_X1 = 0.60;
const CTRL_STOP_Y1 = 0.07;

export class InputHandler {
    private callbacks: ActionCallback[] = [];

    // Tap x3 anywhere on the pad to define BPM (and start/resume the game).
    private tapTimestamps: number[] = [];

    // The pad: one active pointer drives note placement + swipe gestures.
    private notePointerId: number | null = null;
    private lastY: number | null = null;

    start(): void {
        document.body.addEventListener("pointerdown", this.handlePointerDown);
        document.body.addEventListener("pointermove", this.handlePointerMove);
        document.body.addEventListener("pointerup", this.handlePointerEnd);
        document.body.addEventListener("pointercancel", this.handlePointerEnd);
    }

    stop(): void {
        document.body.removeEventListener("pointerdown", this.handlePointerDown);
        document.body.removeEventListener("pointermove", this.handlePointerMove);
        document.body.removeEventListener("pointerup", this.handlePointerEnd);
        document.body.removeEventListener("pointercancel", this.handlePointerEnd);
    }

    onAction(cb: ActionCallback): void {
        this.callbacks.push(cb);
    }

    private emit(action: GameAction): void {
        this.callbacks.forEach(cb => cb(action));
    }

    private zoneFor(x: number, y: number): Zone {
        const xf = x / window.innerWidth;
        const yf = y / window.innerHeight;

        if (yf > STRIP_Y) {
            return xf < STRIP_SPLIT ? "ctrlRemove" : "ctrlInstrument";
        }
        if (xf > CTRL_STOP_X0 && xf < CTRL_STOP_X1 && yf < CTRL_STOP_Y1) return "ctrlStop";
        return "pad";
    }

    // Maps a y coordinate to a pad row. Row 0 = bottom = lowest note.
    private rowForY(y: number): number {
        const yf = Math.max(0, Math.min(0.999999, y / (window.innerHeight * STRIP_Y)));
        const rowFromTop = Math.floor(yf * SCALE_DEGREES);
        return Math.max(0, SCALE_DEGREES - 1 - rowFromTop);
    }

    private registerBpmTap(): void {
        const now = performance.now();
        const last = this.tapTimestamps[this.tapTimestamps.length - 1];
        if (last !== undefined && now - last > TAP_MAX_GAP_MS) {
            this.tapTimestamps = [];
        }
        this.tapTimestamps.push(now);

        if (this.tapTimestamps.length >= 3) {
            const [t0, t1, t2] = this.tapTimestamps.slice(-3);
            const avgIntervalMs = ((t1 - t0) + (t2 - t1)) / 2;
            const bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(60000 / avgIntervalMs)));
            this.emit({ type: "bpmSet", bpm });
            this.tapTimestamps = [];
        }
    }

    private handlePointerDown = (e: PointerEvent): void => {
        const zone = this.zoneFor(e.clientX, e.clientY);

        switch (zone) {
            case "ctrlRemove":
                this.emit({ type: "noteRemove" });
                return;
            case "ctrlInstrument":
                this.emit({ type: "instrumentSwitch" });
                return;
            case "ctrlStop":
                return; // inert — lets the real Stop button take its own native click
            case "pad":
                if (this.notePointerId !== null) return; // one pad gesture at a time
                this.notePointerId = e.pointerId;
                this.lastY = e.clientY;
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                this.emit({ type: "noteSet", note: this.rowForY(e.clientY) });
                this.emit({ type: "padHold", held: true });
                this.registerBpmTap();
                return;
        }
    };

    private handlePointerMove = (e: PointerEvent): void => {
        if (e.pointerId !== this.notePointerId || this.lastY === null) return;

        // The playhead advances on its own, so a drag on the pad only ever
        // nudges pitch (vertical axis) on the current step.
        let dy = e.clientY - this.lastY;
        while (Math.abs(dy) >= SWIPE_STEP_PX) {
            const direction: 1 | -1 = dy < 0 ? 1 : -1; // dragging up => higher note
            this.emit({ type: "noteNudge", direction });
            const consumed = SWIPE_STEP_PX * Math.sign(dy);
            this.lastY += consumed;
            dy -= consumed;
        }
    };

    private handlePointerEnd = (e: PointerEvent): void => {
        if (e.pointerId === this.notePointerId) {
            this.notePointerId = null;
            this.lastY = null;
            this.emit({ type: "padHold", held: false });
        }
    };
}
