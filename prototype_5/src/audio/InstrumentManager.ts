import WebAudioFontPlayer from "webaudiofont";

export interface DrumHit {
    variable: string;
    pitch: number;
}

export interface InstrumentDef {
    id: string;
    label: string;
    /** webaudiofont sound file, relative to /public */
    file: string;
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
    /** for the drum trap: which kit piece plays on each melody step */
    kit?: DrumHit[];
}

// Instrument samples shipped in /public/fonts (GeneralUserGS + Chaos soundfonts,
// shared with the other prototypes). Loading them locally means no network and
// no external dependency.
const FONTS = `${import.meta.env.BASE_URL}fonts/`;

const KICK = "_drum_36_1_Chaos_sf2_file";
const SNARE = "_drum_38_1_Chaos_sf2_file";

export const INSTRUMENTS: InstrumentDef[] = [
    {
        id: "piano", label: "Piano", isDrum: false,
        file: FONTS + "0000_GeneralUserGS_sf2_file.js", variable: "_tone_0000_GeneralUserGS_sf2_file",
        melody: [60, 62, 64, 65, 67], noteDur: 0.26, volume: 0.7,
    },
    {
        id: "violin", label: "Viool", isDrum: false,
        file: FONTS + "0040_GeneralUserGS_sf2_file.js", variable: "_tone_0040_GeneralUserGS_sf2_file",
        melody: [69, 71, 72, 74, 76, 74], noteDur: 0.26, volume: 0.7,
    },
    {
        id: "guitar", label: "Gitaar", isDrum: false,
        file: FONTS + "0241_GeneralUserGS_sf2_file.js", variable: "_tone_0241_GeneralUserGS_sf2_file",
        melody: [55, 59, 62, 67, 62, 59], noteDur: 0.22, volume: 0.8,
    },
    {
        id: "bass", label: "Bas", isDrum: false,
        file: FONTS + "0321_GeneralUserGS_sf2_file.js", variable: "_tone_0321_GeneralUserGS_sf2_file",
        melody: [40, 43, 45, 47, 43], noteDur: 0.3, volume: 0.85,
    },
    {
        id: "steelpan", label: "Steeldrum", isDrum: false,
        file: FONTS + "1140_Chaos_sf2_file.js", variable: "_tone_1140_Chaos_sf2_file",
        melody: [72, 76, 79, 76, 72, 74], noteDur: 0.24, volume: 0.7,
    },
    {
        // the trap — a flat kick/snare backbeat, obviously not a melody
        id: "drums", label: "Drums", isDrum: true,
        file: FONTS + "12838_1_Chaos_sf2_file.js", variable: SNARE,
        melody: [0, 0, 0, 0], noteDur: 0.22, volume: 0.9,
        kit: [
            { variable: KICK, pitch: 36 },
            { variable: SNARE, pitch: 38 },
            { variable: KICK, pitch: 36 },
            { variable: SNARE, pitch: 38 },
        ],
    },
];

// every distinct sound file that has to be downloaded/decoded
const REQUIRED_VARIABLES: { file: string; variable: string }[] = [
    ...INSTRUMENTS.map(i => ({ file: i.file, variable: i.variable })),
    { file: FONTS + "12836_1_Chaos_sf2_file.js", variable: KICK },
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

    /** Download + decode every instrument sample. Resolves when all are ready. */
    preload(): Promise<void> {
        return new Promise((resolve) => {
            REQUIRED_VARIABLES.forEach(({ file, variable }) =>
                this.player.loader.startLoad(this.ctx, file, variable));
            this.player.loader.waitLoad(() => {
                this.ready = true;
                resolve();
            });
        });
    }

    /**
     * Queue the instrument's motif starting now.
     * @returns total duration in seconds (0 if the samples aren't loaded).
     */
    playMelody(def: InstrumentDef): number {
        const start = this.ctx.currentTime;
        const steps = def.kit ? def.kit.length : def.melody.length;

        for (let i = 0; i < steps; i++) {
            const when = start + i * def.noteDur;
            if (def.kit) {
                const hit = def.kit[i];
                const preset = (window as any)[hit.variable];
                if (preset) {
                    this.player.queueWaveTable(this.ctx, this.ctx.destination, preset, when, hit.pitch, def.noteDur, def.volume);
                }
            } else {
                const preset = (window as any)[def.variable];
                if (!preset) {
                    console.warn("InstrumentManager: preset not loaded", def.variable);
                    return 0;
                }
                this.player.queueWaveTable(this.ctx, this.ctx.destination, preset, when, def.melody[i], def.noteDur * 0.95, def.volume);
            }
        }
        return steps * def.noteDur;
    }

    stopAll(): void {
        this.player.cancelQueue(this.ctx);
    }
}
