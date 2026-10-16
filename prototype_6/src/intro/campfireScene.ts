// The "Campfire Drummer" scene: the fisherman at a night fire with a hand drum
// on his lap, who can drum and talk at the same time. Ported from the
// standalone Campfire Drummer animation; the engine is unchanged, only the page
// chrome, the demo controls and the synthesised drum sound are gone (the
// game's own drums are the audio — main.ts calls hit() on every drum step).

export interface HitOptions {
    hand?: "left" | "right";
    zone?: "center" | "edge";
    vel?: number;
}

export interface CampfireScene {
    /** One drum strike; resolves when the hand lands. Hands alternate when `hand` is left out. */
    hit(opts?: HitOptions): Promise<void>;
    /** Mouth moves for `ms` with no text (used while a speech line plays). */
    talk(ms: number): Promise<void>;
    stopTalking(): void;
    setPaused(p: boolean): void;
    destroy(): void;
}

const SVG_MARKUP = `<svg class="campfire-svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Een visser zit 's avonds bij een kampvuur met een trommel op schoot." xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cf-skyG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#070d22"/>
      <stop offset="0.55" stop-color="#14224a"/>
      <stop offset="1" stop-color="#2c4066"/>
    </linearGradient>
    <radialGradient id="cf-moonGlow">
      <stop offset="0" stop-color="#e9efff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#e9efff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cf-lakeG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a3d63"/>
      <stop offset="1" stop-color="#0d1736"/>
    </linearGradient>
    <linearGradient id="cf-groundG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2d4231"/>
      <stop offset="1" stop-color="#16231b"/>
    </linearGradient>
    <radialGradient id="cf-glowG">
      <stop offset="0" stop-color="#ffb04a" stop-opacity="0.62"/>
      <stop offset="0.35" stop-color="#ff7a22" stop-opacity="0.26"/>
      <stop offset="1" stop-color="#ff5a10" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cf-groundGlowG"><stop offset="0" stop-color="#ff9a40" stop-opacity="0.9"/><stop offset="0.6" stop-color="#ff7a22" stop-opacity="0.35"/><stop offset="1" stop-color="#ff7a22" stop-opacity="0"/></radialGradient>
    <radialGradient id="cf-vigG" cx="0.5" cy="0.55" r="0.75">
      <stop offset="0.55" stop-color="#02050f" stop-opacity="0"/>
      <stop offset="1" stop-color="#02050f" stop-opacity="0.6"/>
    </radialGradient>
    <mask id="cf-moonMask" maskUnits="userSpaceOnUse" x="600" y="30" width="110" height="100">
      <rect x="600" y="30" width="110" height="100" fill="#fff"/>
      <circle cx="665" cy="72" r="17" fill="#000"/>
    </mask>
    <clipPath id="cf-farClip"><rect x="196" y="200" width="300" height="200"/></clipPath>
    <g id="cf-hillsG">
      <path d="M0 246 C50 232 110 226 170 236 C230 246 270 228 340 226 C400 224 430 240 480 250 C520 258 540 256 580 255 C620 254 660 236 720 226 C760 220 780 226 800 232 L800 266 L0 266Z" fill="#16264d"/>
      <path d="M0 258 C70 246 130 252 200 256 C280 260 330 246 400 250 C470 254 520 262 600 260 C680 258 740 246 800 250 L800 266 L0 266Z" fill="#101d40"/>
    </g>
  </defs>

  <rect x="0" y="0" width="800" height="270" fill="url(#cf-skyG)"/>
  <g data-id="stars" fill="#ffffff"></g>
  <circle cx="655" cy="78" r="70" fill="url(#cf-moonGlow)"/>
  <circle cx="655" cy="78" r="21" fill="#f3eed8" mask="url(#cf-moonMask)"/>

  <use href="#cf-hillsG"/>

  <rect x="0" y="264" width="800" height="72" fill="url(#cf-lakeG)"/>
  <g data-id="moonRef" fill="#dfe8ff"></g>
  <g data-id="shimmer"></g>

  <path d="M0 332 C150 325 300 329 480 333 C640 337 740 331 800 327 L800 450 L0 450Z" fill="url(#cf-groundG)"/>
  <path d="M0 332 C150 325 300 329 480 333 C640 337 740 331 800 327" fill="none" stroke="#5f7d62" stroke-width="2" opacity="0.7"/>

  <g data-id="bigPines" fill="#06101f"></g>

  <g>
    <path d="M64 346 L60 296 M60 296 L53 287 M60 296 L67 286" stroke="#4a3322" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <line x1="84" y1="338" x2="74" y2="314" stroke="#5a3b24" stroke-width="6" stroke-linecap="round"/>
    <line x1="74" y1="314" x2="20" y2="190" stroke="#1d2327" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M20 190 Q13 214 22 238" fill="none" stroke="#2f4147" stroke-width="1" opacity="0.8"/>
    <ellipse cx="22" cy="242" rx="3.4" ry="5" fill="#d9381e"/>
  </g>

  <g transform="translate(14 336)">
    <rect width="36" height="20" rx="3" fill="#2f6f77"/>
    <rect y="8" width="36" height="2" fill="#1c474d"/>
    <rect x="15" y="-5" width="6" height="5" rx="1.5" fill="none" stroke="#1c474d" stroke-width="2"/>
    <rect x="15" y="7" width="6" height="4" fill="#d9a441"/>
  </g>

  <g>
    <rect x="116" y="320" width="100" height="24" rx="11" fill="#6d4b34"/>
    <path d="M130 326 q10 3 22 0 M160 336 q12 3 26 0 M190 327 q8 2 18 0" stroke="#573a27" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="118" cy="332" rx="7" ry="12" fill="#8a6444"/>
    <ellipse cx="118" cy="332" rx="3.5" ry="6.5" fill="none" stroke="#6d4b34" stroke-width="1.2"/>
  </g>

  <ellipse cx="410" cy="368" rx="64" ry="14" fill="#0e1510" opacity="0.7"/>
  <g data-id="stonesBack"></g>
  <g transform="translate(410 364) rotate(-13)">
    <rect x="-38" y="-5.5" width="76" height="11" rx="5.5" fill="#4a2d1a"/>
    <ellipse cx="38" cy="0" rx="3.2" ry="5.5" fill="#6d4b34"/>
  </g>
  <g transform="translate(410 365) rotate(11)">
    <rect x="-38" y="-5.5" width="76" height="11" rx="5.5" fill="#5a3a24"/>
    <ellipse cx="-38" cy="0" rx="3.2" ry="5.5" fill="#7a5436"/>
  </g>
  <g data-id="stonesFront"></g>

  <g>
    <path d="M176 307 L226 306 L234 336" fill="none" stroke="#263747" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M234 338 L250 340" stroke="#15181a" stroke-width="10" stroke-linecap="round"/>
    <path d="M166 310 L216 309 L224 338" fill="none" stroke="#33485a" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M224 340 L241 342" stroke="#1c1f22" stroke-width="10" stroke-linecap="round"/>
    <path id="cf-armFar" data-id="armFar" d="M176 265 L205 286 L232 262" fill="none" stroke="#a8491f" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M167 306 L178 264" stroke="#d4622d" stroke-width="35" stroke-linecap="round"/>
    <path d="M187 272 L181 306" stroke="#b24d20" stroke-width="1.6" opacity="0.55" stroke-linecap="round"/>
    <path d="M186 252 L184 262" stroke="#d6a27c" stroke-width="9" stroke-linecap="round"/>
    <path d="M172 262 Q184 271 197 260" stroke="#b24d20" stroke-width="6" fill="none" stroke-linecap="round"/>

    <g data-id="head">
      <circle cx="190" cy="239" r="14.5" fill="#e3b690"/>
      <ellipse cx="204" cy="241" rx="3" ry="2.4" fill="#e3b690"/>
      <g data-id="beard"><path d="M180 242 Q184 258 200 252 Q206 250 205 247 Q192 252 183 240 Z" fill="#7a6a58"/></g>
      <circle cx="185" cy="241" r="3" fill="#c99673"/>
      <ellipse data-id="eye" cx="198.5" cy="236.5" rx="1.4" ry="1.4" fill="#1f2a2e"/>
      <path data-id="mouthLine" d="M199 247 L203.4 247.3" stroke="#8a5a45" stroke-width="1" stroke-linecap="round" fill="none"/>
      <ellipse data-id="mouthO" cx="200.8" cy="247.3" rx="2.4" ry="0.6" fill="#5b1d18" opacity="0"/>
      <ellipse data-id="tongue" cx="200.8" cy="248" rx="1.3" ry="0.8" fill="#c4584c" opacity="0"/>
      <path d="M176 229 Q176 211 193 211 Q210 211 210 229 Z" fill="#2f4a3a"/>
      <path d="M177 224 Q193 229 209 224" stroke="#d9a441" stroke-width="3" fill="none"/>
      <ellipse cx="193" cy="229" rx="22" ry="4.8" fill="#284233"/>
    </g>

    <path d="M199 290 Q196 272 190 258" fill="none" stroke="#5a3b24" stroke-width="3" stroke-linecap="round"/>

    <g data-id="drum">
      <path d="M197 290 L197 320 A25 7.5 0 0 0 247 320 L247 290 Z" fill="#7b3f26"/>
      <path d="M197 300 L197 304 A25 7.5 0 0 0 247 304 L247 300 Z" fill="#2f8f8a" opacity="0.9"/>
      <path d="M201 296 L208 313 L215 296 L222 313 L229 296 L236 313 L243 296" fill="none" stroke="#e0c98f" stroke-width="1.5" stroke-linejoin="round" opacity="0.9"/>
      <path d="M200 292 L200 316" stroke="#a65b38" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
      <ellipse cx="222" cy="290" rx="25.8" ry="8.2" fill="#4b2616"/>
      <ellipse data-id="drumHead" cx="222" cy="290" rx="24" ry="7" fill="#ead9b3"/>
      <ellipse data-id="drumFlash" cx="222" cy="290" rx="24" ry="7" fill="#fff6dc" opacity="0"/>
      <g data-id="drumRings" fill="none" stroke="#fff3cf"></g>
    </g>
  </g>

  <use href="#cf-armFar" clip-path="url(#cf-farClip)"/>
  <circle data-id="handFar" r="5" fill="#d6a27c"/>
  <path data-id="armNear" d="M182 268 L198 300 L214 268" fill="none" stroke="#d4622d" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  <circle data-id="handNear" r="5.2" fill="#e3b690"/>

  <path d="M100 352 l3 -10 l3 10 M108 353 l3 -8 l3 8 M258 350 l3 -10 l3 10 M266 352 l3 -7 l3 7 M300 358 l3 -10 l3 10 M520 360 l3 -9 l3 9 M560 352 l3 -10 l3 10 M690 356 l3 -10 l3 10" stroke="#4d7340" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>

  <rect width="800" height="450" fill="#7487c0" opacity="0.62" style="mix-blend-mode:multiply"/>

  <ellipse data-id="groundGlow" cx="410" cy="372" rx="260" ry="70" fill="url(#cf-groundGlowG)" opacity="0.3" style="mix-blend-mode:screen"/>
  <ellipse data-id="coals" cx="410" cy="362" rx="30" ry="7" fill="#ff5a1a" opacity="0.9"/>
  <g data-id="flames"></g>
  <g data-id="embers"></g>

  <circle data-id="glow" cx="410" cy="358" r="300" fill="url(#cf-glowG)" style="mix-blend-mode:screen"/>
  <rect width="800" height="450" fill="url(#cf-vigG)"/>

  <rect data-id="fade" x="0" y="0" width="800" height="450" fill="#070d22" opacity="1"/>
</svg>`;

