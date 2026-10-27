import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "checkout-challenge",
  name: "Checkout Challenge",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 480 },
    },
  },
  achievements: [
    { id: "first-day", title: "Open for business", text: "Get through a day without closing early." },
    { id: "three-stars", title: "Gold stars", text: "Earn three stars in a day." },
    { id: "days-7", title: "Week one", text: "Stay in business for 7 days in one run.", goal: 7 },
    { id: "money-1000", title: "Big takings", text: "Take 1,000 in one run.", goal: 1000 },
    { id: "sales-500", title: "Regular cashier", text: "Ring up 500 sales in all.", goal: 500 },
    { id: "spotless", title: "Spotless", text: "Get through a whole day from day 5 on without a mistake or a sorry.", secret: true },
  ],
  highlights: () => import("./highlights"),
  component: () => import("./checkout-challenge.app.svelte"),
});
