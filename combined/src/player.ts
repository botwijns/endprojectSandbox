// Player view: runs a flow's segments one after another, each one the real
// prototype page in a full-screen iframe (see src/embed.ts for the other side).

import { enterFullscreen } from "../../src/fullscreen.ts";
import { segmentTitle, segmentUrl, type Flow } from "./segments.ts";

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

    root.replaceChildren(screen, frame, skipBtn);

    let index = -1;
    const results: unknown[] = [];

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
        frame.src = segmentUrl(seg);
        // the segment's own page shows the title + "tik om te beginnen"; say it too, eyes-free
        speak(index === 0
            ? `${title}. Tik op het scherm om te beginnen.`
            : `Goed gedaan! Nu: ${title}. Tik op het scherm om te beginnen.`);
    }

    function finish(): void {
        console.info("[combined] flow finished", results);
        show("Klaar! 🎉", "Bedankt voor het spelen.");
        speak("Klaar! Bedankt voor het spelen.");
        if (flow.surveyAtEnd) {
            const survey = new URL("../survey/", location.href);
            survey.searchParams.set("next", new URL("../", location.href).href);
            window.setTimeout(() => { location.href = survey.href; }, 3500);
        }
    }

    window.addEventListener("message", (e) => {
        if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
        const data = e.data as { source?: string; type?: string; result?: unknown };
        if (data?.source !== "combined-embed") return;
        if (data.type === "done") {
            results[index] = data.result ?? {};
            console.info(`[combined] segment ${index + 1} done`, data.result);
            next();
        }
    });

    skipBtn.addEventListener("click", () => { results[index] = { skipped: true }; next(); });

    // the first tap is the shell's own user gesture: fullscreen + speech unlock
    show(flow.name, `${flow.segments.length} onderdelen · tik op het scherm om te beginnen`);
    screen.addEventListener("click", function start() {
        if (index !== -1) return;
        screen.removeEventListener("click", start);
        void enterFullscreen();
        // the shared fullscreen toggle would sit on top of the game's tap zones
        document.body.classList.add("playing");
        next();
    });
}
