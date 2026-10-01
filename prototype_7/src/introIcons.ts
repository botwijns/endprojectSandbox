// ── Hand-drawn tutorial icons (inline SVG, no external assets) ──────────────
// Same flat, bold-outline style as prototype 5's intro icons, meant to be read
// at a glance by whoever is helping the player. Animation is driven by CSS
// classes toggled from main.ts - see the matching keyframes (drum-shake/
// wave-pulse/tap-ripple/shake-wiggle) and the .lit-N zone highlights in
// index.html.

export const DRUMS_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g class="drum-body">
    <line x1="30" y1="8" x2="46" y2="34" stroke="#5a3a22" stroke-width="4" stroke-linecap="round"/>
    <line x1="70" y1="8" x2="54" y2="34" stroke="#5a3a22" stroke-width="4" stroke-linecap="round"/>
    <rect x="20" y="35" width="60" height="40" fill="#c0392b"/>
    <ellipse cx="50" cy="35" rx="30" ry="10" fill="#e8c39e"/>
    <ellipse cx="50" cy="75" rx="30" ry="10" fill="#8f2418"/>
  </g>
  <g class="no-overlay">
    <circle cx="50" cy="50" r="44" fill="none" stroke="#e63946" stroke-width="7"/>
    <line x1="18" y1="18" x2="82" y2="82" stroke="#e63946" stroke-width="7"/>
  </g>
</svg>`;

export const EAR_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M60 18 C40 18 24 34 24 55 C24 74 36 88 52 88 C58 88 61 82 56 78 C46 74 38 65 38 54 C38 40 48 30 61 30 C69 30 74 36 71 43" fill="none" stroke="#2f2f2f" stroke-width="6" stroke-linecap="round"/>
  <path class="wave" d="M78 38 Q90 55 78 72" fill="none" stroke="#2f7fbf" stroke-width="5" stroke-linecap="round"/>
  <path class="wave" d="M84 32 Q96 55 84 78" fill="none" stroke="#2f7fbf" stroke-width="5" stroke-linecap="round"/>
  <path class="wave" d="M90 26 Q99 55 90 84" fill="none" stroke="#2f7fbf" stroke-width="5" stroke-linecap="round"/>
</svg>`;

// Landscape phone (same orientation as prototype 5's phone icon), screen split
// into the answer zones. Each zone is a <rect class="zone-N"> that lights up
// when the slot carries the matching lit-N class.
const PHONE_FRAME = `<rect x="4" y="22" width="92" height="56" rx="9" fill="#333333"/>
  <circle cx="91" cy="50" r="2.5" fill="#666666"/>`;

export const PHONE_ZONES_2_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  ${PHONE_FRAME}
  <rect class="zone-0" x="10" y="28" width="37.5" height="44" rx="2"/>
  <rect class="zone-1" x="48.5" y="28" width="37.5" height="44" rx="2"/>
</svg>`;

export const PHONE_ZONES_4_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  ${PHONE_FRAME}
  <rect class="zone-0" x="10" y="28" width="37.5" height="21.5" rx="2"/>
  <rect class="zone-1" x="48.5" y="28" width="37.5" height="21.5" rx="2"/>
  <rect class="zone-2" x="10" y="50.5" width="37.5" height="21.5" rx="2"/>
  <rect class="zone-3" x="48.5" y="50.5" width="37.5" height="21.5" rx="2"/>
</svg>`;

// A fingertip pressing the screen with one ripple ring.
export const TAP_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle class="ripple" cx="44" cy="34" r="16" fill="none" stroke="#2f7fbf" stroke-width="4"/>
  <path d="M38 34 L38 70 C38 82 46 90 58 90 C70 90 76 82 76 70 L76 52 C76 47 70 47 70 52 L70 48 C70 43 63 43 63 48 L63 46 C63 41 56 41 56 46 L56 50 L50 50 L50 34 C50 26 38 26 38 34 Z" fill="#f2c9a0" stroke="#2f2f2f" stroke-width="4" stroke-linejoin="round"/>
</svg>`;

// Same finger, two staggered ripples: "tap again on the same spot".
export const DOUBLE_TAP_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle class="ripple" cx="44" cy="34" r="16" fill="none" stroke="#2e7d32" stroke-width="4"/>
  <circle class="ripple ripple-2" cx="44" cy="34" r="16" fill="none" stroke="#2e7d32" stroke-width="4"/>
  <path d="M38 34 L38 70 C38 82 46 90 58 90 C70 90 76 82 76 70 L76 52 C76 47 70 47 70 52 L70 48 C70 43 63 43 63 48 L63 46 C63 41 56 41 56 46 L56 50 L50 50 L50 34 C50 26 38 26 38 34 Z" fill="#f2c9a0" stroke="#2f2f2f" stroke-width="4" stroke-linejoin="round"/>
  <text x="80" y="26" font-size="18" font-weight="700" fill="#2e7d32" font-family="system-ui, sans-serif">2×</text>
</svg>`;

// Landscape phone wiggling side to side with motion lines on both sides.
export const SHAKE_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g class="shake-phone">
    <rect x="18" y="32" width="64" height="36" rx="7" fill="#333333"/>
    <rect x="23" y="37" width="50" height="26" rx="2" fill="#bfe3ff"/>
    <circle cx="77.5" cy="50" r="2.2" fill="#666666"/>
  </g>
  <g class="shake-lines" stroke="#2f7fbf" stroke-width="4" stroke-linecap="round">
    <line x1="12" y1="38" x2="5" y2="34"/>
    <line x1="12" y1="50" x2="3" y2="50"/>
    <line x1="12" y1="62" x2="5" y2="66"/>
    <line x1="88" y1="38" x2="95" y2="34"/>
    <line x1="88" y1="50" x2="97" y2="50"/>
    <line x1="88" y1="62" x2="95" y2="66"/>
  </g>
</svg>`;
