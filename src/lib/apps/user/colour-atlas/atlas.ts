export const Tier = { FAMILIAR: "familiar", PERCEPTUAL: "perceptual", EXOTIC: "exotic" } as const;
export type Tier = (typeof Tier)[keyof typeof Tier];
export const TIERS: readonly Tier[] = Object.values(Tier);

export const TIER_NAMES: Record<Tier, string> = {
  [Tier.FAMILIAR]: "Familiar",
  [Tier.PERCEPTUAL]: "Perceptual",
  [Tier.EXOTIC]: "Exotic",
};

export interface AtlasEntry {
  id: string;
  name: string;
  tier: Tier;
  family: string;
  source: string;
}

const { FAMILIAR: F, PERCEPTUAL: P, EXOTIC: E } = Tier;

const entry = (id: string, name: string, tier: Tier, family: string, source: string): AtlasEntry => ({ id, name, tier, family, source });

export const ATLAS: readonly AtlasEntry[] = [
  entry("xyz-d65", "XYZ D65", E, "Core", "CSS Color 4 (the graph hub)"),
  entry("xyz-d50", "XYZ D50", E, "Core", "CSS Color 4, Bradford"),
  entry("srgb-linear", "Linear sRGB", E, "Core", "CSS Color 4"),
  entry("srgb", "sRGB", F, "Core", "CSS Color 4"),
  entry("srgb8", "sRGB bytes", F, "Core", "CSS Color 4; rounds, clamps"),
  entry("display-p3", "Display P3", F, "Core", "CSS Color 4"),
  entry("display-p3-linear", "Linear Display P3", E, "Wide-gamut RGB", "CSS Color 4"),
  entry("a98-rgb", "Adobe RGB (1998)", F, "Wide-gamut RGB", "CSS Color 4"),
  entry("prophoto-rgb", "ProPhoto RGB", F, "Wide-gamut RGB", "CSS Color 4"),
  entry("rec2020", "Rec. 2020", F, "Wide-gamut RGB", "CSS Color 4"),
  entry("rec2100-pq", "Rec. 2100 PQ", E, "Wide-gamut RGB", "ITU-R BT.2100-3, CSS Color HDR draft"),
  entry("rec2100-hlg", "Rec. 2100 HLG", E, "Wide-gamut RGB", "ITU-R BT.2100-3, CSS Color HDR draft"),
  entry("smpte-c", "SMPTE C", E, "Wide-gamut RGB", "SMPTE 170M-2004"),
  entry("aces2065-1", "ACES2065-1", E, "ACES", "Academy S-2008-001"),
  entry("acescg", "ACEScg", E, "ACES", "Academy S-2014-004"),
  entry("acescc", "ACEScc", E, "ACES", "Academy S-2014-003"),
  entry("acescct", "ACEScct", E, "ACES", "Academy S-2016-001"),
  entry("ycbcr-601", "Y′CbCr 601", E, "Video", "BT.601-7, H.273"),
  entry("ycbcr-709", "Y′CbCr 709", E, "Video", "BT.709-6, H.273"),
  entry("ycbcr-2020", "Y′CbCr 2020", E, "Video", "BT.2020-2, H.273"),
  entry("yiq", "YIQ", E, "Video", "SMPTE 170M-2004 Annex A"),
  entry("yuv", "YUV", E, "Video", "SMPTE 170M-2004 Annex A"),
  entry("ydbdr", "YDbDr", E, "Video", "ITU-R BT.470-6 (SECAM)"),
  entry("ycgco", "YCgCo", E, "Video", "ITU-T H.273"),
  entry("oklab", "OKLab", P, "Core", "Ottosson 2020, CSS matrices"),
  entry("oklch", "OKLCH", P, "Core", "CSS Color 4"),
  entry("okhsl", "Okhsl", P, "Perceptual", "Ottosson 2021, ok_color.h (MIT)"),
  entry("okhsv", "Okhsv", P, "Perceptual", "Ottosson 2021, ok_color.h (MIT)"),
  entry("lab", "CIE Lab", P, "Core", "CIE, CSS Color 4"),
  entry("lch", "CIE LCH", P, "Core", "CIE, CSS Color 4"),
  entry("lab-d65", "Lab D65", P, "Tristimulus and Lab-like", "CIE 015:2018 §8.2.1"),
  entry("lch-d65", "LCH D65", P, "Tristimulus and Lab-like", "CIE 015:2018 §8.2.1"),
  entry("luv-d65", "Luv D65", P, "Perceptual", "CIE 015:2018 §8.2.2"),
  entry("luv-d50", "Luv D50", P, "Perceptual", "CIE 015:2018 §8.2.2"),
  entry("lchuv-d65", "LCHuv D65", P, "Perceptual", "CIE 015:2018"),
  entry("lchuv-d50", "LCHuv D50", P, "Perceptual", "CIE 015:2018"),
  entry("hsluv", "HSLuv", P, "Perceptual", "hsluv.org (MIT)"),
  entry("hpluv", "HPLuv", P, "Perceptual", "hsluv.org (MIT)"),
  entry("hsl", "HSL", F, "Core", "CSS Color 4"),
  entry("hsv", "HSV", F, "Core", "Smith 1978 via Wikipedia"),
  entry("hwb", "HWB", F, "Core", "CSS Color 4"),
  entry("hsi", "HSI", F, "More hue models", "Kender 1976; Wikipedia \"HSL and HSV\""),
  entry("hsp", "HSP", F, "More hue models", "Finley 2006 (no independent vectors for p)"),
  entry("cubehelix", "Cubehelix", E, "More hue models", "Green 2011, d3-color's reading as a space"),
  entry("tsl", "TSL", E, "More hue models", "Terrillon et al. 2000 (no independent vectors)"),
  entry("cmy", "CMY", F, "Subtractive", "colour-science (EasyRGB)"),
  entry("cmyk", "CMYK", F, "Subtractive", "CSS Color 5 §6.1 naive conversion"),
  entry("ryb", "RYB", F, "Subtractive", "Gossett & Chen 2004 (trilinear cube)"),
  entry("jzazbz", "Jzazbz", E, "Perceptual", "Safdar et al. 2017"),
  entry("jzczhz", "JzCzhz", E, "Perceptual", "Safdar et al. 2017"),
  entry("ictcp", "ICtCp", E, "Perceptual", "ITU-R BT.2100-3 (PQ)"),
  entry("ictcp-hlg", "ICtCp HLG", E, "Perceptual", "ITU-R BT.2100-3 (HLG)"),
  entry("cam16", "CAM16", E, "Appearance", "Li et al. 2017"),
  entry("cam16-ucs", "CAM16-UCS", E, "Appearance", "Luo et al. 2006 / Li et al. 2017"),
  entry("cam16-lcd", "CAM16-LCD", E, "Appearance", "Luo et al. 2006 / Li et al. 2017"),
  entry("cam16-scd", "CAM16-SCD", E, "Appearance", "Luo et al. 2006 / Li et al. 2017"),
  entry("ciecam02", "CIECAM02", E, "Appearance", "CIE 159:2004"),
  entry("hct", "HCT", P, "Appearance", "material-color-utilities (Apache-2.0)"),
  entry("xyy", "xyY", E, "Tristimulus and Lab-like", "CIE 015:2018 §7.3"),
  entry("uvy-1976", "u′v′Y (1976)", E, "Tristimulus and Lab-like", "CIE 015:2018 §8.1"),
  entry("uvy-1960", "uvY (1960)", E, "Tristimulus and Lab-like", "CIE 015:2018 Annex A.4"),
  entry("uvw-1964", "U*V*W* (1964)", E, "Tristimulus and Lab-like", "CIE 015:2018 Annex A.4"),
  entry("lms", "LMS", E, "Tristimulus and Lab-like", "Hunt, equal-energy normalised"),
  entry("ipt", "IPT", E, "Tristimulus and Lab-like", "Ebner & Fairchild 1998"),
  entry("hunter-lab", "Hunter Lab", E, "Tristimulus and Lab-like", "Hunter 1958, 1966 Ka / Kb"),
  entry("din99", "DIN99", P, "Tristimulus and Lab-like", "DIN 6176:2001"),
  entry("din99-lch", "DIN99 LCh", P, "Tristimulus and Lab-like", "DIN 6176:2001"),
  entry("din99o", "DIN99o", P, "Tristimulus and Lab-like", "Cui et al. 2002 (no independent vectors)"),
  entry("din99o-lch", "DIN99o LCh", P, "Tristimulus and Lab-like", "Cui et al. 2002 (no independent vectors)"),
  entry("xyb", "XYB", E, "Tristimulus and Lab-like", "libjxl (BSD-3)"),
];

const BY_ID = new Map(ATLAS.map((item) => [item.id, item]));

export function atlas_entry(id: string): AtlasEntry | null {
  return BY_ID.get(id) ?? null;
}
