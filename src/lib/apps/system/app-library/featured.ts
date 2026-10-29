import type { AppId } from "$lib/core/api";

export interface FeaturedApp {
  app: AppId;
  tagline?: string;
}

/** The App Store's hand-picked hero cards, after the newest apps. Ids the catalogue doesn't know are skipped. */
export const FEATURED: FeaturedApp[] = [
  { app: "tight-spot", tagline: "Nine driving games in one small town: park, race, mow, push back a jet, sit your driving test." },
  { app: "hopsprite", tagline: "Pixel art and sprite animation, frame by frame." },
  { app: "image-tools", tagline: "Cut out, join, compress and compare pictures, all on your device." },
  { app: "p2p-transfer", tagline: "Send files between your devices by scanning a QR code." },
  { app: "pdf-tools", tagline: "Merge, split, sign and convert PDFs without uploading them." },
  { app: "warren", tagline: "A calm page to write on, out as Word or PDF." },
  { app: "format-lab", tagline: "One picture, four formats, side by side." },
];