interface Pt { x: number; y: number; }

export function createCampfireScene(host: HTMLElement): CampfireScene {
    host.innerHTML = SVG_MARKUP;
    const svg = host.querySelector("svg")!;

    const NS = "http://www.w3.org/2000/svg";
    const $ = (id: string): SVGElement => svg.querySelector(`[data-id="${id}"]`) as SVGElement;
    const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const f = (v: number) => v.toFixed(1);
    const copy = (p: Pt): Pt => ({ x: p.x, y: p.y });
    function mk(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
        const e = document.createElementNS(NS, tag);
        for (const k in attrs) e.setAttribute(k, String(attrs[k]));
        if (parent) parent.appendChild(e);
        return e;
    }
    function mulberry(a: number) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    /* ---------- constants ---------- */
    const SH_NEAR = { x: 182, y: 268 }, SH_FAR = { x: 176, y: 265 }; // shoulders
    const ARM = 36;                                                  // length of each arm segment
    const DRUM = { x: 222, y: 290, rx: 24, ry: 7 };                  // drum head
    const FIRE = { x: 410, y: 362 };
    const STRIKE = 0.07;                                             // seconds from "hand starts down" to contact

    /* ---------- scenery (built once) ---------- */
    const stars: { el: SVGElement; base: number; ph: number; sp: number }[] = [];
    (function () {
        const rng = mulberry(3), g = $("stars");
        for (let i = 0; i < 80; i++) {
            const y = rng() * 235, fadeLow = 1 - y / 300;
            const c = mk("circle", { cx: f(rng() * 800), cy: f(y), r: (0.4 + rng() * 1.0).toFixed(2) }, g);
            stars.push({ el: c, base: (0.3 + rng() * 0.6) * fadeLow, ph: rng() * 6.28, sp: 0.6 + rng() * 2.2 });
        }
    })();
    (function pines() {
        const hills = svg.querySelector("#cf-hillsG")!;
        [{ seed: 11, col: "#0f1c3e", lo: 14, hi: 20 }, { seed: 29, col: "#0a1530", lo: 10, hi: 16 }].forEach(layer => {
            const rng = mulberry(layer.seed), by = 265;
            let d = "";
            for (let x = -6; x < 806;) {
                const valley = x > 470 && x < 650;
                const h = valley ? (6 + rng() * 6) : (layer.lo + rng() * layer.hi);
                const w = h * 0.3;
                d += "M" + f(x - w) + " " + by + "L" + f(x) + " " + f(by - h) + "L" + f(x + w) + " " + by + "Z";
                x += 5 + rng() * 9;
            }
            mk("path", { d, fill: layer.col }, hills);
        });
        function big(x: number, base: number, h: number, w: number) {
            let d = "";
            for (let i = 0; i < 6; i++) {
                const top = base - h + i * h * 0.15, bot = top + h * 0.27, hw = w * (0.38 + 0.13 * i);
                d += "M" + f(x) + " " + f(top) + "L" + f(x + hw) + " " + f(bot) + "L" + f(x - hw) + " " + f(bot) + "Z";
            }
            d += "M" + f(x - 3) + " " + f(base - h * 0.1) + "L" + f(x + 3) + " " + f(base - h * 0.1) + "L" + f(x + 3) + " " + f(base + 8) + "L" + f(x - 3) + " " + f(base + 8) + "Z";
            mk("path", { d }, $("bigPines"));
        }
        big(752, 336, 230, 64);
        big(700, 333, 150, 44);
        big(786, 340, 170, 40);
    })();
    (function stones() {
        const rng = mulberry(8), back = $("stonesBack"), front = $("stonesFront");
        for (let i = 0; i < 14; i++) {
            const a = i / 14 * Math.PI * 2;
            const x = FIRE.x + Math.cos(a) * 50, y = FIRE.y + 6 + Math.sin(a) * 12;
            const g = Math.sin(a) < 0 ? back : front;
            const rx = 6 + rng() * 3.5, ry = 4 + rng() * 2;
            mk("ellipse", { cx: f(x), cy: f(y), rx: f(rx), ry: f(ry), fill: "#4b5264" }, g);
            mk("ellipse", { cx: f(x - 1), cy: f(y - 1.2), rx: f(rx * 0.7), ry: f(ry * 0.55), fill: "#6c7589" }, g);
        }
    })();
    const moonDash: SVGElement[] = [];
    const shim: { el: SVGElement; x: number; y: number; w: number; sp: number; ph: number; base: number }[] = [];
    (function () {
        const g = $("moonRef");
        for (let i = 0; i < 12; i++) moonDash.push(mk("rect", { height: "2", rx: "1", opacity: (0.5 - i * 0.03).toFixed(2) }, g));
        const rng = mulberry(5), sg = $("shimmer");
        for (let i = 0; i < 26; i++) {
            const depth = rng();
            const r = mk("rect", { height: (1 + depth * 1.2).toFixed(1), rx: "0.6", fill: "#cfdcff" }, sg);
            shim.push({ el: r, x: rng() * 820, y: 268 + depth * 62, w: 12 + depth * 60 * (0.6 + rng() * 0.6), sp: 2 + depth * 9, ph: rng() * 6.28, base: 0.08 + rng() * 0.14 });
        }
    })();

    /* the fire: four layers of five tongues each, redrawn every frame */
    const layers = [
        { col: "#ff5a14", k: 1.00 },
        { col: "#ff9a1f", k: 0.76 },
        { col: "#ffd35a", k: 0.52 },
        { col: "#fff3c4", k: 0.30 },
    ];
    const tongues = [
        { dx: -17, w: 13, h: 46, sp: 3.1, ph: 0.4 },
        { dx: 0, w: 17, h: 76, sp: 2.3, ph: 1.9 },
        { dx: 16, w: 12, h: 52, sp: 3.7, ph: 3.1 },
        { dx: -7, w: 10, h: 60, sp: 4.1, ph: 5.2 },
        { dx: 8, w: 10, h: 64, sp: 3.4, ph: 2.6 },
    ];
    const flamePaths: SVGElement[][] = layers.map(L => tongues.map(() => mk("path", { fill: L.col, opacity: "0.95" }, $("flames"))));
    const embers: { el: SVGElement; x0: number; life: number; off: number; vy: number; ph: number }[] = [];
    (function () {
        const rng = mulberry(21), g = $("embers");
        for (let i = 0; i < 20; i++) {
            const life = 2 + rng() * 2.5;
            embers.push({
                el: mk("circle", { r: "1.5", fill: rng() > 0.5 ? "#ffb347" : "#ffe08a", opacity: "0" }, g),
                x0: FIRE.x + (rng() - 0.5) * 34, life, off: rng() * life, vy: 26 + rng() * 42, ph: rng() * 6.28,
            });
        }
    })();

    /* ---------- engine state ----------
       Two independent channels: SPEECH (mouth) and DRUM (hands, drum), plus
       the ambient world (fire, stars, water). One clock drives all of them. */
    let clock = 0, running = true, destroyed = false;

    const waiters: { cond: () => boolean; res: () => void }[] = [];
    function waitFor(cond: () => boolean): Promise<void> { return new Promise(res => { waiters.push({ cond, res }); }); }
    function tickWaiters() {
        for (let i = waiters.length - 1; i >= 0; i--) {
            if (waiters[i].cond()) { const w = waiters.splice(i, 1)[0]; w.res(); }
        }
    }

    /* ---------- drum channel ---------- */
    type HandName = "left" | "right";
    type Zone = "center" | "edge";
    interface Hit { t0: number; contact: number; from: Pt; to: Pt; zone: Zone; vel: number; sounded: boolean }
    interface Hand { ph: number; rest: Pt; zone: Record<Zone, Pt>; cur: Pt; hit: Hit | null }
    const hands: Record<HandName, Hand> = {
        left: { ph: 0.7, rest: { x: 232, y: 262 }, zone: { center: { x: 228, y: 284 }, edge: { x: 241, y: 286 } }, cur: { x: 232, y: 262 }, hit: null },
        right: { ph: 2.1, rest: { x: 214, y: 268 }, zone: { center: { x: 221, y: 289 }, edge: { x: 206, y: 291 } }, cur: { x: 214, y: 268 }, hit: null },
    };
    let lastHand: HandName = "left", lastHitAt = -99, flash = 0, bob = 0;
    const rings: { t0: number; x: number; life: number; max: number }[] = [];
    const ringEls: SVGElement[] = [];
    let ringIdx = 0;
    for (let i = 0; i < 8; i++) {
        ringEls.push(mk("ellipse", { cx: DRUM.x, cy: DRUM.y, rx: "0", ry: "0", opacity: "0", "stroke-width": "1.6" }, $("drumRings")));
        rings.push({ t0: -99, x: DRUM.x, life: 0.5, max: 30 });
    }

    function handPose(h: Hand): Pt {
        const p = h.hit, r = h.rest;
        const sway = reduce ? 0 : Math.sin(clock * 1.7 + h.ph);
        const rest = { x: r.x + sway * 0.5, y: r.y + sway * 0.8 };
        if (!p) return rest;
        if (clock < p.contact) {
            let u = smooth((clock - p.t0) / (p.contact - p.t0));
            u = u * u;
            return { x: lerp(p.from.x, p.to.x, u), y: lerp(p.from.y, p.to.y, u) };
        }
        const e = clock - p.contact;
        const peak = { x: lerp(p.to.x, r.x, 0.6), y: r.y - 4 - 9 * p.vel };
        if (e < 0.14) {
            const u2 = smooth(e / 0.14);
            return { x: lerp(p.to.x, peak.x, u2), y: lerp(p.to.y, peak.y, u2) };
        }
        const u3 = smooth((e - 0.14) / 0.42);
        return { x: lerp(peak.x, rest.x, u3), y: lerp(peak.y, rest.y, u3) };
    }
    function contact(p: Hit) {
        p.sounded = true;
        lastHitAt = clock;
        flash = Math.min(1.4, flash + 0.55 + 0.6 * p.vel);
        bob = Math.min(1.6, bob + 0.3 + 0.55 * p.vel);
        const rg = rings[ringIdx++ % rings.length];
        rg.t0 = clock; rg.x = p.to.x; rg.max = 18 + 22 * p.vel; rg.life = 0.35 + 0.3 * p.vel;
    }
    function doHit(opts: HitOptions = {}): Promise<void> {
        const name: HandName = opts.hand ?? (lastHand === "left" ? "right" : "left");
        lastHand = name;
        const h = hands[name];
        const zone: Zone = opts.zone === "edge" ? "edge" : "center";
        const vel = clamp(opts.vel == null ? 0.85 : +opts.vel || 0, 0.05, 1);
        if (h.hit && !h.hit.sounded) contact(h.hit);
        const p: Hit = { t0: clock, contact: clock + STRIKE, from: copy(h.cur), to: h.zone[zone], zone, vel, sounded: false };
        h.hit = p;
        return waitFor(() => p.sounded);
    }
    function updateHits(dt: number) {
        (["left", "right"] as HandName[]).forEach(name => {
            const h = hands[name];
            if (h.hit && !h.hit.sounded && clock >= h.hit.contact) contact(h.hit);
            h.cur = handPose(h);
        });
        flash = Math.max(0, flash - dt * 5.5);
        bob = Math.max(0, bob - dt * 4.2);
    }

    /* ---------- speech + mouth channel ---------- */
    const mouth = { v: 0 };
    let speech: { chars: string[]; starts: number[]; total: number; t0: number; idx: number; res: () => void } | null = null;
    let speechGen = 0;
    let speechChain: Promise<unknown> = Promise.resolve();

    function openFor(ch: string): number {
        const c = ch.toLowerCase();
        if (c === "a") return 1;
        if (c === "o") return 0.9;
        if (c === "u" || c === "e") return 0.7;
        if (c === "i" || c === "y") return 0.5;
        if ("mbp".indexOf(c) > -1) return 0;
        if ("fv".indexOf(c) > -1) return 0.12;
        if ("wq".indexOf(c) > -1) return 0.35;
        if (c === " ") return 0.06;
        if (".,;:!?…-".indexOf(c) > -1) return 0;
        return 0.28;
    }
    function pauseFor(ch: string): number {
        if (".!?…".indexOf(ch) > -1) return 5;
        if (",;:".indexOf(ch) > -1) return 3;
        return 1;
    }
    function runSpeech(text: string): Promise<void> {
        return new Promise(res => {
            const per = 0.062;
            const chars = Array.from(text), starts: number[] = [];
            let t = 0;
            chars.forEach(ch => { starts.push(t); t += per * pauseFor(ch); });
            speech = { chars, starts, total: t, t0: clock, idx: 0, res };
        });
    }
    function finishSpeech() {
        const s = speech;
        if (!s) return;
        speech = null;
        s.res();
    }
    function say(text: string): Promise<void> {
        const gen = speechGen;
        const p = speechChain.then(() => {
            if (gen !== speechGen) return;
            return runSpeech(text);
        });
        speechChain = p.catch(() => {});
        return p;
    }
    function updateSpeech(dt: number) {
        let target = 0;
        if (speech) {
            const el = clock - speech.t0;
            if (el >= speech.total) finishSpeech();
            else {
                while (speech.idx < speech.chars.length - 1 && speech.starts[speech.idx + 1] <= el) speech.idx++;
                target = openFor(speech.chars[speech.idx]) * (0.88 + 0.12 * Math.sin(clock * 38));
            }
        }
        mouth.v += (target - mouth.v) * Math.min(1, dt * 26);
    }

    /* ---------- drawing ---------- */
    const el = {
        armFar: $("armFar"), armNear: $("armNear"), handFar: $("handFar"), handNear: $("handNear"),
        head: $("head"), beard: $("beard"), eye: $("eye"), mouthLine: $("mouthLine"), mouthO: $("mouthO"), tongue: $("tongue"),
        drum: $("drum"), drumHead: $("drumHead"), drumFlash: $("drumFlash"),
        glow: $("glow"), groundGlow: $("groundGlow"), coals: $("coals"), fade: $("fade"),
    };
    function elbow(S: Pt, H: Pt, l: number): Pt {
        const dx = H.x - S.x, dy = H.y - S.y, d = Math.hypot(dx, dy) || 1;
        const dd = Math.min(d, 2 * l - 1);
        const mx = S.x + dx * (dd / d) / 2, my = S.y + dy * (dd / d) / 2;
        const h = Math.sqrt(Math.max(0, l * l - dd * dd / 4));
        let px = -dy / d, py = dx / d;
        if (py < 0) { px = -px; py = -py; }
        return { x: mx + px * h, y: my + py * h };
    }

    const blink = { next: 2.5, t0: -9 };
    function drawFire() {
        const amp = reduce ? 0.25 : 1;
        const flick = 0.86 + 0.14 * amp * (Math.sin(clock * 9.1) + Math.sin(clock * 13.7 + 1.3)) / 2;
        const gust = 0.5 + 0.5 * Math.sin(clock * 0.7);
        for (let i = 0; i < layers.length; i++) {
            const k = layers[i].k;
            for (let j = 0; j < tongues.length; j++) {
                const T = tongues[j];
                const n = (Math.sin(clock * T.sp + T.ph) + 0.6 * Math.sin(clock * T.sp * 1.7 + T.ph * 2.3)) / 1.6;
                const h = T.h * k * (1 + 0.2 * amp * n + 0.08 * amp * gust);
                const w = T.w * (0.5 + 0.5 * k);
                const x = FIRE.x + T.dx * (0.45 + 0.55 * k);
                const sw = amp * 5 * Math.sin(clock * T.sp * 0.9 + T.ph + 1) * (h / 70);
                const y0 = FIRE.y;
                flamePaths[i][j].setAttribute("d",
                    "M" + f(x - w) + " " + f(y0) +
                    " C" + f(x - w) + " " + f(y0 - h * 0.45) + " " + f(x - w * 0.3 + sw * 0.4) + " " + f(y0 - h * 0.78) + " " + f(x + sw) + " " + f(y0 - h) +
                    " C" + f(x + w * 0.3 + sw * 0.4) + " " + f(y0 - h * 0.74) + " " + f(x + w) + " " + f(y0 - h * 0.42) + " " + f(x + w) + " " + f(y0) +
                    " Q" + f(x) + " " + f(y0 + w * 0.6) + " " + f(x - w) + " " + f(y0) + " Z");
            }
        }
        el.glow.setAttribute("opacity", (0.72 + 0.28 * flick).toFixed(2));
        el.groundGlow.setAttribute("opacity", (0.7 + 0.3 * flick).toFixed(2));
        el.coals.setAttribute("opacity", (0.6 + 0.4 * flick).toFixed(2));
        for (const e of embers) {
            const t = (clock * (reduce ? 0.4 : 1) + e.off) % e.life, u = t / e.life;
            const ex = e.x0 + Math.sin(t * 2.3 + e.ph) * (5 + t * 6) + t * 3;
            const ey = FIRE.y - 8 - e.vy * t;
            e.el.setAttribute("cx", f(ex)); e.el.setAttribute("cy", f(ey));
            e.el.setAttribute("r", (0.5 + 1.7 * (1 - u)).toFixed(2));
            e.el.setAttribute("opacity", ((1 - u) * (u < 0.1 ? u / 0.1 : 1) * 0.95).toFixed(2));
        }
    }
    function drawWorld() {
        for (const s of stars) {
            s.el.setAttribute("opacity", (s.base * (reduce ? 0.8 : 0.6 + 0.4 * Math.sin(clock * s.sp + s.ph))).toFixed(2));
        }
        for (let i = 0; i < moonDash.length; i++) {
            const w = 6 + i * 3.6;
            moonDash[i].setAttribute("x", f(655 - w / 2 + (reduce ? 0 : Math.sin(clock * 1.1 + i) * 3)));
            moonDash[i].setAttribute("y", f(268 + i * 5));
            moonDash[i].setAttribute("width", f(w));
        }
        for (const sh of shim) {
            sh.el.setAttribute("x", f(((sh.x + clock * sh.sp) % 900) - 50));
            sh.el.setAttribute("y", f(sh.y));
            sh.el.setAttribute("width", f(sh.w));
            sh.el.setAttribute("opacity", (sh.base * (0.55 + 0.45 * Math.sin(clock * 1.4 + sh.ph))).toFixed(2));
        }
    }

    function draw() {
        /* arms and hands */
        const HN = hands.right.cur, HF = hands.left.cur;
        const en = elbow(SH_NEAR, HN, ARM), ef = elbow(SH_FAR, HF, ARM);
        el.armNear.setAttribute("d", "M" + f(SH_NEAR.x) + " " + f(SH_NEAR.y) + " L" + f(en.x) + " " + f(en.y) + " L" + f(HN.x) + " " + f(HN.y));
        el.armFar.setAttribute("d", "M" + f(SH_FAR.x) + " " + f(SH_FAR.y) + " L" + f(ef.x) + " " + f(ef.y) + " L" + f(HF.x) + " " + f(HF.y));
        el.handNear.setAttribute("cx", f(HN.x)); el.handNear.setAttribute("cy", f(HN.y));
        el.handFar.setAttribute("cx", f(HF.x)); el.handFar.setAttribute("cy", f(HF.y));

        /* drum: dips and brightens on a hit, with a ring where the hand landed */
        el.drum.setAttribute("transform", "translate(0 " + f(1.3 * Math.min(1, flash)) + ")");
        const ry = DRUM.ry - 0.9 * Math.min(1, flash);
        el.drumHead.setAttribute("ry", f(ry));
        el.drumFlash.setAttribute("ry", f(ry));
        el.drumFlash.setAttribute("opacity", (0.5 * Math.min(1, flash)).toFixed(2));
        for (let i = 0; i < rings.length; i++) {
            const r = rings[i], p = (clock - r.t0) / r.life, e = ringEls[i];
            if (p <= 0 || p >= 1) { e.setAttribute("opacity", "0"); continue; }
            const rad = 4 + r.max * (1 - Math.pow(1 - p, 2));
            e.setAttribute("cx", f(DRUM.x + (r.x - DRUM.x) * 0.7));
            e.setAttribute("rx", f(rad)); e.setAttribute("ry", f(rad * 0.3));
            e.setAttribute("opacity", (0.8 * (1 - p)).toFixed(2));
        }

        /* eye: looks at the fire, glances down while drumming, blinks now and then */
        const drumming = clock - lastHitAt < 1.2;
        el.eye.setAttribute("cx", f(199.2));
        el.eye.setAttribute("cy", f(236.9 + (drumming ? 0.9 : 0.2)));
        if (clock >= blink.next) { blink.t0 = clock; blink.next = clock + 2.5 + ((Math.sin(clock * 12.9) + 1) * 2.5); }
        const bt = (clock - blink.t0) / 0.16;
        el.eye.setAttribute("ry", f(bt >= 0 && bt < 1 ? Math.max(0.15, 1.4 * Math.abs(1 - 2 * bt)) : 1.4));

        /* mouth, jaw and head: talking plus a nod on every drum hit */
        const ov = mouth.v;
        if (ov > 0.1) {
            const ryM = 0.5 + ov * 3.4, rxM = 2.3 + ov * 0.9, cyM = 247.3 + ov * 1.1;
            el.mouthLine.setAttribute("opacity", "0");
            el.mouthO.setAttribute("opacity", "1");
            el.mouthO.setAttribute("rx", f(rxM)); el.mouthO.setAttribute("ry", f(ryM)); el.mouthO.setAttribute("cy", f(cyM));
            el.tongue.setAttribute("opacity", ov > 0.45 ? "1" : "0");
            el.tongue.setAttribute("cy", f(cyM + ryM * 0.45)); el.tongue.setAttribute("rx", f(rxM * 0.55)); el.tongue.setAttribute("ry", f(ryM * 0.4));
        } else {
            el.mouthLine.setAttribute("opacity", "1");
            el.mouthO.setAttribute("opacity", "0");
            el.tongue.setAttribute("opacity", "0");
        }
        el.beard.setAttribute("transform", "translate(0 " + f(ov * 2.2) + ")");
        const nod = Math.min(1.6, bob);
        const sway = drumming && !reduce ? Math.sin(clock * 3.1) * 0.6 : 0;
        el.head.setAttribute("transform", "translate(0 " + f(-0.5 * ov + 1.6 * nod) + ") rotate(" + f(-1.8 * ov + 1.0 * ov * Math.sin(clock * 5.2) + 2.2 * nod + sway) + " 186 254)");

        el.fade.setAttribute("opacity", (1 - smooth(clock / 0.8)).toFixed(2));
    }

    /* ---------- main loop ---------- */
    function step(dt: number) {
        clock += dt;
        updateHits(dt);
        updateSpeech(dt);
        drawWorld();
        drawFire();
        draw();
        tickWaiters();
    }
    let last: number | null = null, rafId = 0;
    function frame(ts: number) {
        if (destroyed) return;
        if (last === null) last = ts;
        const dt = Math.min(0.05, (ts - last) / 1000);
        last = ts;
        if (running) step(dt);
        rafId = requestAnimationFrame(frame);
    }
    step(0);
    rafId = requestAnimationFrame(frame);

    return {
        hit: doHit,
        talk(ms: number) {
            const syl = ["ba", "lo", "ma", "ah", "ee", "oh", "da", "no", "ya", "um"];
            const n = Math.max(1, Math.round((ms || 1000) / 62));
            let s = "";
            while (s.length < n) s += syl[Math.floor(Math.random() * syl.length)] + " ";
            return say(s);
        },
        stopTalking() {
            speechGen++;
            if (speech) finishSpeech();
        },
        setPaused(p: boolean) { running = !p; },
        destroy() {
            destroyed = true;
            cancelAnimationFrame(rafId);
            waiters.length = 0;
            host.innerHTML = "";
        },
    };
}
