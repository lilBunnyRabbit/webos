import { Warehouse as WarehouseIcon } from "phosphor-svelte";
import { Building, define_game } from "../define";

export default define_game({
  id: "forklift",
  name: "Warehouse",
  icon: WarehouseIcon,
  building: Building.WAREHOUSE,
  achievements: [
    { id: "forklift-first", title: "First delivery", text: "Finish a warehouse job." },
    { id: "forklift-perfect", title: "Perfect drop", text: "Put a pallet down with 95% precision or better." },
    { id: "forklift-full-load", title: "Full load", text: "Finish a four-pallet job." },
    { id: "forklift-by-the-book", title: "By the book", text: "Earn three stars on a job of three pallets or more." },
    { id: "forklift-levels", title: "Shift lead", text: "Finish every warehouse level.", goal: 16 },
    { id: "forklift-daily", title: "Daily delivery", text: "Finish the daily job." },
    { id: "forklift-spotless", title: "Spotless", text: "Put every pallet of a job of three or more down Perfect.", secret: true },
    { id: "forklift-top-shelf", title: "Top shelf", text: "Put a pallet away on a top shelf without a scrape." },
  ],
  load: () => import("./game.svelte"),
});
