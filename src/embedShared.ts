// Shared audio, speech and motion for the combined/ shell's "no tap per game"
// option. Import this FIRST in a prototype's main.ts (before howler and friends):
//
//   import "../../src/embedShared.ts";
//
// Browsers only let a page play sound, speak, or read the motion sensors (iOS)
// after the player has tapped *that* page. The shell got that tap, and the games
// run in same-origin iframes, so they can borrow the shell's already-unlocked
// AudioContext, speechSynthesis and motion events instead of needing their own
// tap. Nothing happens unless the page runs embedded with ?shared=1 and the
// shell actually offers the shared objects — standalone play is untouched.
//
// Every `new AudioContext()` in the game (including Howler's and WebAudioFont's
// users) gets the shell's context, with `destination` swapped for a per-game
// output channel. When the game ends the shell disconnects that channel, which
// silences anything the game left scheduled, in one go.

import { getEmbed, markSharedActive, onEmbedStop } from "./embed.ts";

/** What the shell puts on its window for the games to borrow. */
export interface CombinedShared {
    ctx: AudioContext;
    /** a fresh output channel for one game, connected to the speakers */
    newBus(): GainNode;
    /** the shell's motion permission request, started in its first tap ("granted" off iOS) */
    motion: Promise<"granted" | "denied">;
}

const MOTION_EVENTS = new Set(["devicemotion", "deviceorientation", "deviceorientationabsolute"]);

function install(shared: CombinedShared, parentWin: Window & typeof globalThis): void {
    const w = window as unknown as Record<string, unknown>;

    // ── Audio ────────────────────────────────────────────────────────────────
    const bus = shared.newBus();
    const real = shared.ctx;
    // A Proxy that is the shell's context except for its output, and that can't
    // close or suspend it (other games still need it).
    const borrowed = new Proxy(real, {
        get(target, prop) {
            if (prop === "destination") return bus;
            if (prop === "close" || prop === "suspend") return () => Promise.resolve();
            const value = Reflect.get(target, prop, target);
            // bind methods to the real context; leave `constructor` alone (WebAudioFont reads its name)
            return typeof value === "function" && prop !== "constructor" ? value.bind(target) : value;
        },
    });
    // `new AudioContext()` returns this object instead of a new, locked context
    const SharedAudioContext = function () { return borrowed; } as unknown as typeof AudioContext;
    w.AudioContext = SharedAudioContext;
    w.webkitAudioContext = SharedAudioContext;

    // ── Speech ───────────────────────────────────────────────────────────────
    if (parentWin.speechSynthesis) {
        Object.defineProperty(window, "speechSynthesis", { value: parentWin.speechSynthesis, configurable: true });
        w.SpeechSynthesisUtterance = parentWin.SpeechSynthesisUtterance;
    }

    // ── Motion sensors ──────────────────────────────────────────────────────
    // Listen on the shell's window (which has the permission) instead of ours.
    // They're tracked so they can be removed again: the shell's window outlives this page.
    const addListener = window.addEventListener.bind(window);
    const removeListener = window.removeEventListener.bind(window);
    const motionListeners: [string, EventListenerOrEventListenerObject, boolean | EventListenerOptions | undefined][] = [];
    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        if (MOTION_EVENTS.has(type)) {
            parentWin.addEventListener(type, listener, options);
            motionListeners.push([type, listener, options]);
        } else addListener(type, listener, options);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
        if (MOTION_EVENTS.has(type)) {
            parentWin.removeEventListener(type, listener, options);
            const i = motionListeners.findIndex(([t, l]) => t === type && l === listener);
            if (i >= 0) motionListeners.splice(i, 1);
        } else removeListener(type, listener, options);
    }) as typeof window.removeEventListener;
    const dropMotionListeners = () => {
        for (const [type, listener, options] of motionListeners.splice(0)) parentWin.removeEventListener(type, listener, options);
    };
    // the shell removes this page's iframe when the game ends; don't leave listeners behind
    addListener("pagehide", dropMotionListeners);
    // iOS asks for permission per page and only inside a tap: answer with the shell's result
    const answer = () => shared.motion;
    for (const name of ["DeviceMotionEvent", "DeviceOrientationEvent"]) {
        const Ev = w[name] as { requestPermission?: unknown } | undefined;
        if (Ev && typeof Ev.requestPermission === "function") {
            Object.defineProperty(Ev, "requestPermission", { value: answer, configurable: true });
        }
    }

    // The shell sends "stop" before removing this page: cut speech mid-sentence and
    // let go of the motion sensors. (The shell disconnects the audio bus itself.)
    onEmbedStop(() => {
        parentWin.speechSynthesis?.cancel();
        dropMotionListeners();
    });

    markSharedActive();
    console.info("[embedShared] using the shell's audio, speech and motion");
}

const embed = getEmbed();
if (embed?.shared && window.parent !== window) {
    try {
        const parentWin = window.parent as Window & typeof globalThis & { __combinedShared?: CombinedShared };
        const shared = parentWin.__combinedShared;
        if (shared?.ctx) install(shared, parentWin);
        else console.warn("[embedShared] shell offers no shared audio — falling back to the tap screen");
    } catch (err) {
        // cross-origin parent or anything unexpected: keep the normal per-game tap
        console.warn("[embedShared] could not borrow the shell's audio", err);
    }
}
