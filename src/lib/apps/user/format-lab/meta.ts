import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "Encode one image as JPEG, WebP, AVIF and JPEG XL side by side: compare them with a swipe, see size, time and an SSIM score with a heatmap of what changed, and save the one you like. Also reads what an AVIF or JPEG XL file says about itself.",
  keywords: [
    "avif",
    "jxl",
    "jpeg xl",
    "webp",
    "jpeg",
    "png",
    "convert",
    "format",
    "codec",
    "encode",
    "compress",
    "compression",
    "quality",
    "ssim",
    "compare",
    "lossless",
    "image size",
    "hdr",
    "bit depth",
    "inspect",
  ],
  pitch: {
    problem: "Picking an image format means guessing how big and how ugly each one will be.",
    solution: "Encode the same picture four ways and swipe between them, with the bytes and a quality score.",
  },
} satisfies AppMeta;
