// Shared "embed mode" for prototypes that the combined/ shell strings together.
//
// The shell loads a prototype's real page in an <iframe> with
//   ?embed=1&mode=intro|game&title=...&params=<json>&sid=<id>&snum=<number>
// and waits for a "done" message. sid/snum are the game server's session id and
// display number, both -1 when the shell couldn't reach the server. Opened without ?embed, getEmbed() returns
// null and the prototype behaves exactly as it does standalone.
//
// The iframe is not granted fullscreen (allow="fullscreen 'none'": the shell
// holds it), so the prototypes' own enterFullscreen() calls quietly no-op and
// their fullscreen button hides. Instrument fonts come from the shell too (src/fonts.ts).

export type EmbedMode = "intro" | "game";

/** The game server's session for this player; both -1 when the server was unreachable. */
export interface EmbedSession {
    id: string | -1;
    number: number | -1;
}

export interface Embed {
    mode: EmbedMode;
    title: string;
    params: Record<string, unknown>;
    session: EmbedSession;
}

let cached: Embed | null | undefined;

export function getEmbed(): Embed | null {
    if (cached !== undefined) return cached;
    const q = new URLSearchParams(location.search);
    if (q.get("embed") !== "1") return (cached = null);
    let params: Record<string, unknown> = {};
    try {
        const parsed = JSON.parse(q.get("params") ?? "{}");
        if (parsed && typeof parsed === "object") params = parsed;
    } catch { /* bad params — fall back to defaults */ }
    const sid = q.get("sid");
    const snum = Number(q.get("snum"));
    return (cached = {
        mode: q.get("mode") === "intro" ? "intro" : "game",
        title: q.get("title") ?? "",
        params,
        session: {
            id: sid && sid !== "-1" ? sid : -1,
            number: Number.isInteger(snum) && snum > 0 ? snum : -1,
        },
    });
}

/** The server session handed down by the shell; -1 / -1 when not embedded or offline. */
export function getSession(): EmbedSession {
    return getEmbed()?.session ?? { id: -1, number: -1 };
}

// ── Param readers: always fall back to the prototype's own default ───────────
export function num(embed: Embed | null, key: string, fallback: number, min = -Infinity, max = Infinity): number {
    const v = embed?.params[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
}

export function bool(embed: Embed | null, key: string, fallback: boolean): boolean {
    const v = embed?.params[key];
    return typeof v === "boolean" ? v : fallback;
}

export function str<T extends string>(embed: Embed | null, key: string, fallback: T, allowed?: readonly T[]): T {
    const v = embed?.params[key];
    if (typeof v !== "string") return fallback;
    if (allowed && !allowed.includes(v as T)) return fallback;
    return v as T;
}

export function strList(embed: Embed | null, key: string): string[] | null {
    const v = embed?.params[key];
    if (!Array.isArray(v)) return null;
    const list = v.filter((x): x is string => typeof x === "string");
    return list.length > 0 ? list : null;
}

/** An object of finite numbers (e.g. per-category ratings), or null. */
export function numRecord(embed: Embed | null, key: string): Record<string, number> | null {
    const v = embed?.params[key];
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v)) if (typeof n === "number" && Number.isFinite(n)) out[k] = n;
    return Object.keys(out).length ? out : null;
}

// ── Messages to the shell ────────────────────────────────────────────────────
function post(type: string, data: Record<string, unknown> = {}): void {
    if (window.parent === window) return;
    window.parent.postMessage({ source: "combined-embed", type, ...data }, location.origin);
}

/** The gorilla experiment's sounds, by `experiment` value - 1 (0 = off). */
export const EXPERIMENT_SOUNDS = ["meow", "bark", "boing"] as const;

/**
 * Telemetry: one game event, forwarded by the shell to the game server under
 * the flow's session. Only game segments log — standalone pages and oefenlevels
 * send nothing (the shell itself logs when an oefenlevel starts and ends).
 */
export function track(type: string, payload: Record<string, unknown> = {}): void {
    if (getEmbed()?.mode !== "game") return;
    post("event", { event: { type, payload, at: Date.now() } });
}

let doneSent = false;
/** The segment is over — the shell moves on to the next one. Sent once. */
export function embedDone(result: Record<string, unknown> = {}): void {
    if (doneSent) return;
    doneSent = true;
    post("done", { result });
}

// ── Start overlay ────────────────────────────────────────────────────────────
// Each page needs its own tap to unlock audio / motion permission (a tap in the
// shell doesn't count inside the iframe), so the start screen is replaced by
// one full-screen tap target. `onStart` runs inside that user gesture.
const STYLE = `
#embed-start {
  position: fixed; inset: 0; z-index: 2000; margin: 0; border: 0; width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem;
  background: #ffffff; color: #111; font: inherit; font-family: system-ui, sans-serif;
  cursor: pointer; touch-action: manipulation; padding: 1.5rem; box-sizing: border-box;
}
#embed-start .t { font-size: clamp(1.4rem, 7vmin, 2.6rem); font-weight: 700; }
#embed-start .s { font-size: clamp(1rem, 4.5vmin, 1.5rem); color: #444; }
#embed-session {
  position: fixed; left: 50%; bottom: 4px; transform: translateX(-50%); z-index: 2001;
  padding: 1px 8px; border-radius: 6px; font: 12px system-ui, sans-serif;
  background: rgba(0, 0, 0, 0.06); color: #666; pointer-events: none;
}
`;

export function setupEmbedStart(embed: Embed, onStart: () => void): void {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.id = "embed-start";
    btn.type = "button";
    btn.dataset.ui = "";
    const t = document.createElement("div");
    t.className = "t";
    t.textContent = embed.title || (embed.mode === "intro" ? "Oefenlevel" : "Spel");
    const s = document.createElement("div");
    s.className = "s";
    s.textContent = "Tik op het scherm om te beginnen";
    btn.append(t, s);

    // keep the tap out of the games' own body-level pointer handlers
    for (const type of ["pointerdown", "pointerup", "pointermove", "touchstart", "touchend"] as const) {
        btn.addEventListener(type, (e) => e.stopPropagation());
    }
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        btn.remove();
        post("start");
        onStart();
    }, { once: true });

    // session number, like the survey page's badge; never takes taps
    const badge = document.createElement("div");
    badge.id = "embed-session";
    badge.title = "Sessienummer";
    badge.textContent = `sessie ${embed.session.number}`;
    console.info("[embed] session", embed.session);

    const mount = () => {
        document.body.append(btn, badge);
        btn.focus();
        post("ready");
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
}
