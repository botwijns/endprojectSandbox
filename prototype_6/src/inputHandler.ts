// Number of pitch rows available on the note pad (one octave-ish of a scale).
export const SCALE_DEGREES = 8;

const MIN_BPM = 60;
const MAX_BPM = 200;
const TAP_MAX_GAP_MS = 1500;   // taps further apart than this reset the tempo-tap sequence
const SWIPE_STEP_PX = 44;      // px of drag needed to emit one nudge / step move

export type GameAction =
    | { type: "bpmSet"; bpm: number }        // 3 quick taps top-right
    | { type: "transportTap" }               // a single tap top-right
    | { type: "noteSet"; note: number }      // tap on the pad
    | { type: "padHold"; held: boolean }     // pad pressed / released (for sustained notes)
    | { type: "noteNudge"; direction: 1 | -1 } // vertical swipe on the pad
    | { type: "stepMove"; direction: 1 | -1 }  // horizontal swipe on the pad
    | { type: "noteRemove" }                  // bottom strip — left cell
    | { type: "instrumentSwitch" }            // bottom strip — middle cell
    | { type: "modeToggle" };                 // bottom strip — right cell

type ActionCallback = (action: GameAction) => void;

type Zone = "topRight" | "pad" | "ctrlRemove" | "ctrlInstrument" | "ctrlMode" | "other";

// Layout fractions — kept in one place so index.html's visual guides can match.
const TOP_RIGHT_X = 0.6;
const TOP_RIGHT_Y = 0.22;
const PAD_X = 0.5;
const STRIP_Y = 0.86;          // bottom control strip starts here
const STRIP_SPLIT_1 = 0.34;    // remove | instrument boundary
const STRIP_SPLIT_2 = 0.67;    // instrument | mode boundary

export class InputHandler {
    private callbacks: ActionCallback[] = [];

    // Top-right corner: tap x3 to define BPM; a single tap is its own action.
    private tapTimestamps: number[] = [];

    // The pad: one active pointer drives note placement + swipe gestures.
    private notePointerId: number | null = null;
    private lastX: number | null = null;
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
            if (xf < STRIP_SPLIT_1) return "ctrlRemove";
            if (xf < STRIP_SPLIT_2) return "ctrlInstrument";
            return "ctrlMode";
        }
        if (xf > TOP_RIGHT_X && yf < TOP_RIGHT_Y) return "topRight";
        if (xf < PAD_X) return "pad";
        return "other";
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
            case "topRight":
                this.emit({ type: "transportTap" });
                this.registerBpmTap();
                return;
            case "ctrlRemove":
                this.emit({ type: "noteRemove" });
                return;
            case "ctrlInstrument":
                this.emit({ type: "instrumentSwitch" });
                return;
            case "ctrlMode":
                this.emit({ type: "modeToggle" });
                return;
            case "pad":
                if (this.notePointerId !== null) return; // one pad gesture at a time
                this.notePointerId = e.pointerId;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                this.emit({ type: "noteSet", note: this.rowForY(e.clientY) });
                this.emit({ type: "padHold", held: true });
                return;
        }
    };

    private handlePointerMove = (e: PointerEvent): void => {
        if (e.pointerId !== this.notePointerId || this.lastX === null || this.lastY === null) return;

        let dx = e.clientX - this.lastX;
        let dy = e.clientY - this.lastY;

        // Consume the drag in fixed steps; the dominant axis decides the gesture
        // for each step, so a mostly-horizontal drag scrubs steps and a
        // mostly-vertical drag nudges pitch.
        while (Math.abs(dx) >= SWIPE_STEP_PX || Math.abs(dy) >= SWIPE_STEP_PX) {
            if (Math.abs(dx) >= Math.abs(dy)) {
                const direction: 1 | -1 = dx > 0 ? 1 : -1;
                this.emit({ type: "stepMove", direction });
                const consumed = SWIPE_STEP_PX * Math.sign(dx);
                this.lastX += consumed;
                dx -= consumed;
            } else {
                const direction: 1 | -1 = dy < 0 ? 1 : -1; // dragging up => higher note
                this.emit({ type: "noteNudge", direction });
                const consumed = SWIPE_STEP_PX * Math.sign(dy);
                this.lastY += consumed;
                dy -= consumed;
            }
        }
    };

    private handlePointerEnd = (e: PointerEvent): void => {
        if (e.pointerId === this.notePointerId) {
            this.notePointerId = null;
            this.lastX = null;
            this.lastY = null;
            this.emit({ type: "padHold", held: false });
        }
    };
}
