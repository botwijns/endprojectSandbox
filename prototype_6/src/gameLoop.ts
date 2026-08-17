type TickFn = (dt: number) => void;

export class GameLoop {
    private intervalId: number | null = null;
    private last = 0;
    private readonly onTick: TickFn;

    constructor(onTick: TickFn) {
        this.onTick = onTick;
    }

    start(intervalMs = 100): void {
        this.last = performance.now();
        this.intervalId = window.setInterval(() => {
            const now = performance.now();
            const dt = (now - this.last) / 1000;
            this.last = now;
            this.onTick(dt);
        }, intervalMs);
    }

    stop(): void {
        if (this.intervalId !== null) window.clearInterval(this.intervalId);
    }
}