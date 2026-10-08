/// <reference types="vite/client" />
// The catalogue of games the combined shell can string together, and the
// parameters each one exposes. The editor form is generated from this list.
//
// Adding a parameter = one entry here + reading it in the prototype with the
// helpers from src/embed.ts (num / bool / str / strList) under the same key.

import { BRIEFS } from "../../prototype_6/src/briefs.ts";

export type ProtoId = "p5" | "p6" | "p7";
export type Mode = "intro" | "game";
export type ParamValue = number | boolean | string | string[];

interface BaseParam { key: string; label: string; help?: string }
export type ParamDef =
    | BaseParam & { type: "number"; default: number; min: number; max: number }
    | BaseParam & { type: "bool"; default: boolean }
    | BaseParam & { type: "select"; default: string; options: { value: string; label: string }[] }
    /** an ordered list picked from `options`; empty = the prototype's own default */
    | BaseParam & { type: "list"; default: string[]; options: { value: string; label: string }[] };

export interface ProtoDef {
    id: ProtoId;
    name: string;
    /** the prototype's page, relative to /combined/ */
    path: string;
    params: Record<Mode, ParamDef[]>;
}

export const PROTOS: ProtoDef[] = [
    {
        id: "p5",
        name: "Vissen (prototype 5)",
        path: "../prototype_5/",
        params: {
            intro: [],
            game: [
                { key: "fishToCatch", label: "Aantal vissen te vangen", type: "number", default: 5, min: 1, max: 5,
                  help: "verschillende instrumenten (max. 5)" },
                { key: "maxStrikes", label: "Max. keer drums", type: "number", default: 3, min: 1, max: 10 },
                { key: "onFail", label: "Bij te vaak drums", type: "select", default: "retry", options: [
                    { value: "retry", label: "opnieuw proberen" },
                    { value: "continue", label: "door naar volgende spel" },
                ] },
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
    for (const s of r.segments) {
        if (!s || !PROTOS.some(p => p.id === s.proto)) continue;
        const mode: Mode = s.mode === "intro" ? "intro" : "game";
        const params = defaultParams(s.proto, mode);
        for (const def of protoDef(s.proto).params[mode]) {
            const v = s.params?.[def.key];
            if (v === undefined) continue;
            if (def.type === "list" ? Array.isArray(v) : typeof v === typeof def.default) params[def.key] = v;
        }
        segments.push({ proto: s.proto, mode, title: typeof s.title === "string" ? s.title : undefined, params });
    }
    return { name: typeof r.name === "string" ? r.name : "flow", surveyAtEnd: !!r.surveyAtEnd, segments };
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

/** The URL a segment's iframe loads. */
export function segmentUrl(seg: Segment): string {
    const q = new URLSearchParams({
        embed: "1",
        mode: seg.mode,
        title: segmentTitle(seg),
        params: JSON.stringify(seg.params),
    });
    return `${protoDef(seg.proto).path}?${q}`;
}
