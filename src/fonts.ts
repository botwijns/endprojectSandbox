// Shared WebAudioFont instrument loading for the prototypes and the combined/ shell.
//
// Every instrument is one file in the repo-root /public/fonts folder that, when run
// as a <script>, sets one global (e.g. window._tone_0000_GeneralUserGS_sf2_file).
// Decoding its samples is the slow part, and a decoded preset keeps its
// AudioBuffers on its zones (zone.buffer), which any AudioContext can play.
//
// So the combined shell loads + decodes every instrument its flow needs once, up
// front (preloadFonts), and each prototype page in its iframe takes the shell's
// decoded presets instead of loading its own (loadFonts). Standalone, loadFonts
// just loads the files itself.

// @ts-ignore — plain JS package without types
import WebAudioFontPlayer from "webaudiofont";

type Preset = { zones: { buffer?: AudioBuffer }[] };
type FontWindow = Window & { [variable: string]: unknown };

/** Where the shell keeps its "all fonts decoded" promise, for the iframes to wait on. */
const SHARED_KEY = "__combinedFontsReady";

/** The /public/fonts file that defines a font variable. */
export function fontUrl(variable: string): string {
    // _tone_0000_GeneralUserGS_sf2_file → 0000_GeneralUserGS_sf2_file.js
    // _drum_36_1_Chaos_sf2_file         → 12836_1_Chaos_sf2_file.js (drums are bank 128)
    const drum = /^_drum_(\d+)_(.+)$/.exec(variable);
    const file = drum ? `128${drum[1]}_${drum[2]}` : variable.replace(/^_tone_/, "");
    return `${import.meta.env.BASE_URL}fonts/${file}.js`;
}

/** The same-origin shell window this page is embedded in, or null. */
function shellWindow(): FontWindow | null {
    try {
        if (window.parent === window) return null;
        void window.parent.document; // throws when cross-origin
        return window.parent as unknown as FontWindow;
    } catch {
        return null;
    }
}

const scripts = new Map<string, Promise<void>>();

function loadScript(variable: string): Promise<void> {
    let p = scripts.get(variable);
    if (!p) {
        p = new Promise<void>((resolve) => {
            const s = document.createElement("script");
            s.src = fontUrl(variable);
            s.onload = () => resolve();
            s.onerror = () => { console.warn("[fonts] could not load", s.src); resolve(); };
            document.head.appendChild(s);
        });
        scripts.set(variable, p);
    }
    return p;
}

/**
 * Make every font variable available on this window: taken from the combined
 * shell when it already has it (decoded), otherwise loaded from /public/fonts.
 * Resolves once all are defined — not necessarily decoded; see decodeFonts().
 */
export async function loadFonts(variables: readonly string[]): Promise<void> {
    const win = window as unknown as FontWindow;
    const shell = shellWindow();
    if (shell) {
        try { await (shell[SHARED_KEY] as Promise<void> | undefined); } catch { /* load our own below */ }
        let adopted = 0;
        for (const v of variables) {
            if (!win[v] && shell[v]) { win[v] = shell[v]; adopted++; }
        }
        if (adopted) console.info(`[fonts] ${adopted} instrument(s) from the combined shell`);
    }
    await Promise.all(variables.filter(v => !win[v]).map(loadScript));
}

function decoded(variable: string): boolean {
    const preset = (window as unknown as FontWindow)[variable] as Preset | undefined;
    return !!preset && preset.zones.every(z => z.buffer);
}

/**
 * Decode every zone of the (loaded) presets on `ctx`; zones that already carry
 * a buffer are skipped. Resolves when all are decoded, or after `timeoutMs`.
 */
export function decodeFonts(player: any, ctx: BaseAudioContext, variables: readonly string[], timeoutMs = 20000): Promise<void> {
    const win = window as unknown as FontWindow;
    for (const v of variables) if (win[v]) player.adjustPreset(ctx, win[v]);
    const until = Date.now() + timeoutMs;
    return new Promise((resolve) => {
        const check = () => {
            if (variables.every(decoded)) return resolve();
            if (Date.now() > until) {
                console.warn("[fonts] still decoding:", variables.filter(v => !decoded(v)));
                return resolve();
            }
            window.setTimeout(check, 50);
        };
        check();
    });
}

/**
 * Combined shell: load + decode `variables` once for the whole flow. The games'
 * loadFonts() wait for this and then reuse the decoded presets.
 * `onProgress` gets the fraction (0..1) of fonts that are ready.
 */
export function preloadFonts(variables: readonly string[], onProgress?: (done: number) => void): Promise<void> {
    const unique = [...new Set(variables)];
    const win = window as unknown as FontWindow;
    // half for downloading, half for decoding
    const tick = window.setInterval(() => onProgress?.(
        (unique.filter(v => win[v]).length + unique.filter(decoded).length) / (2 * unique.length),
    ), 100);
    const ready = (async () => {
        await loadFonts(unique);
        // a suspended context decodes fine without a user gesture
        const ctx = new AudioContext();
        await decodeFonts(new WebAudioFontPlayer(), ctx, unique);
        void ctx.close(); // the decoded AudioBuffers outlive it
    })().finally(() => {
        window.clearInterval(tick);
        onProgress?.(1);
    });
    (window as unknown as FontWindow)[SHARED_KEY] = ready;
    return ready;
}
