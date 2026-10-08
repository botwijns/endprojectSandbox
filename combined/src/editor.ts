// Editor view (sighted, for the researcher): put segments in order, tweak each
// one's parameters, then hand out a player link or export the flow as a preset.

import {
    PROTOS, PRESETS, MODE_LABEL, protoDef, defaultParams, sanitizeFlow, encodeFlow, segmentTitle,
    type Flow, type Mode, type ParamDef, type ProtoId, type Segment,
} from "./segments.ts";

const STORAGE_KEY = "combined_flow";

function loadDraft(): Flow {
    try {
        const saved = sanitizeFlow(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
        if (saved) return saved;
    } catch { /* no storage / bad JSON */ }
    const first = Object.values(PRESETS)[0];
    return first ? structuredClone(first) : { name: "nieuwe-flow", surveyAtEnd: false, segments: [] };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...children);
    return e;
}

export function playerUrl(flow: Flow, skip = false): string {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set("play", encodeFlow(flow));
    if (skip) url.searchParams.set("skip", "1");
    return url.href;
}

function presetUrl(name: string): string {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set("flow", name);
    return url.href;
}

export function runEditor(root: HTMLElement): void {
    let flow = loadDraft();

    const save = () => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(flow)); } catch { /* ignore */ }
        renderLinks();
    };

    // ── Header: name, presets, options ──────────────────────────────────────
    const nameInput = el("input", { type: "text", value: flow.name, id: "flow-name" });
    nameInput.addEventListener("input", () => {
        flow.name = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "flow";
        save();
    });

    const surveyBox = el("input", { type: "checkbox", checked: !!flow.surveyAtEnd });
    surveyBox.addEventListener("change", () => { flow.surveyAtEnd = surveyBox.checked; save(); });

    const presetSelect = el("select", {}, el("option", { value: "", textContent: "— kies een preset —" }));
    for (const id of Object.keys(PRESETS)) presetSelect.append(el("option", { value: id, textContent: id }));
    const loadPresetBtn = el("button", { type: "button", textContent: "Laden" });
    loadPresetBtn.addEventListener("click", () => {
        const preset = PRESETS[presetSelect.value];
        if (!preset || !confirm(`Huidige flow vervangen door preset "${presetSelect.value}"?`)) return;
        setFlow(structuredClone(preset));
    });

    const importInput = el("input", { type: "file", accept: ".json,application/json", hidden: true });
    const importBtn = el("button", { type: "button", textContent: "Importeer JSON" });
    importBtn.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", async () => {
        const file = importInput.files?.[0];
        importInput.value = "";
        if (!file) return;
        try {
            const imported = sanitizeFlow(JSON.parse(await file.text()));
            if (imported) setFlow(imported);
            else alert("Geen geldige flow in dit bestand.");
        } catch {
            alert("Kon dit bestand niet lezen.");
        }
    });

    const header = el("section", { className: "panel" },
        el("label", { className: "row" }, el("span", { textContent: "Naam" }), nameInput),
        el("label", { className: "row check" }, surveyBox, el("span", { textContent: "Na afloop naar de vragenlijst (/survey/)" })),
        el("div", { className: "row" }, presetSelect, loadPresetBtn, importBtn, importInput),
    );

    // ── Segment list ─────────────────────────────────────────────────────────
    const list = el("ol", { className: "segments" });

    function paramField(seg: Segment, def: ParamDef): HTMLElement {
        const value = seg.params[def.key];
        const help = def.help ? el("small", { textContent: def.help }) : "";
        if (def.type === "number") {
            const input = el("input", { type: "number", min: String(def.min), max: String(def.max), value: String(value ?? def.default) });
            input.addEventListener("change", () => {
                const n = Math.round(Number(input.value));
                seg.params[def.key] = Number.isFinite(n) ? Math.min(def.max, Math.max(def.min, n)) : def.default;
                input.value = String(seg.params[def.key]);
                save();
            });
            return el("label", { className: "param" }, el("span", { textContent: def.label }), input, help);
        }
        if (def.type === "bool") {
            const input = el("input", { type: "checkbox", checked: Boolean(value ?? def.default) });
            input.addEventListener("change", () => { seg.params[def.key] = input.checked; save(); });
            return el("label", { className: "param check" }, input, el("span", { textContent: def.label }), help);
        }
        if (def.type === "select") {
            const select = el("select");
            for (const o of def.options) select.append(el("option", { value: o.value, textContent: o.label }));
            select.value = String(value ?? def.default);
            select.addEventListener("change", () => { seg.params[def.key] = select.value; save(); });
            return el("label", { className: "param" }, el("span", { textContent: def.label }), select, help);
        }
        // list: click options to append them in order
        const current = () => (Array.isArray(seg.params[def.key]) ? seg.params[def.key] as string[] : []);
        const shown = el("div", { className: "list-value" });
        const renderList = () => {
            const items = current();
            shown.textContent = items.length ? items.map((v, i) => `${i + 1}. ${v}`).join("  ") : "(standaard)";
        };
        renderList();
        const chips = el("div", { className: "chips" });
        for (const o of def.options) {
            const chip = el("button", { type: "button", textContent: `+ ${o.label}` });
            chip.addEventListener("click", () => { seg.params[def.key] = [...current(), o.value]; renderList(); save(); });
            chips.append(chip);
        }
        const undo = el("button", { type: "button", textContent: "↶", title: "laatste weghalen" });
        undo.addEventListener("click", () => { seg.params[def.key] = current().slice(0, -1); renderList(); save(); });
        const clear = el("button", { type: "button", textContent: "wis" });
        clear.addEventListener("click", () => { seg.params[def.key] = []; renderList(); save(); });
        chips.append(undo, clear);
        return el("div", { className: "param wide" }, el("span", { textContent: def.label }), shown, chips, help);
    }

    function renderSegments(): void {
        list.replaceChildren();
        if (flow.segments.length === 0) {
            list.append(el("li", { className: "empty", textContent: "Nog geen onderdelen — voeg er hieronder een toe." }));
        }
        flow.segments.forEach((seg, i) => {
            const def = protoDef(seg.proto);
            const up = el("button", { type: "button", textContent: "↑", title: "omhoog", disabled: i === 0 });
            const down = el("button", { type: "button", textContent: "↓", title: "omlaag", disabled: i === flow.segments.length - 1 });
            const remove = el("button", { type: "button", textContent: "✕", title: "verwijderen" });
            const test = el("button", { type: "button", textContent: "Test ▶", title: "alleen dit onderdeel spelen" });
            test.addEventListener("click", () => window.open(playerUrl({ ...flow, surveyAtEnd: false, segments: [seg] }, true), "_blank"));
            up.addEventListener("click", () => move(i, -1));
            down.addEventListener("click", () => move(i, 1));
            remove.addEventListener("click", () => { flow.segments.splice(i, 1); save(); renderSegments(); });

            const titleInput = el("input", { type: "text", value: seg.title ?? "", placeholder: segmentTitle({ ...seg, title: "" }) });
            titleInput.addEventListener("change", () => {
                seg.title = titleInput.value.trim() || undefined;
                save();
                renderSegments();
            });

            const params = def.params[seg.mode].map(p => paramField(seg, p));
            list.append(el("li", { className: `segment proto-${seg.proto}` },
                el("div", { className: "seg-head" },
                    el("strong", { textContent: `${def.name} · ${MODE_LABEL[seg.mode]}` }),
                    el("span", { className: "tools" }, test, up, down, remove),
                ),
                el("label", { className: "param wide" }, el("span", { textContent: "Titel (op het startscherm)" }), titleInput),
                el("div", { className: "params" }, ...(params.length ? params : [el("small", { textContent: "geen instellingen" })])),
            ));
        });
    }

    function move(i: number, dir: -1 | 1): void {
        const j = i + dir;
        [flow.segments[i], flow.segments[j]] = [flow.segments[j], flow.segments[i]];
        save();
        renderSegments();
    }

    // ── Add a segment ────────────────────────────────────────────────────────
    const protoSelect = el("select");
    for (const p of PROTOS) protoSelect.append(el("option", { value: p.id, textContent: p.name }));
    const modeSelect = el("select",
        {}, el("option", { value: "game", textContent: MODE_LABEL.game }), el("option", { value: "intro", textContent: MODE_LABEL.intro }));
    const addBtn = el("button", { type: "button", textContent: "+ Toevoegen", className: "primary" });
    addBtn.addEventListener("click", () => {
        const proto = protoSelect.value as ProtoId;
        const mode = modeSelect.value as Mode;
        flow.segments.push({ proto, mode, params: defaultParams(proto, mode) });
        save();
        renderSegments();
    });
    const adder = el("section", { className: "panel row" }, protoSelect, modeSelect, addBtn);

    // ── Share / export ───────────────────────────────────────────────────────
    const links = el("section", { className: "panel" });
    function renderLinks(): void {
        const url = playerUrl(flow);
        const play = el("a", { href: url, target: "_blank", textContent: "Speel hele flow ▶", className: "button primary" });
        const copy = el("button", { type: "button", textContent: "Kopieer spelerslink" });
        copy.addEventListener("click", async () => {
            try { await navigator.clipboard.writeText(url); copy.textContent = "Gekopieerd ✓"; }
            catch { prompt("Kopieer deze link:", url); }
        });
        const exportBtn = el("button", { type: "button", textContent: "Exporteer JSON" });
        exportBtn.addEventListener("click", () => {
            const blob = new Blob([JSON.stringify(flow, null, 2) + "\n"], { type: "application/json" });
            const a = el("a", { href: URL.createObjectURL(blob), download: `${flow.name}.json` });
            a.click();
            URL.revokeObjectURL(a.href);
        });
        links.replaceChildren(
            el("div", { className: "row" }, play, copy, exportBtn),
            el("p", { className: "hint" },
                "Vaste preset maken: zet het geëxporteerde bestand in ",
                el("code", { textContent: `combined/flows/${flow.name}.json` }),
                ", commit en deploy. Spelers openen dan ",
                el("code", { textContent: presetUrl(flow.name) }), "."),
        );
    }

    function setFlow(next: Flow): void {
        flow = next;
        nameInput.value = flow.name;
        surveyBox.checked = !!flow.surveyAtEnd;
        save();
        renderSegments();
    }

    root.replaceChildren(
        el("header", {},
            el("h1", { textContent: "Gecombineerd spel" }),
            el("p", { textContent: "Zet de prototypes in volgorde, stel ze in, en geef spelers de link. Wijzigingen in de prototypes zelf komen hier automatisch mee." }),
            el("a", { href: "../", textContent: "← Terug naar hoofdmenu" }),
        ),
        header,
        list,
        adder,
        links,
    );
    renderSegments();
    renderLinks();
}
