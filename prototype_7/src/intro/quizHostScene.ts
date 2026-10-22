// The "Quiz Show Host" scene: the fisherman from prototypes 5 and 6 has left
// the campfire for a TV studio, with a live audience behind him and a speaker
// on each side of the stage. Ported from the standalone Quiz Show Host
// animation; the engine is unchanged, only the page chrome, the demo controls,
// the event emitters and the audio-file support are gone (main.ts plays the
// sounds itself and tells the scene how long each one lasts).

/** Where the host can point: a side of the screen, or one of its corners. */
export type PointTarget = "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface QuizHostScene {
    /** Mouth moves and he gestures for `ms`. Resolves true when it ran its course, false when cut short. */
    talk(ms: number): Promise<boolean>;
    stopTalking(): void;
    /** Point at a side or corner of the screen for `holdMs` (Infinity keeps pointing). */
    point(target: PointTarget, holdMs?: number): Promise<boolean>;
    stopPointing(): void;
    /** The audience claps for `ms`. */
    clap(ms?: number): Promise<boolean>;
    /** The audience goes "awww" for `ms`: heads tilt, brows go up, shoulders drop. */
    awww(ms?: number): Promise<boolean>;
    stopAudience(): void;
    /** Notes float up from the stage speakers and the speakers pulse for `ms`. */
    playMusic(ms?: number): Promise<boolean>;
    stopMusic(): void;
    destroy(): void;
}

