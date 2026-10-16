import {createCampfireScene, type CampfireScene} from "./campfireScene.ts";
import {speakLine, stopSpeech} from "../speech.ts";

// The intro level ("oefenlevel"): the fisherman sits by the campfire with his
// drum and teaches the controls, one action at a time. There are no buttons —
// each part waits until the player has done what he asked. Once the beat
// starts he drums along with it (main.ts calls scene.hit() on every drum step).
// The real note placing, switching and removing is main.ts's own composer;
// this script only unlocks each control and listens for the player's actions.

/** Controls the intro unlocks one by one. */
export type IntroGate = "place" | "instrument" | "remove";
/** What the player did: a note (with the starting piano, or another instrument), a remove, a shake. */
export type IntroEvent = "place" | "placeOther" | "remove" | "shake";

export interface IntroDeps {
    stage: HTMLElement;              // layer the campfire scene is drawn in
    /** Length of one sequencer step in ms (a bar is 8 steps). */
    stepMs(): number;
    /** Start the sequencer: the drum groove (and any placed notes) start looping. */
    startBeat(): void;
    allow(gate: IntroGate): void;
    /** Lock every control again (for the final replay). */
    lock(): void;
    /** Pulse one of the bottom corner zones, or none. */
    highlight(zone: "instrument" | "remove" | null): void;
    /** Glow the top ("hoog") and bottom ("laag") edges of the note pad. */
    showPitchEdges(on: boolean): void;
    /** Play the song from the start `bars` times, then stop the sequencer. */
    replaySong(bars: number): Promise<void>;
    /** The intro is over: back to the start screen. */
    finished(): void;
}

export interface IntroLevel {
    readonly scene: CampfireScene;
    start(): void;
    /** The player did something (called by main.ts). */
    notify(event: IntroEvent): void;
    /** Debug: cut the current line short. */
    skipLine(): void;
    destroy(): void;
}

// TODO(speech): replace with recordings, like prototype 5's intro/speech.ts.
const LINES = {
    welcome:    "Oké, bij een goed vuurtje hoort ook een lekker liedje.",
    teach:      "En dat ga jij voor ons maken. Geen zorgen, ik ga het je allemaal leren.",
    instrument: "Kijk, dit is je muziekinstrument. En we gaan korte liedjes maken van een paar tellen. Ik zal je alvast een ritme geven.",
    tap:        "Oké, als je nu op het scherm drukt, dan verschijnt er een pianonoot in het liedje.",
    pitch:      "Juist! Deze noot kan hoog en laag zijn, afhankelijk van hoe hoog je op het scherm tikt.",
    more:       "Probeer maar wat meer noten toe te voegen!",
    switch:     "Juist! Nou, als je een ander instrument wil, moet je rechtsonder in de hoek klikken om te wisselen. Plaats ook wat noten met de gitaar!",
    remove:     "Kijk! Dat begint al ergens op te lijken. Als laatste kan je linksonder de laatste noot die je geplaatst hebt wissen. Probeer dat ook even!",
    shake:      "Laatste noot is gewist! Top! Als je klaar bent, schud de telefoon heen en weer. Dan is het nummer af.",
    outro:      "Dat klinkt erg goed!",
} as const;

const MORE_NOTES = 2;   // extra notes asked for after the first one
const REPLAYS = 2;      // the finished song is played this many times

export function createIntroLevel(deps: IntroDeps): IntroLevel {
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const scene = createCampfireScene(deps.stage);

    // Every action is counted, so a wait can ask for "n more since now" —
    // actions done while a line is still being spoken count as well.
    const counts: Record<IntroEvent, number> = {place: 0, placeOther: 0, remove: 0, shake: 0};
    const waiting: {event: IntroEvent; target: number; res: () => void}[] = [];

    function waitFor(event: IntroEvent, n = 1, since = counts[event]): Promise<void> {
        const target = since + n;
        if (counts[event] >= target) return Promise.resolve();
        return new Promise(res => waiting.push({event, target, res}));
    }

    function sleep(ms: number): Promise<void> {
        return new Promise(res => {
            const t = setTimeout(() => { timers.delete(t); res(); }, ms);
            timers.add(t);
        });
    }

    const say = (text: string) => speakLine(text, scene);

    async function run(): Promise<void> {
        await sleep(900); // let the scene fade in
        if (destroyed) return;
        await say(LINES.welcome);
        if (destroyed) return;
        await say(LINES.teach);
        if (destroyed) return;
        await say(LINES.instrument);
        if (destroyed) return;

        // (rhythm starts) — give the player one bar to hear it on its own
        deps.startBeat();
        await sleep(deps.stepMs() * 8);
        if (destroyed) return;

        await say(LINES.tap);
        if (destroyed) return;
        const placedBefore = counts.place;
        deps.allow("place");
        await waitFor("place", 1, placedBefore);
        if (destroyed) return;

        // the note now loops in the song; explain pitch with the edges lit
        const afterFirst = counts.place;
        deps.showPitchEdges(true);
        await say(LINES.pitch);
        if (destroyed) return;
        await say(LINES.more);
        if (destroyed) return;
        await waitFor("place", MORE_NOTES, afterFirst);
        if (destroyed) return;
        deps.showPitchEdges(false);

        deps.highlight("instrument");
        await say(LINES.switch);
        if (destroyed) return;
        const otherBefore = counts.placeOther;
        deps.allow("instrument");
        await waitFor("placeOther", 1, otherBefore);
        if (destroyed) return;

        deps.highlight("remove");
        await say(LINES.remove);
        if (destroyed) return;
        const removedBefore = counts.remove;
        deps.allow("remove");
        await waitFor("remove", 1, removedBefore);
        if (destroyed) return;
        deps.highlight(null);

        await say(LINES.shake);
        if (destroyed) return;
        await waitFor("shake");
        if (destroyed) return;

        // the song is done: play it back while he drums along
        deps.lock();
        await deps.replaySong(REPLAYS);
        if (destroyed) return;
        await say(LINES.outro);
        if (destroyed) return;
        await sleep(600);
        if (destroyed) return;
        deps.finished();
    }

    return {
        scene,
        start() { void run(); },

        notify(event) {
            if (destroyed) return;
            counts[event]++;
            for (let i = waiting.length - 1; i >= 0; i--) {
                const w = waiting[i];
                if (w.event === event && counts[event] >= w.target) {
                    waiting.splice(i, 1);
                    w.res();
                }
            }
        },

        skipLine: stopSpeech,

        destroy() {
            destroyed = true;
            stopSpeech();
            for (const t of timers) clearTimeout(t);
            timers.clear();
            // release any pending waits so the script can see it was destroyed
            for (const w of waiting.splice(0)) w.res();
            scene.destroy();
            deps.highlight(null);
            deps.showPitchEdges(false);
        },
    };
}
