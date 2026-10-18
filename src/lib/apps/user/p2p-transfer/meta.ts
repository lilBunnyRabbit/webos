import type { AppMeta } from "$lib/core/api";

export default {
  description: "Sends files straight to another device. The two devices connect by scanning each other's QR code.",
  keywords: ["send", "share", "receive", "webrtc", "peer", "airdrop", "qr", "transfer", "files", "phone"],
  pitch: {
    problem: "Moving a file to the phone next to you usually goes through the cloud.",
    solution: "Send it straight between devices, connected by scanning each other's QR code.",
  },
} satisfies AppMeta;
