// The "Lakeside Cast" scene: a fisherman on a log beside a misty lake who can
// wind up, cast, reel in and talk. Ported from the standalone Lakeside Cast
// animation; the engine is unchanged, only the page chrome and demo controls
// are gone. Casting and speech are separate channels, so he can talk while he
// casts. Every action returns a promise that resolves on the scene's own clock.

export type FishermanEvent =
    "windup" | "swing" | "release" | "land" | "reel" | "reeled" | "nibble" | "speechstart" | "speechend";

export interface LakesideScene {
    windUp(): Promise<void>;
    swing(): Promise<void>;
    cast(): Promise<void>;
    reelIn(): Promise<void>;
    nibble(): Promise<boolean>;
    /** Mouth moves for `ms` with no text (used while a speech line plays). */
    talk(ms: number): Promise<void>;
    stopTalking(): void;
    /** Drive the mouth yourself (0..1); null hands control back. */
    setMouth(v: number | null): void;
    on(name: FishermanEvent, fn: (data?: unknown) => void): LakesideScene;
    off(name: FishermanEvent, fn: (data?: unknown) => void): LakesideScene;
    readonly state: { rod: string; float: string; speaking: boolean };
    setPaused(p: boolean): void;
    destroy(): void;
}

const SVG_MARKUP = `<svg class="lakeside-svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Een visser zit op een boomstam aan een meer en gooit zijn hengel uit." xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lk-skyG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6ea6c4"/>
      <stop offset="0.5" stop-color="#aecfda"/>
      <stop offset="1" stop-color="#f5dfbd"/>
    </linearGradient>
    <radialGradient id="lk-glowG">
      <stop offset="0" stop-color="#fff2c8" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#fff2c8" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="lk-lakeG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c3d8d6"/>
      <stop offset="0.3" stop-color="#86b1be"/>
      <stop offset="1" stop-color="#386d80"/>
    </linearGradient>
    <linearGradient id="lk-mistG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff4e0" stop-opacity="0"/>
      <stop offset="0.55" stop-color="#fff4e0" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#fff4e0" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="lk-refG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <mask id="lk-refMask" maskUnits="userSpaceOnUse" x="0" y="264" width="800" height="90">
      <rect x="0" y="264" width="800" height="70" fill="url(#lk-refG)"/>
    </mask>
    <clipPath id="lk-waterClip"><rect data-id="clipR" x="0" y="0" width="800" height="345"/></clipPath>
    <g id="lk-hillsG">
      <path d="M0 246 C50 232 110 226 170 236 C230 246 270 228 340 226 C400 224 430 240 480 250 C520 258 540 256 580 255 C620 254 660 236 720 226 C760 220 780 226 800 232 L800 266 L0 266Z" fill="#a3c0c6"/>
      <path d="M0 258 C70 246 130 252 200 256 C280 260 330 246 400 250 C470 254 520 262 600 260 C680 258 740 246 800 250 L800 266 L0 266Z" fill="#7ea3ad"/>
    </g>
  </defs>

  <rect x="0" y="0" width="800" height="270" fill="url(#lk-skyG)"/>
  <circle cx="565" cy="246" r="130" fill="url(#lk-glowG)"/>
  <circle cx="565" cy="246" r="24" fill="#fff3cf"/>
  <g data-id="cloud1" fill="#ffffff" opacity="0.5"><ellipse cx="0" cy="0" rx="42" ry="8"/><ellipse cx="-22" cy="-6" rx="24" ry="9"/><ellipse cx="18" cy="-8" rx="28" ry="10"/></g>
  <g data-id="cloud2" fill="#ffffff" opacity="0.4"><ellipse cx="0" cy="0" rx="56" ry="9"/><ellipse cx="-26" cy="-7" rx="30" ry="10"/><ellipse cx="22" cy="-9" rx="34" ry="11"/></g>
  <g data-id="cloud3" fill="#ffffff" opacity="0.45"><ellipse cx="0" cy="0" rx="34" ry="6"/><ellipse cx="-14" cy="-5" rx="18" ry="7"/><ellipse cx="12" cy="-6" rx="20" ry="8"/></g>
  <g fill="none" stroke="#3b5560" stroke-width="1.6" stroke-linecap="round">
    <path data-id="bird0" d="M-7 0 Q-3.5 -4 0 0 Q3.5 -4 7 0"/>
    <path data-id="bird1" d="M-6 0 Q-3 -3.5 0 0 Q3 -3.5 6 0"/>
    <path data-id="bird2" d="M-5 0 Q-2.5 -3 0 0 Q2.5 -3 5 0"/>
  </g>

  <use href="#lk-hillsG"/>

  <rect x="0" y="264" width="800" height="186" fill="url(#lk-lakeG)"/>
  <g mask="url(#lk-refMask)" opacity="0.8"><use href="#lk-hillsG" transform="translate(0 528) scale(1 -1)"/></g>
  <g data-id="sunRef" fill="#fff3cf"></g>
  <g data-id="shimmer"></g>
  <rect data-id="mist" x="-50" y="242" width="900" height="36" fill="url(#lk-mistG)"/>

  <g data-id="ripples" fill="none" stroke="#ffffff"></g>
  <ellipse data-id="crown" cx="612" cy="345" rx="0" ry="0" fill="none" stroke="#ffffff" stroke-width="1.4" opacity="0"/>

  <path d="M0 328 C80 322 190 326 280 334 C318 338 338 350 338 368 C338 400 330 430 346 450 L0 450Z" fill="#2b3d2f"/>
  <ellipse cx="165" cy="346" rx="115" ry="8" fill="#3a4f38" opacity="0.6"/>
  <path d="M0 328 C80 322 190 326 280 334 C318 338 338 350 338 368" fill="none" stroke="#5a7e48" stroke-width="3"/>
  <path d="M338 368 C338 400 330 430 346 450" fill="none" stroke="#9fc0ae" stroke-width="2" opacity="0.4"/>

  <g transform="translate(58 333)">
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

  <g data-id="reeds"></g>

  <g>
    <path d="M176 307 L226 306 L234 336" fill="none" stroke="#263747" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M234 338 L250 340" stroke="#15181a" stroke-width="10" stroke-linecap="round"/>
    <path d="M166 310 L216 309 L224 338" fill="none" stroke="#33485a" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M224 340 L241 342" stroke="#1c1f22" stroke-width="10" stroke-linecap="round"/>
    <path data-id="armR" d="M176 265 L200 285 L220 290" fill="none" stroke="#a8491f" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M167 306 L178 264" stroke="#d4622d" stroke-width="35" stroke-linecap="round"/>
    <path d="M187 272 L181 306" stroke="#b24d20" stroke-width="1.6" opacity="0.55" stroke-linecap="round"/>
    <path d="M186 252 L184 262" stroke="#d6a27c" stroke-width="9" stroke-linecap="round"/>
    <path d="M172 262 Q184 271 197 260" stroke="#b24d20" stroke-width="6" fill="none" stroke-linecap="round"/>

    <g data-id="head">
      <circle cx="190" cy="239" r="14.5" fill="#e3b690"/>
      <ellipse cx="204" cy="241" rx="3" ry="2.4" fill="#e3b690"/>
      <g data-id="beard"><path d="M180 242 Q184 258 200 252 Q206 250 205 247 Q192 252 183 240 Z" fill="#7a6a58"/></g>
      <circle cx="185" cy="241" r="3" fill="#c99673"/>
      <circle data-id="eye" cx="198.5" cy="236.5" r="1.4" fill="#1f2a2e"/>
      <path data-id="mouthLine" d="M199 247 L203.4 247.3" stroke="#8a5a45" stroke-width="1" stroke-linecap="round" fill="none"/>
      <ellipse data-id="mouthO" cx="200.8" cy="247.3" rx="2.4" ry="0.6" fill="#5b1d18" opacity="0"/>
      <ellipse data-id="tongue" cx="200.8" cy="248" rx="1.3" ry="0.8" fill="#c4584c" opacity="0"/>
      <path d="M176 229 Q176 211 193 211 Q210 211 210 229 Z" fill="#2f4a3a"/>
      <path d="M177 224 Q193 229 209 224" stroke="#d9a441" stroke-width="3" fill="none"/>
      <ellipse cx="193" cy="229" rx="22" ry="4.8" fill="#284233"/>
    </g>
  </g>

  <path data-id="shaft" d="M0 0" fill="none" stroke="#1d2327" stroke-width="2.6" stroke-linecap="round"/>
  <line data-id="handle" x1="0" y1="0" x2="1" y2="1" stroke="#5a3b24" stroke-width="6" stroke-linecap="round"/>
  <g data-id="reel">
    <circle r="5.2" fill="#aab6bb" stroke="#3c474b" stroke-width="1.2"/>
    <circle r="1.8" fill="#3c474b"/>
    <line x1="0" y1="0" x2="6.5" y2="0" stroke="#3c474b" stroke-width="1.4"/>
    <circle cx="6.5" cy="0" r="1.5" fill="#d9a441"/>
  </g>
  <path data-id="armF" d="M0 0" fill="none" stroke="#d4622d" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  <circle data-id="handR" r="5" fill="#d6a27c"/>
  <circle data-id="handF" r="5.2" fill="#e3b690"/>
  <path data-id="lineP" d="M0 0" fill="none" stroke="#2f4147" stroke-width="1.1" opacity="0.8" stroke-linecap="round"/>
  <ellipse data-id="refl" cx="612" cy="352" rx="3.4" ry="1.6" fill="#d9381e" opacity="0"/>
  <g clip-path="url(#lk-waterClip)">
    <g data-id="bobber" transform="translate(0 0)">
      <line x1="0" y1="-17" x2="0" y2="-9" stroke="#2a2f31" stroke-width="1.8" stroke-linecap="round"/>
      <ellipse cx="0" cy="0" rx="6" ry="9" fill="#f4f0e6"/>
      <path d="M-6 0 A6 9 0 0 1 6 0 Z" fill="#d9381e"/>
      <ellipse cx="-2" cy="-4.5" rx="1.4" ry="2.6" fill="#ffffff" opacity="0.55"/>
    </g>
  </g>
  <ellipse data-id="ring" cx="612" cy="346" rx="9" ry="2.2" fill="none" stroke="#ffffff" stroke-width="1" opacity="0"/>
  <g data-id="drops" fill="#ffffff"></g>

  <path d="M100 350 l3 -10 l3 10 M108 351 l3 -8 l3 8 M244 348 l3 -10 l3 10 M252 350 l3 -7 l3 7 M40 356 l3 -10 l3 10 M284 346 l3 -9 l3 9" stroke="#4d7340" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>

  <rect data-id="fade" x="0" y="0" width="800" height="450" fill="#14323c" opacity="1"/>
</svg>`;