const SVG_MARKUP = `<svg class="quizhost-svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Een quizshowstudio. Een presentator met baard, groene pet en oranje trui staat midden op het podium voor een publiek." xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="qh-wallG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b1f78"/>
      <stop offset="0.6" stop-color="#171553"/>
      <stop offset="1" stop-color="#0b1031"/>
    </linearGradient>
    <linearGradient id="qh-beamG" gradientUnits="userSpaceOnUse" x1="0" y1="28" x2="0" y2="396">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="qh-curtainG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9b2a52"/>
      <stop offset="1" stop-color="#5d1233"/>
    </linearGradient>
    <linearGradient id="qh-floorG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2f7a"/>
      <stop offset="1" stop-color="#0f1344"/>
    </linearGradient>
    <radialGradient id="qh-spotG">
      <stop offset="0" stop-color="#fff2d0" stop-opacity="0.55"/>
      <stop offset="0.6" stop-color="#ffd9a0" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="qh-floorGlowG">
      <stop offset="0" stop-color="#ffe3a8" stop-opacity="0.75"/>
      <stop offset="1" stop-color="#ffe3a8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="qh-vigG" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0.6" stop-color="#03051a" stop-opacity="0"/>
      <stop offset="1" stop-color="#03051a" stop-opacity="0.55"/>
    </radialGradient>
  </defs>

  <!-- back wall and sunburst -->
  <rect width="800" height="450" fill="url(#qh-wallG)"/>
  <g data-id="rays" fill="#ffffff" opacity="0.07"></g>

  <!-- audience, built in script -->
  <g data-id="aud"></g>

  <!-- stage lights over the crowd -->
  <g data-id="beams" style="mix-blend-mode:screen"></g>

  <!-- curtains -->
  <path d="M0 0H46Q30 220 48 450H0Z" fill="url(#qh-curtainG)"/>
  <path d="M800 0H754Q770 220 752 450H800Z" fill="url(#qh-curtainG)"/>
  <path d="M12 0Q8 220 16 450M28 0Q22 220 32 450" stroke="#2f0a1a" stroke-width="2" fill="none" opacity="0.5"/>
  <path d="M788 0Q792 220 784 450M772 0Q778 220 768 450" stroke="#2f0a1a" stroke-width="2" fill="none" opacity="0.5"/>
  <path data-id="valance" fill="url(#qh-curtainG)"/>
  <g data-id="bulbs"></g>

  <!-- spotlight on the host -->
  <ellipse cx="400" cy="300" rx="170" ry="210" fill="url(#qh-spotG)" style="mix-blend-mode:screen"/>

  <!-- stage -->
  <path d="M0 397 Q400 389 800 397 L800 450 L0 450Z" fill="url(#qh-floorG)"/>
  <path d="M0 397 Q400 389 800 397" fill="none" stroke="#ffcf5a" stroke-width="2.5" opacity="0.85"/>
  <ellipse cx="400" cy="428" rx="150" ry="17" fill="url(#qh-floorGlowG)"/>
  <ellipse cx="400" cy="428" rx="104" ry="12" fill="none" stroke="#ffcf5a" stroke-width="1.6" opacity="0.55"/>

  <!-- stage speakers -->
  <g transform="translate(100 414)">
    <rect x="-16" y="-46" width="32" height="46" rx="4" fill="#1a1d3d" stroke="#3a3f7a" stroke-width="1.5"/>
    <circle cx="0" cy="-35" r="3.6" fill="#0a0c24"/>
    <g data-id="coneL"><circle cx="0" cy="-17" r="10" fill="#0a0c24" stroke="#4d539a" stroke-width="1.5"/><circle cx="0" cy="-17" r="4.6" fill="#2a2e66"/></g>
  </g>
  <g transform="translate(700 414)">
    <rect x="-16" y="-46" width="32" height="46" rx="4" fill="#1a1d3d" stroke="#3a3f7a" stroke-width="1.5"/>
    <circle cx="0" cy="-35" r="3.6" fill="#0a0c24"/>
    <g data-id="coneR"><circle cx="0" cy="-17" r="10" fill="#0a0c24" stroke="#4d539a" stroke-width="1.5"/><circle cx="0" cy="-17" r="4.6" fill="#2a2e66"/></g>
  </g>

  <!-- the host: local origin is between his feet -->
  <g data-id="host">
    <ellipse cx="0" cy="1" rx="36" ry="6" fill="#000" opacity="0.35"/>
    <path d="M-12 -90 L-13 -12" stroke="#33485a" stroke-width="19" stroke-linecap="round" fill="none"/>
    <path d="M12 -90 L13 -12" stroke="#33485a" stroke-width="19" stroke-linecap="round" fill="none"/>
    <ellipse cx="-15" cy="-5" rx="12" ry="6" fill="#15181a"/>
    <ellipse cx="15" cy="-5" rx="12" ry="6" fill="#15181a"/>

    <g data-id="torso">
      <path d="M-31 -146 Q-34 -118 -31 -88 L31 -88 Q34 -118 31 -146 Q0 -156 -31 -146Z" fill="#d4622d"/>
      <path d="M19 -140 Q23 -118 21 -96" stroke="#b24d20" stroke-width="2" fill="none" opacity="0.5" stroke-linecap="round"/>
      <rect x="-31" y="-95" width="62" height="7" rx="3" fill="#b24d20"/>
      <rect x="-7" y="-161" width="14" height="14" fill="#d6a27c"/>
      <path d="M-12 -152 Q0 -141 12 -152" fill="none" stroke="#b24d20" stroke-width="3" stroke-linecap="round"/>
      <path d="M0 -146 L-13 -153 L-13 -139Z M0 -146 L13 -153 L13 -139Z" fill="#2f8f8a"/>
      <rect x="-3" y="-150" width="6" height="8" rx="2" fill="#1f6b66"/>
    </g>

    <path data-id="armL" fill="none" stroke="#d4622d" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    <path data-id="armR" fill="none" stroke="#d4622d" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    <line data-id="fingL" stroke="#e3b690" stroke-width="3.8" stroke-linecap="round"/>
    <line data-id="fingR" stroke="#e3b690" stroke-width="3.8" stroke-linecap="round"/>
    <circle data-id="handL" r="5.6" fill="#e3b690"/>
    <circle data-id="handR" r="5.6" fill="#e3b690"/>

    <g data-id="head">
      <ellipse cx="-19.5" cy="-176" rx="3.6" ry="5.2" fill="#d9a984"/>
      <ellipse cx="19.5" cy="-176" rx="3.6" ry="5.2" fill="#d9a984"/>
      <ellipse cx="0" cy="-176" rx="19" ry="20" fill="#e3b690"/>
      <g data-id="face">
        <ellipse cx="0" cy="-174" rx="3.6" ry="3" fill="#d3a07c"/>
        <g data-id="jaw">
          <path d="M-19 -174 Q-22 -148 0 -145 Q22 -148 19 -174 Q12 -168 0 -169 Q-12 -168 -19 -174Z" fill="#7a6a58"/>
          <ellipse data-id="mouthE" cx="0" cy="-163" rx="4.4" ry="0.8" fill="#4a1612"/>
          <ellipse data-id="tongue" cx="0" cy="-161" rx="2.4" ry="1.4" fill="#c4584c" opacity="0"/>
        </g>
        <path d="M-13 -168 Q-7 -173.5 0 -169.5 Q7 -173.5 13 -168 Q8 -164.5 0 -166.2 Q-8 -164.5 -13 -168Z" fill="#6c5c4a"/>
        <g data-id="eyeL" transform="translate(-7.6 -178)"><ellipse rx="3.6" ry="3.7" fill="#ffffff"/><circle data-id="pupL" r="1.9" fill="#1f2a2e"/></g>
        <g data-id="eyeR" transform="translate(7.6 -178)"><ellipse rx="3.6" ry="3.7" fill="#ffffff"/><circle data-id="pupR" r="1.9" fill="#1f2a2e"/></g>
        <path data-id="browL" fill="none" stroke="#6a5b4a" stroke-width="2.4" stroke-linecap="round"/>
        <path data-id="browR" fill="none" stroke="#6a5b4a" stroke-width="2.4" stroke-linecap="round"/>
      </g>
      <!-- headset mic -->
      <circle cx="-20" cy="-176" r="4" fill="#15181a"/>
      <path d="M-20 -172 Q-22 -160 -9 -160.5" fill="none" stroke="#15181a" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="-8.5" cy="-160.5" r="2.4" fill="#15181a"/>
      <!-- cap -->
      <path d="M-20.5 -190 Q-21 -214 0 -214.5 Q21 -214 20.5 -190Z" fill="#2f4a3a"/>
      <path d="M-20.5 -193.5 Q0 -188 20.5 -193.5" fill="none" stroke="#d9a441" stroke-width="3.4"/>
      <ellipse cx="0" cy="-190" rx="25.5" ry="4.3" fill="#284233"/>
      <circle cx="0" cy="-214.5" r="2.2" fill="#284233"/>
    </g>
  </g>

  <g data-id="notes"></g>
  <rect width="800" height="450" fill="url(#qh-vigG)"/>

  <rect data-id="fade" x="0" y="0" width="800" height="450" fill="#0b1031" opacity="1"/>
</svg>`;

interface Pt { x: number; y: number; }

/** One running action (talk, point, clap, awww, music). Starting a new one in the same slot cuts the old one short. */
interface Act { res: (ok: boolean) => void; until: number; }
interface PointAct extends Act { name: PointTarget; arm: ArmKey; ang: number; turn: number; pitch: number; lean: number; }
interface Slot<A extends Act> { act: A | null; }
type ArmKey = "L" | "R";

