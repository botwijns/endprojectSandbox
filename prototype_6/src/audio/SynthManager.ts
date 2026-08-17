export type WaveType = "sine" | "square" | "sawtooth" | "triangle";

export class SynthManager {
    private ctx: AudioContext;
    private activeOscillators: OscillatorNode[] = [];

    constructor() {
        this.ctx = new AudioContext();
    }

    playNote(frequency: number, duration?: number, wave: WaveType = "sine", volume = 0.5): void {
        if (!isFinite(frequency) || frequency <= 0) {
            console.warn("playNote: invalid frequency", frequency);
            return;
        }

        const oscillator = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, this.ctx.currentTime);
        gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);

        oscillator.start(this.ctx.currentTime);
        this.activeOscillators.push(oscillator);

        if (duration !== undefined) {
            // Fade out smoothly at the end to avoid clicks
            gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
            oscillator.stop(this.ctx.currentTime + duration);
            // Remove from active list once it finishes
            oscillator.onended = () => {
                this.activeOscillators = this.activeOscillators.filter(o => o !== oscillator);
            };
        }
    }

    stopAll(): void {
        this.activeOscillators.forEach(oscillator => {
            oscillator.stop();
        });
        this.activeOscillators = [];
    }

    resume(): void {
        this.ctx.resume();
    }
}

export const NOTE: Record<string, number> = {
    C4:  261.63,
    D4:  293.66,
    E4:  329.63,
    F4:  349.23,
    G4:  392.00,
    GS4: 415.3,
    A4:  440.00,
    B4:  493.88,
    C5:  523.25,
};