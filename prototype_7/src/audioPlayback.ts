import { GeneratedSong } from "./types.ts";
import { GENRES } from "./songGenerator.ts";

// ---------------------------------------------------------------------------
// Ported from the original quiz's playback code. Instead of an <audio> element
// pointing at a file, we synthesize the song's notes/chords/bass/drums directly
// from the generated note data using WebAudioFont soundfonts.
//
// The player library comes from the `webaudiofont` npm package (side-effect
// import, same as prototype 6); the instrument/drum data files are loaded as
// <script src="fonts/..."> tags in index.html and resolve from the shared
// repo-root /public/fonts folder.
// ---------------------------------------------------------------------------

import "webaudiofont";
declare const WebAudioFontPlayer: new () => WebAudioFontPlayerInstance;

const FONT_VARS: Record<string, string> = {
  piano: "_tone_0000_GeneralUserGS_sf2_file",
  guitar: "_tone_0241_GeneralUserGS_sf2_file",
  elGuitar: "_tone_0271_GeneralUserGS_sf2_file",
  bass: "_tone_0321_GeneralUserGS_sf2_file",
  slapBass: "_tone_0282_GeneralUserGS_sf2_file",
  disGuitar: "_tone_0331_GeneralUserGS_sf2_file",
  elBass: "_tone_0340_GeneralUserGS_sf2_file",
  synthBass: "_tone_0382_GeneralUserGS_sf2_file",
  violin: "_tone_0401_GeneralUserGS_sf2_file",
  cello: "_tone_0421_GeneralUserGS_sf2_file",
  uprightBass: "_tone_0430_GeneralUserGS_sf2_file",
  trumpet: "_tone_0560_GeneralUserGS_sf2_file",
  sax: "_tone_0650_GeneralUserGS_sf2_file",
  synthLead: "_tone_0851_GeneralUserGS_sf2_file",
  synthPad: "_tone_0882_GeneralUserGS_sf2_file",
  kick: "_drum_36_1_Chaos_sf2_file",
  snare: "_drum_38_1_Chaos_sf2_file",
  hihat: "_drum_42_1_Chaos_sf2_file",
  elecKick: "_drum_64_0_Chaos_sf2_file",
  elecClap: "_drum_69_0_Chaos_sf2_file",
  elecCymbal: "_drum_68_0_Chaos_sf2_file",
};

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
  for (const bar of song.chords) {
    for (const n of bar) {
      playWithFont(chordsFont, n.pitch, now + n.startBeat * beat, n.duration * beat, n.velocity);
    }
  }

  return song.config.bars * song.config.bpb * beat * 1000;
}

export function stopAudio(): void {
  for (const env of envelopes) {
    try { env.cancel(); } catch { /* already finished */ }
  }
  envelopes = [];
}
