// Player view: runs a flow's segments one after another, each one the real
// prototype page in a full-screen iframe (see src/embed.ts for the other side).

import { enterFullscreen } from "../../src/fullscreen.ts";
import { preloadFonts } from "../../src/fonts.ts";
import { FONT_VARIABLES as P5_FONTS } from "../../prototype_5/src/audio/InstrumentManager.ts";
import { FONT_VARS as P6_FONTS } from "../../prototype_6/src/fonts.ts";
import { FONT_VARS as P7_FONTS } from "../../prototype_7/src/fonts.ts";
import { gorillaLabel, resolveGorilla, segmentParams, segmentTitle, segmentUrl, type Flow, type ProtoId, type ServerSession } from "./segments.ts";
import { connectSession, endSession } from "./session.ts";
import { createTracker, type Tracker } from "./telemetry.ts";
import { unlockSharedAudio, type SharedAudio } from "./sharedAudio.ts";

/** The `prototype` column of the server's event log, per game. */
const PROTOTYPE_NAME: Record<ProtoId, string> = { p5: "prototype_5", p6: "prototype_6", p7: "prototype_7" };

/** The WebAudioFont instruments each game plays, preloaded once for the whole flow. */
const PROTOTYPE_FONTS: Record<ProtoId, readonly string[]> = {
    p5: P5_FONTS,
    p6: Object.values(P6_FONTS),
    p7: Object.values(P7_FONTS),
};

/** Played between two games, so the player "walks" from one to the next. */
const FOOTSTEPS_URL = `${import.meta.env.BASE_URL}sounds/footsteps.mp3`;
/** Fallback if the footsteps can't play or never report their end (the file is ~5.6 s). */
const WALK_MAX_MS = 8000;

interface Options {
    /** show a "Volgende" button so the researcher can skip a segment */
    skip: boolean;
}

let speechTimer = 0;

/**
 * Stop the shell's own announcement. Only when it's actually talking: an extra
 * cancel() would also cut off a game's speech (same origin, one Chrome queue).
 */
function stopSpeech(): void {
    window.clearTimeout(speechTimer);
    if (typeof speechSynthesis === "undefined") return;
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
}

