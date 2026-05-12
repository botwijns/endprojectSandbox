export type Action = "moveLeft" | "moveRight" | "interact" | "pause";

type ActionCallback = (action: Action) => void;

export interface Orientation {
    beta: number | null;  // forward/back tilt, -180 to 180
    gamma: number | null; // left/right tilt, -90 to 90
}
export class InputHandler {
    private callbacks: ActionCallback[] = [];
    private orientation: Orientation = {beta:null, gamma:null};
    private keyMap: Record<string, Action> = {
        ArrowLeft: "moveLeft",
        ArrowRight: "moveRight",
        Space: "interact",
        Escape: "pause",
    };

    private debug = false;

    constructor(debug = false) {
        this.debug = debug;
    }

    start(): void {
        window.addEventListener("keydown", this.handleKey);
        if (this.debug){
            window.addEventListener("mousemove", this.handleMouse);
        } else{
            window.addEventListener("deviceorientation", this.handleOrientation);
        }
    }

    stop(): void {
        window.removeEventListener("keydown", this.handleKey);
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
        this.orientation = {beta: e.beta, gamma: e.gamma};
    }

    private handleMouse = (e: MouseEvent): void => {
        const x = e.clientX / window.innerWidth;  // 0 to 1
        const y = e.clientY / window.innerHeight; // 0 to 1
        this.orientation = {
            gamma: (x - 0.5) * 180, // -90 to 90
            beta:  (y - 0.5) * 360, // -180 to 180
        };
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