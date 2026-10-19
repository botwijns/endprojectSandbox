// Player view: runs a flow's segments one after another, each one the real
// prototype page in a full-screen iframe (see src/embed.ts for the other side).

import { enterFullscreen } from "../../src/fullscreen.ts";
import { segmentTitle, segmentUrl, type Flow, type ProtoId, type ServerSession } from "./segments.ts";
import { connectSession, endSession } from "./session.ts";
import { createTracker, type Tracker } from "./telemetry.ts";

/** The `prototype` column of the server's event log, per game. */
const PROTOTYPE_NAME: Record<ProtoId, string> = { p5: "prototype_5", p6: "prototype_6", p7: "prototype_7" };

interface Options {
    /** show a "Volgende" button so the researcher can skip a segment */
    skip: boolean;
}

function speak(text: string): void {
    if (typeof speechSynthesis === "undefined") return;
    try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "nl-NL";
        speechSynthesis.speak(u);
    } catch { /* no speech — the on-screen text still shows */ }
}

export function runPlayer(root: HTMLElement, flow: Flow, opts: Options): void {
    document.body.classList.add("player-mode");
    document.title = `${flow.name} — gecombineerd`;

    const screen = document.createElement("button");
    screen.type = "button";
    screen.className = "player-screen";
    const heading = document.createElement("div");
    heading.className = "big";
    const sub = document.createElement("div");
    sub.className = "sub";
    screen.append(heading, sub);

    const frame = document.createElement("iframe");
    frame.className = "player-frame";
    // no "fullscreen": the shell holds fullscreen so it survives segment changes
    frame.allow = "autoplay; accelerometer; gyroscope; magnetometer";
    frame.hidden = true;

    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "skip-btn";
    skipBtn.textContent = "Volgende ⏭";
    skipBtn.hidden = true;

    // session number, like the survey page; the games show their own copy
    const badge = document.createElement("div");
    badge.className = "session-badge";
    badge.title = "Sessienummer";
    badge.textContent = "sessie …";

    root.replaceChildren(screen, frame, skipBtn, badge);

    let index = -1;
    const results: unknown[] = [];
    let session: ServerSession = { id: -1, number: -1 };
    // the per-category ratings the last P7 quiz ended on, for the next quiz part
    let lastRatings: Record<string, number> | null = null;
    // telemetry for the whole flow, under the session above; null until it's known
    let tracker: Tracker | null = null;
    let segmentStart = 0;

    function context() {
        const seg = flow.segments[index];
        return seg
            ? { segment: index, mode: seg.mode, title: segmentTitle(seg), segmentStart }
            : { segment: -1 };
    }

    function logShell(type: string, payload: Record<string, unknown> = {}): void {
        tracker?.log("combined", type, payload, context());
    }

    // ask the server for the session right away, so it's usually ready by the first tap
    const sessionReady = connectSession().then(s => {
        session = s;
        tracker = createTracker(s);
        badge.textContent = `sessie ${s.number}`;
    });

    function show(big: string, small: string): void {
        frame.hidden = true;
        frame.src = "about:blank";
        skipBtn.hidden = true;
        heading.textContent = big;
        sub.textContent = small;
        screen.hidden = false;
    }

    function next(): void {
        index++;
        if (index >= flow.segments.length) return finish();
        const seg = flow.segments[index];
        const title = segmentTitle(seg);
        screen.hidden = true;
        frame.hidden = false;
        skipBtn.hidden = !opts.skip;
        const extra = seg.proto === "p7" && seg.mode === "game" && seg.params.carryRatings !== false && lastRatings
            ? { ratings: lastRatings }
            : {};
        frame.src = segmentUrl(seg, session, extra);
        segmentStart = Date.now();
        logShell("segment_start", { proto: seg.proto, mode: seg.mode, params: { ...seg.params, ...extra } });
        badge.hidden = true; // the game shows its own badge
        // the segment's own page shows the title + "tik om te beginnen"; say it too, eyes-free
        speak(index === 0
            ? `${title}. Tik op het scherm om te beginnen.`
            : `Goed gedaan! Nu: ${title}. Tik op het scherm om te beginnen.`);
    }

    function finish(): void {
        console.info("[combined] flow finished", results);
        logShell("flow_end", { segments: flow.segments.length });
        const flushed = tracker?.flush() ?? Promise.resolve();
        show("Klaar! 🎉", "Bedankt voor het spelen.");
        badge.hidden = false;
        speak("Klaar! Bedankt voor het spelen.");
        if (flow.surveyAtEnd) {
            const survey = new URL("../survey/", location.href);
            survey.searchParams.set("next", new URL("../", location.href).href);
            const api = new URLSearchParams(location.search).get("api");
            if (api) survey.searchParams.set("api", api);
            window.setTimeout(() => { location.href = survey.href; }, 3500);
        } else {
            // no survey to link answers to: the session is over (the survey page
            // forgets the id itself, after submitting) — once the last events are sent
            void flushed.finally(endSession);
        }
    }

    window.addEventListener("message", (e) => {
        if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
        const data = e.data as { source?: string; type?: string; result?: unknown };
        if (data?.source !== "combined-embed") return;
        if (data.type === "event") {
            const ev = (data as { event?: { type?: unknown; payload?: unknown; at?: unknown } }).event;
            const seg = flow.segments[index];
            if (!seg || typeof ev?.type !== "string") return;
            const payload = ev.payload && typeof ev.payload === "object" ? ev.payload as Record<string, unknown> : {};
            const at = typeof ev.at === "number" ? ev.at : Date.now();
            tracker?.log(PROTOTYPE_NAME[seg.proto], ev.type, payload, context(), at);
        } else if (data.type === "done") {
            results[index] = data.result ?? {};
            logShell("segment_done", { proto: flow.segments[index]?.proto, result: data.result ?? {} });
            void tracker?.flush();
            const ratings = (data.result as { ratings?: unknown } | undefined)?.ratings;
            if (flow.segments[index]?.proto === "p7" && ratings && typeof ratings === "object") {
                lastRatings = ratings as Record<string, number>;
            }
            console.info(`[combined] segment ${index + 1} done`, data.result);
            next();
        }
    });

    skipBtn.addEventListener("click", () => {
        results[index] = { skipped: true };
        logShell("segment_skipped", { proto: flow.segments[index]?.proto });
        next();
    });

    // the first tap is the shell's own user gesture: fullscreen + speech unlock
    show(flow.name, `${flow.segments.length} onderdelen · tik op het scherm om te beginnen`);
    screen.addEventListener("click", function start() {
        if (index !== -1) return;
        screen.removeEventListener("click", start);
        void enterFullscreen();
        // the shared fullscreen toggle would sit on top of the game's tap zones
        document.body.classList.add("playing");
        sub.textContent = "verbinden…";
        // waits at most connectSession()'s timeout; offline → -1 / -1
        void sessionReady.then(() => {
            logShell("flow_start", {
                flow: flow.name,
                segments: flow.segments.map(seg => ({ proto: seg.proto, mode: seg.mode, title: segmentTitle(seg) })),
            });
            next();
        });
    });
}
