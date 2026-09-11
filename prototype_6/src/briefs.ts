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

export type MelodicInstrument = "piano" | "guitar" | "bass";

export interface Brief {
    id: string;
    /** spoken when the brief starts, and again on a single top-right tap */
    say: string;
    /** spoken warmly when the player finishes the track */
    praise: string;
    /** semitone offsets from the root, one per pad row (low → high) */
    scale: number[];
    /** BPM the brief pulls toward (the player's tap-tempo is blended in) */
    tempo: number;
    grooveStyle: GrooveStyle;
    instrument: MelodicInstrument;
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
        say: "Maak iets vrolijks. Een liedje voor een zonnige dag.",
        praise: "Mooi! Dat klinkt lekker vrolijk.",
        scale: MAJOR_PENTATONIC, tempo: 120, grooveStyle: "backbeat",
        instrument: "piano", volume: 0.8,
    },
    {
        id: "stoer",
        say: "Maak iets stoers. Muziek voor een held.",
        praise: "Vet. Dat is echt stoer.",
        scale: MINOR_PENTATONIC, tempo: 110, grooveStyle: "syncopated",
        instrument: "guitar", volume: 0.9,
    },
    {
        id: "spannend",
        say: "Nu iets spannends. Alsof er zo iets gaat gebeuren.",
        praise: "Kippenvel! Lekker spannend.",
        scale: PHRYGIAN, tempo: 104, grooveStyle: "driving",
        instrument: "bass", volume: 0.85,
    },
    {
        id: "spookachtig",
        say: "Maak iets spookachtigs. Muziek voor een spookhuis.",
        praise: "Brr. Daar krijg ik de rillingen van.",
        scale: HARMONIC_MINOR, tempo: 88, grooveStyle: "half-time",
        instrument: "piano", volume: 0.6,
    },
    {
        id: "onderwater",
        say: "Maak muziek voor onder water. Rustig en dromerig.",
        praise: "Het klinkt of ik echt onder water zwem.",
        scale: MAJOR_PENTATONIC, tempo: 82, grooveStyle: "backbeat",
        instrument: "piano", volume: 0.55,
    },
    {
        id: "feest",
        say: "Maak feestmuziek. Iets om lekker op te dansen.",
        praise: "Feest! Iedereen gaat dansen.",
        scale: MAJOR, tempo: 132, grooveStyle: "driving",
        instrument: "guitar", volume: 1,
    },
    {
        id: "slaapliedje",
        say: "Maak een slaapliedje. Heel rustig en zacht.",
        praise: "Zo rustig. Daar word je slaperig van.",
        scale: MAJOR_PENTATONIC, tempo: 66, grooveStyle: "half-time",
        instrument: "piano", volume: 0.4,
    },
];

export function briefAt(index: number): Brief {
    return BRIEFS[index % BRIEFS.length];
}