export function createQuizHostScene(host: HTMLElement): QuizHostScene {
    host.innerHTML = SVG_MARKUP;
    const svg = host.querySelector("svg")!;

    const NS = "http://www.w3.org/2000/svg";
    const $ = (id: string): SVGElement => svg.querySelector(`[data-id="${id}"]`) as SVGElement;
    const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const f = (v: number) => v.toFixed(2);
    // Every frame rewrites the animated attributes (a hundred audience members
    // each frame); skip the ones whose value didn't change, so the browser
    // doesn't re-lay out and repaint the SVG for nothing.
    const attrCache = new WeakMap<Element, Record<string, string>>();
    function setAttr(e: Element, name: string, value: string): void {
        let c = attrCache.get(e);
        if (!c) attrCache.set(e, c = {});
        if (c[name] === value) return;
        c[name] = value;
        e.setAttribute(name, value);
    }
    function mk(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
        const e = document.createElementNS(NS, tag);
        for (const k in attrs) setAttr(e, k, String(attrs[k]));
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
    const HX = 400, HY = 424, SC = 1.04;       // host position and scale on the stage
    const SHY = -148, SHX = 26, ARM = 36;      // shoulders and length of each arm segment (local units)
    const REACH = 2 * ARM - 0.4;               // a fully straight arm

    /* ---------- scenery (built once) ---------- */
    (function sunburst() {
        let d = "";
        for (let i = 0; i < 24; i++) {
            const a0 = i / 24 * Math.PI * 2, a1 = a0 + Math.PI / 24;
            d += "M400 300L" + f(400 + Math.cos(a0) * 900) + " " + f(300 + Math.sin(a0) * 900) + "L" + f(400 + Math.cos(a1) * 900) + " " + f(300 + Math.sin(a1) * 900) + "Z";
        }
        mk("path", { d }, $("rays"));
    })();
    const raysEl = $("rays");

    (function valance() {
        let d = "M0 0H800V30";
        for (let i = 0; i < 16; i++) d += " Q" + (800 - i * 50 - 25) + " 52 " + (800 - (i + 1) * 50) + " 30";
        setAttr($("valance"), "d", d + "Z");
    })();
    const bulbs: { el: SVGElement; ph: number }[] = [];
    for (let i = 0; i < 16; i++) {
        bulbs.push({ el: mk("circle", { cx: 25 + i * 50, cy: 43, r: 3.2, fill: i % 2 ? "#ffe9a8" : "#ffffff" }, $("bulbs")), ph: i * 0.8 });
    }

    const beams: { el: SVGElement; x: number; ph: number }[] = [];
    [120, 300, 500, 680].forEach((x, i) => {
        const el = mk("path", { d: "M" + x + " 28L" + (x - 52) + " 396L" + (x + 52) + " 396Z", fill: "url(#qh-beamG)", opacity: "0.16" }, $("beams"));
        beams.push({ el, x, ph: i * 1.7 });
    });

    /* ---------- audience (built once, animated every frame) ---------- */
    const SKINS = ["#f1c9a5", "#e0ac82", "#c68863", "#a06a45", "#7a4a30", "#f5d6b8"];
    const HAIRS = ["#2a1d17", "#4a3020", "#7a5230", "#c9a05a", "#9a9a9a", "#b5452e", "#15110f"];
    const SHIRTS = ["#c4453d", "#3b7fc4", "#4aa36b", "#d9a441", "#8a5cc4", "#2f8f8a", "#d46a9a", "#e8e1d0", "#5a6b7a", "#e07b39"];
    interface Member {
        body: SVGElement; head: SVGElement; armL: SVGElement; armR: SVGElement; handL: SVGElement; handR: SVGElement;
        blushL: SVGElement; blushR: SVGElement; eyeL: SVGElement; eyeR: SVGElement; browL: SVGElement; browR: SVGElement;
        mouth: SVGElement; mouthO: SVGElement;
        ph: number; ph2: number; cph: number; rate: number; tilt: number;
        blinkAt: number; blinkT: number; armsOn: boolean; faceReset: boolean;
    }
    const members: Member[] = [];
    (function () {
        const aud = $("aud"), rnd = mulberry(42);
        const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
        const rows = [{ y: 196, s: 0.58, sp: 30, off: 0 }, { y: 240, s: 0.72, sp: 36, off: 14 }, { y: 290, s: 0.88, sp: 44, off: 0 }, { y: 346, s: 1.06, sp: 54, off: 22 }];
        rows.forEach(R => {
            mk("rect", { x: 0, y: f(R.y + 13 * R.s), width: 800, height: 450, fill: "#121945" }, aud);
            const n = Math.ceil(840 / R.sp);
            for (let i = 0; i < n; i++) {
                const x = -14 + i * R.sp + R.off + (rnd() - 0.5) * R.sp * 0.25;
                members.push(makeMember(aud, x, R.y + (rnd() - 0.5) * 3, R.s));
            }
            mk("rect", { width: 800, height: 450, fill: "#0b1033", opacity: "0.2" }, aud);
        });
        function makeMember(parent: Element, x: number, y: number, s: number): Member {
            const skin = pick(SKINS), hair = pick(HAIRS), shirt = pick(SHIRTS), style = Math.floor(rnd() * 5);
            const g = mk("g", { transform: "translate(" + f(x) + " " + f(y) + ") scale(" + s + ")" }, parent);
            if (style === 2) mk("path", { d: "M-12.5 -1Q-13.5 -13.5 0 -13.5Q13.5 -13.5 12.5 -1L14 18L-14 18Z", fill: hair }, g);
            const body = mk("g", {}, g);
            mk("path", { d: "M-17 46L-17 24Q-17 13 -6 12.5L6 12.5Q17 13 17 24L17 46Z", fill: shirt }, body);
            mk("rect", { x: -3.5, y: 9, width: 7, height: 6, fill: skin }, body);
            const armAttrs = { d: "", fill: "none", stroke: shirt, "stroke-width": 5.4, "stroke-linecap": "round", opacity: 0 };
            const armL = mk("path", armAttrs, body), armR = mk("path", armAttrs, body);
            const handL = mk("circle", { r: 3.1, fill: skin, opacity: 0 }, body), handR = mk("circle", { r: 3.1, fill: skin, opacity: 0 }, body);
            const head = mk("g", {}, g);
            mk("circle", { r: 11, fill: skin }, head);
            const fringe = "M-11.2 -1.5Q-12 -12.5 0 -12.6Q12 -12.5 11.2 -1.5Q6 -8 0 -7.6Q-6 -8 -11.2 -1.5Z";
            if (style === 0 || style === 1 || style === 2) mk("path", { d: fringe, fill: hair }, head);
            if (style === 1) mk("circle", { cx: 0, cy: -13.5, r: 4.2, fill: hair }, head);
            if (style === 4) [-8, -4, 0, 4, 8].forEach(cx => { mk("circle", { cx, cy: -9 + Math.abs(cx) * 0.25, r: 4.2, fill: hair }, head); });
            const blushL = mk("ellipse", { cx: -6.5, cy: 4, rx: 2.6, ry: 1.6, fill: "#ff7a8a", opacity: 0 }, head);
            const blushR = mk("ellipse", { cx: 6.5, cy: 4, rx: 2.6, ry: 1.6, fill: "#ff7a8a", opacity: 0 }, head);
            const eyeL = mk("ellipse", { cx: -4.2, cy: -0.5, rx: 1.45, ry: 1.45, fill: "#1d1d28" }, head);
            const eyeR = mk("ellipse", { cx: 4.2, cy: -0.5, rx: 1.45, ry: 1.45, fill: "#1d1d28" }, head);
            const bAttr = { d: "", fill: "none", stroke: "#2b2018", "stroke-width": 1.1, "stroke-linecap": "round", opacity: 0.8 };
            const browL = mk("path", bAttr, head), browR = mk("path", bAttr, head);
            const mouth = mk("path", { d: "M-3.6 5.6Q0 7.8 3.6 5.6", fill: "none", stroke: "#7a2f2f", "stroke-width": 1.2, "stroke-linecap": "round" }, head);
            const mouthO = mk("ellipse", { cx: 0, cy: 6.8, rx: 1.9, ry: 1.4, fill: "#5b1d18", opacity: 0 }, head);
            return {
                body, head, armL, armR, handL, handR, blushL, blushR, eyeL, eyeR, browL, browR, mouth, mouthO,
                ph: rnd() * 6.28, ph2: rnd() * 6.28, cph: rnd() * 6.28, rate: 4.4 + rnd() * 1.8, tilt: rnd() < 0.5 ? -1 : 1,
                blinkAt: 1 + rnd() * 5, blinkT: -9, armsOn: false, faceReset: false,
            };
        }
    })();

    /* ---------- clock and activities ---------- */
    let clock = 0, running = true, destroyed = false;

    const talkSlot: Slot<Act> = { act: null };
    const pointSlot: Slot<PointAct> = { act: null };
    const clapSlot: Slot<Act> = { act: null };
    const awwSlot: Slot<Act> = { act: null };
    const musicSlot: Slot<Act> = { act: null };
    const slots: Slot<Act>[] = [talkSlot, pointSlot, clapSlot, awwSlot, musicSlot];

    function endAct(slot: Slot<Act>, ok: boolean): void {
        const a = slot.act;
        if (!a) return;
        slot.act = null;
        a.res(ok);
    }
    function startAct<A extends Act>(slot: Slot<A>, ms: number, extra?: Omit<A, keyof Act>): Promise<boolean> {
        if (slot.act) endAct(slot, false);
        return new Promise(res => {
            const until = ms === Infinity ? Infinity : clock + Math.max(0, ms) / 1000;
            slot.act = { ...extra, res, until } as A;
        });
    }
    function tickSlot(slot: Slot<Act>): void {
        const a = slot.act;
        if (a && a.until !== Infinity && clock >= a.until) endAct(slot, true);
    }

    /* ---------- host ---------- */
    const el = {
        host: $("host"), torso: $("torso"), head: $("head"), face: $("face"), jaw: $("jaw"),
        mouthE: $("mouthE"), tongue: $("tongue"), eyeL: $("eyeL"), eyeR: $("eyeR"), pupL: $("pupL"), pupR: $("pupR"),
        browL: $("browL"), browR: $("browR"), fade: $("fade"),
    };
    interface Arm { side: number; sx: number; sy: number; ph: number; pos: Pt; vel: Pt; pt: number; armEl: SVGElement; handEl: SVGElement; fingEl: SVGElement; }
    const arms: Record<ArmKey, Arm> = {
        L: { side: -1, sx: -SHX, sy: SHY, ph: 0.4, pos: { x: -30, y: -92 }, vel: { x: 0, y: 0 }, pt: 0, armEl: $("armL"), handEl: $("handL"), fingEl: $("fingL") },
        R: { side: 1, sx: SHX, sy: SHY, ph: 2.3, pos: { x: 30, y: -92 }, vel: { x: 0, y: 0 }, pt: 0, armEl: $("armR"), handEl: $("handR"), fingEl: $("fingR") },
    };

    /** A point on the edge of the visible screen, in scene coordinates. The
     *  scene is letterboxed (meet) on a phone, so the screen's corners can lie
     *  well outside the 800×450 picture - aim at where they really are. */
    function screenPoint(fx: number, fy: number): Pt {
        const m = svg.getScreenCTM();
        if (!m) return { x: fx * 800, y: fy * 450 };
        const p = new DOMPoint(fx * window.innerWidth, fy * window.innerHeight).matrixTransform(m.inverse());
        return { x: p.x, y: p.y };
    }
    const POINTS: Record<PointTarget, { arm: ArmKey; turn: number; pitch: number; at: (s: Pt) => Pt }> = {
        "left":         { arm: "L", turn: -1,    pitch: -0.05, at: s => ({ x: s.x - 600, y: s.y - 40 }) },
        "right":        { arm: "R", turn: 1,     pitch: -0.05, at: s => ({ x: s.x + 600, y: s.y - 40 }) },
        "top-left":     { arm: "L", turn: -0.85, pitch: -1,    at: () => screenPoint(0, 0) },
        "top-right":    { arm: "R", turn: 0.85,  pitch: -1,    at: () => screenPoint(1, 0) },
        "bottom-left":  { arm: "L", turn: -0.85, pitch: 0.9,   at: () => screenPoint(0, 1) },
        "bottom-right": { arm: "R", turn: 0.85,  pitch: 0.9,   at: () => screenPoint(1, 1) },
    };

    function point(name: PointTarget, hold = 1500): Promise<boolean> {
        const P = POINTS[name], A = arms[P.arm];
        const leanDeg = P.turn * 2.0;
        const sh = { x: HX + SC * A.sx, y: HY + SC * A.sy }, tg = P.at(sh);
        const ang = Math.atan2(tg.y - sh.y, tg.x - sh.x) - leanDeg * Math.PI / 180;
        return startAct(pointSlot, hold === Infinity ? Infinity : Math.max(0, hold) + 350,
            { name, arm: P.arm, ang, turn: P.turn, pitch: P.pitch, lean: leanDeg });
    }

    let mouthV = 0, syl = { end: 0, t0: 0, peak: 0, dur: 0.1 }, sylN = 0, headBob = 0, gest = 0;
    let turnS = 0, pitchS = 0, leanS = 0, raiseS = 0;
    const blink = { next: 2.5, t0: -9 };

    function nextSyl(): void {
        const pause = (sylN++ % 5 === 4) && Math.random() < 0.7;
        let peak: number, dur: number;
        if (pause) { peak = 0; dur = 0.16 + Math.random() * 0.12; }
        else { peak = 0.3 + Math.random() * 0.7; dur = 0.08 + Math.random() * 0.09; }
        syl = { t0: clock, end: clock + dur, peak, dur };
        if (peak > 0.55) headBob = Math.min(1.5, headBob + 0.45);
    }
    function updateMouth(dt: number): void {
        let target = 0;
        if (talkSlot.act) {
            if (clock >= syl.end) nextSyl();
            const ph = clamp((clock - syl.t0) / syl.dur, 0, 1);
            target = syl.peak * Math.pow(Math.sin(Math.PI * ph), 0.7);
        }
        mouthV += (target - mouthV) * Math.min(1, dt * 24);
    }

    function elbow(S: Pt, H: Pt, l: number, side: number): Pt {
        const dx = H.x - S.x, dy = H.y - S.y, d = Math.hypot(dx, dy) || 1;
        const dd = Math.min(d, 2 * l - 0.3);
        const mx = S.x + dx * (dd / d) / 2, my = S.y + dy * (dd / d) / 2;
        const h = Math.sqrt(Math.max(0, l * l - dd * dd / 4));
        let px = -dy / d, py = dx / d;
        if (py + 0.35 * px * side < 0) { px = -px; py = -py; }
        return { x: mx + px * h, y: my + py * h };
    }

    function updateArms(dt: number): void {
        const talking = !!talkSlot.act, pa = pointSlot.act;
        gest += ((talking ? 1 : 0) - gest) * Math.min(1, dt * 5);
        (["L", "R"] as ArmKey[]).forEach(k => {
            const A = arms[k];
            const pointing = !!pa && pa.arm === k;
            A.pt += ((pointing ? 1 : 0) - A.pt) * Math.min(1, dt * 12);
            let target: Pt;
            if (pointing) {
                target = { x: A.sx + Math.cos(pa!.ang) * REACH, y: A.sy + Math.sin(pa!.ang) * REACH };
            } else {
                const sw = reduce ? 0 : Math.sin(clock * 1.1 + A.ph);
                const rest = { x: A.side * 30 + sw * 0.8, y: -92 + sw * 0.8 };
                const ep = Math.pow(Math.max(0, Math.sin(clock * 1.3 + A.ph * 2)), 3) * 14;
                const gb = {
                    x: A.side * (58 + 8 * Math.sin(clock * 2.3 + A.ph) + 3 * Math.sin(clock * 3.7)),
                    y: -116 + 6 * Math.sin(clock * 2.9 + A.ph * 1.7) - ep,
                };
                target = { x: lerp(rest.x, gb.x, gest), y: lerp(rest.y, gb.y, gest) };
            }
            /* spring toward the target, two sub-steps for stability */
            for (let s = 0; s < 2; s++) {
                const h = dt / 2;
                A.vel.x += (target.x - A.pos.x) * 300 * h; A.vel.y += (target.y - A.pos.y) * 300 * h;
                const damp = Math.exp(-11 * h); A.vel.x *= damp; A.vel.y *= damp;
                A.pos.x += A.vel.x * h; A.pos.y += A.vel.y * h;
            }
            const dx = A.pos.x - A.sx, dy = A.pos.y - A.sy, d = Math.hypot(dx, dy);
            if (d > REACH) { A.pos.x = A.sx + dx / d * REACH; A.pos.y = A.sy + dy / d * REACH; }
        });
    }

    function drawArms(): void {
        (["L", "R"] as ArmKey[]).forEach(k => {
            const A = arms[k], S = { x: A.sx, y: A.sy }, H = A.pos, E = elbow(S, H, ARM, A.side);
            setAttr(A.armEl, "d", "M" + f(S.x) + " " + f(S.y) + "L" + f(E.x) + " " + f(E.y) + "L" + f(H.x) + " " + f(H.y));
            setAttr(A.handEl, "cx", f(H.x)); setAttr(A.handEl, "cy", f(H.y));
            setAttr(A.handEl, "r", f(5.6 - 0.5 * A.pt));
            const dx = H.x - E.x, dy = H.y - E.y, d = Math.hypot(dx, dy) || 1, len = 11 * A.pt;
            setAttr(A.fingEl, "x1", f(H.x)); setAttr(A.fingEl, "y1", f(H.y));
            setAttr(A.fingEl, "x2", f(H.x + dx / d * len)); setAttr(A.fingEl, "y2", f(H.y + dy / d * len));
            setAttr(A.fingEl, "opacity", A.pt > 0.05 ? "1" : "0");
        });
    }

    function drawHost(dt: number): void {
        const pa = pointSlot.act, talking = !!talkSlot.act;
        /* where he looks and leans */
        let turnT: number, pitchT: number, leanT = 0;
        if (pa) { turnT = pa.turn; pitchT = pa.pitch; leanT = pa.lean; }
        else { turnT = reduce ? 0 : 0.3 * Math.sin(clock * 0.4) + 0.12 * Math.sin(clock * 0.93); pitchT = 0; }
        turnS += (turnT - turnS) * Math.min(1, dt * 8);
        pitchS += (pitchT - pitchS) * Math.min(1, dt * 8);
        leanS += (leanT - leanS) * Math.min(1, dt * 6);
        const ptAny = Math.max(arms.L.pt, arms.R.pt);
        const raiseT = ptAny * 1.6 + (talking ? 0.8 * Math.max(0, Math.sin(clock * 2.2)) : 0);
        raiseS += (raiseT - raiseS) * Math.min(1, dt * 10);
        headBob = Math.max(0, headBob - dt * 4);

        const sway = reduce ? 0 : Math.sin(clock * 0.5) * 1.2;
        setAttr(el.host, "transform", "translate(" + f(HX + sway) + " " + HY + ") scale(" + SC + ") rotate(" + f(leanS) + ")");
        const br = reduce ? 0 : Math.sin(clock * 1.6) * 0.006;
        setAttr(el.torso, "transform", "translate(0 -88) scale(1 " + f(1 + br) + ") translate(0 88)");

        /* head */
        const nod = talking && !reduce ? Math.sin(clock * 3.1) * 0.7 : 0;
        setAttr(el.head, "transform", "translate(" + f(turnS * 1.4) + " " + f(pitchS * 1.2 + headBob * 1.1) + ") rotate(" + f(turnS * 4 + nod + pitchS * -1.5) + " 0 -158)");
        setAttr(el.face, "transform", "translate(" + f(turnS * 2.4) + " " + f(pitchS * 1.0) + ")");

        /* eyes */
        const gx = turnS * 1.7 + (pa ? 0 : (reduce ? 0 : Math.sin(clock * 0.37) * 0.5)), gy = pitchS * 1.2;
        setAttr(el.pupL, "cx", f(gx)); setAttr(el.pupL, "cy", f(gy));
        setAttr(el.pupR, "cx", f(gx)); setAttr(el.pupR, "cy", f(gy));
        if (clock >= blink.next) { blink.t0 = clock; blink.next = clock + 2.5 + ((Math.sin(clock * 12.9) + 1) * 2.5); }
        const bt = (clock - blink.t0) / 0.16, bs = bt >= 0 && bt < 1 ? Math.max(0.1, Math.abs(1 - 2 * bt)) : 1;
        setAttr(el.eyeL, "transform", "translate(-7.6 -178) scale(1 " + f(bs) + ")");
        setAttr(el.eyeR, "transform", "translate(7.6 -178) scale(1 " + f(bs) + ")");
        const by = -183.2 - raiseS;
        setAttr(el.browL, "d", "M-11.2 " + f(by + 0.6) + "Q-7.4 " + f(by - 1) + " -3.4 " + f(by + 0.2));
        setAttr(el.browR, "d", "M11.2 " + f(by + 0.6) + "Q7.4 " + f(by - 1) + " 3.4 " + f(by + 0.2));

        /* mouth and jaw */
        const ov = mouthV, ry = 0.7 + ov * 4.8, rx = 4.4 + ov * 1.6, cy = -163 + ov * 1.5;
        setAttr(el.jaw, "transform", "translate(0 " + f(ov * 2.4) + ")");
        setAttr(el.mouthE, "rx", f(rx)); setAttr(el.mouthE, "ry", f(ry)); setAttr(el.mouthE, "cy", f(cy));
        setAttr(el.tongue, "cy", f(cy + ry * 0.55)); setAttr(el.tongue, "rx", f(rx * 0.55)); setAttr(el.tongue, "ry", f(ry * 0.4));
        setAttr(el.tongue, "opacity", ov > 0.4 ? "1" : "0");
    }

    /* ---------- audience animation ---------- */
    let clapL = 0, awwL = 0;
    function drawAudience(dt: number): void {
        clapL += ((clapSlot.act ? 1 : 0) - clapL) * Math.min(1, dt * (clapSlot.act ? 7 : 3.5));
        awwL += ((awwSlot.act ? 1 : 0) - awwL) * Math.min(1, dt * (awwSlot.act ? 5 : 2.5));
        const C = clapL < 0.004 ? 0 : clapL, W = awwL < 0.004 ? 0 : awwL, t = clock, amp = reduce ? 0.4 : 1;
        const activeFace = C > 0 || W > 0;
        for (const m of members) {
            let bob = reduce ? 0 : Math.sin(t * 1.3 + m.ph) * 0.5;
            let rot = reduce ? 0 : Math.sin(t * 0.6 + m.ph2) * 1.1;
            let tx = 0, beat = 0;
            if (C > 0) {
                beat = Math.cos(t * m.rate * 6.2832 + m.cph);
                bob -= C * (0.5 + 0.7 * (0.5 + 0.5 * beat)) * amp * 1.6;
            }
            if (W > 0) {
                bob += W * 1.6;
                rot += W * m.tilt * (8 + 3 * Math.sin(t * 2 + m.ph)) * (reduce ? 0.7 : 1);
                tx += W * m.tilt * 1.4;
            }
            setAttr(m.body, "transform", "translate(0 " + f(bob) + ")");
            setAttr(m.head, "transform", "translate(" + f(tx) + " " + f(bob) + ") rotate(" + f(rot) + " 0 12)");

            /* clapping arms */
            if (C > 0.02) {
                const open = 0.5 + 0.5 * beat, gap = 1.3 + 9.5 * open, hy = lerp(34, 25.5, Math.min(1, C)) - 2.2 * (1 - open), op = Math.min(1, C * 2.5).toFixed(2);
                setAttr(m.armL, "d", "M-14 21Q-17 " + f(hy + 5) + " " + f(-gap) + " " + f(hy));
                setAttr(m.armR, "d", "M14 21Q17 " + f(hy + 5) + " " + f(gap) + " " + f(hy));
                setAttr(m.handL, "cx", f(-gap)); setAttr(m.handL, "cy", f(hy));
                setAttr(m.handR, "cx", f(gap)); setAttr(m.handR, "cy", f(hy));
                setAttr(m.armL, "opacity", op); setAttr(m.armR, "opacity", op);
                setAttr(m.handL, "opacity", op); setAttr(m.handR, "opacity", op);
                m.armsOn = true;
            } else if (m.armsOn) {
                setAttr(m.armL, "opacity", "0"); setAttr(m.armR, "opacity", "0");
                setAttr(m.handL, "opacity", "0"); setAttr(m.handR, "opacity", "0");
                m.armsOn = false;
            }

            /* blink */
            if (t >= m.blinkAt) { m.blinkT = t; m.blinkAt = t + 2 + ((Math.sin(t * 7.7 + m.ph) + 1) * 2.5); }
            const b = (t - m.blinkT) / 0.14, ery = b >= 0 && b < 1 ? Math.max(0.2, 1.45 * Math.abs(1 - 2 * b)) : 1.45;
            setAttr(m.eyeL, "ry", f(ery)); setAttr(m.eyeR, "ry", f(ery));

            /* brows, mouth and blush only change while a reaction is running */
            if (activeFace || !m.faceReset) {
                const up = C * 0.8, o = -5.8 + 1.3 * W - up, inn = -5.8 - 2.3 * W - up;
                setAttr(m.browL, "d", "M-7.4 " + f(o) + "L-2 " + f(inn));
                setAttr(m.browR, "d", "M7.4 " + f(o) + "L2 " + f(inn));
                const mo = smooth((W - 0.25) / 0.3), curve = 2.2 + 3.2 * C;
                setAttr(m.mouth, "d", "M-3.6 5.6Q0 " + f(5.6 + curve) + " 3.6 5.6");
                setAttr(m.mouth, "opacity", (1 - mo).toFixed(2));
                setAttr(m.mouthO, "opacity", mo.toFixed(2));
                setAttr(m.mouthO, "rx", f(1.9 + 0.3 * Math.sin(t * 5 + m.ph)));
                setAttr(m.mouthO, "ry", f(1.4 + 0.4 * Math.sin(t * 4.1 + m.ph2)));
                const bl = (0.55 * W + 0.25 * C).toFixed(2);
                setAttr(m.blushL, "opacity", bl); setAttr(m.blushR, "opacity", bl);
                m.faceReset = !activeFace;
            }
        }
    }

    /* ---------- room lights ---------- */
    function drawRoom(): void {
        setAttr(raysEl, "transform", "rotate(" + f(reduce ? 0 : clock * 2.5) + " 400 300)");
        for (const b of beams) {
            const a = reduce ? 0 : Math.sin(clock * 0.5 + b.ph) * 4;
            setAttr(b.el, "transform", "rotate(" + f(a) + " " + b.x + " 28)");
            setAttr(b.el, "opacity", (0.15 + (reduce ? 0 : 0.05 * Math.sin(clock * 0.9 + b.ph))).toFixed(2));
        }
        for (const u of bulbs) {
            setAttr(u.el, "opacity", (reduce ? 1 : 0.6 + 0.4 * Math.sin(clock * 3 + u.ph)).toFixed(2));
        }
    }

    /* ---------- music notes ----------
       Notes spawn at the stage speakers (and now and then along the stage
       front), drift upward with a sway, and fade out. */
    interface Note { g: SVGElement; on: boolean; t0: number; life: number; x0: number; y0: number; vy: number; amp: number; swF: number; ph: number; sc: number; drift: number; }
    const notes: Note[] = [], notesG = $("notes");
    let musicL = 0, spawnT = 0;
    const NOTE_COLS = ["#ffd24a", "#ff7aa8", "#6fd3ff", "#9ef28a", "#ffffff", "#c9a0ff"];
    const SPEAKERS = [{ x: 100, y: 366, cone: $("coneL") }, { x: 700, y: 366, cone: $("coneR") }];
    function makeNote(): Note {
        const g = mk("g", { opacity: 0 }, notesG), col = NOTE_COLS[Math.floor(Math.random() * NOTE_COLS.length)], ink = "#0b1033";
        const head = (cx: number, cy: number) => { mk("ellipse", { cx, cy, rx: 5.2, ry: 3.8, transform: "rotate(-20 " + cx + " " + cy + ")", fill: col, stroke: ink, "stroke-width": 1.2 }, g); };
        const stem = (d: string) => {
            mk("path", { d, fill: "none", stroke: ink, "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
            mk("path", { d, fill: "none", stroke: col, "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
        };
        if (Math.random() < 0.4) { stem("M-3 -1V-22L11 -26V-5"); head(-8, 0); head(6, -4); }
        else { stem("M4 -1V-22Q6 -14 13 -12"); head(0, 0); }
        return { g, on: false, t0: 0, life: 3, x0: 0, y0: 0, vy: -60, amp: 10, swF: 2, ph: 0, sc: 1, drift: 0 };
    }
    function spawnNote(): void {
        let n: Note | null = null;
        for (const x of notes) if (!x.on) { n = x; break; }
        if (!n) { if (notes.length >= 28) return; n = makeNote(); notes.push(n); }
        const sp = SPEAKERS[Math.floor(Math.random() * SPEAKERS.length)];
        if (Math.random() < 0.25) { n.x0 = 190 + Math.random() * 420; n.y0 = 412; }
        else { n.x0 = sp.x + (Math.random() - 0.5) * 14; n.y0 = sp.y; }
        n.t0 = clock; n.life = 2.6 + Math.random() * 1.4; n.vy = -(45 + Math.random() * 35);
        n.amp = (8 + Math.random() * 10) * (reduce ? 0.4 : 1); n.swF = 1.5 + Math.random() * 1.5; n.ph = Math.random() * 6.28;
        n.sc = 0.9 + Math.random() * 0.5; n.drift = (n.x0 < 400 ? 1 : -1) * (4 + Math.random() * 10);
        n.on = true;
    }
    function drawMusic(dt: number): void {
        musicL += ((musicSlot.act ? 1 : 0) - musicL) * Math.min(1, dt * (musicSlot.act ? 8 : 3));
        if (musicSlot.act) {
            spawnT -= dt;
            while (spawnT <= 0) { spawnNote(); spawnT += (0.16 + Math.random() * 0.14) * (reduce ? 2 : 1); }
        }
        const beat = Math.pow(0.5 + 0.5 * Math.sin(clock * 6.2832 * 2.2), 2), s = 1 + (reduce ? 0.04 : 0.12) * musicL * beat;
        for (const sp of SPEAKERS) setAttr(sp.cone, "transform", "translate(0 -17) scale(" + f(s) + ") translate(0 17)");
        for (const n of notes) {
            if (!n.on) continue;
            const age = clock - n.t0, u = age / n.life;
            if (u >= 1) { n.on = false; setAttr(n.g, "opacity", "0"); continue; }
            const sw = Math.sin(age * n.swF + n.ph);
            const x = n.x0 + sw * n.amp + age * n.drift, y = n.y0 + n.vy * age;
            const op = Math.min(1, age / 0.2) * Math.min(1, (1 - u) / 0.3);
            const sc = n.sc * (0.7 + 0.5 * smooth(u * 2));
            setAttr(n.g, "transform", "translate(" + f(x) + " " + f(y) + ") rotate(" + f(sw * 14) + ") scale(" + f(sc) + ")");
            setAttr(n.g, "opacity", op.toFixed(2));
        }
    }

    /* ---------- main loop ---------- */
    function step(dt: number): void {
        clock += dt;
        for (const s of slots) tickSlot(s);
        updateMouth(dt);
        updateArms(dt);
        drawRoom();
        drawMusic(dt);
        drawAudience(dt);
        drawHost(dt);
        drawArms();
        setAttr(el.fade, "opacity", (1 - smooth(clock / 0.8)).toFixed(2));
    }
    let last: number | null = null, rafId = 0;
    function frame(ts: number): void {
        if (destroyed) return;
        if (last === null) last = ts;
        const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
        last = ts;
        if (running) step(dt);
        rafId = requestAnimationFrame(frame);
    }
    step(0);
    rafId = requestAnimationFrame(frame);

    return {
        talk: ms => startAct(talkSlot, ms),
        stopTalking: () => endAct(talkSlot, false),
        point,
        stopPointing: () => endAct(pointSlot, false),
        clap(ms = 3000) { endAct(awwSlot, false); return startAct(clapSlot, ms); },
        awww(ms = 2200) { endAct(clapSlot, false); return startAct(awwSlot, ms); },
        stopAudience() { endAct(clapSlot, false); endAct(awwSlot, false); },
        playMusic: (ms = 4000) => startAct(musicSlot, ms),
        stopMusic: () => endAct(musicSlot, false),
        destroy() {
            destroyed = true;
            running = false;
            cancelAnimationFrame(rafId);
            for (const s of slots) endAct(s, false);
            host.innerHTML = "";
        },
    };
}
