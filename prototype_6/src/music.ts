// ── Automatic drum-groove generation ─────────────────────────────────────────
// Builds a one-bar (8 eighth-note) drum pattern for the player to compose their
// melody on. Each vibe brief asks for a groove *style*; if none is given (or the
// name is unknown) a groove is picked at random so the beat still feels fresh.

export interface DrumPattern {
    kick: boolean[];
    snare: boolean[];
    hihat: boolean[];
    name: string;
}

// A handful of one-bar grooves. The brief names one of these by `name`.
const GROOVES = [
    { name: "straight",   kick: [0, 4],       snare: [2, 6], hihat: [0, 1, 2, 3, 4, 5, 6, 7] },
    { name: "backbeat",   kick: [0, 4],       snare: [2, 6], hihat: [0, 2, 4, 6] },
    { name: "syncopated", kick: [0, 3, 4],    snare: [2, 6], hihat: [0, 2, 4, 6] },
    { name: "driving",    kick: [0, 4, 6],    snare: [2, 6], hihat: [1, 3, 5, 7] },
    { name: "half-time",  kick: [0],          snare: [4],    hihat: [0, 2, 4, 6] },
] as const;

export type GrooveStyle = (typeof GROOVES)[number]["name"];

export function generateDrumPattern(steps: number, style?: GrooveStyle): DrumPattern {
    const groove =
        GROOVES.find(g => g.name === style) ??
        GROOVES[Math.floor(Math.random() * GROOVES.length)];
    const blank = () => Array<boolean>(steps).fill(false);
    const kick = blank();
    const snare = blank();
    const hihat = blank();

    for (const s of groove.kick)  if (s < steps) kick[s] = true;
    for (const s of groove.snare) if (s < steps) snare[s] = true;
    for (const s of groove.hihat) if (s < steps) hihat[s] = true;

    // A little humanising: ~1-in-3 chance of an extra "ghost" kick somewhere in
    // the second half so repeats of the same groove aren't identical.
    if (Math.random() < 0.34) {
        const ghost = 4 + Math.floor(Math.random() * (steps - 4));
        if (!snare[ghost]) kick[ghost] = true;
    }

    return { kick, snare, hihat, name: groove.name };
}
