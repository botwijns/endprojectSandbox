// The "Hook and Reel" scene: an underwater canvas with swimming fish, a baited
// hook in the middle and a big fishing reel on the right. Ported from the
// standalone Hook and Reel animation (demo buttons removed). On top of the
// original showBite/showReel/showEscape it adds a "driven" mode, so the
// player's own cranking can wind the reel and lift the hook (driveReel), and
// land()/dropHook() to finish or abandon such a reel-in.

export interface HookReelScene {
    /** A fish swims in, nibbles and gets hooked. False if the scene is busy.
     *  `nearHook` starts it right beside the hook, so it bites within about a
     *  second, in time with a melody that is already playing. */
    showBite(nearHook?: boolean): boolean;
    /** Scripted reel-in: the hook (and any fish on it) rises off screen, then
     *  drops back with fresh bait. */
    showReel(): boolean;
    /** The fish fights free (or, if it hasn't bitten yet, swims away). */
    showEscape(): boolean;
    /** Player-driven reeling: `progress` 0..1 lifts the hook, `velocity` (crank
     *  degrees per tick) spins the reel. */
    driveReel(progress: number, velocity: number): void;
    /** Finish a driven reel-in: the hook rises off screen, then re-baits. */
    land(): void;
    /** Abandon a driven reel-in: the hook sinks back to its resting depth. */
    dropHook(): void;
    destroy(): void;
}

interface Fish {
    dir: number; size: number; col: string; belly: string; fin: string;
    speed: number; baseY: number; wob: number; wobSpeed: number; phase: number;
    x: number; y: number; tilt: number; tail: number; alpha: number;
}

interface Bite {
    dir: number; size: number; x: number; y: number; tilt: number; tail: number;
    state: "approach" | "nibble" | "hooked" | "struggle" | "free" | "flee";
    t: number; thrash: number; puffT: number; nib: boolean;
    col: string; belly: string; fin: string;
    esc?: number; tilt0?: number;
}

