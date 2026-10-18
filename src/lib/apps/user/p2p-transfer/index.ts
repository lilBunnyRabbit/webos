import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "p2p-transfer",
  name: "P2P Transfer",
  icon: AppIcon,
  version: "1.0.0",
  meta: () => import("./meta"),
  category: AppCategory.UTILITIES,
  defaults: {
    constraints: {
      width: { min: 360 },
      height: { min: 420 },
    },
  },
  component: () => import("./p2p-transfer.app.svelte"),
});
