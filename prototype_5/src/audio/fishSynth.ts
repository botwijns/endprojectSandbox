// Synthesised fish sounds — the fish whose name suggests a noise rather than a
// melody (a hammer, a saw, a sword...). Each voice schedules its nodes on `out`
// starting at `t0` and returns how long it lasts in seconds. Every source it
// starts is handed to `track` so InstrumentManager.stopAll() can cut it off.

export type Track = (node: AudioScheduledSourceNode) => void;
export type SynthVoice = (ctx: AudioContext, out: AudioNode, t0: number, track: Track) => number;

let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBufferSourceNode {
    if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    return src;
}

/** A gain node that rises to `peak` in `attack` s and decays to silence over `decay` s. */
function envelope(ctx: AudioContext, out: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out);
    return g;
}

function sine(ctx: AudioContext, dest: AudioNode, freq: number, t: number, dur: number, track: Track, type: OscillatorType = "sine"): OscillatorNode {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur);
    track(o);
    return o;
}

function noiseBurst(ctx: AudioContext, dest: AudioNode, t: number, dur: number, track: Track): AudioBufferSourceNode {
    const n = noise(ctx);
    n.connect(dest);
    n.start(t, Math.random());
    n.stop(t + dur);
    track(n);
    return n;
}

/** Hamerhaai: a hammer on an anvil — "tok… tok… TANG". */
export const hammer: SynthVoice = (ctx, out, t0, track) => {
    const strikes = [
        { at: 0.0,  peak: 0.35, ring: 0.25 },
        { at: 0.45, peak: 0.45, ring: 0.3 },
        { at: 0.9,  peak: 0.9,  ring: 1.1 },
    ];
    for (const s of strikes) {
        const t = t0 + s.at;
        // the metal: inharmonic partials, the higher ones die out faster
        [1, 2.76, 5.4, 8.93].forEach((ratio, i) => {
            const g = envelope(ctx, out, t, s.peak / (i + 1), 0.002, s.ring / (1 + i * 0.6));
            sine(ctx, g, 620 * ratio, t, s.ring + 0.05, track);
        });
        // the impact click
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 2500;
        hp.connect(envelope(ctx, out, t, s.peak * 0.8, 0.001, 0.04));
        noiseBurst(ctx, hp, t, 0.06, track);
    }
    return 2.0;
};

/** Zaagvis: a saw going back and forth through wood. */
export const saw: SynthVoice = (ctx, out, t0, track) => {
    const stroke = 0.32;
    for (let i = 0; i < 4; i++) {
        const t = t0 + i * (stroke + 0.04);
        const push = i % 2 === 0;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
        g.gain.setValueAtTime(0.5, t + stroke - 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + stroke);
        g.connect(out);

        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1600;
        lp.connect(g);
        const o = sine(ctx, lp, push ? 170 : 250, t, stroke, track, "sawtooth");
        o.frequency.linearRampToValueAtTime(push ? 250 : 170, t + stroke);

        // the rasp of the teeth
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = push ? 3200 : 2600;
        bp.Q.value = 2;
        const rasp = ctx.createGain();
        rasp.gain.value = 0.6;
        bp.connect(rasp);
        rasp.connect(g);
        noiseBurst(ctx, bp, t, stroke, track);
    }
    return 4 * 0.36;
};

/** Zwaardvis: two swords drawn — a rising "shiiing" and a metal ring. */
export const sword: SynthVoice = (ctx, out, t0, track) => {
    for (const at of [0, 0.8]) {
        const t = t0 + at;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 6;
        bp.frequency.setValueAtTime(900, t);
        bp.frequency.exponentialRampToValueAtTime(7000, t + 0.35);
        const swoosh = ctx.createGain();
        swoosh.gain.setValueAtTime(0.0001, t);
        swoosh.gain.exponentialRampToValueAtTime(0.9, t + 0.3);
        swoosh.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
        swoosh.connect(out);
        bp.connect(swoosh);
        noiseBurst(ctx, bp, t, 0.45, track);

        const ringAt = t + 0.3;
        [2400, 3610, 5230].forEach((f, i) => {
            const g = envelope(ctx, out, ringAt, 0.18 / (i + 1), 0.005, 0.7);
            sine(ctx, g, f, ringAt, 0.8, track);
        });
    }
    return 1.9;
};

/** Kogelvis: a pufferfish blowing itself up with a wobbly whistle, then — pop! */
export const puffer: SynthVoice = (ctx, out, t0, track) => {
    const inflate = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.45, t0 + inflate);
    g.gain.setValueAtTime(0.0001, t0 + inflate + 0.01);
    g.connect(out);
    const o = sine(ctx, g, 280, t0, inflate + 0.02, track, "triangle");
    o.frequency.exponentialRampToValueAtTime(950, t0 + inflate);
    // the wobble grows as it swells
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(5, t0);
    lfo.frequency.linearRampToValueAtTime(11, t0 + inflate);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(5, t0);
    depth.gain.linearRampToValueAtTime(60, t0 + inflate);
    lfo.connect(depth);
    depth.connect(o.frequency);
    lfo.start(t0);
    lfo.stop(t0 + inflate + 0.02);
    track(lfo);

    // pop
    const tp = t0 + inflate + 0.05;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 1;
    bp.connect(envelope(ctx, out, tp, 1, 0.001, 0.08));
    noiseBurst(ctx, bp, tp, 0.1, track);
    const thump = sine(ctx, envelope(ctx, out, tp, 0.8, 0.001, 0.12), 900, tp, 0.15, track);
    thump.frequency.exponentialRampToValueAtTime(140, tp + 0.08);
    return inflate + 0.35;
};

/** Papegaaivis: a parrot's quick, high tweets. */
export const parrot: SynthVoice = (ctx, out, t0, track) => {
    // [start s, length s, from Hz, to Hz]
    const chirps: [number, number, number, number][] = [
        [0.0,  0.09, 2200, 3600],
        [0.14, 0.09, 2200, 3600],
        [0.45, 0.07, 3400, 2600],
        [0.55, 0.07, 3400, 2600],
        [0.65, 0.07, 3400, 2600],
        [0.85, 0.22, 2000, 4200],
    ];
    for (const [at, len, from, to] of chirps) {
        const t = t0 + at;
        const o = sine(ctx, envelope(ctx, out, t, 0.35, 0.01, len), from, t, len + 0.02, track);
        o.frequency.exponentialRampToValueAtTime(to, t + len);
    }
    return 1.15;
};

/** Zeepaardje: hooves — a clip-clop gallop of short wooden knocks. */
export const gallop: SynthVoice = (ctx, out, t0, track) => {
    const knock = (t: number, freq: number, peak: number) => {
        const g = envelope(ctx, out, t, peak, 0.002, 0.07);
        sine(ctx, g, freq, t, 0.1, track, "triangle");
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = freq * 2;
        bp.Q.value = 4;
        bp.connect(envelope(ctx, out, t, peak * 0.6, 0.001, 0.03));
        noiseBurst(ctx, bp, t, 0.05, track);
    };
    for (let i = 0; i < 4; i++) {
        const t = t0 + i * 0.4;
        knock(t, 1250, 0.7);
        knock(t + 0.09, 900, 0.55);
        knock(t + 0.18, 1050, 0.8);
    }
    return 4 * 0.4;
};
