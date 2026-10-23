/// <reference types="vite/client" />
// The catalogue of games the combined shell can string together, and the
// parameters each one exposes. The editor form is generated from this list.
//
// Adding a parameter = one entry here + reading it in the prototype with the
// helpers from src/embed.ts (num / bool / str / strList / numRecord) under the same key.

import { BRIEFS } from "../../prototype_6/src/briefs.ts";

export type ProtoId = "p5" | "p6" | "p7";
export type Mode = "intro" | "game";
export type ParamValue = number | boolean | string | string[];

interface BaseParam { key: string; label: string; help?: string }
export type ParamDef =
    | BaseParam & { type: "number"; default: number; min: number; max: number }
    | BaseParam & { type: "bool"; default: boolean }
    /** option values may be numbers, so the prototype can read them with num() */
    | BaseParam & { type: "select"; default: string | number; options: { value: string | number; label: string }[] }
    /** an ordered list picked from `options`; empty = the prototype's own default */
    | BaseParam & { type: "list"; default: string[]; options: { value: string; label: string }[] };

export interface ProtoDef {
    id: ProtoId;
    name: string;
    /** the prototype's page, relative to /combined/ */
    path: string;
    params: Record<Mode, ParamDef[]>;
}

// ── Gorilla experiment ───────────────────────────────────────────────────────
// Every game has an unexpected sound, played once. The flow picks one sound for
// the whole session (or "random": the player page draws one, or none, per
// player); each game segment only switches it on or off. The prototypes still
// read `experiment` (0 = off, 1–3 = sound), which segmentUrl() fills in.

export type GorillaSound = 0 | 1 | 2 | 3;
export type GorillaChoice = GorillaSound | "random";

export const GORILLA_SOUNDS: { value: GorillaSound; label: string }[] = [
    { value: 0, label: "uit" },
    { value: 1, label: "miauw" },
    { value: 2, label: "blaf" },
    { value: 3, label: "boing" },
];

function isGorillaSound(v: unknown): v is GorillaSound {
    return v === 0 || v === 1 || v === 2 || v === 3;
}

/** The sound this player hears: "random" draws uniformly from uit/miauw/blaf/boing. */
export function resolveGorilla(choice: GorillaChoice): GorillaSound {
    return choice === "random" ? GORILLA_SOUNDS[Math.floor(Math.random() * GORILLA_SOUNDS.length)].value : choice;
}

export function gorillaLabel(sound: GorillaSound): string {
    return GORILLA_SOUNDS.find(s => s.value === sound)!.label;
}

/** Per game segment: the session's sound on/off, plus which day / song / question (1-based) it plays in. */
function experimentParams(unit: string, units: string, max: number, when: string): ParamDef[] {
    return [
        { key: "gorilla", label: "Onverwacht geluid in dit onderdeel", type: "bool", default: true, help: when },
        { key: "gorillaAt", label: `Experiment klinkt in ${unit}`, type: "number", default: 2, min: 1, max,
          help: `meer dan het aantal ${units} = klinkt nooit` },
    ];
}

export const PROTOS: ProtoDef[] = [
    {
        id: "p5",
        name: "Vissen (prototype 5)",
        path: "../prototype_5/",
        params: {
            intro: [],
            game: [
                { key: "days", label: "Aantal dagen", type: "number", default: 3, min: 1, max: 10 },
                { key: "fishFirstDay", label: "Vissen op het lijstje op dag 1", type: "number", default: 3, min: 1, max: 12 },
                { key: "maxExtraPerDay", label: "Max. extra vissen per dag", type: "number", default: 1, min: 0, max: 5,
                  help: "elke volgende dag komen er 0 t/m dit aantal bij" },
                ...experimentParams("dag", "dagen", 10, "klinkt bij de laatste vis van het lijstje"),
            ],
        },
    },
    {
        id: "p6",
        name: "Maak een sfeer (prototype 6)",
        path: "../prototype_6/",
        params: {
            intro: [
                { key: "speech", label: "Spraak (voice-over)", type: "bool", default: true },
            ],
            game: [
                { key: "songCount", label: "Aantal nummers", type: "number", default: BRIEFS.length, min: 1, max: 20 },
                { key: "briefs", label: "Opdrachten (volgorde)", type: "list", default: [],
                  options: BRIEFS.map(b => ({ value: b.id, label: b.id })),
                  help: "leeg = standaardvolgorde; de lijst herhaalt als er meer nummers zijn" },
                { key: "speech", label: "Spraak (voice-over)", type: "bool", default: true },
                { key: "randomNote", label: "Willekeurige toonhoogte bij plaatsen", type: "bool", default: false },
                ...experimentParams("nummer", "nummers", 20, "vervangt een drumslag (vanaf de 4e herhaling)"),
            ],
        },
    },
    {
        id: "p7",
        name: "Wat hoor je? (prototype 7)",
        path: "../prototype_7/",
        params: {
            intro: [],
            game: [
                { key: "questions", label: "Aantal vragen", type: "number", default: 8, min: 1, max: 30 },
                { key: "carryRatings", label: "Spelersniveau overnemen van vorige quiz", type: "bool", default: true,
                  help: "start met de ratings waarop een eerder quizdeel in deze flow eindigde" },
                ...experimentParams("vraag", "vragen", 30, "klinkt vóór de muziek"),
            ],
        },
    },
];