interface Pt { x: number; y: number; }

export function createLakesideScene(host: HTMLElement): LakesideScene {
    host.innerHTML = SVG_MARKUP;
    const svg = host.querySelector("svg")!;

    const NS = "http://www.w3.org/2000/svg";
    const $ = (id: string): SVGElement => svg.querySelector(`[data-id="${id}"]`) as SVGElement;
    const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const f = (v: number) => v.toFixed(1);
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
    const D2R = Math.PI / 180;
    const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    /* ---------- constants ---------- */
    const L = 175;                                   // rod length beyond the hand
    const SH = { x: 182, y: 268 }, SH2 = { x: 176, y: 265 }; // shoulders
    const T = { x: 612, y: 344 };                    // where the bobber settles on the water
    const WIND = 0.85;                               // wind-up duration
    const SWING = 0.36, REL = 0.26;                  // forward stroke length, and when the line lets go
    const FLY = 1.3;                                 // flight time
    const REEL = 1.9;                                // reel-in time
    const REST = { x: 3, y: 60 }, BACK = { x: 38, y: 50 }, FWD = { x: -34, y: 44 }; // float offsets from the rod tip

    /* ---------- scenery (procedural) ---------- */
    (function trees() {
        const hills = svg.querySelector("#lk-hillsG")!;
        [{ seed: 11, col: "#3b6270", lo: 14, hi: 20 }, { seed: 29, col: "#2f5361", lo: 10, hi: 16 }].forEach(layer => {
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
    })();
    const shim: { el: SVGElement; x: number; y: number; w: number; sp: number; ph: number; base: number }[] = [];
    (function water() {
        const rng = mulberry(5), sg = $("shimmer");
        for (let i = 0; i < 40; i++) {
            const depth = rng();
            const r = mk("rect", { height: (1.2 + depth * 1.4).toFixed(1), rx: "0.7", fill: "#ffffff" }, sg);
            shim.push({ el: r, x: rng() * 820, y: 274 + depth * 168, w: 14 + depth * 70 * (0.6 + rng() * 0.6), sp: 3 + depth * 14, ph: rng() * 6.28, base: 0.12 + rng() * 0.22 });
        }
    })();
    const sunDash: SVGElement[] = [];
    for (let i = 0; i < 14; i++) sunDash.push(mk("rect", { height: "2", rx: "1", opacity: (0.6 - i * 0.035).toFixed(2) }, $("sunRef")));
    const reeds: { g: SVGElement; x: number; y: number; ph: number }[] = [];
    [[338, 398, 66], [345, 404, 78], [352, 396, 58], [358, 408, 72], [364, 400, 50]].forEach((s, i) => {
        const rg = mk("g", {}, $("reeds"));
        mk("path", { d: "M0 0 Q3 " + (-s[2] / 2) + " 1 " + (-s[2]), stroke: "#46663f", "stroke-width": "2", fill: "none", "stroke-linecap": "round" }, rg);
        mk("ellipse", { cx: "1", cy: String(-s[2] + 6), rx: "2.6", ry: "7.5", fill: "#70472b" }, rg);
        reeds.push({ g: rg, x: s[0], y: s[1], ph: i * 1.3 });
    });
    const clouds = [{ el: $("cloud1"), x: 120, y: 70, sp: 3.5 }, { el: $("cloud2"), x: 520, y: 112, sp: 2.2 }, { el: $("cloud3"), x: 760, y: 48, sp: 4.4 }];
    const birds = [{ el: $("bird0"), x: 80, y: 96, sp: 16, ph: 0 }, { el: $("bird1"), x: 130, y: 112, sp: 15, ph: 1.4 }, { el: $("bird2"), x: 30, y: 126, sp: 13, ph: 2.6 }];

    /* ---------- engine state ----------
       Two independent channels move the cast: the ROD and the FLOAT.
       A third channel, SPEECH, moves the mouth. Each channel is a small state
       machine driven by one clock. */
    let clock = 0, running = true, destroyed = false;
    const rod = { mode: "idle", t0: 0, aFrom: -52, a: -52, w: 0 };
    //   rod.mode: idle | windup | held | swing | settle
    const flt = { mode: "hang", t0: 0, from: { x: 0, y: 0 } as Pt, C: { x: 0, y: 0 } as Pt, tilt: 0, tiltLand: 0, sag: 3 };
    //   flt.mode: hang | flight | landed | reel
    let nibbles: number[] = [], splashT = -99, nextIdle = 0, reelRot = 0;

    /* promises that wait on the clock (they freeze while paused) */
    const waiters: { cond: () => boolean; res: () => void }[] = [];
    function waitFor(cond: () => boolean): Promise<void> { return new Promise(res => { waiters.push({ cond, res }); }); }
    function sleep(sec: number) { const t = clock + sec; return waitFor(() => clock >= t); }
    function tickWaiters() {
        for (let i = waiters.length - 1; i >= 0; i--) {
            if (waiters[i].cond()) { const w = waiters.splice(i, 1)[0]; w.res(); }
        }
    }

    const handlers: Record<string, ((data?: unknown) => void)[]> = {};
    function emit(name: FishermanEvent, data?: unknown) {
        (handlers[name] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
    }

    /* ---------- rod channel ---------- */
    function setRod(mode: string) { rod.mode = mode; rod.t0 = clock; rod.aFrom = rod.a; }
    function idleBase() {
        if (flt.mode === "reel") return lerp(-42, -52, smooth((clock - flt.t0) / REEL));
        if (flt.mode === "landed" || flt.mode === "flight") return -42;
        return -52;
    }
    function updateRod(dt: number) {
        const t = clock - rod.t0;
        let a: number;
        if (rod.mode === "idle") {
            a = idleBase() + (reduce ? 0 : 0.9 * Math.sin(clock * 1.3) * (flt.mode === "hang" ? 1 : 0.35));
        } else if (rod.mode === "windup") {
            const u = t / WIND;
            a = lerp(rod.aFrom, -130, smooth(u));
            if (u >= 1) { rod.mode = "held"; rod.t0 = clock; a = -130; }
        } else if (rod.mode === "held") {
            a = -130;
        } else if (rod.mode === "swing") {
            const us = t / SWING;
            a = lerp(-130, -28, smooth(us));
            if (us >= 1) { rod.mode = "settle"; rod.t0 = clock; a = -28; }
        } else { // settle: damped follow-through after the throw
            const k = 4.5, w = 11;
            a = idleBase() + (-28 - idleBase()) * Math.exp(-k * t) * (Math.cos(w * t) + (k / w) * Math.sin(w * t));
            if (t > 2.4) rod.mode = "idle";
        }
        const wNow = (a - rod.a) / Math.max(dt, 1e-3) * D2R;
        rod.w = lerp(rod.w, wNow, 0.6);
        rod.a = a;
    }
    function handPos(a: number): Pt {
        const B = { x: 206, y: 262 }, R = { x: 230, y: 288 }, F = { x: 241, y: 283 };
        let k: number;
        if (a < -52) { k = clamp((a + 130) / 78, 0, 1); return { x: lerp(B.x, R.x, k), y: lerp(B.y, R.y, k) }; }
        k = clamp((a + 52) / 24, 0, 1); return { x: lerp(R.x, F.x, k), y: lerp(R.y, F.y, k) };
    }
    function geo(dip: number) {
        const ar = rod.a * D2R;
        const u = { x: Math.cos(ar), y: Math.sin(ar) };
        const P = handPos(rod.a);
        let dx = 6 * rod.w * Math.sin(ar), dy = -6 * rod.w * Math.cos(ar);
        const m = Math.hypot(dx, dy);
        if (m > 38) { dx *= 38 / m; dy *= 38 / m; }
        dy += 3;
        if (flt.mode === "landed") dy += 6 * smooth((clock - flt.t0) / 0.5) + dip * 0.9;
        else if (flt.mode === "reel") dy += 6 * (1 - smooth((clock - flt.t0) / REEL));
        const butt = { x: P.x - 20 * u.x, y: P.y - 20 * u.y };
        const tipS = { x: P.x + L * u.x, y: P.y + L * u.y };
        return {
            u, P, butt, tip: { x: tipS.x + dx, y: tipS.y + dy },
            ctrl: { x: butt.x + 0.62 * (tipS.x - butt.x) + dx * 0.25, y: butt.y + 0.62 * (tipS.y - butt.y) + dy * 0.25 },
        };
    }
    function elbow(S: Pt, H: Pt, l: number): Pt {
        const dx = H.x - S.x, dy = H.y - S.y, d = Math.hypot(dx, dy) || 1;
        const dd = Math.min(d, 2 * l - 1);
        const mx = S.x + dx * (dd / d) / 2, my = S.y + dy * (dd / d) / 2;
        const h = Math.sqrt(Math.max(0, l * l - dd * dd / 4));
        let px = -dy / d, py = dx / d;
        if (py < 0) { px = -px; py = -py; }
        return { x: mx + px * h, y: my + py * h };
    }

    /* ---------- float channel ---------- */
    const rippleEls: SVGElement[] = [], ripples: { t0: number; max: number; life: number }[] = [];
    for (let ri = 0; ri < 10; ri++) {
        rippleEls.push(mk("ellipse", { cx: T.x, cy: T.y + 1, rx: "0", ry: "0", fill: "none", opacity: "0" }, $("ripples")));
        ripples.push({ t0: -99, max: 0, life: 1 });
    }
    let ripIdx = 0;
    function addRipple(max: number, life: number, delay = 0) {
        const r = ripples[ripIdx++ % ripples.length];
        r.t0 = clock + delay; r.max = max; r.life = life;
    }
    const dropEls: SVGElement[] = [];
    for (let di = 0; di < 10; di++) dropEls.push(mk("circle", { r: "2", opacity: "0" }, $("drops")));

    function tiltOf(C: Pt, tip: Pt) { return Math.atan2(-(C.x - tip.x), C.y - tip.y); }
    function swayX() { return reduce ? 0 : 3 * Math.sin(clock * 2.3); }
    function hangOffset(): Pt {
        if (rod.mode === "windup") {
            const s = smooth((clock - rod.t0) / WIND);
            return { x: lerp(REST.x, BACK.x, s), y: lerp(REST.y, BACK.y, s) };
        } else if (rod.mode === "held") {
            return { x: BACK.x, y: BACK.y };
        } else if (rod.mode === "swing") {
            const s2 = smooth((clock - rod.t0) / REL);
            return { x: lerp(BACK.x, FWD.x, s2), y: lerp(BACK.y, FWD.y, s2) };
        }
        return { x: REST.x + swayX(), y: REST.y };
    }
    function releaseNow() { flt.mode = "flight"; flt.t0 = clock; flt.from = { x: flt.C.x, y: flt.C.y }; }
    function landNow(tip: Pt) {
        flt.mode = "landed"; flt.t0 = clock;
        flt.tiltLand = tiltOf({ x: T.x, y: T.y - 4 }, tip);
        splashT = clock;
        addRipple(100, 2.8); addRipple(78, 2.6, 0.28); addRipple(56, 2.4, 0.6);
        nextIdle = clock + 2.6;
        nibbles = [];
    }
    function nibbleNow() {
        nibbles.push(clock);
        addRipple(40, 2.3, 0.05); addRipple(28, 2.0, 0.4);
        emit("nibble");
    }
    function computeDip() {
        let s = 0;
        for (let i = nibbles.length - 1; i >= 0; i--) {
            const e = clock - nibbles[i];
            if (e > 2) { nibbles.splice(i, 1); continue; }
            s += 6 * Math.sin(Math.PI * clamp(e / 0.6, 0, 1)) + 3 * Math.sin(Math.PI * clamp((e - 0.45) / 0.4, 0, 1));
        }
        return s;
    }
    function updateFloat(tip: Pt, dt: number, dip: number) {
        let C: Pt;
        if (flt.mode === "hang") {
            if ((rod.mode === "swing" && clock - rod.t0 >= REL) || rod.mode === "settle") releaseNow();
        }
        if (flt.mode === "hang") {
            const o = hangOffset();
            C = { x: tip.x + o.x, y: tip.y + o.y };
            flt.C = C; flt.tilt = tiltOf(C, tip); flt.sag = 3;
            return;
        }
        if (flt.mode === "flight") {
            const u = (clock - flt.t0) / FLY;
            if (u < 1) {
                C = { x: lerp(flt.from.x, T.x, u), y: lerp(flt.from.y, T.y - 4, u) - 130 * 4 * u * (1 - u) };
                flt.C = C; flt.tilt = tiltOf(C, tip); flt.sag = 8 + 34 * Math.sin(Math.PI * u);
                reelRot -= dt * 20 * (1 - u);
                return;
            }
            landNow(tip);
        }
        if (flt.mode === "landed") {
            const tau = clock - flt.t0;
            C = { x: T.x, y: T.y - 4 + 5 * Math.exp(-5 * tau) * Math.sin(14 * tau) + 1.6 * Math.sin(clock * 2.4) * smooth(tau / 0.8) + dip };
            flt.C = C;
            flt.tilt = lerp(flt.tiltLand, 0.04 * Math.sin(clock * 1.7), smooth(tau / 0.3));
            flt.sag = 8 + 10 * (1 - Math.exp(-2.5 * tau)) - dip * 0.8;
            if (clock >= nextIdle) { addRipple(20 + Math.random() * 12, 2.0); nextIdle = clock + 1.8 + Math.random() * 1.8; }
            return;
        }
        if (flt.mode === "reel") {
            const ur = (clock - flt.t0) / REEL, s = smooth(ur);
            const target = { x: tip.x + REST.x + swayX(), y: tip.y + REST.y };
            C = { x: lerp(flt.from.x, target.x, s), y: lerp(flt.from.y, target.y, s) };
            flt.C = C;
            flt.tilt = lerp(0, tiltOf(C, tip), smooth(s * 1.5));
            flt.sag = lerp(18, 3, s);
            reelRot += dt * 14;
            if (ur >= 1) flt.mode = "hang";
        }
    }

    /* ---------- speech + mouth channel ---------- */
    const mouth = { v: 0, manual: null as number | null };
    let speech: { chars: string[]; starts: number[]; total: number; t0: number; idx: number; res: () => void } | null = null;
    let speechGen = 0, speechChain: Promise<void> = Promise.resolve();

    function openFor(ch: string) {
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
    function pauseFor(ch: string) {
        if (".!?…".indexOf(ch) > -1) return 5;
        if (",;:".indexOf(ch) > -1) return 3;
        return 1;
    }
    function runSpeech(text: string, speed: number): Promise<void> {
        return new Promise(res => {
            const per = 0.062 / speed;
            const chars = Array.from(text), starts: number[] = [];
            let t = 0;
            chars.forEach(ch => { starts.push(t); t += per * pauseFor(ch); });
            speech = { chars, starts, total: t, t0: clock, idx: 0, res };
            emit("speechstart", text);
        });
    }
    function finishSpeech() {
        const s = speech;
        if (!s) return;
        speech = null;
        emit("speechend");
        s.res();
    }
    function updateSpeech(dt: number) {
        let target = 0;
        if (speech) {
            const el = clock - speech.t0;
            if (el >= speech.total) { finishSpeech(); }
            else {
                while (speech.idx < speech.chars.length - 1 && speech.starts[speech.idx + 1] <= el) speech.idx++;
                target = openFor(speech.chars[speech.idx]) * (0.88 + 0.12 * Math.sin(clock * 38));
            }
        }
        if (mouth.manual !== null) target = mouth.manual;
        mouth.v += (target - mouth.v) * Math.min(1, dt * 26);
    }
    function say(text: string, speed = 1): Promise<void> {
        text = text.trim();
        if (!text) return Promise.resolve();
        const gen = speechGen;
        const p = speechChain.then(() => {
            if (gen !== speechGen) return;
            return runSpeech(text, speed);
        });
        speechChain = p.catch(() => {});
        return p;
    }

    /* ---------- drawing (reads state, writes SVG attributes) ---------- */
    const el = {
        shaft: $("shaft"), handle: $("handle"), reel: $("reel"), armF: $("armF"), armR: $("armR"), handF: $("handF"), handR: $("handR"),
        lineP: $("lineP"), bobber: $("bobber"), ring: $("ring"), refl: $("refl"), eye: $("eye"), fade: $("fade"), crown: $("crown"),
        head: $("head"), beard: $("beard"), mouthLine: $("mouthLine"), mouthO: $("mouthO"), tongue: $("tongue"),
        mist: $("mist"),
    };
    $("clipR").setAttribute("height", String(T.y + 1));

    function draw(g: ReturnType<typeof geo>, dip: number) {
        const u = g.u;
        const n = { x: -u.y, y: u.x };
        if (n.y < 0) { n.x = -n.x; n.y = -n.y; }

        /* rod */
        el.shaft.setAttribute("d", "M" + f(g.butt.x) + " " + f(g.butt.y) + " Q" + f(g.ctrl.x) + " " + f(g.ctrl.y) + " " + f(g.tip.x) + " " + f(g.tip.y));
        el.handle.setAttribute("x1", f(g.butt.x)); el.handle.setAttribute("y1", f(g.butt.y));
        el.handle.setAttribute("x2", f(g.P.x + u.x * 26)); el.handle.setAttribute("y2", f(g.P.y + u.y * 26));
        el.reel.setAttribute("transform", "translate(" + f(g.butt.x + u.x * 34 + n.x * 7) + " " + f(g.butt.y + u.y * 34 + n.y * 7) + ") rotate(" + f(reelRot * 57.3) + ")");

        /* arms */
        const H = g.P, H2 = { x: H.x - 12 * u.x, y: H.y - 12 * u.y };
        const e1 = elbow(SH, H, 34), e2 = elbow(SH2, H2, 34);
        el.armF.setAttribute("d", "M" + f(SH.x) + " " + f(SH.y) + " L" + f(e1.x) + " " + f(e1.y) + " L" + f(H.x) + " " + f(H.y));
        el.armR.setAttribute("d", "M" + f(SH2.x) + " " + f(SH2.y) + " L" + f(e2.x) + " " + f(e2.y) + " L" + f(H2.x) + " " + f(H2.y));
        el.handF.setAttribute("cx", f(H.x)); el.handF.setAttribute("cy", f(H.y));
        el.handR.setAttribute("cx", f(H2.x)); el.handR.setAttribute("cy", f(H2.y));

        /* float + line */
        const C = flt.C, tilt = flt.tilt, tip = g.tip;
        const A = { x: C.x + 18 * Math.sin(tilt), y: C.y - 18 * Math.cos(tilt) };
        el.bobber.setAttribute("transform", "translate(" + f(C.x) + " " + f(C.y) + ") rotate(" + f(tilt / D2R) + ")");
        el.lineP.setAttribute("d", "M" + f(tip.x) + " " + f(tip.y) + " Q" + f((tip.x + A.x) / 2) + " " + f((tip.y + A.y) / 2 + flt.sag) + " " + f(A.x) + " " + f(A.y));

        const landed = flt.mode === "landed", tau = clock - flt.t0;
        el.ring.setAttribute("opacity", landed ? (0.7 * smooth(tau / 0.1)).toFixed(2) : "0");
        el.ring.setAttribute("rx", f(9 + dip * 0.5));
        el.refl.setAttribute("opacity", landed ? (0.3 * smooth(tau / 0.3)).toFixed(2) : "0");
        el.refl.setAttribute("cx", f(T.x + 1.2 * Math.sin(clock * 2.1)));

        /* ripples */
        for (let i = 0; i < ripples.length; i++) {
            const r = ripples[i], p = (clock - r.t0) / r.life, e = rippleEls[i];
            if (p <= 0 || p >= 1) { e.setAttribute("opacity", "0"); continue; }
            const rad = r.max * (1 - Math.pow(1 - p, 2));
            e.setAttribute("rx", f(rad)); e.setAttribute("ry", f(rad * 0.2));
            e.setAttribute("opacity", (0.85 * Math.pow(1 - p, 1.5)).toFixed(2));
            e.setAttribute("stroke-width", (1.6 * (1 - p) + 0.5).toFixed(2));
        }

        /* splash */
        const ts = clock - splashT;
        if (ts > 0 && ts < 0.8) {
            el.crown.setAttribute("rx", f(40 * smooth(ts / 0.4)));
            el.crown.setAttribute("ry", f(40 * smooth(ts / 0.4) * 0.2));
            el.crown.setAttribute("opacity", (0.9 * (1 - clamp(ts / 0.5, 0, 1))).toFixed(2));
        } else el.crown.setAttribute("opacity", "0");
        for (let i = 0; i < dropEls.length; i++) {
            const d = dropEls[i];
            let shown = false;
            if (ts > 0 && ts < 0.75) {
                const vx = (i - 4.5) * 13 + Math.sin(i * 7) * 7, vy = -(120 + (i % 3) * 32);
                const dxp = T.x + vx * ts, dyp = T.y + vy * ts + 0.5 * 560 * ts * ts;
                if (dyp < T.y + 2) {
                    d.setAttribute("cx", f(dxp)); d.setAttribute("cy", f(dyp));
                    d.setAttribute("opacity", (1 - ts / 0.75).toFixed(2));
                    shown = true;
                }
            }
            if (!shown) d.setAttribute("opacity", "0");
        }

        /* face: gaze follows the float, mouth follows speech */
        el.eye.setAttribute("cx", f(198.5 + clamp((C.x - 199) / 250, -1, 1.6) * 1.1));
        el.eye.setAttribute("cy", f(236.5 + clamp((C.y - 237) / 300, -1, 1) * 0.9));
        const ov = mouth.v;
        if (ov > 0.1) {
            const ry = 0.5 + ov * 3.4, rx = 2.3 + ov * 0.9, cy = 247.3 + ov * 1.1;
            el.mouthLine.setAttribute("opacity", "0");
            el.mouthO.setAttribute("opacity", "1");
            el.mouthO.setAttribute("rx", f(rx)); el.mouthO.setAttribute("ry", f(ry)); el.mouthO.setAttribute("cy", f(cy));
            el.tongue.setAttribute("opacity", ov > 0.45 ? "1" : "0");
            el.tongue.setAttribute("cy", f(cy + ry * 0.45)); el.tongue.setAttribute("rx", f(rx * 0.55)); el.tongue.setAttribute("ry", f(ry * 0.4));
        } else {
            el.mouthLine.setAttribute("opacity", "1");
            el.mouthO.setAttribute("opacity", "0");
            el.tongue.setAttribute("opacity", "0");
        }
        el.beard.setAttribute("transform", "translate(0 " + f(ov * 2.2) + ")");
        el.head.setAttribute("transform", "translate(0 " + f(-0.5 * ov) + ") rotate(" + f(-1.8 * ov + 1.0 * ov * Math.sin(clock * 5.2)) + " 186 254)");

        /* fade in at load */
        el.fade.setAttribute("opacity", (1 - smooth(clock / 0.7)).toFixed(2));
    }

    /* ambient motion runs on the same clock but is independent of the actions */
    function ambient() {
        for (const c of clouds) c.el.setAttribute("transform", "translate(" + f(((c.x + clock * c.sp) % 1000) - 100) + " " + c.y + ")");
        for (const b of birds) b.el.setAttribute("transform", "translate(" + f(((b.x + clock * b.sp) % 900) - 50) + " " + f(b.y + Math.sin(clock * 0.8 + b.ph) * 4) + ") scale(1 " + (0.3 + 0.9 * Math.sin(clock * 6 + b.ph)).toFixed(2) + ")");
        for (const s of shim) {
            s.el.setAttribute("x", f(((s.x + clock * s.sp) % 900) - 50));
            s.el.setAttribute("y", f(s.y));
            s.el.setAttribute("width", f(s.w));
            s.el.setAttribute("opacity", (s.base * (0.55 + 0.45 * Math.sin(clock * 1.4 + s.ph))).toFixed(2));
        }
        for (let i = 0; i < sunDash.length; i++) {
            const w = 10 + i * 5.2;
            sunDash[i].setAttribute("x", f(565 - w / 2 + Math.sin(clock * 1.1 + i) * 3));
            sunDash[i].setAttribute("y", f(270 + i * 5.5));
            sunDash[i].setAttribute("width", f(w));
        }
        for (const r of reeds) r.g.setAttribute("transform", "translate(" + r.x + " " + r.y + ") rotate(" + f(Math.sin(clock * 0.9 + r.ph) * 2.6) + ")");
        el.mist.setAttribute("transform", "translate(" + f(Math.sin(clock * 0.12) * 30) + " 0)");
    }

    /* ---------- actions (each one is a small async routine over the channels) ---------- */
    async function doReelIn() {
        if (flt.mode === "hang") return;
        await waitFor(() => flt.mode !== "flight");
        flt.mode = "reel"; flt.t0 = clock; flt.from = { x: flt.C.x, y: flt.C.y };
        addRipple(34, 1.6);
        emit("reel");
        await waitFor(() => flt.mode === "hang");
        emit("reeled");
    }
    async function doWindUp() {
        if (flt.mode !== "hang") await doReelIn();
        if (rod.mode === "held") return;
        await waitFor(() => rod.mode !== "swing");
        setRod("windup");
        await waitFor(() => rod.mode === "held");
        emit("windup");
    }
    async function doSwing() {
        if (rod.mode !== "held") { await doWindUp(); await sleep(0.25); }
        setRod("swing");
        emit("swing");
        await waitFor(() => flt.mode === "flight");
        emit("release");
        await waitFor(() => flt.mode === "landed");
        emit("land");
    }
    async function doCast() {
        await doWindUp();
        await sleep(0.25);
        await doSwing();
    }

    /* casting actions run one after another */
    let actionChain: Promise<unknown> = Promise.resolve();
    function enqueue(fn: () => Promise<void>): Promise<void> {
        const p = actionChain.then(fn);
        actionChain = p.catch(() => {});
        return p;
    }

    /* ---------- main loop ---------- */
    function step(dt: number) {
        clock += dt;
        updateRod(dt);
        const dip = computeDip();
        const g = geo(dip);
        updateFloat(g.tip, dt, dip);
        updateSpeech(dt);
        if (!reduce) ambient();
        draw(g, dip);
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
    if (reduce) ambient();
    step(0);
    rafId = requestAnimationFrame(frame);

    const api: LakesideScene = {
        windUp: () => enqueue(doWindUp),
        swing: () => enqueue(doSwing),
        cast: () => enqueue(doCast),
        reelIn: () => enqueue(doReelIn),
        nibble() {
            if (flt.mode !== "landed") return Promise.resolve(false);
            nibbleNow();
            return sleep(1.0).then(() => true);
        },
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
        setMouth(v: number | null) { mouth.manual = (v == null) ? null : clamp(+v || 0, 0, 1); },
        on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); return api; },
        off(name, fn) { handlers[name] = (handlers[name] || []).filter(h => h !== fn); return api; },
        get state() { return { rod: rod.mode, float: flt.mode, speaking: !!speech }; },
        setPaused(p: boolean) { running = !p; },
        destroy() {
            destroyed = true;
            cancelAnimationFrame(rafId);
            waiters.length = 0;
            host.innerHTML = "";
        },
    };
    return api;
}
