import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "Makes QR codes for links, text, Wi-Fi, contacts and UPN payments, and shows step by step how one is built.",
  keywords: [
    "qr",
    "qr code",
    "generator",
    "barcode",
    "wifi",
    "vcard",
    "contact",
    "upn",
    "payment",
    "encode",
    "reed solomon",
  ],
  pitch: {
    problem: "Making a QR code for Wi-Fi or a payment usually means an ad-filled website.",
    solution: "Make QR codes for links, Wi-Fi, contacts and payments, and see how one is built.",
  },
} satisfies AppMeta;