export const MODE_LABEL: Record<Mode, string> = { intro: "Oefenlevel", game: "Spel" };

export function protoDef(id: ProtoId): ProtoDef {
    return PROTOS.find(p => p.id === id)!;
}

// ── Flows ────────────────────────────────────────────────────────────────────
export interface Segment {
    proto: ProtoId;
    mode: Mode;
    /** shown on the segment's tap-to-start screen and spoken between segments */
    title?: string;
    params: Record<string, ParamValue>;
}

export interface Flow {
    name: string;
    /** send the player to the /survey/ page after the last segment */
    surveyAtEnd?: boolean;
    /** games borrow the shell's audio/speech/motion, so only the very first tap is needed (src/embedShared.ts) */
    sharedAudio?: boolean;
    /** the unexpected sound for the whole session; segments switch it on/off */
    gorilla?: GorillaChoice;
    segments: Segment[];
}

export function defaultParams(proto: ProtoId, mode: Mode): Record<string, ParamValue> {
    const out: Record<string, ParamValue> = {};
    for (const p of protoDef(proto).params[mode]) out[p.key] = Array.isArray(p.default) ? [...p.default] : p.default;
    return out;
}

export function segmentTitle(seg: Segment): string {
    if (seg.title?.trim()) return seg.title.trim();
    const name = protoDef(seg.proto).name.replace(/\s*\(.*\)$/, "");
    return seg.mode === "intro" ? `${name} — oefenlevel` : name;
}

/** Drop unknown segments/params so an old or hand-edited flow can't break the player. */
export function sanitizeFlow(raw: unknown): Flow | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Partial<Flow>;
    if (!Array.isArray(r.segments)) return null;
    const segments: Segment[] = [];
    // older flows chose a sound per segment (params.experiment 0–3): keep the
    // first one as the session's sound, and "on" wherever it wasn't 0
    let legacySound: GorillaSound | undefined;
    for (const s of r.segments) {
        if (!s || !PROTOS.some(p => p.id === s.proto)) continue;
        const mode: Mode = s.mode === "intro" ? "intro" : "game";
        const params = defaultParams(s.proto, mode);
        const raw: Record<string, unknown> = { ...s.params };
        if (isGorillaSound(raw.experiment)) {
            if (raw.gorilla === undefined) raw.gorilla = raw.experiment > 0;
            if (raw.experiment > 0) legacySound ??= raw.experiment;
        }
        for (const def of protoDef(s.proto).params[mode]) {
            const v = raw[def.key];
            if (v === undefined) continue;
            if (def.type === "list" ? Array.isArray(v) : typeof v === typeof def.default) params[def.key] = v as ParamValue;
        }
        segments.push({ proto: s.proto, mode, title: typeof s.title === "string" ? s.title : undefined, params });
    }
    const hadLegacy = r.segments.some(s => isGorillaSound((s as Partial<Segment> | null)?.params?.experiment));
    const gorilla: GorillaChoice = r.gorilla === "random" || isGorillaSound(r.gorilla) ? r.gorilla
        : hadLegacy ? legacySound ?? 0
        : "random";
    return {
        name: typeof r.name === "string" ? r.name : "flow",
        surveyAtEnd: !!r.surveyAtEnd,
        sharedAudio: !!r.sharedAudio,
        gorilla,
        segments,
    };
}

// ── URL encoding (UTF-8 safe base64url) ─────────────────────────────────────
export function encodeFlow(flow: Flow): string {
    const bytes = new TextEncoder().encode(JSON.stringify(flow));
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeFlow(text: string): Flow | null {
    try {
        const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        return sanitizeFlow(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
        return null;
    }
}

/** Presets committed as combined/flows/<name>.json, playable at ?flow=<name>. */
const presetModules = import.meta.glob("../flows/*.json", { eager: true, import: "default" }) as Record<string, unknown>;
export const PRESETS: Record<string, Flow> = {};
for (const [path, data] of Object.entries(presetModules)) {
    const id = path.replace(/^.*\//, "").replace(/\.json$/, "");
    const flow = sanitizeFlow(data);
    if (flow) PRESETS[id] = flow;
}

/** The game server session the shell hands to every segment; -1 / -1 when offline. */
export interface ServerSession {
    id: string | -1;
    number: number | -1;
}

/** The params a segment's game gets: its own, the gorilla `experiment` sound (0 when off), and `extra`. */
export function segmentParams(seg: Segment, sound: GorillaSound, extra: Record<string, unknown> = {}): Record<string, unknown> {
    const gorilla = "gorilla" in seg.params ? { experiment: seg.params.gorilla === true ? sound : 0 } : {};
    return { ...seg.params, ...gorilla, ...extra };
}

/**
 * The URL a segment's iframe loads. `sound` is this player's gorilla sound
 * (see resolveGorilla); `extra` adds runtime-only params (e.g. carried-over ratings);
 * `shared` makes the game borrow the shell's audio instead of showing its tap screen.
 */
export function segmentUrl(seg: Segment, session: ServerSession, sound: GorillaSound, extra: Record<string, unknown> = {}, shared = false): string {
    const q = new URLSearchParams({
        embed: "1",
        mode: seg.mode,
        title: segmentTitle(seg),
        params: JSON.stringify(segmentParams(seg, sound, extra)),
        sid: String(session.id),
        snum: String(session.number),
    });
    if (shared) q.set("shared", "1");
    return `${protoDef(seg.proto).path}?${q}`;
}
