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
    { id: "first-day", title: "Open for business", text: "Get through a day without a night in jail." },
    { id: "three-stars", title: "Gold stars", text: "Earn three stars in a day." },
    { id: "days-7", title: "Week one", text: "Stay in business for 7 days in one shop.", goal: 7 },
    { id: "money-1000", title: "Big takings", text: "Take 1,000 in one shop.", goal: 1000 },
    { id: "sales-500", title: "Regular cashier", text: "Serve 500 customers in all.", goal: 500 },
    { id: "party", title: "Party supplies", text: "Get a regular's party order right." },
    { id: "best-friend", title: "Best friend", text: "Win a customer's full trust." },
    { id: "clean-record", title: "Clean record", text: "Serve until the police leave, without a slip.", secret: true },
    { id: "spotless", title: "Spotless", text: "Get through a whole day from day 5 on without a wrong total.", secret: true },
  ],
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  component: () => import("./checkout-challenge.app.svelte"),
});
