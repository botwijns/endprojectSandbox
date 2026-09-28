// A discrete "shake the phone" gesture, detected via the accelerometer. This
// is intentionally NOT continuous spatial steering — it only ever fires a
// single pulse when acceleration magnitude spikes past a threshold, debounced
// by a cooldown so one hard shake can't fire twice.
const SHAKE_THRESHOLD = 18;      // m/s² of acceleration to count as a shake — needs live-device tuning
const SHAKE_COOLDOWN_MS = 1200;  // ignore further shakes for this long after one fires

type ShakeCallback = () => void;

export class ShakeDetector {
    private callbacks: ShakeCallback[] = [];
    private lastShakeAt = 0;
    private listening = false;

    onShake(cb: ShakeCallback): void {
        this.callbacks.push(cb);
    }

    // Must be called from inside a user-gesture handler — iOS Safari gates
    // DeviceMotionEvent behind an explicit permission prompt.
    async start(): Promise<void> {
        if (this.listening) return;
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
        this.listening = true;
    }

    private handleMotion = (e: DeviceMotionEvent): void => {
        const acc = e.acceleration ?? e.accelerationIncludingGravity;
        if (!acc) return;
        const magnitude = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
        if (magnitude < SHAKE_THRESHOLD) return;

        const now = performance.now();
        if (now - this.lastShakeAt < SHAKE_COOLDOWN_MS) return;
        this.lastShakeAt = now;
        this.callbacks.forEach(cb => cb());
    };
}
