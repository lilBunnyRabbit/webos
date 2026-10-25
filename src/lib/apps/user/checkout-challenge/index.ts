import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "checkout-challenge",
  name: "Checkout Challenge",
  icon: AppIcon,
  version: "0.1.0",
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 480 },
    },
  },
  highlights: () => import("./highlights"),
  component: () => import("./checkout-challenge.app.svelte"),
});
