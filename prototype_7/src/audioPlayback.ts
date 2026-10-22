import { GeneratedSong } from "./types.ts";
import { GENRES } from "./songGenerator.ts";

// ---------------------------------------------------------------------------
// Ported from the original quiz's playback code. Instead of an <audio> element
// pointing at a file, we synthesize the song's notes/chords/bass/drums directly
// from the generated note data using WebAudioFont soundfonts.
//
// The player library comes from the `webaudiofont` npm package (side-effect
// import, same as prototype 6); the instrument/drum data files listed in
// fonts.ts come from the shared repo-root /public/fonts folder (src/fonts.ts).
// ---------------------------------------------------------------------------

import "webaudiofont";
import { FONT_VARS } from "./fonts.ts";
import { loadFonts } from "../../src/fonts.ts";
declare const WebAudioFontPlayer: new () => WebAudioFontPlayerInstance;

// standalone this downloads the fonts; in the combined/ shell they come pre-decoded
await loadFonts(Object.values(FONT_VARS));

// The soundfont data files register themselves as window._tone_* / _drum_* globals.
declare global {
  interface Window {
    [fontVar: string]: unknown;
  }
}

interface WebAudioFontEnvelope {
  cancel: () => void;
}
interface WebAudioFontPlayerInstance {
  loader: { decodeAfterLoading: (ctx: AudioContext, varName: string) => void };
  queueWaveTable: (
    ctx: AudioContext, destination: AudioNode, font: unknown,
    startSec: number, pitch: number, durSec: number, velocity: number
  ) => WebAudioFontEnvelope | undefined;
}

let audioCtx: AudioContext | null = null;
let player: WebAudioFontPlayerInstance | null = null;
let envelopes: WebAudioFontEnvelope[] = [];

function getFont(name: string): unknown {
  return window[FONT_VARS[name]];
}

export function fontsReady(): boolean {
  return Object.values(FONT_VARS).every((v) => !!window[v]);
}

export function initAudio(): void {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  player = new WebAudioFontPlayer();
  for (const varName of Object.values(FONT_VARS)) {
    if (window[varName]) player.loader.decodeAfterLoading(audioCtx, varName);
  }
}

/** The shared AudioContext, or null before the first initAudio() call. */
export function getAudioContext(): AudioContext | null {
  return audioCtx;
}

function playWithFont(fontName: string, pitch: number, startSec: number, durSec: number, velocity: number) {
  const font = getFont(fontName);
  if (!font || !player || !audioCtx) return;
  const env = player.queueWaveTable(audioCtx, audioCtx.destination, font, startSec, pitch, durSec, velocity);
  if (env) envelopes.push(env);
}

/** Plays every part of a generated song and returns its duration in ms. */
export function playSong(song: GeneratedSong): number {
  if (!audioCtx || !player) return 0;
  if (audioCtx.state === "suspended") audioCtx.resume();

  const bpm = song.config.bpm || 120;
  const beat = 60 / bpm;
  const now = audioCtx.currentTime + 0.05;
  envelopes = [];

  const genre = GENRES.find((g) => g.id === song.config.genre)!;
  const { melody: melodyFont, chords: chordsFont } = genre.instruments;

  for (const n of song.melody) {
    playWithFont(melodyFont, n.pitch, now + n.startBeat * beat, n.duration * beat, n.velocity);
  }
  if (song.drums) {
    for (const d of song.drums) {
      playWithFont(d.type, d.pitch, now + d.startBeat * beat, d.duration * beat, d.velocity);
    }
  }
  if (song.bass && genre.bassInstrument) {
    for (const n of song.bass) {
      playWithFont(genre.bassInstrument, n.pitch, now + n.startBeat * beat, n.duration * beat, n.velocity * 0.85);
    }
  }
  if (song.chordsAudible) {
    for (const bar of song.chords) {
      for (const n of bar) {
        playWithFont(chordsFont, n.pitch, now + n.startBeat * beat, n.duration * beat, n.velocity);
      }
    }
  }

  return song.config.bars * song.config.bpb * beat * 1000;
}

/** Plays a single isolated note - used for answer options the player hears instead of reads. */
export function playNote(instrument: string, pitch: number, durationSec = 0.6): void {
  if (!audioCtx || !player) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  playWithFont(instrument, pitch, audioCtx.currentTime + 0.03, durationSec, 0.75);
}

export function stopAudio(): void {
  for (const env of envelopes) {
    try { env.cancel(); } catch { /* already finished */ }
  }
  envelopes = [];
}
