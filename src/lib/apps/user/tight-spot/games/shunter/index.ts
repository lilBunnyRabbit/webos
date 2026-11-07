import { Truck as TruckIcon } from "phosphor-svelte";
import { Building, define_game } from "../define";

export default define_game({
  id: "shunter",
  name: "Yard Shunter",
  icon: TruckIcon,
  building: Building.FREIGHT_YARD,
  achievements: [
    { id: "shunter-first", title: "First drop", text: "Finish a yard job." },
    { id: "shunter-kingpin", title: "Kingpin", text: "Couple a trailer without a bump." },
    { id: "shunter-square", title: "Square to the door", text: "Drop a trailer at a dock door with 95% precision or better." },
    { id: "shunter-double", title: "Long haul", text: "Pull a double out to the outbound lane." },
    { id: "shunter-full-yard", title: "Full yard", text: "Finish a job of four drops." },
    { id: "shunter-by-the-book", title: "By the book", text: "Earn three stars on a job of three drops or more." },
    { id: "shunter-levels", title: "Yard master", text: "Finish every yard level.", goal: 12 },
    { id: "shunter-daily", title: "Daily shift", text: "Finish the daily yard job." },
  ],
  load: () => import("./game.svelte"),
  progress: () => import("./progress").then((module) => module.default),
});
