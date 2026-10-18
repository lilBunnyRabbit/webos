import type { AppMeta } from "$lib/core/api";

export default {
  description: "Scans QR codes and barcodes from your camera or an image.",
  keywords: ["qr", "barcode", "scan", "scanner", "camera", "code"],
  pitch: {
    problem: "A QR code on screen or in a photo is hard to read without a phone.",
    solution: "Scan QR codes and barcodes from your camera or an image.",
  },
} satisfies AppMeta;
