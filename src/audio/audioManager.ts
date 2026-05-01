import { Howl, Howler } from "howler";

interface SoundConfig {
    src: string[];
    loop?: boolean;
    volume?: number;
    start?: number;
    end?: number;
}

export class AudioManager {
    private sounds: Map<string, Howl> = new Map();

    load(id: string, config: SoundConfig): void {
        this.sounds.set(id, new Howl({
            src: config.src,
            loop: config.loop ?? false,
            volume: config.volume ?? 1.0,
        }));
    }

    play(id: string): number | null {
        return this.sounds.get(id)?.play() ?? null;
    }

    stop(id: string): void {
        this.sounds.get(id)?.stop();
    }

    // Spatial audio — pan from -1 (left) to 1 (right)
    playAt(id: string, x: number, listenerX: number, range = 10): void {
        const sound = this.sounds.get(id);
        if (!sound) return;
        const pan = Math.max(-1, Math.min(1, (x - listenerX) / range));
        sound.stereo(pan);
        sound.play();
    }
    setPos(id: string, x: number, y: number): void {
        const sound = this.sounds.get(id);
        if (!sound) return;
        sound.pos(x, y);
    }
    setPlayerPos(x: number, y: number): void {
        Howler.pos(x, y);
    }
    setMasterVolume(v: number): void {
        Howler.volume(v);
    }

    resume(): void {
        Howler.ctx?.resume();
    }
}
// import {Howl, Howler} from "howler";
//
// const player = new Howl({})
