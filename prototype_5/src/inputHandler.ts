export type Action = "moveLeft" | "moveRight" | "interact" | "pause" |"shoot";

type ActionCallback = (action: Action) => void;
export interface JoystickState {
    x: number; // -1 to 1 (left to right)
    y: number; // -1 to 1 (top to bottom)
    active: boolean;
}
export interface Orientation {
    alpha: number | null;
    beta: number | null;  // forward/back tilt, -180 to 180
    gamma: number | null; // left/right tilt, -90 to 90
}

export interface RelativeState {
    orientation: {
        alpha: number | null;
        beta: number | null;
        gamma: number | null;
    };
    motion: {
        x: number | null;
        y: number | null;
        z: number | null;
    };
}

export interface Motion {
    x: number | null; // left/right acceleration in m/s²
    y: number | null; // forward/back acceleration in m/s²
    z: number | null; // up/down acceleration in m/s²
}
export class InputHandler {
    private callbacks: ActionCallback[] = [];
    private orientation: Orientation = {alpha: null, beta:null, gamma:null};
    private keyMap: Record<string, Action> = {
        ArrowLeft: "moveLeft",
        ArrowRight: "moveRight",
        Space: "interact",
        Escape: "pause",
    };

    private debug = false;
    // private shootCooldown = false;
    private joystick: JoystickState = { x: 0, y: 0, active: false };
    private joystickStartPos: { x: number; y: number } | null = null;
    private joystickPointerId: number | null = null;
    private pressCallbacks: (() => void)[] = [];
    // raw screen position of the active pointer (null when nothing is touching)
    private pointerPos: { x: number; y: number } | null = null;
    // last time we heard *anything* about the claimed pointer — lets a new
    // touch reclaim control if the previous one's up/cancel was ever dropped
    // (some browsers lose a terminal pointer event when a gesture is hijacked)
    private lastPointerActivity = 0;

    constructor(debug = false) {
        this.debug = debug;
    }

    start(): void {
        window.addEventListener("keydown", this.handleKey);
        // document.body.addEventListener("pointerdown", this.handlePointer);
        // document.body.addEventListener("pointerup", this.handlePointerUp);
        document.body.addEventListener("pointerdown", this.handleJoystickStart);
        document.body.addEventListener("pointermove", this.handleJoystickMove);
        document.body.addEventListener("pointerup", this.handleJoystickEnd);
        document.body.addEventListener("pointercancel", this.handleJoystickEnd);
        // a dropped pointerup/pointercancel would otherwise leave the pointer
        // claimed forever — lostpointercapture is a more reliable backstop
        document.body.addEventListener("lostpointercapture", this.handleJoystickEnd);
        // stop the browser from turning a held/long touch into a context menu
        // or text-selection gesture mid-crank, which can cancel the pointer
        document.body.addEventListener("contextmenu", this.handleContextMenu);
        if (this.debug){
            window.addEventListener("mousemove", this.handleMouse);
        } else{
            window.addEventListener("deviceorientation", this.handleOrientation);
            window.addEventListener("devicemotion", this.handleMotion);
        }
    }

    stop(): void {
        window.removeEventListener("keydown", this.handleKey);
        // document.body.removeEventListener("pointerdown", this.handlePointer);
        // document.body.removeEventListener("pointerup", this.handlePointerUp);
        document.body.removeEventListener("pointerdown", this.handleJoystickStart);
        document.body.removeEventListener("pointermove", this.handleJoystickMove);
        document.body.removeEventListener("pointerup", this.handleJoystickEnd);
        document.body.removeEventListener("pointercancel", this.handleJoystickEnd);
        document.body.removeEventListener("lostpointercapture", this.handleJoystickEnd);
        document.body.removeEventListener("contextmenu", this.handleContextMenu);
        if (this.debug){
            window.removeEventListener("mousemove", this.handleMouse);
        } else{
            window.removeEventListener("deviceorientation", this.handleOrientation);
            window.removeEventListener("devicemotion", this.handleMotion);
        }
    }

    onAction(cb: ActionCallback): void {
        this.callbacks.push(cb);
    }

    /** Fires the moment a fresh press starts on the screen. */
    onPress(cb: () => void): void {
        this.pressCallbacks.push(cb);
    }


    getOrientation(): Orientation {
        return this.orientation;
    }

    getJoystick(): JoystickState {
        return { ...this.joystick };
    }

    /** Raw screen coordinates of the finger/mouse currently pressed, or null. */
    getPointer(): { x: number; y: number } | null {
        return this.pointerPos ? { ...this.pointerPos } : null;
    }

    // --- crank tracking (for the reeling minigame) ---------------------------
    // Updated on every pointermove (not the game loop), so fast circular motion
    // is tracked accurately. The centre of the circle is estimated by a
    // least-squares fit over recent points, so it may drift across the screen.
    private crankSamples: { x: number; y: number }[] = [];
    private crankCenter: { x: number; y: number } | null = null;
    private crankPrevAngle: number | null = null;
    private crankTotal = 0;
    private static CRANK_WINDOW = 40;

