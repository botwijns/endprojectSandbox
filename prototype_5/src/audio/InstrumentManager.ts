// @ts-ignore
import WebAudioFontPlayer from "webaudiofont";
import * as synth from "./fishSynth.ts";

/** One step of a melody: a MIDI pitch (null = rest), its length in beats and an optional velocity 0..1. */
export interface Note {
    p: number | null;
    d: number;
    v?: number;
}

export type Voice =
    /** a webaudiofont instrument playing a melody */
    | { kind: "font"; file: string; variable: string; notes: Note[]; bpm: number; legato?: number }
    /** webaudiofont drum samples: each hit picks its own kit piece (variable null = rest) */
    | { kind: "kit"; hits: { variable: string | null; p: number; d: number; v?: number }[]; bpm: number }
    /** synthesised with Web Audio (see fishSynth.ts) */
    | { kind: "synth"; play: synth.SynthVoice }
    /** a slice [start, end] in seconds of a recorded sound in /public */
    | { kind: "sample"; src: string; slice: [number, number] };

export interface FishDef {
    id: string;
    label: string;
    /** what the fish sounds like when it bites — every fish has its own timbre AND rhythm/contour */
    voice: Voice;
    /** playback volume 0..1 */
    volume: number;
}

// Instrument samples shipped in /public/fonts (GeneralUserGS + Chaos soundfonts,
// shared with the other prototypes). Loading them locally means no network and
// no external dependency. File names are <GM program><variant>.
const FONTS = `${import.meta.env.BASE_URL}fonts/`;
const SOUNDS = `${import.meta.env.BASE_URL}sounds/`;

const KICK = "_drum_36_1_Chaos_sf2_file";
const SNARE = "_drum_38_1_Chaos_sf2_file";
const HAT = "_drum_42_1_Chaos_sf2_file";
const CONGA = "_drum_64_0_Chaos_sf2_file";

const n = (p: number | null, d: number, v?: number): Note => ({p, d, v});

export const FISH: FishDef[] = [
    {
        // fanfare: short-short-LONG, upward
        id: "trumpetfish", label: "Trompetvis", volume: 0.8,
        voice: {
            kind: "font", file: FONTS + "0560_GeneralUserGS_sf2_file.js", variable: "_tone_0560_GeneralUserGS_sf2_file",
            bpm: 160, notes: [n(67, 0.5), n(67, 0.5), n(72, 1.5), n(null, 0.25), n(76, 0.5), n(79, 1.75)],
        },
    },
    {
        // fast rolling arpeggio up and back down
        id: "guitarfish", label: "Gitaarvis", volume: 0.85,
        voice: {
            kind: "font", file: FONTS + "0241_GeneralUserGS_sf2_file.js", variable: "_tone_0241_GeneralUserGS_sf2_file",
            bpm: 170, legato: 1.6,
            notes: [52, 55, 59, 64, 67, 71, 76, 71, 67, 64, 59, 55].map(p => n(p, 0.25)).concat(n(52, 1)),
        },
    },
    {
        // slow, long legato notes sliding downward
        id: "fiddlerray", label: "Vioolrog", volume: 0.75,
        voice: {
            kind: "font", file: FONTS + "0401_GeneralUserGS_sf2_file.js", variable: "_tone_0401_GeneralUserGS_sf2_file",
            bpm: 96, legato: 1.1, notes: [n(81, 1), n(79, 0.5), n(77, 0.5), n(76, 1), n(72, 1.5)],
        },
    },
    {
        // low, bouncy walking line with gaps
        id: "seabass", label: "Zeebaars", volume: 1,
        voice: {
            kind: "font", file: FONTS + "0321_GeneralUserGS_sf2_file.js", variable: "_tone_0321_GeneralUserGS_sf2_file",
            bpm: 132,
            notes: [n(40, 0.5), n(null, 0.5), n(40, 0.25), n(43, 0.25), n(45, 0.5), n(null, 0.25), n(47, 0.25), n(45, 0.5), n(40, 1)],
        },
    },
    {
        // a real fish that drums with its swim bladder — a syncopated groove
        id: "drumfish", label: "Trommelvis", volume: 0.9,
        voice: {
            kind: "kit", bpm: 130,
            hits: [
                {variable: KICK, p: 36, d: 0.75}, {variable: KICK, p: 36, d: 0.25}, {variable: SNARE, p: 38, d: 0.5},
                {variable: HAT, p: 42, d: 0.25, v: 0.6}, {variable: CONGA, p: 64, d: 0.25}, {variable: CONGA, p: 64, d: 0.25},
                {variable: KICK, p: 36, d: 0.5}, {variable: SNARE, p: 38, d: 0.25}, {variable: SNARE, p: 38, d: 0.5},
            ],
        },
    },
    { id: "hammerhead", label: "Hamerhaai", volume: 0.8, voice: {kind: "synth", play: synth.hammer} },
    { id: "sawfish", label: "Zaagvis", volume: 0.6, voice: {kind: "synth", play: synth.saw} },
    { id: "swordfish", label: "Zwaardvis", volume: 0.7, voice: {kind: "synth", play: synth.sword} },
    { id: "pufferfish", label: "Kogelvis", volume: 0.8, voice: {kind: "synth", play: synth.puffer} },
    { id: "parrotfish", label: "Papegaaivis", volume: 0.7, voice: {kind: "synth", play: synth.parrot} },
    { id: "seahorse", label: "Zeepaardje", volume: 0.9, voice: {kind: "synth", play: synth.gallop} },
    {
        // the first three croaks of the frog recording
        id: "frogfish", label: "Kikvorsvis", volume: 1,
        voice: {kind: "sample", src: SOUNDS + "frogCroak.mp3", slice: [0.15, 2.45]},
    },
];

