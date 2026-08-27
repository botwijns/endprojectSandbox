import WebAudioFontPlayer from "webaudiofont";

export interface InstrumentDef {
    id: string;
    label: string;
    /** CDN url of the webaudiofont sound file */
    url: string;
    /** global variable the sound file defines once loaded */
    variable: string;
    /** drums must NOT be caught — tapping on them is a strike */
    isDrum: boolean;
    /** the recognisable motif this instrument always plays (MIDI pitches) */
    melody: number[];
    /** seconds per note */
    noteDur: number;
    /** playback volume 0..1 */
    volume: number;
}

const CDN = "https://surikov.github.io/webaudiofontdata/sound/";

// GM presets from the FluidR3_GM soundfont. Each instrument has its own fixed
// melody so the player learns to recognise it by ear.
export const INSTRUMENTS: InstrumentDef[] = [
    {
        id: "piano", label: "Piano", isDrum: false,
        url: CDN + "0000_FluidR3_GM_sf2_file.js", variable: "_tone_0000_FluidR3_GM_sf2_file",
        melody: [60, 62, 64, 65, 67], noteDur: 0.26, volume: 0.6,
    },
    {
        id: "guitar", label: "Gitaar", isDrum: false,
        url: CDN + "0240_FluidR3_GM_sf2_file.js", variable: "_tone_0240_FluidR3_GM_sf2_file",
        melody: [55, 59, 62, 67, 62, 59], noteDur: 0.22, volume: 0.7,
    },
    {
        id: "flute", label: "Fluit", isDrum: false,
        url: CDN + "0730_FluidR3_GM_sf2_file.js", variable: "_tone_0730_FluidR3_GM_sf2_file",
        melody: [79, 77, 76, 74, 72], noteDur: 0.24, volume: 0.7,
    },
    {
        id: "trumpet", label: "Trompet", isDrum: false,
        url: CDN + "0560_FluidR3_GM_sf2_file.js", variable: "_tone_0560_FluidR3_GM_sf2_file",
        melody: [67, 67, 72, 67, 72, 74], noteDur: 0.28, volume: 0.55,
    },
    {
        id: "violin", label: "Viool", isDrum: false,
        url: CDN + "0400_FluidR3_GM_sf2_file.js", variable: "_tone_0400_FluidR3_GM_sf2_file",
        melody: [69, 71, 72, 74, 76, 74], noteDur: 0.24, volume: 0.65,
    },
    {
        // Taiko drum (GM 116) — the trap. Tapping while this plays is a strike.
        id: "drums", label: "Drums", isDrum: true,
        url: CDN + "1160_FluidR3_GM_sf2_file.js", variable: "_tone_1160_FluidR3_GM_sf2_file",
        melody: [48, 48, 36, 48, 36, 36], noteDur: 0.2, volume: 0.8,
    },
];

export class InstrumentManager {
    private player: any;
    private ctx: AudioContext;
    private ready = false;

    constructor() {
        this.player = new WebAudioFontPlayer();
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AC();
    }

    resume(): void {
        this.ctx.resume();
    }

    isReady(): boolean {
        return this.ready;
    }

    /** Download every instrument's samples. Resolves once all are decoded. */
    preload(defs: InstrumentDef[] = INSTRUMENTS): Promise<void> {
        return new Promise((resolve) => {
            defs.forEach((d) => this.player.loader.startLoad(this.ctx, d.url, d.variable));
            this.player.loader.waitLoad(() => {
                this.ready = true;
                resolve();
            });
        });
    }

    /**
     * Queue the instrument's melody starting now.
     * @returns total melody duration in seconds (0 if the samples aren't loaded).
     */
    playMelody(def: InstrumentDef): number {
        const preset = (window as any)[def.variable];
        if (!preset) {
            console.warn("InstrumentManager: preset not loaded", def.variable);
            return 0;
        }
        const start = this.ctx.currentTime;
        def.melody.forEach((pitch, i) => {
            this.player.queueWaveTable(
                this.ctx,
                this.ctx.destination,
                preset,
                start + i * def.noteDur,
                pitch,
                def.noteDur * 0.95,
                def.volume,
            );
        });
        return def.melody.length * def.noteDur;
    }

    stopAll(): void {
        this.player.cancelQueue(this.ctx);
    }
}