/** Speak; `then` runs when it's done — or after `maxMs`, if speech is missing or never ends. */
function speak(text: string, then?: () => void, maxMs = 6000): void {
    let called = false;
    const done = () => { if (!called) { called = true; then?.(); } };
    if (then) window.setTimeout(done, maxMs);
    if (typeof speechSynthesis === "undefined") return done();
    stopSpeech();
    // Chrome tends to drop an utterance spoken right after cancel(): let it settle
    speechTimer = window.setTimeout(() => {
        try {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = "nl-NL";
            u.onend = done;
            u.onerror = done;
            speechSynthesis.speak(u);
        } catch { done(); /* no speech — the on-screen text still shows */ }
    }, 120);
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
    // the shell holds fullscreen so it survives segment changes. Same-origin
    // frames may go fullscreen by default, and a game doing so would hand
    // fullscreen to this iframe — then lose it when the next segment replaces it.
    frame.allow = "autoplay; accelerometer; gyroscope; magnetometer; fullscreen 'none'";
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

    // black cover over the game / the in-between screens, so players can't look
    // for hints; pointer-events: none lets taps through to the game underneath
    const blackout = document.createElement("div");
    blackout.className = "blackout";
    blackout.hidden = true;

    root.replaceChildren(screen, frame, blackout, skipBtn, badge);

    let index = -1;
    const results: unknown[] = [];
    let session: ServerSession = { id: -1, number: -1 };
    // the per-category ratings the last P7 quiz ended on, for the next quiz part
    let lastRatings: Record<string, number> | null = null;
    // set on the first tap when the flow uses shared audio (no tap per game)
    let shared: SharedAudio | null = null;
    // one unexpected sound for every game in this run ("random" draws it here, per player)
    const sound = resolveGorilla(flow.gorilla ?? "random");
    console.info(`[combined] gorilla sound: ${gorillaLabel(sound)}${flow.gorilla === "random" ? " (willekeurig)" : ""}`);
    // telemetry for the whole flow, under the session above; null until it's known
    let tracker: Tracker | null = null;
    let segmentStart = 0;
    // true while the footsteps play between two segments
    let walking = false;
    const footsteps = new Audio(FOOTSTEPS_URL);
    footsteps.preload = "auto";

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

    // every instrument the flow needs, loaded + decoded once; each game's page
    // takes these instead of loading its own (src/fonts.ts)
    let fontProgress = 0;
    const loadingText = () => `instrumenten laden… ${Math.round(fontProgress * 100)}%`;
    const fontsReady = preloadFonts(
        [...new Set(flow.segments.map(seg => seg.proto))].flatMap(proto => PROTOTYPE_FONTS[proto]),
        (done) => {
            fontProgress = done;
            if (index === -1 && sub.dataset.loading) sub.textContent = loadingText();
        },
    );

    /** Silence the current game's speech before its page is replaced (see stopSpeech()). */
    function stopFrameSpeech(): void {
        try {
            const synth = (frame.contentWindow as (Window & typeof globalThis) | null)?.speechSynthesis;
            if (synth && (synth.speaking || synth.pending)) synth.cancel();
        } catch { /* about:blank / not loaded yet */ }
    }

    function show(big: string, small: string): void {
        stopFrameSpeech();
        stopSpeech();
        frame.hidden = true;
        frame.src = "about:blank";
        skipBtn.hidden = true;
        heading.textContent = big;
        sub.textContent = small;
        screen.hidden = false;
        // black between games (walk, announcement) — not on the first tap screen or at the end
        blackout.hidden = !(flow.blackoutBetween && index >= 0 && index < flow.segments.length);
        if (!blackout.hidden) badge.hidden = false;
    }

    /** Stop the current game and silence it: its own stopGame(), then cut its audio bus. */
    function endSegment(): void {
        frame.contentWindow?.postMessage({ source: "combined-shell", type: "stop" }, location.origin);
        // the game's stopGame() handles what it knows about; the bus catches the rest
        shared?.silence();
    }

    /** Leaves the current segment: walks to the next game if there is one, else finishes. */
    function advance(): void {
        if (walking) return;
        endSegment();
        if (index < 0 || index + 1 >= flow.segments.length) return next();
        walking = true;
        show("🚶", "Op weg naar het volgende spel…");
        logShell("walk_start");
        let timer = 0;
        const arrive = () => {
            if (!walking) return;
            walking = false;
            window.clearTimeout(timer);
            footsteps.removeEventListener("ended", arrive);
            footsteps.removeEventListener("error", arrive);
            footsteps.pause();
            next();
        };
        timer = window.setTimeout(arrive, WALK_MAX_MS);
        footsteps.addEventListener("ended", arrive);
        footsteps.addEventListener("error", arrive);
        footsteps.currentTime = 0;
        footsteps.play().catch(arrive);
    }

    function next(): void {
        index++;
        if (index >= flow.segments.length) return finish();
        const seg = flow.segments[index];
        const title = segmentTitle(seg);
        const extra = seg.proto === "p7" && seg.mode === "game" && seg.params.carryRatings !== false && lastRatings
            ? { ratings: lastRatings }
            : {};
        const url = segmentUrl(seg, session, sound, extra, shared !== null);
        const lead = index === 0 ? "" : "Goed gedaan! Nu: ";
        const load = () => {
            screen.hidden = true;
            frame.hidden = false;
            blackout.hidden = !seg.blackout;
            skipBtn.hidden = !opts.skip;
            stopFrameSpeech();
            frame.src = url;
            segmentStart = Date.now();
            logShell("segment_start", { proto: seg.proto, mode: seg.mode, params: segmentParams(seg, sound, extra) });
            // the game shows its own badge — unless it's blacked out, then show ours on top
            badge.hidden = !seg.blackout;
        };

        if (shared) {
            // no tap screen in the game: announce it here, then load it once that's been said
            const myIndex = index;
            show(title, "");
            skipBtn.hidden = !opts.skip;
            // speak(`${lead}${title}.`, () => { if (myIndex === index && !walking) load(); });
            return;
        }
        load();
        // the segment's own page shows the title + "tik om te beginnen"; say it too, eyes-free
        // speak(`${lead}${title}. Tik op het scherm om te beginnen.`);
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
        if (data.type === "start") {
            // the game's start tap also activates this page: win fullscreen back
            // if the player left it (e.g. the Android back gesture)
            void enterFullscreen();
        } else if (data.type === "event") {
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
            advance();
        }
    });

    skipBtn.addEventListener("click", () => {
        if (walking) return;
        results[index] = { skipped: true };
        logShell("segment_skipped", { proto: flow.segments[index]?.proto });
        advance();
    });

    // the first tap is the shell's own user gesture: fullscreen + speech unlock
    show(flow.name, `${flow.segments.length} onderdelen · tik op het scherm om te beginnen`);
    screen.addEventListener("click", function start() {
        if (index !== -1) return;
        screen.removeEventListener("click", start);
        void enterFullscreen();
        // unlock audio, speech and motion here, inside the tap, for the games to borrow
        if (flow.sharedAudio) {
            shared = unlockSharedAudio();
            // speak("Daar gaan we.");
        }
        // the shared fullscreen toggle would sit on top of the game's tap zones
        document.body.classList.add("playing");
        sub.dataset.loading = "1";
        sub.textContent = loadingText();
        // waits at most connectSession()'s timeout; offline → -1 / -1
        void Promise.all([sessionReady, fontsReady]).then(() => {
            delete sub.dataset.loading;
            logShell("flow_start", {
                flow: flow.name,
                gorilla: gorillaLabel(sound),
                gorillaRandom: flow.gorilla === "random",
                segments: flow.segments.map(seg => ({ proto: seg.proto, mode: seg.mode, title: segmentTitle(seg) })),
            });
            next();
        });
    });
}
