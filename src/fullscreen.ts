// Shared fullscreen toggle for every prototype: a small button in the top-right
// corner that switches the page in and out of fullscreen. Importing this module
// is all a prototype needs to do.
//
// The button is marked data-ui and swallows its own pointer events, so tapping
// it never reaches the games' tap-anywhere input handlers.
//
// iPhone Safari has no Fullscreen API for pages, so the button is not shown
// there; adding the page to the home screen gives fullscreen instead (see the
// apple-mobile-web-app-capable meta tag in each index.html).

type FullscreenDoc = Document & {
    webkitFullscreenEnabled?: boolean;
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenEl = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
};

const doc = document as FullscreenDoc;

function isSupported(): boolean {
    return Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
    return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export async function enterFullscreen(): Promise<void> {
    if (!isSupported() || isFullscreen()) return;
    const el = document.documentElement as FullscreenEl;
    try {
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
        else await el.webkitRequestFullscreen?.();
    } catch {
        // refused (e.g. not triggered by a user gesture) — just stay windowed
    }
}

export async function exitFullscreen(): Promise<void> {
    if (!isFullscreen()) return;
    try {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
    } catch {
        // already left fullscreen
    }
}

export function toggleFullscreen(): Promise<void> {
    return isFullscreen() ? exitFullscreen() : enterFullscreen();
}

const ICON_ENTER =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
const ICON_EXIT =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>';

const STYLE = `
#fullscreen-btn {
  position: fixed; top: 6px; right: 6px; z-index: 1000;
  width: 40px; height: 40px; padding: 7px; margin: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px; border: 1px solid rgb(0 0 0 / 0.3);
  background: rgb(255 255 255 / 0.85); color: #111; cursor: pointer;
  touch-action: manipulation;
}
#fullscreen-btn svg {
  width: 100%; height: 100%;
  fill: none; stroke: currentColor; stroke-width: 2.2;
  stroke-linecap: round; stroke-linejoin: round;
}
`;

function mount(): void {
    if (!isSupported() || document.getElementById("fullscreen-btn")) return;

    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.id = "fullscreen-btn";
    btn.type = "button";
    btn.dataset.ui = "";

    const render = () => {
        const on = isFullscreen();
        btn.innerHTML = on ? ICON_EXIT : ICON_ENTER;
        btn.title = on ? "Volledig scherm sluiten" : "Volledig scherm";
        btn.setAttribute("aria-label", btn.title);
    };
    render();

    // keep taps on the button out of the games' own pointer handlers
    for (const type of ["pointerdown", "pointerup", "touchstart", "touchend"] as const) {
        btn.addEventListener(type, (e) => e.stopPropagation());
    }
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        // drop focus so the space bar (a game key in some prototypes) doesn't re-toggle
        btn.blur();
        void toggleFullscreen();
    });

    document.addEventListener("fullscreenchange", render);
    document.addEventListener("webkitfullscreenchange", render);
    document.body.appendChild(btn);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
    mount();
}
