// Telemetry for a combined flow: the shell's own events plus everything the
// games send up with track() (src/embed.ts), all stored under the one game
// server session the shell got from connectSession().
//
// Events are queued and sent in small batches, one request at a time so they
// land in order. Best-effort: offline (-1) or a failed request just drops them.

import type { ServerSession } from "./segments.ts";

interface Telemetry {
    _apiBase(): string;
}

interface TelemetryEvent {
    prototype: string;
    type: string;
    payload: Record<string, unknown>;
}

/** Where in the flow an event happened; added to every event's payload. */
export interface EventContext {
    segment: number;
    mode?: string;
    title?: string;
    /** when the segment started (Date.now()), for segmentMs */
    segmentStart?: number;
}

const FLUSH_MS = 3000;
const MAX_BATCH = 50; // the server's max events per request

export interface Tracker {
    log(prototype: string, type: string, payload: Record<string, unknown>, ctx: EventContext, at?: number): void;
    flush(): Promise<void>;
}

export function createTracker(session: ServerSession): Tracker {
    const telemetry = (window as unknown as { GameTelemetry?: Telemetry }).GameTelemetry;
    const online = session.id !== -1 && !!telemetry;
    // Posts to *this* session's id directly instead of GameTelemetry.recordProgress(),
    // which looks the session up again at send time: once the flow ends the
    // shell forgets the id (endSession), and a late batch would otherwise
    // start a fresh session.
    const url = online ? `${telemetry!._apiBase()}/api/sessions/${encodeURIComponent(String(session.id))}/progress` : "";

    function send(events: TelemetryEvent[]): Promise<void> {
        return fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ events }),
            keepalive: true, // lets the last batch land while the page is being left
        }).then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); });
    }
    const queue: TelemetryEvent[] = [];
    let sending: Promise<void> = Promise.resolve();
    let timer: number | null = null;

    function flush(): Promise<void> {
        if (timer !== null) { window.clearTimeout(timer); timer = null; }
        if (!online || queue.length === 0) return sending;
        const batch = queue.splice(0, MAX_BATCH);
        sending = sending
            .then(() => send(batch))
            .catch(err => console.warn("[combined] telemetry not sent", err));
        return queue.length ? flush() : sending;
    }

    function log(prototype: string, type: string, payload: Record<string, unknown>, ctx: EventContext, at = Date.now()): void {
        const event: TelemetryEvent = {
            prototype,
            type,
            payload: {
                ...payload,
                segment: ctx.segment,
                ...(ctx.mode ? { mode: ctx.mode } : {}),
                ...(ctx.title ? { title: ctx.title } : {}),
                clientAt: new Date(at).toISOString(),
                ...(ctx.segmentStart !== undefined ? { segmentMs: at - ctx.segmentStart } : {}),
            },
        };
        console.info("[combined] event", event);
        if (!online) return;
        queue.push(event);
        if (queue.length >= MAX_BATCH) void flush();
        else if (timer === null) timer = window.setTimeout(() => { timer = null; void flush(); }, FLUSH_MS);
    }

    // last chance before the tab goes away (the request uses fetch keepalive)
    window.addEventListener("pagehide", () => { void flush(); });

    return { log, flush };
}