export function createHookReelScene(host: HTMLElement): HookReelScene {
    const cv = document.createElement("canvas");
    cv.className = "hook-reel-canvas";
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "Onder water: zwemmende vissen, een vislijn met haak in het midden en een molen rechts");
    host.appendChild(cv);
    const ctx = cv.getContext("2d")!;

    const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const calm = reduceMotion ? 0.45 : 1;
    const TAU = Math.PI * 2;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    let W = 0, H = 0, u = 1, hs = 1.15, T = 0, hf = 0.5, reelR = 60;
    let bgGrad: CanvasGradient | null = null, vigGrad: CanvasGradient | null = null;
    let fishes: Fish[] = [];
    let bubbles: { x: number; y: number; r: number; vy: number; ph: number }[] = [];
    let motes: { x: number; y: number; r: number; vx: number; vy: number }[] = [];
    const puffs: { x: number; y: number; r: number; vy: number; vx: number; life: number; max: number }[] = [];
    let rays: { x: number; w: number; a: number; sp: number; ph: number }[] = [];
    let weeds: { x: number; h: number; w: number; ph: number; col: string }[] = [];

    const hook = { x: 0, y: 0, kick: 0, bait: true };
    // idle | up | wait | down | driven. `fromY` (null = resting depth) is where
    // an up/down move starts, so a driven reel can hand over mid-water.
    const rise = { state: "idle" as "idle" | "up" | "wait" | "down" | "driven", t: 0, fromY: null as number | null };
    const UP = 2.7, DOWN = 1.9;
    let bite: Bite | null = null;
    let reelAngle = 0, reelSpeed = 0, reelTarget = 0, lineFlow = 0;
    let driveP = 0, driveShown = 0; // driven-reel progress: target and eased

    const PAL = [
        { c: "#f2c14e", b: "#fff1bf", f: "#d99a1f" },
        { c: "#5ab4e6", b: "#d8f1ff", f: "#2f86bd" },
        { c: "#e8706a", b: "#ffd6cf", f: "#bf453f" },
        { c: "#86cf79", b: "#e4f6d5", f: "#5aa04e" },
        { c: "#b38ce6", b: "#ece0ff", f: "#8660bf" },
        { c: "#e9e3c8", b: "#ffffff", f: "#b9b08a" },
    ];

    /* ---------- layout and seeding ---------- */
    function spawnFish(initial: boolean): Fish {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const size = rnd(8, 22) * u;
        const p = PAL[(Math.random() * PAL.length) | 0];
        return {
            dir, size, col: p.c, belly: p.b, fin: p.f,
            speed: rnd(24, 70) * u * (0.6 + (size / (22 * u)) * 0.6),
            baseY: rnd(H * 0.12, H * 0.8),
            wob: rnd(6, 22), wobSpeed: rnd(0.6, 1.6), phase: rnd(0, TAU),
            x: initial ? rnd(-40, W + 40) : (dir > 0 ? -size * 3 : W + size * 3),
            y: 0, tilt: 0, tail: rnd(0, TAU), alpha: 1,
        };
    }

    function layout() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = cv.clientWidth; H = cv.clientHeight;
        if (!W || !H) return;
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        u = clamp(Math.min(W / 700, H / 640), 0.7, 1.1);
        hs = 1.15 * u;
        // Portrait phones: hook sits a little left of centre so the big reel fits on the right.
        hf = W < H ? 0.4 : 0.5;
        reelR = Math.max(60, Math.min(H * 0.4, (W * (1 - hf) - 40) / 1.3));

        bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, "#2fb0b8");
        bgGrad.addColorStop(0.35, "#157d9b");
        bgGrad.addColorStop(0.72, "#0a4666");
        bgGrad.addColorStop(1, "#041b30");
        vigGrad = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.78);
        vigGrad.addColorStop(0, "rgba(0,12,24,0)");
        vigGrad.addColorStop(1, "rgba(0,12,24,0.5)");

        fishes = [];
        const nf = clamp(Math.round(W / 110), 6, 14);
        for (let i = 0; i < nf; i++) fishes.push(spawnFish(true));

        bubbles = [];
        const nb = clamp(Math.round(W / 35), 14, 40);
        for (let i = 0; i < nb; i++) bubbles.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(1.5, 5) * u + 0.5, vy: rnd(18, 55) * u, ph: rnd(0, TAU) });

        motes = [];
        for (let i = 0; i < 60; i++) motes.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.6, 1.6), vx: rnd(-6, 6), vy: rnd(2, 10) });

        rays = [];
        for (let i = 0; i < 6; i++) rays.push({ x: rnd(0.05, 1.05) * W, w: rnd(40, 120) * u, a: rnd(0.05, 0.1), sp: rnd(0.05, 0.15), ph: rnd(0, TAU) });

        weeds = [];
        const nw = clamp(Math.round(W / 130), 4, 12);
        const wc = ["#2f8f5b", "#3aa56b", "#1f7a52"];
        for (let i = 0; i < nw; i++) weeds.push({ x: rnd(0, W), h: rnd(0.08, 0.2) * H, w: rnd(5, 9) * u, ph: rnd(0, TAU), col: wc[i % 3] });
    }

    /* ---------- public actions ---------- */
    function showBite(nearHook = false): boolean {
        if (bite || rise.state !== "idle") return false;
        hook.bait = true;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const size = 30 * u;
        const y0 = hook.y + 41.8 * hs + rnd(-0.18, 0.18) * (nearHook ? H * 0.3 : H);
        const x0 = nearHook ? mouthPoint().x - dir * size * 3.5 : (dir > 0 ? -size * 2.6 : W + size * 2.6);
        bite = {
            dir, size, x: x0, y: clamp(y0, H * 0.15, H * 0.78),
            tilt: 0, tail: 0, state: "approach", t: 0, thrash: 1, puffT: 0, nib: false,
            col: "#f08a3c", belly: "#ffe0b0", fin: "#c4601f",
        };
        return true;
    }

    function spook(): void {
        if (bite && (bite.state === "approach" || bite.state === "nibble")) {
            bite.state = "flee";
            bite.dir *= -1;
            bite.tilt = 0;
        }
    }

    function showReel(): boolean {
        if (rise.state !== "idle") return false;
        spook();
        rise.state = "up";
        rise.t = 0;
        rise.fromY = null;
        reelTarget = 12;
        return true;
    }

    // The fish fights, snaps free of the hook and darts off screen. A fish that has not
    // bitten yet is spooked and swims away instead.
    function showEscape(): boolean {
        if (!bite) return false;
        if (bite.state === "approach" || bite.state === "nibble") { spook(); return true; }
        if (bite.state !== "hooked") return false;
        bite.state = "struggle";
        bite.t = 0;
        bite.thrash = 2.2;
        bite.esc = Math.random() < 0.5 ? 1 : -1;
        return true;
    }

    function driveReel(progress: number, velocity: number): void {
        if (rise.state !== "idle" && rise.state !== "driven") return;
        if (rise.state === "idle") { spook(); rise.state = "driven"; rise.t = 0; driveShown = 0; }
        driveP = clamp(progress, 0, 1);
        reelTarget = Math.min(16, Math.abs(velocity) * 0.8);
    }

    function land(): void {
        if (rise.state !== "driven" && rise.state !== "idle") return;
        rise.fromY = hook.y;
        rise.state = "up";
        rise.t = 0;
        reelTarget = 12;
    }

    function dropHook(): void {
        if (rise.state !== "driven") return;
        rise.fromY = hook.y;
        rise.state = "down";
        rise.t = 0;
        reelTarget = -4;
    }

    /* ---------- update ---------- */
    function mouthPoint() { return { x: hook.x + 18.8 * hs, y: hook.y + 41.8 * hs }; }

    function kf(arr: [number, number][], t: number): number {
        if (t <= arr[0][0]) return arr[0][1];
        for (let i = 1; i < arr.length; i++) {
            if (t <= arr[i][0]) {
                const a = arr[i - 1], b = arr[i];
                return lerp(a[1], b[1], smooth((t - a[0]) / (b[0] - a[0])));
            }
        }
        return arr[arr.length - 1][1];
    }

    function spawnPuff(x: number, y: number, n: number, spread: number) {
        for (let i = 0; i < n && puffs.length < 220; i++) {
            const life = rnd(0.9, 1.8);
            puffs.push({ x: x + rnd(-spread, spread), y: y + rnd(-spread, spread), r: rnd(1.5, 4.5) * u + 0.5, vy: rnd(30, 80) * u, vx: rnd(-10, 10), life, max: life });
        }
    }

    function updateHook(dt: number) {
        rise.t += dt;
        const baseY = H * 0.46, topY = -230 * u;
        // a driven reel never lifts the hook out of view; land() does that
        const drivenTopY = H * 0.12;
        let y = baseY;
        if (rise.state === "up") {
            const p = Math.min(1, rise.t / UP);
            y = lerp(rise.fromY ?? baseY, topY, smooth(p));
            if (p >= 1) {
                rise.state = "wait"; rise.t = 0; reelTarget = 0;
                if (bite && bite.state !== "flee" && bite.state !== "free") bite = null;
            }
        } else if (rise.state === "wait") {
            y = topY;
            if (rise.t > 0.9) { rise.state = "down"; rise.t = 0; rise.fromY = null; hook.bait = true; reelTarget = -4; }
        } else if (rise.state === "down") {
            const p = Math.min(1, rise.t / DOWN);
            y = lerp(rise.fromY ?? topY, baseY, easeOut(p));
            if (p >= 1) { rise.state = "idle"; rise.t = 0; rise.fromY = null; reelTarget = 0; }
        } else if (rise.state === "driven") {
            driveShown += (driveP - driveShown) * Math.min(1, dt * 6);
            y = lerp(baseY, drivenTopY, driveShown);
            // the reel only spins while the player keeps cranking
            reelTarget *= Math.pow(0.02, dt);
        } else {
            y = baseY + Math.sin(T * 1.3 * calm) * 3;
        }
        hook.kick *= Math.pow(0.02, dt);
        hook.y = y + hook.kick * 9 * u;
        const shake = (bite && (bite.state === "hooked" || bite.state === "struggle")) ? 3.5 * u * bite.thrash : 0;
        hook.x = W * hf + Math.sin(T * 0.9 * calm) * 2 * u + Math.sin(T * 13) * shake;
    }

    function updateBite(dt: number) {
        if (!bite) return;
        const b = bite, fs = b.size, mp = mouthPoint();
        b.t += dt;

        if (b.state === "approach") {
            const tx = mp.x - b.dir * fs, ty = mp.y;
            const dx = tx - b.x, dy = ty - b.y;
            const dist = Math.abs(dx);
            const v = clamp(dist * 1.5, 60 * u, 300 * u);
            b.x += Math.sign(dx) * Math.min(dist, v * dt);
            b.y += dy * Math.min(1, dt * 2.4);
            b.tilt = Math.sin(T * 3) * 0.05;
            b.tail += dt * (10 + clamp(dist / 20, 0, 16));
            if (dist < 3 && Math.abs(dy) < 4) { b.state = "nibble"; b.t = 0; }
        } else if (b.state === "nibble") {
            const o = kf([[0, 0], [0.35, 0.9], [0.52, 0], [0.82, 0.55], [0.95, 0]], b.t);
            b.x = mp.x - b.dir * (fs + o * fs);
            b.y = mp.y;
            b.tilt = 0;
            b.tail += dt * 14;
            if (!b.nib && b.t > 0.52) { b.nib = true; hook.kick = 0.5; spawnPuff(mp.x, mp.y, 3, fs * 0.2); }
            if (b.t >= 0.95) {
                b.state = "hooked"; b.t = 0;
                hook.bait = false;
                hook.kick = 1.4;
                spawnPuff(mp.x, mp.y, 10, fs * 0.6);
            }
        } else if (b.state === "hooked") {
            if (rise.state === "up") b.thrash = lerp(1, 0.5, smooth(Math.min(1, rise.t / UP)));
            else if (rise.state === "driven") b.thrash = lerp(1, 0.5, driveShown);
            const grow = smooth(Math.min(1, b.t / 0.55));
            b.tilt = -1.42 * grow + Math.sin(b.t * 11) * 0.16 * b.thrash * (0.4 + 0.6 * grow);
            b.tail += dt * (24 * b.thrash + 6);
            const c = Math.cos(b.tilt), s = Math.sin(b.tilt);
            b.x = mp.x - b.dir * fs * c;
            b.y = mp.y - fs * s;
            b.puffT -= dt;
            if (b.puffT < 0) { b.puffT = 0.22; spawnPuff(mp.x, mp.y, 1, fs * 0.2); }
        } else if (b.state === "struggle") {
            b.tilt = -1.2 + Math.sin(b.t * 26) * 0.45;
            b.tail += dt * 40;
            const c = Math.cos(b.tilt), s = Math.sin(b.tilt);
            b.x = mp.x - b.dir * fs * c;
            b.y = mp.y - fs * s;
            b.puffT -= dt;
            if (b.puffT < 0) { b.puffT = 0.07; spawnPuff(mp.x, mp.y, 2, fs * 0.3); }
            if (b.t > 0.55) {
                hook.bait = false;
                hook.kick = 2.4;
                spawnPuff(mp.x, mp.y, 16, fs * 0.7);
                b.state = "free"; b.t = 0;
                b.tilt0 = b.tilt;
                b.dir = b.esc ?? 1;
            }
        } else if (b.state === "free") {
            const tt = b.t;
            b.x += b.dir * lerp(80, 620, smooth(Math.min(1, tt / 0.9))) * u * dt;
            b.y += 140 * u * Math.max(0, 1 - tt / 0.3) * dt;
            b.tilt = lerp(b.tilt0 ?? 0, 0.08, smooth(Math.min(1, tt / 0.35)));
            b.tail += dt * 32;
            b.puffT -= dt;
            if (b.puffT < 0) { b.puffT = 0.08; spawnPuff(b.x - b.dir * fs, b.y, 1, fs * 0.15); }
            if (b.x < -fs * 3 || b.x > W + fs * 3) bite = null;
        } else if (b.state === "flee") {
            b.x += b.dir * 320 * u * dt;
            b.tail += dt * 26;
            b.tilt = Math.sin(T * 6) * 0.06;
            if (b.x < -fs * 3 || b.x > W + fs * 3) bite = null;
        }
    }

    function update(dt: number) {
        for (const f of fishes) {
            f.x += f.dir * f.speed * dt * calm;
            f.tail += dt * (5 + f.speed * 0.12) * calm;
            const w = T * f.wobSpeed * calm + f.phase;
            f.y = f.baseY + Math.sin(w) * f.wob;
            f.tilt = Math.cos(w) * 0.1;
            if ((f.dir > 0 && f.x > W + f.size * 3) || (f.dir < 0 && f.x < -f.size * 3)) Object.assign(f, spawnFish(false));
        }
        for (const b of bubbles) {
            b.y -= b.vy * dt * calm;
            b.x += Math.sin(T * 2 + b.ph) * 8 * dt * calm;
            if (b.y < -10) { b.y = H + 10; b.x = rnd(0, W); }
        }
        for (const m of motes) {
            m.x += m.vx * dt * calm; m.y += m.vy * dt * calm;
            if (m.y > H) m.y = 0;
            if (m.x < 0) m.x = W; else if (m.x > W) m.x = 0;
        }
        for (let i = puffs.length - 1; i >= 0; i--) {
            const p = puffs[i];
            p.life -= dt;
            if (p.life <= 0) { puffs.splice(i, 1); continue; }
            p.y -= p.vy * dt; p.x += p.vx * dt;
        }
        updateHook(dt);
        updateBite(dt);
        reelSpeed += (reelTarget - reelSpeed) * Math.min(1, dt * (reelTarget ? 4 : 3));
        reelAngle += reelSpeed * dt;
        lineFlow += reelSpeed * dt * 6;
    }

    /* ---------- drawing ---------- */
    function drawRays() {
        for (const r of rays) {
            const x = r.x + Math.sin(T * r.sp * calm + r.ph) * 40;
            const a = r.a * (0.7 + 0.3 * Math.sin(T * 0.5 * calm + r.ph * 2));
            const lean = -H * 0.3;
            const g = ctx.createLinearGradient(0, 0, 0, H * 0.9);
            g.addColorStop(0, "rgba(220,255,250," + (a * 1.6).toFixed(3) + ")");
            g.addColorStop(1, "rgba(220,255,250,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x + r.w, 0);
            ctx.lineTo(x + r.w + lean * 0.8, H * 0.9); ctx.lineTo(x + lean, H * 0.9);
            ctx.closePath(); ctx.fill();
        }
    }

    function drawSurface() {
        const sg = ctx.createLinearGradient(0, 0, 0, H * 0.16);
        sg.addColorStop(0, "rgba(210,255,248,.55)");
        sg.addColorStop(1, "rgba(210,255,248,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, W, H * 0.16);
        ctx.strokeStyle = "rgba(255,255,255,.28)";
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            for (let x = 0; x <= W + 12; x += 12) {
                const y = 10 + k * 14 + Math.sin(x * 0.02 + T * (0.8 + k * 0.3) * calm + k) * 4;
                if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }

    function sandY(x: number) {
        return H - H * 0.075 - Math.sin(x * 0.007 + 1.2) * H * 0.014 - Math.sin(x * 0.019) * H * 0.007;
    }

    function drawSeabed() {
        ctx.lineCap = "round";
        for (const w of weeds) {
            const by = sandY(w.x) + 4;
            for (let j = 0; j < 2; j++) {
                ctx.strokeStyle = j ? "#3aa56b" : w.col;
                ctx.lineWidth = w.w * (j ? 0.8 : 1);
                ctx.beginPath();
                const n = 8, h = w.h * (1 - 0.25 * j);
                for (let i = 0; i <= n; i++) {
                    const k = i / n;
                    const px = w.x + j * 8 * u + Math.sin(T * 1.1 * calm + w.ph + j * 0.8 + k * 2.2) * k * k * 22 * u;
                    const py = by - k * h;
                    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
                }
                ctx.stroke();
            }
        }
        const sg = ctx.createLinearGradient(0, H * 0.88, 0, H);
        sg.addColorStop(0, "#9a9a78");
        sg.addColorStop(1, "#3d4a3f");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W + 16; x += 16) ctx.lineTo(x, sandY(x));
        ctx.lineTo(W + 16, H);
        ctx.closePath();
        ctx.fill();
        ([[0.1, 30], [0.55, 22], [0.8, 36]] as [number, number][]).forEach(r => {
            const x = W * r[0], s = r[1] * u, y = sandY(x) + 2;
            ctx.fillStyle = "#31505f";
            ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.6, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = "#4f7385";
            ctx.beginPath(); ctx.ellipse(x - s * 0.2, y - s * 0.18, s * 0.6, s * 0.3, -0.2, 0, TAU); ctx.fill();
        });
    }

    function drawMotes() {
        ctx.fillStyle = "rgba(220,245,250,.28)";
        for (const m of motes) { ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill(); }
    }

    function drawBubble(x: number, y: number, r: number, a: number) {
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = "rgba(220,250,255,.10)"; ctx.fill();
        ctx.strokeStyle = "rgba(230,252,255,.55)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, TAU);
        ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawFish(f: { size: number; col: string; belly: string; fin: string }, x: number, y: number, tilt: number, dir: number, tail: number, alpha: number) {
        const s = f.size, tw = Math.sin(tail) * s * 0.3;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.scale(dir, 1);
        ctx.rotate(tilt);
        ctx.fillStyle = f.fin;
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, 0);
        ctx.quadraticCurveTo(-s * 1.05, -s * 0.12 + tw * 0.4, -s * 1.5, -s * 0.55 + tw);
        ctx.quadraticCurveTo(-s * 1.3, tw * 0.7, -s * 1.5, s * 0.55 + tw);
        ctx.quadraticCurveTo(-s * 1.05, s * 0.12 + tw * 0.4, -s * 0.7, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.35, -s * 0.5);
        ctx.quadraticCurveTo(-s * 0.05, -s * 1.0, -s * 0.55, -s * 0.38);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.15, s * 0.46);
        ctx.quadraticCurveTo(-s * 0.1, s * 0.9, -s * 0.35, s * 0.42);
        ctx.closePath(); ctx.fill();
        const g = ctx.createLinearGradient(0, -s * 0.6, 0, s * 0.6);
        g.addColorStop(0, f.col); g.addColorStop(0.58, f.col); g.addColorStop(1, f.belly);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(s, 0);
        ctx.bezierCurveTo(s * 0.75, -s * 0.62, -s * 0.3, -s * 0.66, -s * 0.82, -s * 0.13);
        ctx.lineTo(-s * 0.82, s * 0.13);
        ctx.bezierCurveTo(-s * 0.3, s * 0.62, s * 0.75, s * 0.6, s, 0);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.22)";
        ctx.lineWidth = s * 0.07;
        ctx.beginPath();
        ctx.moveTo(s * 0.6, -s * 0.22);
        ctx.quadraticCurveTo(-s * 0.1, -s * 0.42, -s * 0.6, -s * 0.1);
        ctx.stroke();
        ctx.strokeStyle = "rgba(0,20,30,.28)";
        ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.beginPath(); ctx.arc(s * 0.32, 0, s * 0.4, Math.PI - 0.85, Math.PI + 0.85); ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(s * 0.6, -s * 0.1, s * 0.115, 0, TAU); ctx.fill();
        ctx.fillStyle = "#10202c";
        ctx.beginPath(); ctx.arc(s * 0.63, -s * 0.1, s * 0.065, 0, TAU); ctx.fill();
        ctx.restore();
    }

    function drawLine() {
        const hooked = !!bite && (bite.state === "hooked" || bite.state === "struggle");
        const th = hooked ? bite!.thrash : 0;
        const ox = Math.sin(T * 0.7 * calm) * 5 * u + (hooked ? Math.sin(T * 13) * 9 * u * th : 0);
        const slack = rise.state === "up" ? 0.3 : rise.state === "driven" ? lerp(1, 0.3, driveShown) : 1;
        ctx.strokeStyle = "rgba(236,246,250,.85)";
        ctx.lineWidth = Math.max(1, 1.5 * u);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(W * hf, -6);
        ctx.quadraticCurveTo(hook.x + ox * slack, hook.y * 0.5, hook.x, hook.y - 5 * hs);
        ctx.stroke();
    }

    function drawHook() {
        ctx.save();
        ctx.translate(hook.x, hook.y);
        ctx.scale(hs, hs);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        if (hook.bait) {
            ctx.strokeStyle = "#e58aa0"; ctx.lineWidth = 5;
            ctx.beginPath();
            for (let i = 0; i <= 12; i++) {
                const px = 5 + Math.sin(i * 1.1 + T * 3 * calm) * 3.2, py = 8 + i * 2.5;
                if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
            }
            ctx.stroke();
        }
        ctx.strokeStyle = "#d6e2ea"; ctx.lineWidth = 3.2;
        ctx.beginPath(); ctx.arc(0, -3, 4, 0, TAU); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 1); ctx.lineTo(0, 34);
        ctx.arc(11, 34, 11, Math.PI, 0, true);
        ctx.lineTo(22, 21); ctx.lineTo(17.5, 25.5);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-1, 4); ctx.lineTo(-1, 32); ctx.stroke();
        ctx.restore();
    }

    function drawRodAndReel() {
        const S = reelR / 54;   // reel body radius is 54 units, so the wheel is reelR px
        const tip = { x: W * hf, y: -6 };
        const rc = { x: W - reelR * 0.3, y: H * 0.54 };
        const dx = rc.x - tip.x, dy = rc.y - tip.y, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
        const bl = len * 1.55;
        const bx = tip.x + ux * bl, by = tip.y + uy * bl;
        const ht = 1.4 * S, hb = 9 * S;

        const rg = ctx.createLinearGradient(rc.x - nx * 9 * S, rc.y - ny * 9 * S, rc.x + nx * 9 * S, rc.y + ny * 9 * S);
        rg.addColorStop(0, "#10151c"); rg.addColorStop(0.45, "#4b586a"); rg.addColorStop(1, "#0c1117");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(tip.x + nx * ht, tip.y + ny * ht);
        ctx.lineTo(bx + nx * hb, by + ny * hb);
        ctx.lineTo(bx - nx * hb, by - ny * hb);
        ctx.lineTo(tip.x - nx * ht, tip.y - ny * ht);
        ctx.closePath(); ctx.fill();

        ctx.lineCap = "round";
        ctx.strokeStyle = "#202a36"; ctx.lineWidth = 17 * S;
        ctx.beginPath();
        ctx.moveTo(rc.x - ux * 26 * S, rc.y - uy * 26 * S);
        ctx.lineTo(rc.x + ux * 26 * S, rc.y + uy * 26 * S);
        ctx.stroke();

        let vx = uy, vy = -ux;
        if (vy > 0) { vx = -vx; vy = -vy; }
        const p0 = { x: rc.x + vx * 50 * S, y: rc.y + vy * 50 * S };
        ctx.strokeStyle = "rgba(236,246,250,.8)"; ctx.lineWidth = Math.max(1, 1.5 * u);
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
        if (Math.abs(reelSpeed) > 0.5) {
            ctx.setLineDash([3 * u, 12 * u]);
            ctx.lineDashOffset = lineFlow;
            ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = Math.max(1.4, 2.2 * u);
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
        }
        [0.55, 0.76, 0.92].forEach(t => {
            const gx = p0.x + (tip.x - p0.x) * t, gy = p0.y + (tip.y - p0.y) * t;
            const rx = rc.x + (tip.x - rc.x) * t, ry = rc.y + (tip.y - rc.y) * t;
            ctx.strokeStyle = "#7d8a98"; ctx.lineWidth = 1.4 * S;
            ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(gx, gy); ctx.stroke();
            ctx.beginPath(); ctx.arc(gx, gy, 3.4 * S, 0, TAU); ctx.stroke();
        });

        ctx.save();
        ctx.translate(rc.x, rc.y);
        let g = ctx.createRadialGradient(-12 * S, -14 * S, 6 * S, 0, 0, 56 * S);
        g.addColorStop(0, "#e9eef2"); g.addColorStop(0.6, "#9aa7b3"); g.addColorStop(1, "#56626e");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 54 * S, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#2a3139"; ctx.lineWidth = 2 * S; ctx.stroke();
        g = ctx.createRadialGradient(0, 0, 4 * S, 0, 0, 44 * S);
        g.addColorStop(0, "#26394a"); g.addColorStop(1, "#101b25");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 44 * S, 0, TAU); ctx.fill();

        const blur = Math.min(1, Math.abs(reelSpeed) / 10);
        ctx.strokeStyle = "rgba(180,205,225," + (0.12 * blur).toFixed(3) + ")";
        ctx.lineWidth = 20 * S;
        ctx.beginPath(); ctx.arc(0, 0, 27 * S, 0, TAU); ctx.stroke();

        ctx.rotate(reelAngle);
        ctx.strokeStyle = "#33485c"; ctx.lineWidth = 3 * S;
        for (let i = 0; i < 5; i++) {
            const a = (i + 0.5) * TAU / 5;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 40 * S, Math.sin(a) * 40 * S); ctx.stroke();
        }
        for (let i = 0; i < 5; i++) {
            const a = i * TAU / 5;
            ctx.fillStyle = "#0a121a"; ctx.strokeStyle = "#6c7a88"; ctx.lineWidth = 1.5 * S;
            ctx.beginPath(); ctx.arc(Math.cos(a) * 27 * S, Math.sin(a) * 27 * S, 9 * S, 0, TAU); ctx.fill(); ctx.stroke();
        }
        ctx.lineCap = "round";
        ctx.strokeStyle = "#2a3139"; ctx.lineWidth = 10 * S;
        ctx.beginPath(); ctx.moveTo(-14 * S, 0); ctx.lineTo(44 * S, 0); ctx.stroke();
        ctx.strokeStyle = "#c0cbd5"; ctx.lineWidth = 7 * S;
        ctx.beginPath(); ctx.moveTo(-14 * S, 0); ctx.lineTo(44 * S, 0); ctx.stroke();
        ctx.fillStyle = "#8f9cab";
        ctx.beginPath(); ctx.arc(-16 * S, 0, 7 * S, 0, TAU); ctx.fill();
        g = ctx.createRadialGradient(44 * S - 3 * S, -3 * S, 1, 44 * S, 0, 10 * S);
        g.addColorStop(0, "#ffe39a"); g.addColorStop(1, "#c9892a");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(44 * S, 0, 9 * S, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#6b4510"; ctx.lineWidth = 1.5 * S; ctx.stroke();
        ctx.rotate(-reelAngle);
        g = ctx.createRadialGradient(-3 * S, -3 * S, 1, 0, 0, 13 * S);
        g.addColorStop(0, "#f2f6f9"); g.addColorStop(1, "#7c8996");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 12 * S, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#2a3139"; ctx.lineWidth = 1.5 * S; ctx.stroke();
        ctx.restore();
    }

    function render() {
        ctx.fillStyle = bgGrad!;
        ctx.fillRect(0, 0, W, H);
        drawRays();
        drawSurface();
        drawSeabed();
        drawMotes();
        fishes.sort((a, b) => a.size - b.size);
        for (const f of fishes) drawFish(f, f.x, f.y, f.tilt, f.dir, f.tail, f.alpha);
        for (const b of bubbles) drawBubble(b.x, b.y, b.r, 1);
        drawLine();
        if (bite) drawFish(bite, bite.x, bite.y, bite.tilt, bite.dir, bite.tail, 1);
        drawHook();
        for (const p of puffs) drawBubble(p.x, p.y, p.r, clamp(p.life / (p.max * 0.6), 0, 1));
        ctx.fillStyle = vigGrad!;
        ctx.fillRect(0, 0, W, H);
        drawRodAndReel();
    }

    /* ---------- boot ---------- */
    let ro: ResizeObserver | null = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(layout); ro.observe(cv); }
    else window.addEventListener("resize", layout);
    layout();

    let destroyed = false, rafId = 0;
    let last = performance.now();
    function frame(now: number) {
        if (destroyed) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        T += dt;
        if (W && H) { update(dt); render(); }
        rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return {
        showBite, showReel, showEscape, driveReel, land, dropHook,
        destroy() {
            destroyed = true;
            cancelAnimationFrame(rafId);
            if (ro) ro.disconnect(); else window.removeEventListener("resize", layout);
            cv.remove();
        },
    };
}
