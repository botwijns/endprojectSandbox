// The WebAudioFont instruments the quiz plays: our instrument names → the global
// each /public/fonts file defines. Kept apart from audioPlayback.ts so the
// combined/ shell can preload them (src/fonts.ts).
export const FONT_VARS: Record<string, string> = {
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
