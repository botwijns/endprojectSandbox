// Combined shell: strings prototypes 5, 6 and 7 together in a chosen order.
//   /combined/               → editor (order + parameters, share/export)
//   /combined/?play=<data>   → player, flow encoded in the link
//   /combined/?flow=<name>   → player, preset from combined/flows/<name>.json
//   add &skip=1              → player shows a "Volgende" button (testing)

import "../style.css";
import { PRESETS, decodeFlow } from "./segments.ts";
import { runEditor } from "./editor.ts";
import { runPlayer } from "./player.ts";

const root = document.getElementById("app")!;
const q = new URLSearchParams(location.search);
const skip = q.get("skip") === "1";

if (q.has("play")) {
    const flow = decodeFlow(q.get("play")!);
    if (flow && flow.segments.length) runPlayer(root, flow, { skip });
    else root.textContent = "Deze link bevat geen geldige spelvolgorde.";
} else if (q.has("flow")) {
    const preset = PRESETS[q.get("flow")!];
    if (preset && preset.segments.length) runPlayer(root, preset, { skip });
    else root.textContent = `Onbekende preset "${q.get("flow")}".`;
} else {
    runEditor(root);
}
