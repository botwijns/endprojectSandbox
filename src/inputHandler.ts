export type Action = "moveLeft" | "moveRight" | "interact" | "pause" |"shoot";

type ActionCallback = (action: Action) => void;
export interface Orientation {
    alpha: number | null;
    beta: number | null;  // forward/back tilt, -180 to 180
    gamma: number | null; // left/right tilt, -90 to 90
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
    private shootCooldown = false;
    constructor(debug = false) {
        this.debug = debug;
    }

    start(): void {
        window.addEventListener("keydown", this.handleKey);
        document.body.addEventListener("pointerdown", this.handlePointer);
        document.body.addEventListener("pointerup", this.handlePointerUp)
        if (this.debug){
            window.addEventListener("mousemove", this.handleMouse);
        } else{
            window.addEventListener("deviceorientation", this.handleOrientation);
        }
    }

    stop(): void {
        window.removeEventListener("keydown", this.handleKey);
        document.body.removeEventListener("pointerdown", this.handlePointer);
        document.body.removeEventListener("pointerup", this.handlePointerUp);
        if (this.debug){
            window.removeEventListener("mousemove", this.handleMouse);
        } else{
            window.removeEventListener("deviceorientation", this.handleOrientation);
        }
    }

    onAction(cb: ActionCallback): void {
        this.callbacks.push(cb);
    }


    getOrientation(): Orientation {
        return this.orientation;
    }
    private handleKey = (e: KeyboardEvent): void => {
        const action = this.keyMap[e.code];
        if (action) this.callbacks.forEach(cb => cb(action));
    };
    private handleOrientation = (e: DeviceOrientationEvent): void => {
        const angle = screen.orientation?.angle ?? 0;

        switch (angle) {
            case 0:
                // Portrait, top up — standard mapping
                this.orientation = {
                    alpha: e.alpha,
                    beta:  e.beta,
                    gamma: e.gamma,

                };
                break;

            case 90:
                // Landscape, device rotated clockwise (home button right)
                // gamma and beta swap, gamma needs to be flipped
                this.orientation = {
                    alpha: e.alpha,
                    beta:  -(e.gamma ?? 0),
                    gamma: -(e.beta ?? 0),
                };
                break;

            case 270:
            case -90:
                // Landscape, device rotated counter-clockwise (home button left)
                this.orientation = {
                    alpha: e.alpha,
                    beta:  e.gamma,
                    gamma: e.beta,
                };
                break;

            case 180:
                // Portrait, upside down
                this.orientation = {
                    alpha: e.alpha,
                    beta:  -(e.beta ?? 0),
                    gamma: -(e.gamma ?? 0),
                };
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
            alpha:  (y - 0.5) * 360, // -180 to 180
            beta: 0
        };
    };
    private handlePointer = (e: PointerEvent): void => {
        if (this.shootCooldown) return;
        if (e.pointerType === "mouse" && !this.debug) return;
        const action = e.clientX < window.innerWidth / 2 ? "moveLeft" : "moveRight";
        this.callbacks.forEach(cb => cb(action));
    };
    private handlePointerUp = (e: PointerEvent): void => {
        if (this.shootCooldown) return;
        if (e.pointerType === "mouse" && !this.debug) return;
        this.shootCooldown = true;
        if (e.clientX < window.innerWidth / 2){
            const action = "shoot"
            this.callbacks.forEach(cb => cb(action));
        }
        setTimeout(() =>{this.shootCooldown = false;}, 300);
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
}