// ── Vibe briefs ──────────────────────────────────────────────────────────────
// The "game" is a series of creative briefs: the game asks for a feeling
// ("maak iets vrolijks") and the player composes freely toward it. There is no
// right answer and no fail state — the brief quietly picks the scale, tempo,
// groove and loudness so whatever the player plays already sounds in key and on
// theme.
//
// `scale` is a list of semitone offsets from the root, one per pad row (there
// are SCALE_DEGREES rows). Keep it ordered low→high and at least SCALE_DEGREES
// long. `volume` scales every voice (0..1) so a lullaby stays soft and a party
// hits hard.

import type { GrooveStyle } from "./music.ts";
import type { BriefId } from "./voiceLines.ts";

export type MelodicInstrument =
    | "piano" | "electricPiano"
    | "distortionGuitar" | "electricBass" | "slapBass"
    | "cello" | "contrabass"
    | "trumpet"
    | "synthPad"
    | "steelDrums";

export interface Brief {
    /** also picks its spoken lines (the brief and the praise) in voiceLines.ts */
    id: BriefId;
    /** semitone offsets from the root, one per pad row (low → high) */
    scale: number[];
    /** BPM the brief pulls toward (the player's tap-tempo is blended in) */
    tempo: number;
    grooveStyle: GrooveStyle;
    /** instruments that fit this vibe; the first is the starting instrument */
    instruments: MelodicInstrument[];
    /** overall loudness for this vibe, 0..1 */
    volume: number;
}

const MAJOR            = [0, 2, 4, 5, 7, 9, 11, 12];
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];
// const MINOR            = [0, 2, 3, 5, 7, 8, 10, 12];
const MINOR_PENTATONIC = [0, 3, 5, 7, 10, 12, 15, 17];
const PHRYGIAN         = [0, 1, 3, 5, 7, 8, 10, 12]; // dark, tense
const HARMONIC_MINOR   = [0, 2, 3, 5, 7, 8, 11, 12]; // eerie, "spookachtig"

export const BRIEFS: Brief[] = [
    {
        id: "vrolijk",
        scale: MAJOR_PENTATONIC, tempo: 85, grooveStyle: "backbeat",
        instruments: ["piano", "steelDrums"], volume: 0.8,
    },
    {
        id: "stoer",
        scale: MINOR_PENTATONIC, tempo: 78, grooveStyle: "syncopated",
        instruments: ["distortionGuitar", "electricBass"], volume: 0.9,
    },
    {
        id: "spannend",
        scale: PHRYGIAN, tempo: 74, grooveStyle: "driving",
        instruments: ["cello", "contrabass"], volume: 0.85,
    },
    {
        id: "spookachtig",
        scale: HARMONIC_MINOR, tempo: 63, grooveStyle: "half-time",
        instruments: ["piano", "synthPad"], volume: 0.6,
    },
    {
        id: "onderwater",
        scale: MAJOR_PENTATONIC, tempo: 59, grooveStyle: "backbeat",
        instruments: ["electricPiano", "synthPad"], volume: 0.55,
    },
    {
        id: "feest",
        scale: MAJOR, tempo: 94, grooveStyle: "driving",
        instruments: ["trumpet", "slapBass"], volume: 1,
    },
    {
        id: "slaapliedje",
        scale: MAJOR_PENTATONIC, tempo: 47, grooveStyle: "half-time",
        instruments: ["piano", "electricPiano"], volume: 0.4,
    },
];

export function briefAt(index: number): Brief {
    return BRIEFS[index % BRIEFS.length];
}
