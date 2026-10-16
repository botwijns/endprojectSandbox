// The game server session for this player: created (or resumed) once by the
// shell and handed to every segment. Both values are -1 when the server can't
// be reached, so the games always get something to show / store.
//
// Same client as the survey page (survey/main.ts): the API base comes from the
// <meta name="game-api-base"> tag in combined/index.html, or ?api=<url>.

import "../../server/public/client/game-telemetry.js";
import type { ServerSession } from "./segments.ts";

interface Telemetry {
    setApiBase(base: string): void;
    session(): Promise<{ id: string; number: number }>;
}

const OFFLINE: ServerSession = { id: -1, number: -1 };
const TIMEOUT_MS = 4000; // never keep a player waiting longer than this for the server

let pending: Promise<ServerSession> | null = null;

export function connectSession(): Promise<ServerSession> {
    if (pending) return pending;
    const telemetry = (window as unknown as { GameTelemetry?: Telemetry }).GameTelemetry;
    const api = new URLSearchParams(location.search).get("api");
    if (api) telemetry?.setApiBase(api);

    const request: Promise<ServerSession> = telemetry
        ? telemetry.session().then(s =>
            typeof s?.id === "string" && Number.isInteger(s.number) ? { id: s.id, number: s.number } : OFFLINE)
        : Promise.resolve(OFFLINE);
    const timeout = new Promise<ServerSession>(resolve => window.setTimeout(() => resolve(OFFLINE), TIMEOUT_MS));

    pending = Promise.race([request.catch(() => OFFLINE), timeout]).then(s => {
        console.info("[combined] server session", s);
        return s;
    });
    return pending;
}
