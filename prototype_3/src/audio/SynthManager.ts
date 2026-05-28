export type WaveType = "sine" | "square" | "sawtooth" | "triangle";

export class SynthManager {
    private ctx: AudioContext;

    constructor() {
        this.ctx = new AudioContext();
    }

    playNote(frequency: number, duration = 0.5, wave: WaveType = "sine", volume = 0.5): void {
        const oscillator = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, this.ctx.currentTime);

        // Fade out smoothly at the end to avoid clicks
        gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

        oscillator.start(this.ctx.currentTime);
        oscillator.stop(this.ctx.currentTime + duration);
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