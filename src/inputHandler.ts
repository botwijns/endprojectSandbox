export type Action = "moveLeft" | "moveRight" | "interact" | "pause";

type ActionCallback = (action: Action) => void;

export class InputHandler {
    private callbacks: ActionCallback[] = [];

    private keyMap: Record<string, Action> = {
        ArrowLeft: "moveLeft",
        ArrowRight: "moveRight",
        Space: "interact",
        Escape: "pause",
    };

    start(): void {
        window.addEventListener("keydown", this.handleKey);
    }

    stop(): void {
        window.removeEventListener("keydown", this.handleKey);
    }

    onAction(cb: ActionCallback): void {
        this.callbacks.push(cb);
    }

    private handleKey = (e: KeyboardEvent): void => {
        const action = this.keyMap[e.code];
        if (action) this.callbacks.forEach(cb => cb(action));
    };
}