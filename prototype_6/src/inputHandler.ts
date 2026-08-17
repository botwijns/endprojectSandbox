// Number of pitch rows available on the left-hand note area (one octave, diatonic).
export const SCALE_DEGREES = 8;

const MIN_BPM = 60;
const MAX_BPM = 200;
const TAP_MAX_GAP_MS = 1500;   // taps further apart than this reset the tempo-tap sequence
const SWIPE_STEP_PX = 40;      // px of vertical drag needed to nudge a note by one degree

export type GameAction =
    | { type: "bpmSet"; bpm: number }
    | { type: "noteSet"; note: number }
    | { type: "noteNudge"; direction: 1 | -1 }
    | { type: "instrumentSwitch" };

type ActionCallback = (action: GameAction) => void;

type Zone = "topRight" | "bottomRight" | "left" | "other";

export class InputHandler {
    private callbacks: ActionCallback[] = [];

    // Top-right corner: tap x3 to define BPM and start the game.
    private tapTimestamps: number[] = [];

    // Left side: one active pointer drives note placement + swipe nudges.
    private notePointerId: number | null = null;
    private noteLastY: number | null = null;

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
        if (xf > 0.7 && yf < 0.25) return "topRight";
        if (xf > 0.7 && yf > 0.75) return "bottomRight";
        if (xf < 0.5) return "left";
        return "other";
    }

    // Maps a y coordinate (over the full screen height) to a note row.
    // Row 0 = bottom of the screen = lowest note; higher rows = higher pitch.
    private rowForY(y: number): number {
        const yf = Math.max(0, Math.min(0.999999, y / window.innerHeight));
        const rowFromTop = Math.floor(yf * SCALE_DEGREES);
        return SCALE_DEGREES - 1 - rowFromTop;
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

        if (zone === "topRight") {
            this.registerBpmTap();
            return;
        }

        if (zone === "bottomRight") {
            this.emit({ type: "instrumentSwitch" });
            return;
        }

        if (zone === "left") {
            if (this.notePointerId !== null) return; // one note gesture at a time
            this.notePointerId = e.pointerId;
            this.noteLastY = e.clientY;
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            this.emit({ type: "noteSet", note: this.rowForY(e.clientY) });
        }
    };

    private handlePointerMove = (e: PointerEvent): void => {
        if (e.pointerId !== this.notePointerId || this.noteLastY === null) return;

        let dy = e.clientY - this.noteLastY;
        // Consume the drag in fixed-size steps so a long swipe emits multiple nudges.
        while (Math.abs(dy) >= SWIPE_STEP_PX) {
            const direction: 1 | -1 = dy < 0 ? 1 : -1; // dragging up => higher note
            this.emit({ type: "noteNudge", direction });
            const consumed = SWIPE_STEP_PX * Math.sign(dy);
            this.noteLastY += consumed;
            dy -= consumed;
        }
    };

    private handlePointerEnd = (e: PointerEvent): void => {
        if (e.pointerId === this.notePointerId) {
            this.notePointerId = null;
            this.noteLastY = null;
        }
    };
}
