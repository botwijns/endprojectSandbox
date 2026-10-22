// Shared "shake the phone" gesture for every prototype that uses one, so a
// shake feels the same everywhere. It is a discrete gesture, not continuous
// steering: it fires a single pulse and then ignores the sensor for a cooldown,
// so one hard shake can't fire twice.
//
// A shake is detected as a sudden jump in the acceleration vector between two
// consecutive sensor samples. Comparing the vectors, not just their lengths,
// also catches a back-and-forth flip (+x to -x) whose magnitude barely changes,
// and gravity cancels out of the difference, so readings with and without
// gravity (the fallback on some devices) behave the same.
const SHAKE_THRESHOLD = 15;      // m/s² jump between consecutive samples - tune against a real device
const SHAKE_COOLDOWN_MS = 1200;  // ignore further shakes for this long after one fires

type ShakeCallback = () => void;
type Vec3 = { x: number; y: number; z: number };

export class ShakeDetector {
    private callbacks: ShakeCallback[] = [];
    private lastSample: Vec3 | null = null;
    private lastShakeAt = 0;
    private listening = false;

    onShake(cb: ShakeCallback): void {
        this.callbacks.push(cb);
    }

    // Must be called from inside a user-gesture handler - iOS Safari gates
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
        if (this.listening) return; // a second start() raced past the permission prompt
        window.addEventListener("devicemotion", this.handleMotion);
        this.listening = true;
    }

    stop(): void {
        window.removeEventListener("devicemotion", this.handleMotion);
        this.listening = false;
        this.lastSample = null;
    }

    private handleMotion = (e: DeviceMotionEvent): void => {
        const acc = e.acceleration ?? e.accelerationIncludingGravity;
        if (!acc) return;
        const sample = { x: acc.x ?? 0, y: acc.y ?? 0, z: acc.z ?? 0 };
        const prev = this.lastSample;
        this.lastSample = sample;
        if (!prev) return;

        const jump = Math.sqrt((sample.x - prev.x) ** 2 + (sample.y - prev.y) ** 2 + (sample.z - prev.z) ** 2);
        if (jump < SHAKE_THRESHOLD) return;

        const now = performance.now();
        if (now - this.lastShakeAt < SHAKE_COOLDOWN_MS) return;
        this.lastShakeAt = now;
        this.callbacks.forEach(cb => cb());
    };
}
