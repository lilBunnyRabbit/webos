import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { ArrowsLeftRight as ArrowsLeftRightIcon } from "phosphor-svelte";

export default define_app({
  id: "p2p-transfer",
  name: "P2P Transfer",
  icon: ArrowsLeftRightIcon,
  version: "1.0.0",
  description: "Sends files straight to another device. The two devices connect by scanning each other's QR code.",
  keywords: ["send", "share", "receive", "webrtc", "peer", "airdrop", "qr", "transfer", "files", "phone"],
  category: AppCategory.UTILITIES,
  defaults: {
    constraints: {
      width: { min: 360 },
      height: { min: 420 },
    },
  },
  component: () => import("./p2p-transfer.app.svelte"),
});
