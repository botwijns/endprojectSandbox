// Tracks which way the phone is physically facing, relative to whatever
// direction it faced when the current round was calibrated. Edit mode uses
// the resulting delta to pick a step column instead of a swipe gesture.
export type HeadingCallback = (deltaDeg: number) => void;

function normalizeDelta(deltaDeg: number): number {
    return ((deltaDeg + 180) % 360 + 360) % 360 - 180;
}

export class OrientationTracker {
    private baseHeading: number | null = null;
    private lastHeading: number | null = null;
    private listening = false;
    private callbacks: HeadingCallback[] = [];

    onHeadingChange(cb: HeadingCallback): void {
        this.callbacks.push(cb);
    }

    // Must be called from inside a user-gesture handler — iOS Safari gates
    // DeviceOrientationEvent behind an explicit permission prompt.
    async start(): Promise<void> {
        if (this.listening) return;
        const DOE = (window as any).DeviceOrientationEvent;
        if (DOE && typeof DOE.requestPermission === "function") {
            try {
                const result = await DOE.requestPermission();
                if (result !== "granted") return;
            } catch {
                return; // not actually iOS, or the prompt was denied/unsupported
            }
        }
        window.addEventListener("deviceorientationabsolute", this.handleOrientation as EventListener);
        window.addEventListener("deviceorientation", this.handleOrientation as EventListener);
        this.listening = true;
    }

    // Locks in "straight ahead" as whatever direction the phone currently
    // faces — call this when a round starts.
    calibrate(): void {
        this.baseHeading = this.lastHeading;
    }

    // Signed degrees turned from the calibrated heading; positive = right (clockwise).
    currentDelta(): number {
        if (this.baseHeading === null || this.lastHeading === null) return 0;
        return normalizeDelta(this.lastHeading - this.baseHeading);
    }

    private handleOrientation = (e: DeviceOrientationEvent): void => {
        // iOS exposes a ready-made compass heading; elsewhere derive one from
        // alpha (which increases counter-clockwise, so flip it).
        const compass = (e as any).webkitCompassHeading;
        const heading = typeof compass === "number"
            ? compass
            : (e.alpha !== null ? (360 - e.alpha) % 360 : null);
        if (heading === null) return;

        this.lastHeading = heading;
        if (this.baseHeading === null) this.baseHeading = heading;

        const delta = normalizeDelta(heading - this.baseHeading);
        this.callbacks.forEach(cb => cb(delta));
    };
}
