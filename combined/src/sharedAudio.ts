// The shell's half of the "no tap per game" option (the games' half is
// src/embedShared.ts). On the player's very first tap the shell unlocks one
// AudioContext, speech and (on iOS) the motion sensors, and puts them on
// window.__combinedShared for the game iframes to borrow.
//
// Each game asks for its own output bus (a GainNode into the speakers). When a
// game ends, silence() disconnects every bus handed out so far, which cuts off
// anything the game still had scheduled, in one step.

import type { CombinedShared } from "../../src/embedShared.ts";

type PermissionFn = { requestPermission?: () => Promise<string> };

export interface SharedAudio {
    /** disconnect every game's output bus handed out so far */
    silence(): void;
}

/** Must run synchronously inside the first tap's event handler. */
export function unlockSharedAudio(): SharedAudio {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    void ctx.resume();
    // iOS Safari: playing a (silent) buffer inside the tap is what really unlocks output
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, 22050);
    blip.connect(ctx.destination);
    blip.start(0);

    const buses: GainNode[] = [];

    // iOS: one prompt covers motion + orientation; the request has to start inside the tap.
    // Elsewhere there is nothing to ask, so it's granted straight away.
    const DME = (window as unknown as { DeviceMotionEvent?: PermissionFn }).DeviceMotionEvent;
    const DOE = (window as unknown as { DeviceOrientationEvent?: PermissionFn }).DeviceOrientationEvent;
    const motion: Promise<"granted" | "denied"> = typeof DME?.requestPermission === "function"
        ? DME.requestPermission()
            .then(r => (r === "granted" && typeof DOE?.requestPermission === "function" ? DOE.requestPermission() : r))
            .then(r => (r === "granted" ? "granted" : "denied") as "granted" | "denied")
            .catch(() => "denied" as const)
        : Promise.resolve("granted");

    const shared: CombinedShared = {
        ctx,
        newBus() {
            const bus = ctx.createGain();
            bus.connect(ctx.destination);
            buses.push(bus);
            return bus;
        },
        motion,
    };
    (window as unknown as { __combinedShared?: CombinedShared }).__combinedShared = shared;

    return {
        silence() {
            for (const bus of buses.splice(0)) {
                try { bus.disconnect(); } catch { /* already gone */ }
            }
        },
    };
}
