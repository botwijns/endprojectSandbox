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

// Add ?motiondebug to the page URL to show what the sensor and the iOS
// permission prompt are doing, for checking a shake on a real phone.
const DEBUG = new URLSearchParams(location.search).has("motiondebug");
const debugState = { permission: "not asked", events: 0, maxJump: 0, shakes: 0 };
let debugEl: HTMLElement | null = null;
function debug(update: Partial<typeof debugState>): void {
    if (!DEBUG) return;
    Object.assign(debugState, update);
    if (!debugEl) {
        debugEl = document.createElement("div");
        debugEl.dataset.ui = "";
        debugEl.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:3000;padding:4px 8px;border-radius:6px;"
            + "background:rgb(0 0 0 / 0.75);color:#fff;font:12px/1.4 monospace;pointer-events:none;white-space:pre";
        document.body.appendChild(debugEl);
    }
    const d = debugState;
    debugEl.textContent = `motion: ${d.permission}
events: ${d.events}  max jump: ${d.maxJump.toFixed(1)} / ${SHAKE_THRESHOLD}
shakes: ${d.shakes}`;
}

type ShakeCallback = () => void;
type Vec3 = { x: number; y: number; z: number };

export class ShakeDetector {
    private callbacks: ShakeCallback[] = [];
    private lastSample: Vec3 | null = null;
    private lastShakeAt = 0;
    private listening = false;
    private retrying = false;

    onShake(cb: ShakeCallback): void {
        this.callbacks.push(cb);
    }

    // Should be called from inside a user-gesture handler - iOS Safari gates
    // DeviceMotionEvent behind an explicit permission prompt, and only a click
    // or touchend counts as a gesture there (pointerdown/touchstart from a
    // finger do not). If the request is refused for lack of a gesture, it is
    // retried on the player's next tap.
    async start(): Promise<void> {
        if (this.listening) return;
        const DME = (window as any).DeviceMotionEvent;
        if (DME && typeof DME.requestPermission === "function") {
            debug({ permission: "asking…" });
            try {
                const result = await DME.requestPermission();
                debug({ permission: result });
                if (result !== "granted") return; // the player said no
            } catch (err) {
                debug({ permission: `refused (${(err as Error)?.name ?? err}), retrying on next tap` });
                this.retryOnNextTap(); // called outside a gesture: ask again on the next tap
                return;
            }
        } else {
            debug({ permission: DME ? "no prompt needed" : "no DeviceMotionEvent (needs https)" });
        }
        if (this.listening) return; // a second start() raced past the permission prompt
        window.addEventListener("devicemotion", this.handleMotion);
        this.listening = true;
    }

    stop(): void {
        window.removeEventListener("devicemotion", this.handleMotion);
        this.cancelRetry();
        this.listening = false;
        this.lastSample = null;
    }

    private retryOnNextTap(): void {
        if (this.retrying) return;
        this.retrying = true;
        window.addEventListener("touchend", this.retry, true);
        window.addEventListener("click", this.retry, true);
    }

    private cancelRetry(): void {
        this.retrying = false;
        window.removeEventListener("touchend", this.retry, true);
        window.removeEventListener("click", this.retry, true);
    }

    private retry = (): void => {
        this.cancelRetry();
        void this.start();
    };

    private handleMotion = (e: DeviceMotionEvent): void => {
        const acc = e.acceleration ?? e.accelerationIncludingGravity;
        if (!acc) return;
        const sample = { x: acc.x ?? 0, y: acc.y ?? 0, z: acc.z ?? 0 };
        const prev = this.lastSample;
        this.lastSample = sample;
        if (!prev) return;

        const jump = Math.sqrt((sample.x - prev.x) ** 2 + (sample.y - prev.y) ** 2 + (sample.z - prev.z) ** 2);
        if (DEBUG) debug({ events: debugState.events + 1, maxJump: Math.max(debugState.maxJump, jump) });
        if (jump < SHAKE_THRESHOLD) return;

        const now = performance.now();
        if (now - this.lastShakeAt < SHAKE_COOLDOWN_MS) return;
        this.lastShakeAt = now;
        debug({ shakes: debugState.shakes + 1 });
        this.callbacks.forEach(cb => cb());
    };
}