    /** Start a fresh crank measurement. */
    beginCrank(): void {
        this.crankSamples = [];
        this.crankCenter = null;
        this.crankPrevAngle = null;
        this.crankTotal = 0;
    }

    /** Signed total degrees turned since beginCrank(). */
    getCrankDegrees(): number {
        return this.crankTotal;
    }

    /** Current estimated centre of the crank circle (screen coords), or null. */
    getCrankCenter(): { x: number; y: number } | null {
        return this.crankCenter ? { ...this.crankCenter } : null;
    }

    private updateCrank(x: number, y: number): void {
        const s = this.crankSamples;
        s.push({ x, y });
        if (s.length > InputHandler.CRANK_WINDOW) s.shift();

        const c = fitCircleCenter(s);
        if (c) this.crankCenter = c;
        if (!this.crankCenter) return;

        const radius = Math.hypot(x - this.crankCenter.x, y - this.crankCenter.y);
        if (radius < 12) return; // too close to the centre to have a stable angle

        const angle = Math.atan2(y - this.crankCenter.y, x - this.crankCenter.x) * (180 / Math.PI);
        if (this.crankPrevAngle !== null) {
            let d = angle - this.crankPrevAngle;
            if (d > 180) d -= 360;
            if (d < -180) d += 360;
            if (Math.abs(d) < 90) this.crankTotal += d; // ignore centre-estimate jitter
        }
        this.crankPrevAngle = angle;
    }

    private handleKey = (e: KeyboardEvent): void => {
        const action = this.keyMap[e.code];
        if (action) this.callbacks.forEach(cb => cb(action));
    };

    private handleOrientation = (e: DeviceOrientationEvent): void => {
        const angle = screen.orientation?.angle ?? 0;

        switch (angle) {
            case 0:
                this.orientation = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
                break;
            case 90:
                this.orientation = { alpha: e.alpha, beta: -(e.gamma ?? 0), gamma: -(e.beta ?? 0) };
                break;
            case 270:
            case -90:
                this.orientation = { alpha: e.alpha, beta: e.gamma, gamma: e.beta };
                break;
            case 180:
                this.orientation = { alpha: e.alpha, beta: -(e.beta ?? 0), gamma: -(e.gamma ?? 0) };
                break;
            default:
                this.orientation = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
        }
    }

    private handleMouse = (e: MouseEvent): void => {
        const x = e.clientX / window.innerWidth;  // 0 to 1
        const y = e.clientY / window.innerHeight; // 0 to 1
        this.orientation = {
            gamma: (x - 0.5) * 180, // -90 to 90
            alpha: (y - 0.5) * 360, // -180 to 180
            beta: 0
        };
    };

    // private handlePointer = (e: PointerEvent): void => {
    //     if (this.shootCooldown) return;
    //     if (e.pointerType === "mouse" && !this.debug) return;
    //     const action = e.clientX < window.innerWidth / 2 ? "moveLeft" : "moveRight";
    //     this.callbacks.forEach(cb => cb(action));
    // };

    // private handlePointerUp = (e: PointerEvent): void => {
    //     if (this.shootCooldown) return;
    //     if (e.pointerType === "mouse" && !this.debug) return;
    //     this.shootCooldown = true;
    //     if (e.clientX < window.innerWidth / 2) {
    //         this.callbacks.forEach(cb => cb("shoot"));
    //     }
    //     setTimeout(() => { this.shootCooldown = false; }, 300);
    // };

    // how long a claimed pointer may go quiet before we assume its up/cancel
    // was dropped and let a fresh touch take over
    private static STALE_POINTER_MS = 1200;

