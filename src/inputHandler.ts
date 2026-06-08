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


    getOrientation(): Orientation {
        return this.orientation;
    }

    getJoystick(): JoystickState {
        return { ...this.joystick };
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

    private handleJoystickStart = (e: PointerEvent): void => {
        // Only claim this pointer if no joystick is active yet
        if (this.joystickPointerId !== null) return;
        this.joystickPointerId = e.pointerId;
        this.joystickStartPos = { x: e.clientX, y: e.clientY };
        this.joystick = { x: 0, y: 0, active: true };
        // Capture so pointermove/pointerup fire even if pointer leaves the element
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    };

    private handleJoystickMove = (e: PointerEvent): void => {
        if (e.pointerId !== this.joystickPointerId || !this.joystickStartPos) return;
        const dx = e.clientX - this.joystickStartPos.x;
        const dy = e.clientY - this.joystickStartPos.y;

        // Normalize to -1..1 range, clamp to circle
        this.joystick = {
            x: Math.max(-1, Math.min(1, dx / (window.innerWidth * 0.4))),
            y: Math.max(-1, Math.min(1, dy / (window.innerHeight * 0.4))),
            active: true
        };
    };

    private handleJoystickEnd = (e: PointerEvent): void => {
        if (e.pointerId !== this.joystickPointerId) return;
        this.joystick = { x: 0, y: 0, active: false };
        this.joystickStartPos = null;
        this.joystickPointerId = null;
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