export function fishById(id: string): FishDef | undefined {
    return FISH.find(f => f.id === id);
}

// every distinct webaudiofont file that has to be downloaded/decoded
const REQUIRED_FONTS: { file: string; variable: string }[] = [
    ...FISH.flatMap(f => f.voice.kind === "font" ? [{file: f.voice.file, variable: f.voice.variable}] : []),
    {file: FONTS + "12836_1_Chaos_sf2_file.js", variable: KICK},
    {file: FONTS + "12838_1_Chaos_sf2_file.js", variable: SNARE},
    {file: FONTS + "12842_1_Chaos_sf2_file.js", variable: HAT},
    {file: FONTS + "12864_0_Chaos_sf2_file.js", variable: CONGA},
];

export class InstrumentManager {
    private player: any;
    private ctx: AudioContext;
    private ready = false;
    private samples = new Map<string, AudioBuffer>();
    /** one output gain per playing fish — disconnecting it silences that fish at once */
    private outputs = new Set<GainNode>();
    private sources = new Set<AudioScheduledSourceNode>();

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

    /** Download + decode every instrument sample and recording. Resolves when all are ready. */
    preload(): Promise<void> {
        const fonts = new Promise<void>((resolve) => {
            REQUIRED_FONTS.forEach(({file, variable}) =>
                this.player.loader.startLoad(this.ctx, file, variable));
            this.player.loader.waitLoad(() => resolve());
        });
        const recordings = FISH.flatMap(f => f.voice.kind === "sample" ? [f.voice.src] : []).map(async src => {
            try {
                const data = await (await fetch(src)).arrayBuffer();
                this.samples.set(src, await this.ctx.decodeAudioData(data));
            } catch (e) {
                console.warn("InstrumentManager: could not load", src, e);
            }
        });
        return Promise.all([fonts, ...recordings]).then(() => { this.ready = true; });
    }

    /**
     * Play the fish's sound starting now. Melodies swell in from a distance
     * (later notes louder), like the fish swimming up to the hook.
     * @returns total duration in seconds (0 if the samples aren't loaded).
     */
    playMelody(def: FishDef): number {
        const start = this.ctx.currentTime + 0.02;
        const out = this.ctx.createGain();
        out.gain.value = def.volume;
        out.connect(this.ctx.destination);
        this.outputs.add(out);
        const track = (node: AudioScheduledSourceNode) => {
            this.sources.add(node);
            node.addEventListener("ended", () => this.sources.delete(node));
        };

        let duration = 0;
        const voice = def.voice;
        if (voice.kind === "font" || voice.kind === "kit") {
            const beat = 60 / voice.bpm;
            const steps = voice.kind === "font"
                ? voice.notes.map(note => ({...note, variable: voice.variable as string | null}))
                : voice.hits;
            let t = start;
            steps.forEach((step, i) => {
                const len = step.d * beat;
                const swell = (step.v ?? 1) * (0.45 + 0.55 * i / Math.max(1, steps.length - 1));
                const variable = step.variable;
                const preset = variable ? (window as any)[variable] : null;
                if (step.p !== null && variable) {
                    if (!preset) {
                        console.warn("InstrumentManager: preset not loaded", variable);
                    } else {
                        const hold = voice.kind === "font" ? len * (voice.legato ?? 0.95) : len;
                        this.player.queueWaveTable(this.ctx, out, preset, t, step.p, hold, swell);
                    }
                }
                t += len;
            });
            duration = t - start;
        } else if (voice.kind === "synth") {
            duration = voice.play(this.ctx, out, start, track);
        } else {
            const buffer = this.samples.get(voice.src);
            if (buffer) {
                const src = this.ctx.createBufferSource();
                src.buffer = buffer;
                src.connect(out);
                const [from, to] = voice.slice;
                src.start(start, from, to - from);
                track(src);
                duration = to - from;
            }
        }

        // drop the output once the sound is over
        setTimeout(() => {
            if (!this.outputs.has(out)) return;
            out.disconnect();
            this.outputs.delete(out);
        }, (duration + 2) * 1000);
        return duration;
    }

    stopAll(): void {
        this.player.cancelQueue(this.ctx);
        for (const s of this.sources) {
            try { s.stop(); } catch { /* not started yet / already stopped */ }
        }
        this.sources.clear();
        for (const out of this.outputs) out.disconnect();
        this.outputs.clear();
    }
}