    private handleJoystickStart = (e: PointerEvent): void => {
        // never hijack native controls (the start/stop button etc.) as a crank touch
        if ((e.target as Element | null)?.closest("button, a, input, select, textarea")) return;

        if (this.joystickPointerId !== null) {
            const stale = performance.now() - this.lastPointerActivity > InputHandler.STALE_POINTER_MS;
            if (!stale) return; // a genuinely active pointer already owns the gesture
            // the previous pointer's terminal event was likely swallowed by the
            // browser (e.g. a hijacked gesture) — release it so this touch isn't ignored
            this.releasePointer();
        }

        this.joystickPointerId = e.pointerId;
        this.joystickStartPos = { x: e.clientX, y: e.clientY };
        this.pointerPos = { x: e.clientX, y: e.clientY };
        this.lastPointerActivity = performance.now();
        this.joystick = { x: 0, y: 0, active: true };
        this.updateCrank(e.clientX, e.clientY);
        // Capture so pointermove/pointerup fire even if pointer leaves the element
        try {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {
            // pointer already released / synthetic event — safe to ignore
        }
        // Stop the browser from treating this as a scroll/zoom/selection gesture —
        // touch-action:none should already cover it, but preventDefault is a
        // synchronous guarantee that doesn't depend on compositor timing
        e.preventDefault();
        this.pressCallbacks.forEach(cb => cb());
    };

    private handleJoystickMove = (e: PointerEvent): void => {
        if (e.pointerId !== this.joystickPointerId || !this.joystickStartPos) return;
        const dx = e.clientX - this.joystickStartPos.x;
        const dy = e.clientY - this.joystickStartPos.y;
        this.pointerPos = { x: e.clientX, y: e.clientY };
        this.lastPointerActivity = performance.now();
        this.updateCrank(e.clientX, e.clientY);
        e.preventDefault();

        // Normalize to -1..1 range, clamp to circle
        this.joystick = {
            x: Math.max(-1, Math.min(1, dx / (window.innerWidth * 0.4))),
            y: Math.max(-1, Math.min(1, dy / (window.innerHeight * 0.4))),
            active: true
        };
    };

    private handleJoystickEnd = (e: PointerEvent): void => {
        if (e.pointerId !== this.joystickPointerId) return;
        this.releasePointer();
    };

    private releasePointer(): void {
        this.joystick = { x: 0, y: 0, active: false };
        this.joystickStartPos = null;
        this.joystickPointerId = null;
        this.pointerPos = null;
        this.crankPrevAngle = null; // finger lifted — don't bridge the gap on re-touch
    }

    private handleContextMenu = (e: Event): void => {
        e.preventDefault();
    };


    async requestOrientationPermission(): Promise<boolean> {
        // Only iOS Safari requires explicit permission
        if (typeof DeviceOrientationEvent !== "undefined" &&
            typeof (DeviceOrientationEvent as any).requestPermission === "function"
        ) {
            try {
                const response = await (DeviceOrientationEvent as any).requestPermission();
                return response === "granted";
            } catch (e) {
                console.warn("Permission request failed:", e);
                return false;
            }
        }
        // Android and desktop grant automatically
        return true;
    }

    // capture motion
    private motion: Motion = { x: null, y: null, z: null };

    getMotion(): Motion {
        return this.motion;
    }

    private handleMotion = (e: DeviceMotionEvent): void => {
        // accelerationIncludingGravity includes gravity (~9.8 m/s² pulling down)
        // acceleration removes gravity but may be null on some devices
        const acc = e.acceleration ?? e.accelerationIncludingGravity;
        this.motion = {
            x: acc?.x ?? null,
            y: acc?.y ?? null,
            z: acc?.z ?? null,
        };
    };

    //create and capture a baseline of motion and orientation
    private orientationBaseline: Orientation | null = null;
    private motionBaseline: Motion | null = null;

    captureBaseline(): void {
        this.orientationBaseline = { ...this.orientation };
        this.motionBaseline = { ...this.motion };
    }

    clearBaseline(): void {
        this.orientationBaseline = null;
        this.motionBaseline = null;
    }

    getRelativeState(): RelativeState | null {
        if (!this.orientationBaseline || !this.motionBaseline) return null;

        return {
            orientation: {
                alpha: this.subtractNullable(this.orientation.alpha, this.orientationBaseline.alpha),
                beta:  this.subtractNullable(this.orientation.beta,  this.orientationBaseline.beta),
                gamma: this.subtractNullable(this.orientation.gamma, this.orientationBaseline.gamma),
            },
            motion: {
                x: this.subtractNullable(this.motion.x, this.motionBaseline.x),
                y: this.subtractNullable(this.motion.y, this.motionBaseline.y),
                z: this.subtractNullable(this.motion.z, this.motionBaseline.z),
            }
        };
    }

    private subtractNullable(a: number | null, b: number | null): number | null {
        if (a === null || b === null) return null;
        return a - b;
    }
}

/**
 * Least-squares circle fit (Kåsa method) over a set of points. Returns the
 * estimated centre, or the centroid when the points are too few or near-collinear.
 */
function fitCircleCenter(pts: { x: number; y: number }[]): { x: number; y: number } | null {
    const n = pts.length;
    if (n < 3) return null;

    let sx = 0, sy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; }
    const mx = sx / n, my = sy / n; // centre the data for numerical stability

    let Suu = 0, Suv = 0, Svv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
    for (const p of pts) {
        const u = p.x - mx, v = p.y - my;
        Suu += u * u; Suv += u * v; Svv += v * v;
        Suuu += u * u * u; Svvv += v * v * v;
        Suvv += u * v * v; Svuu += v * u * u;
    }

    const det = Suu * Svv - Suv * Suv;
    if (Math.abs(det) < 1e-6) return { x: mx, y: my };

    const c1 = 0.5 * (Suuu + Suvv);
    const c2 = 0.5 * (Svvv + Svuu);
    const uc = (c1 * Svv - c2 * Suv) / det;
    const vc = (c2 * Suu - c1 * Suv) / det;

    // reject a wild fit from a shallow arc
    if (Math.hypot(uc, vc) > 800) return { x: mx, y: my };
    return { x: uc + mx, y: vc + my };
}