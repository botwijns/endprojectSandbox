// The WebAudioFont instruments this game plays: our instrument keys → the global
// each /public/fonts file defines. Adding an instrument is just one new entry here.
// Kept apart from main.ts so the combined/ shell can preload them (src/fonts.ts).
export const FONT_VARS = {
    piano:            "_tone_0000_GeneralUserGS_sf2_file",
    electricPiano:    "_tone_0040_GeneralUserGS_sf2_file",
    distortionGuitar: "_tone_0301_GeneralUserGS_sf2_file",
    electricBass:     "_tone_0331_GeneralUserGS_sf2_file",
    slapBass:         "_tone_0361_GeneralUserGS_sf2_file",
    cello:            "_tone_0421_GeneralUserGS_sf2_file",
    contrabass:       "_tone_0430_GeneralUserGS_sf2_file",
    trumpet:          "_tone_0560_GeneralUserGS_sf2_file",
    synthPad:         "_tone_0882_GeneralUserGS_sf2_file",
    steelDrums:       "_tone_1140_Chaos_sf2_file",
    kick:             "_drum_36_1_Chaos_sf2_file",
    snare:            "_drum_38_1_Chaos_sf2_file",
    highHat:          "_drum_42_1_Chaos_sf2_file",
} as const;
