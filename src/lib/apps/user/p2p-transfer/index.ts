import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "p2p-transfer",
  name: "P2P Transfer",
  icon,
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
