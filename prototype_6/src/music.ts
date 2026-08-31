// ── Automatic backing-track generation ───────────────────────────────────────
// Two jobs:
//   1. generateDrumPattern() — a drum groove the player composes their melody on.
//   2. generateChordProgression() — reads the melody the player has built and
//      derives a diatonic chord progression to play underneath it.
//
// Everything is diatonic to C major so it lines up with the note grid in main.ts
// (scale-degree rows 0..7 -> C D E F G A B C).

// Semitone offset of each diatonic scale degree from the root (one octave).
export const SCALE7 = [0, 2, 4, 5, 7, 9, 11];

// Roman-numeral quality label per diatonic degree, for the HUD / log.
const CHORD_NAMES = ["C", "Dm", "Em", "F", "G", "Am", "Bdim"];

/** MIDI pitch of a diatonic degree (may be negative/large — wraps octaves). */
export function degreeToSemitone(degree: number): number {
    const wrapped = ((degree % 7) + 7) % 7;
    const octave = Math.floor(degree / 7);
    return SCALE7[wrapped] + 12 * octave;
}

// ── Drums ────────────────────────────────────────────────────────────────────

export interface DrumPattern {
    kick: boolean[];
    snare: boolean[];
    hihat: boolean[];
    name: string;
}

// A handful of one-bar (8 eighth-note) grooves. One is picked at random each
// time the player starts, so the beat feels freshly generated.
const GROOVES: Array<{ name: string; kick: number[]; snare: number[]; hihat: number[] }> = [
    { name: "straight",   kick: [0, 4],       snare: [2, 6], hihat: [0, 1, 2, 3, 4, 5, 6, 7] },
    { name: "backbeat",   kick: [0, 4],       snare: [2, 6], hihat: [0, 2, 4, 6] },
    { name: "syncopated", kick: [0, 3, 4],    snare: [2, 6], hihat: [0, 2, 4, 6] },
    { name: "driving",    kick: [0, 4, 6],    snare: [2, 6], hihat: [1, 3, 5, 7] },
    { name: "half-time",  kick: [0],          snare: [4],    hihat: [0, 2, 4, 6] },
];

export function generateDrumPattern(steps: number): DrumPattern {
    const groove = GROOVES[Math.floor(Math.random() * GROOVES.length)];
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

// ── Chords ───────────────────────────────────────────────────────────────────

export interface ChordEvent {
    /** step index where this chord is struck (always a beat boundary). */
    step: number;
    /** scale degree (0..6) the chord is rooted on. */
    rootDegree: number;
    /** readable label, e.g. "Am". */
    name: string;
    /** MIDI pitches: low root + close-voiced triad in the middle register. */
    voicing: number[];
}

export interface ChordProgression {
    events: ChordEvent[];
    label: string;
}

/** Diatonic triad (root/third/fifth) rooted on `rootDegree`, voiced around C4. */
function triadVoicing(rootDegree: number): number[] {
    const bass = 48 + degreeToSemitone(rootDegree);              // C3-ish root
    const triad = [rootDegree, rootDegree + 2, rootDegree + 4]
        .map(d => 60 + degreeToSemitone(d));                     // C4-ish triad
    return [bass, ...triad];
}

/**
 * Pick the best diatonic triad for a set of melody pitch-classes.
 * Scores each of the 7 diatonic roots by how well the melody notes sit inside
 * the triad, nudged toward the harmonically common I / IV / V / vi chords.
 */
function chooseChordRoot(melodyDegrees: number[], previousRoot: number | null): number {
    if (melodyDegrees.length === 0) {
        return previousRoot ?? 0; // no melody this beat -> hold, or default to I
    }

    const commonBonus: Record<number, number> = { 0: 2, 3: 1, 4: 1, 5: 1 };
    let bestRoot = 0;
    let bestScore = -Infinity;

    for (let root = 0; root < 7; root++) {
        const chordTones = new Set([root % 7, (root + 2) % 7, (root + 4) % 7]);
        let score = commonBonus[root] ?? 0;

        for (const deg of melodyDegrees) {
            const pc = ((deg % 7) + 7) % 7;
            if (pc === root) score += 3.5;        // melody note is the chord root
            else if (chordTones.has(pc)) score += 2.5;
            else score -= 1.5;                    // non-chord tone -> clash
        }

        // Gentle "avoid repeating the same chord every beat" pressure.
        if (previousRoot !== null && root === previousRoot) score -= 0.5;

        if (score > bestScore) {
            bestScore = score;
            bestRoot = root;
        }
    }
    return bestRoot;
}

/**
 * Build a chord progression from the melody.
 *
 * @param melodyByStep  per-step list of scale-degree note values the player has
 *                      placed across every melodic track (piano / guitar / bass).
 * @param steps         steps per bar (8).
 * @param stepsPerChord how many steps each chord lasts (2 => one chord per beat).
 */
export function generateChordProgression(
    melodyByStep: number[][],
    steps: number,
    stepsPerChord = 2,
): ChordProgression {
    const hasMelody = melodyByStep.some(notes => notes.length > 0);
    if (!hasMelody) return { events: [], label: "—" };

    const events: ChordEvent[] = [];
    let previousRoot: number | null = null;

    for (let step = 0; step < steps; step += stepsPerChord) {
        // Melody notes sounding during this chord's window (plus a look-ahead of
        // one step so a note landing just after the beat still colours it).
        const window: number[] = [];
        for (let s = step; s < Math.min(steps, step + stepsPerChord + 1); s++) {
            window.push(...melodyByStep[s]);
        }

        const rootDegree = chooseChordRoot(window, previousRoot);
        previousRoot = rootDegree;

        events.push({
            step,
            rootDegree,
            name: CHORD_NAMES[rootDegree],
            voicing: triadVoicing(rootDegree),
        });
    }

    // Classic cadential tweak: if the bar would otherwise end on I, make the last
    // chord a V so the loop pulls back around to the top.
    const last = events[events.length - 1];
    if (events.length > 1 && last.rootDegree === 0) {
        last.rootDegree = 4;
        last.name = CHORD_NAMES[4];
        last.voicing = triadVoicing(4);
    }

    return { events, label: events.map(e => e.name).join(" ") };
}
